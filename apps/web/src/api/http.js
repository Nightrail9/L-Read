const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_RETRY_DELAY_MS = 400;
const RETRYABLE_STATUS = new Set([429, 502, 503, 504]);

function resolveApiBaseUrl() {
    const fromQuery = new URLSearchParams(window.location.search).get("apiBase") || "";
    const raw = String(fromQuery || "").trim();
    if (!raw) {
        return "";
    }
    return raw.replace(/\/$/, "");
}

const API_BASE = resolveApiBaseUrl();

function sleep(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function shouldRetry(error, method, attempt, retries, retryable) {
    if (!retryable || attempt >= retries) {
        return false;
    }
    if (error?.code === "REQUEST_TIMEOUT" || error?.code === "NETWORK_ERROR") {
        return true;
    }
    if (RETRYABLE_STATUS.has(Number(error?.status || 0))) {
        return true;
    }
    return method === "GET" && error?.code === "REQUEST_FAILED";
}

export async function request(path, options = {}) {
    const {
        retries,
        retryable,
        retryDelayMs,
        timeoutMs,
        signal,
        headers,
        ...fetchOptions
    } = options;

    const method = String(fetchOptions.method || "GET").toUpperCase();
    const maxRetries = Number.isFinite(retries) ? Math.max(0, Number(retries)) : method === "GET" ? 2 : 0;
    const canRetry = typeof retryable === "boolean" ? retryable : method === "GET";
    const baseDelay = Number.isFinite(retryDelayMs) ? Math.max(0, Number(retryDelayMs)) : DEFAULT_RETRY_DELAY_MS;
    const requestTimeout = Number.isFinite(timeoutMs) ? Math.max(1000, Number(timeoutMs)) : DEFAULT_TIMEOUT_MS;

    let attempt = 0;
    for (;;) {
        const controller = signal ? null : new AbortController();
        const timeout = window.setTimeout(() => controller?.abort(), requestTimeout);
        try {
            const response = await fetch(`${API_BASE}${path}`, {
                ...fetchOptions,
                signal: signal || controller?.signal,
                headers: {
                    ...(headers || {}),
                },
            });

            const contentType = response.headers.get("content-type") || "";
            const isJson = contentType.includes("application/json");
            const payload = isJson ? await response.json() : await response.text();

            if (!response.ok) {
                const detail = isJson ? payload?.detail || payload?.error?.message : payload;
                const err = new Error(detail || `HTTP ${response.status}`);
                err.code = payload?.error?.code || "REQUEST_FAILED";
                err.status = response.status;
                err.details = payload?.error?.details;
                throw err;
            }

            return payload;
        } catch (error) {
            let normalizedError = error;
            if (error?.name === "AbortError") {
                normalizedError = new Error("request timeout");
                normalizedError.code = "REQUEST_TIMEOUT";
            } else if (error instanceof TypeError) {
                normalizedError = new Error(error.message || "failed to fetch");
                normalizedError.code = "NETWORK_ERROR";
            }

            if (!shouldRetry(normalizedError, method, attempt, maxRetries, canRetry)) {
                throw normalizedError;
            }

            attempt += 1;
            await sleep(baseDelay * attempt);
        } finally {
            window.clearTimeout(timeout);
        }
    }
}
