export function createViewRouterController({
    state,
    renderProjectList,
    setupIcons,
    openProjectTagEditor,
    syncProjectsFromBackend,
    syncActiveRunUi,
    getPathForView,
    parseRoute,
    updateBrowserPath,
    projectsPath,
    getSelectProject,
    getDeleteProject,
    getRetryProjectGeneration,
}) {
    function switchView(viewId, options = {}) {
        const { syncUrl = true, replaceState = false, projectId = null } = options;
        state.currentView = viewId;
        ["view-new-task", "view-project-list", "view-reading"].forEach((id) => {
            const el = document.getElementById(id);
            if (el) {
                el.classList.add("hidden");
            }
        });
        const target = document.getElementById(`view-${viewId}`);
        if (target) {
            target.classList.remove("hidden");
        }

        document.querySelectorAll(".nav-item").forEach((btn) => btn.classList.remove("active"));
        if (viewId === "new-task") {
            document.getElementById("nav-new-task").classList.add("active");
        }
        if (viewId === "project-list" || viewId === "reading") {
            document.getElementById("nav-projects").classList.add("active");
        }
        if (viewId === "project-list") {
            state.searchQuery = "";
            const searchInput = document.getElementById("project-search-input");
            if (searchInput) {
                searchInput.value = "";
                document.getElementById("clear-search").classList.add("hidden");
            }
            const selectProject = getSelectProject();
            const deleteProject = getDeleteProject();
            const retryProjectGeneration = getRetryProjectGeneration();
            renderProjectList({
                state,
                onSelectProject: selectProject,
                onDeleteProject: deleteProject,
                onRetryProject: (id) => retryProjectGeneration(id, { mode: "retry_failed" }),
                onEditTags: openProjectTagEditor,
                setupIcons,
            });
            void syncProjectsFromBackend({ silent: false });
        }
        if (syncUrl) {
            updateBrowserPath(getPathForView(viewId, projectId, state.activeProjectId), replaceState);
        }
        syncActiveRunUi();
        setupIcons();
    }

    function applyRouteFromLocation(replaceState = false) {
        const route = parseRoute(window.location.pathname);

        if (route.viewId === "reading") {
            const project = state.projects.find((item) => String(item.id) === String(route.projectId));
            if (project) {
                const selectProject = getSelectProject();
                void selectProject(project.id, { syncUrl: false });
                return;
            }

            switchView("project-list", { syncUrl: false });
            updateBrowserPath(projectsPath, true);
            return;
        }

        switchView(route.viewId, { syncUrl: false });
        if (replaceState) {
            updateBrowserPath(getPathForView(route.viewId, null, state.activeProjectId), true);
        }
    }

    return {
        switchView,
        applyRouteFromLocation,
    };
}
