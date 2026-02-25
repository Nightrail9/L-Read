import json
from pathlib import Path

from ..config import PROMPTS_JSON_FILE


REQUIRED_MODULE_KEYS = [
    "global_prompt",
    "framework_prompt",
    "formula_prompt",
    "code_prompt",
    "mentor_prompt",
]

LEGACY_KEY_ALIASES = {
    "global_prompt": "module_01",
    "framework_prompt": "module_02",
    "formula_prompt": "module_03",
    "code_prompt": "module_04",
    "mentor_prompt": "module_05",
}


def load_prompt_modules(file_path: Path = PROMPTS_JSON_FILE) -> dict[str, str]:
    if not file_path.exists():
        raise FileNotFoundError(f"Prompt JSON file not found: {file_path}")

    raw = file_path.read_text(encoding="utf-8", errors="replace")
    data = json.loads(raw)
    if not isinstance(data, dict):
        raise ValueError("Prompt JSON must be an object mapping module keys to strings")

    prompts: dict[str, str] = {}
    for key, value in data.items():
        if not isinstance(key, str):
            raise ValueError("Prompt JSON keys must be strings")
        if not isinstance(value, str):
            raise ValueError(f"Prompt module '{key}' must be a string")
        normalized = value.strip()
        if normalized:
            prompts[key] = normalized

    for target_key, legacy_key in LEGACY_KEY_ALIASES.items():
        if prompts.get(target_key):
            continue
        legacy_value = prompts.get(legacy_key)
        if legacy_value:
            prompts[target_key] = legacy_value

    missing = [key for key in REQUIRED_MODULE_KEYS if not prompts.get(key)]
    if missing:
        missing_text = ", ".join(missing)
        raise ValueError(f"Prompt JSON missing required modules: {missing_text}")

    return prompts
