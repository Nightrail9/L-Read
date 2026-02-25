export function createConfigFormController({
    normalizeProvider,
    getProviderDefaults,
}) {
    function applyProviderDefaults(provider) {
        const normalized = normalizeProvider(provider);
        const defaults = getProviderDefaults(normalized);
        const modelInput = document.getElementById("config-model");
        const baseUrlInput = document.getElementById("config-base-url");

        if (modelInput && !modelInput.value.trim()) {
            modelInput.value = defaults.model;
        }
        if (baseUrlInput && !baseUrlInput.value.trim()) {
            baseUrlInput.value = defaults.baseUrl;
        }
    }

    function collectLlmConfigFromInputs() {
        const provider = normalizeProvider(document.getElementById("config-provider").value);
        const defaults = getProviderDefaults(provider);
        const model = document.getElementById("config-model").value.trim() || defaults.model;
        const baseUrl = document.getElementById("config-base-url").value.trim() || defaults.baseUrl;
        const key = document.getElementById("config-key").value;

        return {
            provider,
            model,
            baseUrl,
            key,
        };
    }

    function setConfigCheckStatus(message, type = "idle") {
        const statusEl = document.getElementById("config-check-status");
        if (!statusEl) {
            return;
        }

        statusEl.textContent = message || "";
        if (type === "success") {
            statusEl.className = "text-[11px] text-emerald-700 min-h-[16px]";
            return;
        }
        if (type === "error") {
            statusEl.className = "text-[11px] text-red-600 min-h-[16px]";
            return;
        }
        statusEl.className = "text-[11px] text-[#37352f]/55 min-h-[16px]";
    }

    return {
        applyProviderDefaults,
        collectLlmConfigFromInputs,
        setConfigCheckStatus,
    };
}
