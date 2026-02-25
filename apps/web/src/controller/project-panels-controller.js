export function createProjectPanelsController({
    state,
    setupIcons,
    renderHistoryPopoverView,
    renderSidebarShortcuts,
    renderProjectList,
    getSelectProject,
    getDeleteProject,
    getRetryProjectGeneration,
    getOpenProjectTagEditor,
}) {
    function renderHistoryPopover() {
        const selectProject = getSelectProject();
        renderHistoryPopoverView({
            state,
            onSelectProject: selectProject,
            setupIcons,
        });
    }

    function refreshProjectPanels() {
        const selectProject = getSelectProject();
        const deleteProject = getDeleteProject();
        const retryProjectGeneration = getRetryProjectGeneration();
        const openProjectTagEditor = getOpenProjectTagEditor();

        renderProjectList({
            state,
            onSelectProject: selectProject,
            onDeleteProject: deleteProject,
            onRetryProject: (projectId) => retryProjectGeneration(projectId, { mode: "retry_failed" }),
            onEditTags: openProjectTagEditor,
            setupIcons,
        });
        renderSidebarShortcuts({
            state,
            onSelectProject: selectProject,
            setupIcons,
        });
    }

    return {
        renderHistoryPopover,
        refreshProjectPanels,
    };
}
