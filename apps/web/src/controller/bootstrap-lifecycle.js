export function createBootstrapLifecycle({
    state,
    loadConfigFromStorage,
    loadProjectsFromStorage,
    loadActiveRunFromStorage,
    applyProviderDefaults,
    stopActiveRunPolling,
    resolveActiveRunProjectId,
    selectProject,
    switchView,
    attachEventListeners,
    attachEventListenersArgs,
    applyRouteFromLocation,
    syncActiveRunUi,
    bindTagEditorEvents,
    setupIcons,
    syncProjectsFromBackend,
    refreshProjectPanels,
    startActiveRunPolling,
}) {
    function loadPersistedData() {
        const hasSavedConfig = loadConfigFromStorage();
        if (hasSavedConfig) {
            document.getElementById("config-provider").value = state.llmConfig.provider;
            document.getElementById("config-base-url").value = state.llmConfig.baseUrl;
            document.getElementById("config-key").value = state.llmConfig.key;
            document.getElementById("config-model").value = state.llmConfig.model;
        } else {
            applyProviderDefaults(state.llmConfig.provider);
        }
        loadProjectsFromStorage();
        loadActiveRunFromStorage();
    }

    async function init() {
        loadPersistedData();
        window.addEventListener("popstate", () => applyRouteFromLocation(false));
        window.addEventListener("beforeunload", stopActiveRunPolling);

        const jumpToRunBtn = document.getElementById("global-task-jump");
        if (jumpToRunBtn) {
            jumpToRunBtn.addEventListener("click", () => {
                if (state.activeRun?.status === "running") {
                    switchView("new-task");
                    return;
                }

                const activeRunProjectId = resolveActiveRunProjectId();
                if (activeRunProjectId) {
                    void selectProject(activeRunProjectId);
                    return;
                }
                switchView("project-list");
            });
        }

        attachEventListeners(attachEventListenersArgs);

        applyRouteFromLocation(true);
        syncActiveRunUi();
        bindTagEditorEvents();
        setupIcons();

        try {
            await syncProjectsFromBackend({ silent: true });
        } catch {
        }
        refreshProjectPanels();
        if (state.activeRun?.status === "running") {
            startActiveRunPolling();
        }
    }

    function bootstrapApp() {
        window.addEventListener("DOMContentLoaded", init);
    }

    return {
        init,
        bootstrapApp,
    };
}
