export const state = {
    projects: [],
    searchQuery: "",
    selectedTag: "all",
    activeProjectId: null,
    activeNoteId: null,
    isProcessing: false,
    sidebarCollapsed: false,
    currentView: "project-list",
    pendingFile: null,
    activeRun: null,
    llmConfig: {
        provider: "gpt",
        baseUrl: "https://api.openai.com/v1",
        key: "",
        model: "gpt-4o",
    },
};

const ACTIVE_RUN_STORAGE_KEY = "l_read_active_run_v1";
const PROJECTS_STORAGE_KEY = "l_read_projects_v2";

const PROVIDER_DEFAULTS = {
    gpt: {
        model: "gpt-4o",
        baseUrl: "https://api.openai.com/v1",
    },
    gemini: {
        model: "gemini-2.5-flash",
        baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    },
    "openai-compatible": {
        model: "gpt-4o-mini",
        baseUrl: "",
    },
};

export function normalizeProvider(provider) {
    return PROVIDER_DEFAULTS[provider] ? provider : "gpt";
}

export function getProviderDefaults(provider) {
    return PROVIDER_DEFAULTS[normalizeProvider(provider)];
}

export function saveProjectsToStorage() {
    localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(state.projects));
}

export function loadProjectsFromStorage() {
    const savedProjects = localStorage.getItem(PROJECTS_STORAGE_KEY);
    if (savedProjects) {
        state.projects = JSON.parse(savedProjects);
    }
}

export function saveActiveRunToStorage() {
    if (!state.activeRun) {
        localStorage.removeItem(ACTIVE_RUN_STORAGE_KEY);
        return;
    }
    localStorage.setItem(ACTIVE_RUN_STORAGE_KEY, JSON.stringify(state.activeRun));
}

export function loadActiveRunFromStorage() {
    const saved = localStorage.getItem(ACTIVE_RUN_STORAGE_KEY);
    if (!saved) {
        state.activeRun = null;
        return false;
    }

    try {
        state.activeRun = JSON.parse(saved);
        return true;
    } catch {
        state.activeRun = null;
        localStorage.removeItem(ACTIVE_RUN_STORAGE_KEY);
        return false;
    }
}

export function loadConfigFromStorage() {
    const savedConfig = localStorage.getItem("l_read_config_v1");
    if (!savedConfig) {
        return false;
    }

    const parsed = JSON.parse(savedConfig);
    const provider = normalizeProvider(parsed.provider);
    state.llmConfig = {
        provider,
        baseUrl: parsed.baseUrl || getProviderDefaults(provider).baseUrl,
        key: parsed.key || "",
        model: parsed.model || getProviderDefaults(provider).model,
    };
    return true;
}

export function saveConfigToStorage(config) {
    state.llmConfig = config;
    localStorage.setItem("l_read_config_v1", JSON.stringify(config));
}
