import { toUserErrorMessage } from "../api/error-map.js";

export function attachEventListeners({
    state,
    switchView,
    selectProject,
    deleteProject,
    retryProjectGeneration,
    renderProjectList,
    onEditProjectTags,
    setupIcons,
    toggleModal,
    setConfigCheckStatus,
    collectLlmConfigFromInputs,
    api,
    saveConfigToStorage,
    startAnalysisPipeline,
    handleNewProject,
    syncProjects,
    getActiveNoteAsMarkdown,
    downloadActiveNoteAsMarkdown,
    normalizeProvider,
    getProviderDefaults,
    renderHistoryPopover,
}) {
    const sidebar = document.getElementById("sidebar");
    const toggleBtn = document.getElementById("sidebar-toggle");
    const toggleIcon = document.getElementById("toggle-icon");
    const historyBtn = document.getElementById("nav-history-btn");
    const historyPopover = document.getElementById("history-popover");
    const userMenuBtn = document.getElementById("user-menu-trigger");
    const userMenuBtnCollapsed = document.getElementById("user-menu-trigger-collapsed");
    const userDropdown = document.getElementById("user-dropdown");
    let activeUserMenuTrigger = null;

    const isVisible = (panel) => !panel.classList.contains("hidden");
    const closePanel = (panel) => panel.classList.add("hidden");
    const closeFloatingPanels = (except = null) => {
        [historyPopover, userDropdown].forEach((panel) => {
            if (panel !== except) {
                closePanel(panel);
                if (panel === userDropdown) {
                    activeUserMenuTrigger = null;
                }
            }
        });
    };

    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

    const setPanelFixedPosition = (panel, left, top) => {
        panel.style.position = "fixed";
        panel.style.left = `${left}px`;
        panel.style.top = `${top}px`;
        panel.style.right = "auto";
        panel.style.bottom = "auto";
    };

    const positionHistoryPopover = () => {
        const btnRect = historyBtn.getBoundingClientRect();
        const panelWidth = historyPopover.offsetWidth || 288;
        const panelHeight = historyPopover.offsetHeight || 320;
        const gap = 8;
        const viewportPadding = 12;

        const left = clamp(
            btnRect.right + gap,
            viewportPadding,
            window.innerWidth - panelWidth - viewportPadding
        );
        const top = clamp(
            btnRect.top - 8,
            viewportPadding,
            window.innerHeight - panelHeight - viewportPadding
        );

        setPanelFixedPosition(historyPopover, left, top);
    };

    const positionUserDropdown = (trigger) => {
        if (!trigger) {
            return;
        }

        const triggerRect = trigger.getBoundingClientRect();
        const panelWidth = userDropdown.offsetWidth || 192;
        const panelHeight = userDropdown.offsetHeight || 160;
        const gap = 8;
        const viewportPadding = 12;

        const left = state.sidebarCollapsed
            ? clamp(
                triggerRect.right + gap,
                viewportPadding,
                window.innerWidth - panelWidth - viewportPadding
            )
            : clamp(
                triggerRect.right - panelWidth,
                viewportPadding,
                window.innerWidth - panelWidth - viewportPadding
            );

        const top = state.sidebarCollapsed
            ? clamp(
                triggerRect.bottom - panelHeight,
                viewportPadding,
                window.innerHeight - panelHeight - viewportPadding
            )
            : clamp(
                triggerRect.top - panelHeight - gap,
                viewportPadding,
                window.innerHeight - panelHeight - viewportPadding
            );

        setPanelFixedPosition(userDropdown, left, top);
    };

    toggleBtn.addEventListener("click", () => {
        state.sidebarCollapsed = !state.sidebarCollapsed;
        sidebar.classList.toggle("sidebar-expanded", !state.sidebarCollapsed);
        sidebar.classList.toggle("sidebar-collapsed", state.sidebarCollapsed);
        toggleIcon.style.transform = state.sidebarCollapsed ? "rotate(180deg)" : "rotate(0deg)";
        activeUserMenuTrigger = null;
        closeFloatingPanels();
    });

    document.getElementById("nav-new-task").addEventListener("click", () => switchView("new-task"));
    document.getElementById("nav-projects").addEventListener("click", () => switchView("project-list"));
    document.getElementById("back-to-list").addEventListener("click", () => switchView("project-list"));

    historyBtn.addEventListener("click", (event) => {
        if (!state.sidebarCollapsed) {
            switchView("project-list");
            return;
        }
        event.stopPropagation();
        if (isVisible(historyPopover)) {
            closePanel(historyPopover);
        } else {
            renderHistoryPopover();
            closeFloatingPanels(historyPopover);
            historyPopover.classList.remove("hidden");
            positionHistoryPopover();
        }
    });

    const toggleMenu = (event) => {
        event.stopPropagation();
        if (isVisible(userDropdown)) {
            closePanel(userDropdown);
            activeUserMenuTrigger = null;
            return;
        }
        activeUserMenuTrigger = event.currentTarget;
        closeFloatingPanels(userDropdown);
        userDropdown.classList.remove("hidden");
        positionUserDropdown(activeUserMenuTrigger);
    };
    userMenuBtn.addEventListener("click", toggleMenu);
    userMenuBtnCollapsed.addEventListener("click", toggleMenu);

    window.addEventListener("resize", () => {
        if (isVisible(historyPopover)) {
            positionHistoryPopover();
        }
        if (isVisible(userDropdown) && activeUserMenuTrigger) {
            positionUserDropdown(activeUserMenuTrigger);
        }
    });

    document.addEventListener("click", (event) => {
        const clickInsideHistoryButton = historyBtn.contains(event.target);
        if (!historyPopover.contains(event.target) && !clickInsideHistoryButton) {
            closePanel(historyPopover);
        }

        const clickInsideUserMenuTrigger =
            userMenuBtn.contains(event.target) || userMenuBtnCollapsed.contains(event.target);
        if (!userDropdown.contains(event.target) && !clickInsideUserMenuTrigger) {
            closePanel(userDropdown);
            activeUserMenuTrigger = null;
        }
    });

    const searchInput = document.getElementById("project-search-input");
    const clearSearchBtn = document.getElementById("clear-search");
    searchInput.addEventListener("input", (event) => {
        state.searchQuery = event.target.value.toLowerCase().trim();
        clearSearchBtn.classList.toggle("hidden", state.searchQuery === "");
        renderProjectList({
            state,
            onSelectProject: selectProject,
            onDeleteProject: deleteProject,
            onRetryProject: (projectId) => retryProjectGeneration(projectId, { mode: "retry_failed" }),
            onEditTags: onEditProjectTags,
            setupIcons,
        });
    });
    clearSearchBtn.addEventListener("click", () => {
        state.searchQuery = "";
        searchInput.value = "";
        clearSearchBtn.classList.add("hidden");
        renderProjectList({
            state,
            onSelectProject: selectProject,
            onDeleteProject: deleteProject,
            onRetryProject: (projectId) => retryProjectGeneration(projectId, { mode: "retry_failed" }),
            onEditTags: onEditProjectTags,
            setupIcons,
        });
    });

    const tagFilter = document.getElementById("project-tag-filter");
    if (tagFilter) {
        tagFilter.addEventListener("change", (event) => {
            state.selectedTag = String(event.target.value || "all");
            renderProjectList({
                state,
                onSelectProject: selectProject,
                onDeleteProject: deleteProject,
                onRetryProject: (projectId) => retryProjectGeneration(projectId, { mode: "retry_failed" }),
                onEditTags: onEditProjectTags,
                setupIcons,
            });
        });
    }

    const syncProjectsBtn = document.getElementById("sync-projects-btn");
    if (syncProjectsBtn) {
        syncProjectsBtn.addEventListener("click", async () => {
            if (syncProjectsBtn.disabled) {
                return;
            }

            const originalLabel = syncProjectsBtn.innerHTML;
            syncProjectsBtn.disabled = true;
            syncProjectsBtn.classList.add("opacity-60", "cursor-not-allowed");
            syncProjectsBtn.innerHTML = '<i data-lucide="refresh-cw" class="w-3.5 h-3.5 animate-spin"></i><span>同步中...</span>';
            setupIcons();

            try {
                await syncProjects();
            } catch (error) {
                alert(toUserErrorMessage(error, "同步项目失败"));
            } finally {
                syncProjectsBtn.disabled = false;
                syncProjectsBtn.classList.remove("opacity-60", "cursor-not-allowed");
                syncProjectsBtn.innerHTML = originalLabel;
                setupIcons();
            }
        });
    }

    document.getElementById("llm-config-trigger").addEventListener("click", () => {
        setConfigCheckStatus("");
        toggleModal("llm-modal", true);
    });
    document.getElementById("doc-trigger").addEventListener("click", () => toggleModal("doc-modal", true));
    document.querySelectorAll(".close-modal").forEach((button) => {
        button.addEventListener("click", () => {
            toggleModal("llm-modal", false);
            toggleModal("doc-modal", false);
        });
    });

    document.getElementById("test-config").addEventListener("click", async () => {
        const testBtn = document.getElementById("test-config");
        const config = collectLlmConfigFromInputs();
        setConfigCheckStatus("正在检测连通性...");
        testBtn.disabled = true;

        try {
            const result = await api.checkLlmConfig({
                provider: config.provider,
                api_key: config.key,
                model: config.model,
                base_url: config.baseUrl,
            });
            const latency = result?.meta?.latency_ms;
            const latencyText = Number.isFinite(latency) ? `，延迟 ${latency}ms` : "";
            setConfigCheckStatus(`连通成功${latencyText}`, "success");
        } catch (error) {
            setConfigCheckStatus(`连通失败: ${toUserErrorMessage(error, "请检查模型配置")}`, "error");
        } finally {
            testBtn.disabled = false;
        }
    });

    document.getElementById("save-config").addEventListener("click", () => {
        state.llmConfig = collectLlmConfigFromInputs();
        saveConfigToStorage(state.llmConfig);
        setConfigCheckStatus("");
        toggleModal("llm-modal", false);
    });

    document.getElementById("config-provider").addEventListener("change", (event) => {
        const provider = normalizeProvider(event.target.value);
        const defaults = getProviderDefaults(provider);
        document.getElementById("config-model").value = defaults.model;
        document.getElementById("config-base-url").value = defaults.baseUrl;
        setConfigCheckStatus("");
    });

    const dropzone = document.getElementById("dropzone");
    const fileInput = document.getElementById("file-input");
    const dropzoneEmptyHint = document.getElementById("dropzone-empty-hint");
    const filePreviewArea = document.getElementById("file-preview-area");
    const startTaskBtn = document.getElementById("start-task-btn");

    const syncStartTaskButtonState = () => {
        const hasRunningTask = state.activeRun?.status === "running";
        const canStart = Boolean(state.pendingFile) && !state.isProcessing && !hasRunningTask;
        startTaskBtn.disabled = !canStart;
        startTaskBtn.classList.toggle("opacity-50", !canStart);
        startTaskBtn.classList.toggle("cursor-not-allowed", !canStart);
    };

    const applySelectedPdf = (file) => {
        if (!file) {
            return;
        }
        const fileName = String(file.name || "");
        const isPdf = /\.pdf$/i.test(fileName) || file.type === "application/pdf";
        if (!isPdf) {
            alert("仅支持上传 PDF 文件");
            return;
        }
        if (file.size > 50 * 1024 * 1024) {
            alert("PDF 文件大小不能超过 50MB");
            return;
        }

        state.pendingFile = file;
        document.getElementById("selected-filename").innerText = state.pendingFile.name;
        dropzoneEmptyHint.classList.add("hidden");
        filePreviewArea.classList.remove("hidden");
        syncStartTaskButtonState();
    };

    dropzone.addEventListener("click", () => fileInput.click());

    dropzone.addEventListener("dragover", (event) => {
        event.preventDefault();
        dropzone.classList.add("border-blue-400", "bg-blue-50/30");
    });

    dropzone.addEventListener("dragleave", () => {
        dropzone.classList.remove("border-blue-400", "bg-blue-50/30");
    });

    dropzone.addEventListener("drop", (event) => {
        event.preventDefault();
        dropzone.classList.remove("border-blue-400", "bg-blue-50/30");
        const droppedFile = event.dataTransfer?.files?.[0];
        applySelectedPdf(droppedFile);
    });

    fileInput.addEventListener("change", (event) => {
        if (event.target.files.length > 0) {
            applySelectedPdf(event.target.files[0]);
        }
    });

    startTaskBtn.addEventListener("click", async () => {
        const runningTask = state.activeRun?.status === "running" ? state.activeRun : null;
        if (runningTask) {
            const shouldGoRunningTask = confirm("已有任务正在运行。\n\n点击“确定”前往查看进行中的任务；点击“取消”留在当前页面。");
            if (shouldGoRunningTask && runningTask.projectId) {
                await selectProject(runningTask.projectId);
            }
            return;
        }

        if (!state.pendingFile || state.isProcessing) {
            return;
        }

        startTaskBtn.disabled = true;
        startTaskBtn.classList.add("opacity-50", "cursor-not-allowed");
        startTaskBtn.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i>分析中...';
        setupIcons();

        const newProject = handleNewProject(state.pendingFile.name);
        await startAnalysisPipeline(newProject.id);
    });

    const copyMarkdownBtn = document.getElementById("copy-markdown");
    if (copyMarkdownBtn) {
        copyMarkdownBtn.addEventListener("click", () => {
            const markdown = getActiveNoteAsMarkdown(state);
            navigator.clipboard.writeText(markdown).then(() => {
                alert("Markdown content copied to clipboard!");
            });
        });
    }

    const downloadMarkdownBtn = document.getElementById("download-markdown");
    if (downloadMarkdownBtn) {
        downloadMarkdownBtn.addEventListener("click", () => {
            downloadActiveNoteAsMarkdown(state);
        });
    }
}
