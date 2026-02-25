import {
    setupIcons,
    toggleModal,
    updateProgressBar,
    updateStatus,
    addDevLog,
    showGlobalTaskBanner,
    hideGlobalTaskBanner,
    updateGlobalTaskBanner,
} from "../ui/components.js";
import { ApiService } from "../api/modules.js";
import {
    state,
    normalizeProvider,
    getProviderDefaults,
    loadConfigFromStorage,
    loadProjectsFromStorage,
    loadActiveRunFromStorage,
    saveConfigToStorage,
    saveProjectsToStorage,
    saveActiveRunToStorage,
} from "../state/app-state.js";
import {
    renderHistoryPopover as renderHistoryPopoverView,
    renderSidebarShortcuts,
    renderProjectList,
} from "../views/project-view.js";
import {
    getActiveNoteAsMarkdown,
    downloadActiveNoteAsMarkdown,
    downloadNoteAsMarkdown,
    renderNoteCards,
    openNotePreviewModal,
    openNoteEditModal,
    renderReadingEmptyState,
    renderReadingFailedState,
} from "../views/note-view.js";
import { createAnalysisPipeline } from "../pipeline/analysis-pipeline.js";
import { attachEventListeners } from "../events/app-events.js";
import { toUserErrorMessage } from "../api/error-map.js";
import { MODULE_KEY_BY_TITLE } from "../constants/modules.js";
import { fetchModuleNotes } from "../services/module-notes.js";
import {
    PROJECTS_PATH,
    getPathForView,
    parseRoute,
    updateBrowserPath,
} from "./routing.js";
import {
    FIXED_LITERATURE_TAGS,
    createProjectSync,
    normalizeProjectTags,
} from "./project-sync.js";
import { createRunTracker } from "./run-tracker.js";
import { createProjectTagEditor } from "./tag-editor.js";
import { createProjectActions } from "./project-actions.js";
import { createBootstrapLifecycle } from "./bootstrap-lifecycle.js";
import { createViewRouterController } from "./view-router-controller.js";
import { createConfigFormController } from "./config-form-controller.js";
import { createProjectPanelsController } from "./project-panels-controller.js";

const START_TASK_BUTTON_DEFAULT_HTML = '<i data-lucide="zap" class="w-4 h-4"></i>开始分析文献';


function saveState() {
    saveProjectsToStorage();
    saveActiveRunToStorage();
}

const {
    applyProviderDefaults,
    collectLlmConfigFromInputs,
    setConfigCheckStatus,
} = createConfigFormController({
    normalizeProvider,
    getProviderDefaults,
});

let projectActions = null;
let panelsController = null;

function renderHistoryPopover() {
    panelsController?.renderHistoryPopover();
}

function refreshProjectPanels() {
    panelsController?.refreshProjectPanels();
}

const {
    resolveBackendJobId,
    syncProjectsFromBackend,
    syncProjectsWithDirectory,
} = createProjectSync({
    state,
    api: ApiService,
    saveState,
    refreshProjectPanels,
    onActiveProjectMissing: () => switchView("project-list"),
});

const {
    syncActiveRunUi,
    startActiveRunPolling,
    stopActiveRunPolling,
    resolveActiveRunProjectId,
} = createRunTracker({
    state,
    api: ApiService,
    saveState,
    syncProjectsFromBackend,
    updateStatus,
    updateProgressBar,
    showGlobalTaskBanner,
    hideGlobalTaskBanner,
    updateGlobalTaskBanner,
});

const {
    openProjectTagEditor,
    bindTagEditorEvents,
} = createProjectTagEditor({
    state,
    fixedTags: FIXED_LITERATURE_TAGS,
    normalizeProjectTags,
    saveState,
    refreshProjectPanels,
    setupIcons,
});

const { switchView, applyRouteFromLocation } = createViewRouterController({
    state,
    renderProjectList,
    setupIcons,
    openProjectTagEditor,
    syncProjectsFromBackend: (...args) => syncProjectsFromBackend(...args),
    syncActiveRunUi: (...args) => syncActiveRunUi(...args),
    getPathForView,
    parseRoute,
    updateBrowserPath,
    projectsPath: PROJECTS_PATH,
    getSelectProject: () => projectActions?.selectProject,
    getDeleteProject: () => projectActions?.deleteProject,
    getRetryProjectGeneration: () => projectActions?.retryProjectGeneration,
});

function resetTaskInputUi() {
    const filePreviewArea = document.getElementById("file-preview-area");
    const dropzoneEmptyHint = document.getElementById("dropzone-empty-hint");
    const fileInput = document.getElementById("file-input");
    const selectedFilename = document.getElementById("selected-filename");

    filePreviewArea.classList.add("hidden");
    dropzoneEmptyHint.classList.remove("hidden");
    fileInput.value = "";
    selectedFilename.innerText = "filename.pdf";

    const startTaskBtn = document.getElementById("start-task-btn");
    startTaskBtn.innerHTML = START_TASK_BUTTON_DEFAULT_HTML;
    startTaskBtn.disabled = true;
    startTaskBtn.classList.add("opacity-50", "cursor-not-allowed");
    setupIcons();
}

function handlePipelineCompleted() {
    resetTaskInputUi();
    void syncProjectsFromBackend({ force: true, silent: state.currentView !== "project-list" });
}

async function handlePipelineFailed(projectId, message) {
    const project = state.projects.find((item) => item.id === projectId);
    if (!project) {
        await syncProjectsFromBackend({ force: true, silent: state.currentView !== "project-list" });
        return;
    }

    project.status = "failed";
    project.error = message || project.error || "任务执行失败";
    await loadProjectNotes(project);
    saveState();
    refreshProjectPanels();
}

projectActions = createProjectActions({
    state,
    api: ApiService,
    resolveBackendJobId,
    toUserErrorMessage,
    saveState,
    refreshProjectPanels,
    syncProjectsFromBackend,
    switchView,
    syncActiveRunUi,
    startActiveRunPolling,
    renderNoteCards,
    openNotePreviewModal,
    openNoteEditModal,
    renderReadingEmptyState,
    renderReadingFailedState,
    downloadNoteAsMarkdown,
    setupIcons,
    fetchModuleNotes,
    moduleKeyByTitle: MODULE_KEY_BY_TITLE,
});

const {
    loadProjectNotes,
    deleteProject,
    retryProjectGeneration,
    selectNote,
    selectProject,
} = projectActions;

panelsController = createProjectPanelsController({
    state,
    setupIcons,
    renderHistoryPopoverView,
    renderSidebarShortcuts,
    renderProjectList,
    getSelectProject: () => projectActions?.selectProject,
    getDeleteProject: () => projectActions?.deleteProject,
    getRetryProjectGeneration: () => projectActions?.retryProjectGeneration,
    getOpenProjectTagEditor: () => openProjectTagEditor,
});

const startAnalysisPipeline = createAnalysisPipeline({
    state,
    api: ApiService,
    updateProgressBar,
    updateStatus,
    addDevLog,
    saveState,
    selectProject,
    getRepoInputs: () => ({
        gitUrl: (document.getElementById("github-url").value || "").trim(),
        localPath: (document.getElementById("local-path").value || "").trim(),
    }),
    onCompleted: handlePipelineCompleted,
    onFailed: handlePipelineFailed,
    onRunStateChange: syncActiveRunUi,
});

function handleNewProject(name) {
    const timestamp = Date.now();
    const newProj = {
        id: timestamp,
        createdAt: timestamp,
        lastAccessed: timestamp,
        name: name.replace(".pdf", ""),
        repo: document.getElementById("github-url").value || "User Upload",
        color: ["#FF7369", "#FFAB00", "#36B37E", "#00B8D9"][Math.floor(Math.random() * 4)],
        status: "created",
        notes: [],
        tags: [],
    };
    state.projects.unshift(newProj);
    saveState();
    renderSidebarShortcuts({
        state,
        onSelectProject: selectProject,
        setupIcons,
    });
    return newProj;
}

const { bootstrapApp } = createBootstrapLifecycle({
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
    attachEventListenersArgs: {
        state,
        switchView,
        selectProject,
        deleteProject,
        retryProjectGeneration,
        renderProjectList,
        onEditProjectTags: openProjectTagEditor,
        setupIcons,
        toggleModal,
        setConfigCheckStatus,
        collectLlmConfigFromInputs,
        api: ApiService,
        saveConfigToStorage,
        startAnalysisPipeline,
        handleNewProject,
        syncProjects: syncProjectsWithDirectory,
        getActiveNoteAsMarkdown,
        downloadActiveNoteAsMarkdown,
        normalizeProvider,
        getProviderDefaults,
        renderHistoryPopover,
    },
    applyRouteFromLocation,
    syncActiveRunUi,
    bindTagEditorEvents,
    setupIcons,
    syncProjectsFromBackend,
    refreshProjectPanels,
    startActiveRunPolling,
});

export { bootstrapApp };
