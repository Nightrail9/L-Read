import base64
import time
from pathlib import Path
from typing import Any

import requests

from ..config import (
    GEMINI_API_KEY,
    GEMINI_BASE_URL,
    GEMINI_MODEL_TEXT,
    GEMINI_MODEL_VISION,
    LLM_CONTINUATION_ROUNDS,
    LLM_MAX_OUTPUT_TOKENS,
    LLM_RETRIES,
    LLM_RETRY_BACKOFF_SEC,
    LLM_TIMEOUT_CONNECT_SEC,
    LLM_TIMEOUT_READ_SEC,
    GPT_API_KEY,
    GPT_BASE_URL,
    GPT_MODEL_TEXT,
    GPT_MODEL_VISION,
    LLM_PROVIDER,
    OPENAI_COMPAT_API_KEY,
    OPENAI_COMPAT_BASE_URL,
    OPENAI_COMPAT_MODEL_TEXT,
    OPENAI_COMPAT_MODEL_VISION,
)


class LLMError(RuntimeError):
    pass


CONTINUE_PROMPT = (
    "Continue from where you stopped. Output only the remaining content, "
    "keep the same structure/language, and do not repeat previous text."
)


def _provider_defaults(provider: str) -> dict[str, str]:
    if provider == "gpt":
        return {
            "api_key": GPT_API_KEY,
            "base_url": GPT_BASE_URL,
            "model_text": GPT_MODEL_TEXT,
            "model_vision": GPT_MODEL_VISION,
        }
    if provider == "gemini":
        return {
            "api_key": GEMINI_API_KEY,
            "base_url": GEMINI_BASE_URL,
            "model_text": GEMINI_MODEL_TEXT,
            "model_vision": GEMINI_MODEL_VISION,
        }
    if provider == "openai-compatible":
        return {
            "api_key": OPENAI_COMPAT_API_KEY,
            "base_url": OPENAI_COMPAT_BASE_URL,
            "model_text": OPENAI_COMPAT_MODEL_TEXT,
            "model_vision": OPENAI_COMPAT_MODEL_VISION,
        }
    raise LLMError(f"unsupported provider: {provider}")


def _normalize_provider(provider: str | None) -> str:
    picked = (provider or LLM_PROVIDER or "gpt").strip().lower()
    if picked in {"openai", "openai-compatible", "gpt", "gemini"}:
        return "gpt" if picked == "openai" else picked
    raise LLMError(f"unsupported provider: {picked}")


def _resolve_runtime_config(
    llm_config: dict[str, Any] | None, use_vision: bool
) -> tuple[str, str, str, str]:
    cfg = llm_config or {}
    provider = _normalize_provider(cfg.get("provider"))
    defaults = _provider_defaults(provider)

    api_key = (cfg.get("api_key") or defaults["api_key"] or "").strip()
    base_url = (cfg.get("base_url") or defaults["base_url"] or "").strip().rstrip("/")

    default_model = defaults["model_vision"] if use_vision else defaults["model_text"]
    model = (cfg.get("model") or default_model or "").strip()

    if not api_key:
        raise LLMError(f"{provider} api_key is not configured")
    if not base_url:
        raise LLMError(f"{provider} base_url is not configured")
    if not model:
        raise LLMError(f"{provider} model is not configured")

    return provider, api_key, base_url, model


def _headers(api_key: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }


def _is_retryable_status(status_code: int) -> bool:
    return status_code == 429 or 500 <= status_code <= 599


def _post_chat_completions(
    base_url: str,
    api_key: str,
    payload: dict[str, Any],
    retries: int | None = None,
) -> requests.Response:
    max_retries = max(0, retries if retries is not None else LLM_RETRIES)
    attempts = max_retries + 1
    timeout = (LLM_TIMEOUT_CONNECT_SEC, LLM_TIMEOUT_READ_SEC)
    last_error: Exception | None = None

    for attempt in range(1, attempts + 1):
        try:
            resp = requests.post(
                f"{base_url}/chat/completions",
                headers=_headers(api_key),
                json=payload,
                timeout=timeout,
            )
        except (requests.Timeout, requests.ConnectionError) as exc:
            last_error = exc
            if attempt >= attempts:
                break
            time.sleep(LLM_RETRY_BACKOFF_SEC * (2 ** (attempt - 1)))
            continue
        except requests.RequestException as exc:
            raise LLMError(f"request failed: {exc}") from exc

        if resp.status_code >= 400:
            detail = (resp.text or f"HTTP {resp.status_code}")[:500]
            if _is_retryable_status(resp.status_code) and attempt < attempts:
                time.sleep(LLM_RETRY_BACKOFF_SEC * (2 ** (attempt - 1)))
                continue
            raise LLMError(detail)

        return resp

    raise LLMError(
        f"request timed out/connection failed after {attempts} attempts: {last_error}"
    )


def _response_content_and_usage(
    resp: requests.Response,
) -> tuple[str, dict[str, Any], str | None]:
    try:
        data = resp.json()
    except ValueError as exc:
        raise LLMError("invalid JSON response from llm provider") from exc

    try:
        choice = data["choices"][0]
        content = choice["message"]["content"]
    except (KeyError, IndexError, TypeError) as exc:
        raise LLMError("invalid response shape from llm provider") from exc

    if content is None:
        content = ""
    elif not isinstance(content, str):
        content = str(content)

    finish_reason = None
    if isinstance(choice, dict):
        raw_finish_reason = choice.get("finish_reason")
        if isinstance(raw_finish_reason, str):
            finish_reason = raw_finish_reason

    usage = data.get("usage", {})
    if not isinstance(usage, dict):
        usage = {}
    return content, usage, finish_reason


def _safe_int(value: Any) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return int(value)
    if isinstance(value, str):
        try:
            return int(value.strip())
        except ValueError:
            return None
    return None


def _merge_usage(total: dict[str, Any], usage: dict[str, Any]) -> None:
    for key in ("prompt_tokens", "completion_tokens", "total_tokens"):
        current = _safe_int(total.get(key)) or 0
        delta = _safe_int(usage.get(key)) or 0
        if current or delta:
            total[key] = current + delta


def _resolve_max_tokens(
    max_tokens: int | None, llm_config: dict[str, Any] | None
) -> int:
    cfg = llm_config or {}
    candidate = _safe_int(cfg.get("max_tokens"))
    if candidate is None:
        candidate = _safe_int(max_tokens)
    if candidate is None or candidate <= 0:
        candidate = max(1, LLM_MAX_OUTPUT_TOKENS)
    return candidate


def _run_chat_with_continuation(
    *,
    base_url: str,
    api_key: str,
    model: str,
    messages: list[dict[str, Any]],
    max_tokens: int,
) -> tuple[str, dict[str, Any]]:
    turns = max(0, LLM_CONTINUATION_ROUNDS) + 1
    all_parts: list[str] = []
    merged_usage: dict[str, Any] = {}
    convo = list(messages)

    for _ in range(turns):
        payload = {
            "model": model,
            "messages": convo,
            "temperature": 0.2,
            "max_tokens": max_tokens,
        }
        resp = _post_chat_completions(base_url, api_key, payload)
        content, usage, finish_reason = _response_content_and_usage(resp)
        _merge_usage(merged_usage, usage)
        all_parts.append(content)

        if finish_reason != "length":
            break
        if not content.strip():
            break

        convo.append({"role": "assistant", "content": content})
        convo.append({"role": "user", "content": CONTINUE_PROMPT})

    return "".join(all_parts), merged_usage


def _with_provider_context(
    err: Exception, provider: str, model: str, base_url: str
) -> LLMError:
    return LLMError(f"{err} (provider={provider}, model={model}, base_url={base_url})")


def run_text(
    system_prompt: str,
    user_prompt: str,
    max_tokens: int | None = None,
    llm_config: dict[str, Any] | None = None,
) -> tuple[str, dict[str, Any]]:
    provider, api_key, base_url, model = _resolve_runtime_config(
        llm_config, use_vision=False
    )
    resolved_max_tokens = _resolve_max_tokens(max_tokens, llm_config)
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]
    try:
        content, usage = _run_chat_with_continuation(
            base_url=base_url,
            api_key=api_key,
            model=model,
            messages=messages,
            max_tokens=resolved_max_tokens,
        )
    except Exception as exc:
        raise _with_provider_context(exc, provider, model, base_url) from exc
    usage["provider"] = provider
    usage["model"] = model
    usage["max_tokens"] = resolved_max_tokens
    return content, usage


def run_vision(
    system_prompt: str,
    user_prompt: str,
    image_paths: list[Path],
    max_tokens: int | None = None,
    llm_config: dict[str, Any] | None = None,
) -> tuple[str, dict[str, Any]]:
    provider, api_key, base_url, model = _resolve_runtime_config(
        llm_config, use_vision=True
    )
    content: list[dict[str, Any]] = [{"type": "text", "text": user_prompt}]
    for path in image_paths:
        mime = "image/png" if path.suffix.lower() == ".png" else "image/jpeg"
        b64 = base64.b64encode(path.read_bytes()).decode("ascii")
        content.append(
            {
                "type": "image_url",
                "image_url": {"url": f"data:{mime};base64,{b64}"},
            }
        )

    resolved_max_tokens = _resolve_max_tokens(max_tokens, llm_config)
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": content},
    ]
    try:
        content_text, usage = _run_chat_with_continuation(
            base_url=base_url,
            api_key=api_key,
            model=model,
            messages=messages,
            max_tokens=resolved_max_tokens,
        )
    except Exception as exc:
        raise _with_provider_context(exc, provider, model, base_url) from exc
    usage["provider"] = provider
    usage["model"] = model
    usage["max_tokens"] = resolved_max_tokens
    return content_text, usage


def check_connectivity(llm_config: dict[str, Any] | None = None) -> dict[str, Any]:
    provider, api_key, base_url, model = _resolve_runtime_config(
        llm_config, use_vision=False
    )
    payload = {
        "model": model,
        "messages": [{"role": "user", "content": "ping"}],
        "temperature": 0,
        "max_tokens": 1,
    }

    started_at = time.perf_counter()
    try:
        resp = _post_chat_completions(base_url, api_key, payload, retries=0)
        _, usage, _ = _response_content_and_usage(resp)
    except Exception as exc:
        raise _with_provider_context(
            LLMError(f"connectivity check failed: {exc}"),
            provider,
            model,
            base_url,
        ) from exc

    latency_ms = int((time.perf_counter() - started_at) * 1000)
    return {
        "provider": provider,
        "model": model,
        "base_url": base_url,
        "latency_ms": latency_ms,
        "usage": usage,
    }
