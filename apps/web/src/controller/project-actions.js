export function createProjectActions({
    state,
    api,
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
    moduleKeyByTitle,
}) {
    let readingNotesPollTimer = null;
    let readingNotesPollInFlight = false;

    function stopReadingNotesPolling() {
        if (readingNotesPollTimer) {
            clearInterval(readingNotesPollTimer);
            readingNotesPollTimer = null;
        }
        readingNotesPollInFlight = false;
    }

    function startReadingNotesPolling(projectId) {
        stopReadingNotesPolling();

        const pollOnce = async () => {
            if (readingNotesPollInFlight) {
                return;
            }
            if (state.currentView !== "reading" || String(state.activeProjectId) !== String(projectId)) {
                stopReadingNotesPolling();
                return;
            }

            const project = state.projects.find((item) => String(item.id) === String(projectId));
            if (!project) {
                stopReadingNotesPolling();
                return;
            }

            const isRunningProject = project.status === "running";
            const isActiveRunProject =
                state.activeRun?.status === "running"
                && String(state.activeRun.projectId) === String(project.id);
            if (!isRunningProject && !isActiveRunProject) {
                stopReadingNotesPolling();
                return;
            }

            readingNotesPollInFlight = true;
            try {
                const previousCount = Array.isArray(project.notes) ? project.notes.length : 0;
                await loadProjectNotes(project);
                const nextCount = Array.isArray(project.notes) ? project.notes.length : 0;

                if (nextCount !== previousCount) {
                    saveState();
                    refreshProjectPanels();
                    renderReadingCards(project);
                }
            } catch (error) {
                console.error("增量加载笔记失败:", error);
            } finally {
                readingNotesPollInFlight = false;
            }
        };

        void pollOnce();
        readingNotesPollTimer = setInterval(() => {
            void pollOnce();
        }, 3000);
    }

    async function loadProjectNotes(project) {
        const backendJobId = resolveBackendJobId(project);
        if (!backendJobId) {
            return;
        }

        const notes = await fetchModuleNotes(api, backendJobId, {
            noteIdPrefix: project.id,
        });
        project.notes = notes;
        project.notesCount = Math.max(project.notesCount || 0, notes.length);
    }

    async function deleteProject(projectId) {
        const target = state.projects.find((item) => item.id === projectId);
        if (!target) {
            return;
        }

        const backendJobId = resolveBackendJobId(target);
        if (backendJobId) {
            try {
                await api.deleteJob(backendJobId);
            } catch (error) {
                const msg = toUserErrorMessage(error, "删除后端任务失败");
                const shouldDeleteLocalOnly = confirm(`${msg}\n\n是否仅删除本地记录？`);
                if (!shouldDeleteLocalOnly) {
                    return;
                }
            }
        }

        state.projects = state.projects.filter((item) => item.id !== projectId);
        if (state.activeProjectId === projectId) {
            state.activeProjectId = null;
            state.activeNoteId = null;
            switchView("project-list");
        }
        saveState();
        refreshProjectPanels();
        await syncProjectsFromBackend({ force: true, silent: state.currentView !== "project-list" });
    }

    async function retryProjectGeneration(projectId, options = {}) {
        const project = state.projects.find((item) => String(item.id) === String(projectId));
        if (!project) {
            return;
        }
        const backendJobId = resolveBackendJobId(project);
        if (!backendJobId) {
            alert("当前项目缺少后端任务 ID，无法重试。请重新创建任务。");
            return;
        }

        const mode = options.mode || "retry_failed";
        const moduleKey = options.module || null;
        const retryLabel = options.label || (moduleKey ? `重试 ${moduleKey}` : "重试失败模块");

        try {
            await api.queueRun(backendJobId, {
                mode,
                module: moduleKey,
            });
        } catch (error) {
            alert(toUserErrorMessage(error, "提交重试任务失败"));
            return;
        }

        project.status = "running";
        project.error = null;
        project.lastAccessed = Date.now();
        state.activeRun = {
            projectId: project.id,
            jobId: backendJobId,
            status: "running",
            percent: 72,
            message: `${retryLabel}中...`,
            stage: "run_modules",
            startedAt: Date.now(),
        };
        saveState();
        refreshProjectPanels();
        syncActiveRunUi();
        startActiveRunPolling();

        if (state.currentView === "reading" && String(state.activeProjectId) === String(project.id)) {
            renderReadingEmptyState(setupIcons);
        }
    }

    function getModuleKeyFromNote(note) {
        const key = String(note?.moduleKey || "").trim();
        if (key) {
            return key;
        }
        const title = String(note?.title || "").trim();
        return moduleKeyByTitle[title] || null;
    }

    async function retrySingleNote(note) {
        const project = state.projects.find((item) => item.id === state.activeProjectId);
        if (!project) {
            return;
        }
        const moduleKey = getModuleKeyFromNote(note);
        if (!moduleKey) {
            alert("无法识别该笔记对应的模块，请使用“重试失败模块”操作。");
            return;
        }
        await retryProjectGeneration(project.id, {
            mode: "single",
            module: moduleKey,
            label: `重试${note?.title || moduleKey}`,
        });
    }

    function selectNote(noteId) {
        state.activeNoteId = noteId;
    }

    function renderReadingCards(project) {
        renderNoteCards({
            state,
            project,
            onPreviewNote: (noteId) => {
                state.activeNoteId = noteId;
                openNotePreviewModal({ project, noteId, setupIcons });
            },
            onDownloadNote: (note) => {
                downloadNoteAsMarkdown(project, note);
            },
            onEditNote: (note) => {
                openNoteEditModal({
                    note,
                    setupIcons,
                    onSave: async (nextContent) => {
                        const backendJobId = resolveBackendJobId(project);
                        if (!backendJobId) {
                            throw new Error("缺少后端任务 ID，无法保存编辑");
                        }
                        const moduleKey = getModuleKeyFromNote(note);
                        if (!moduleKey) {
                            throw new Error("无法识别笔记所属模块");
                        }

                        try {
                            await api.updateOutput(backendJobId, moduleKey, {
                                content: String(nextContent || ""),
                            });
                        } catch (error) {
                            throw new Error(toUserErrorMessage(error, "保存笔记失败"));
                        }

                        note.content = [{ type: "text", text: String(nextContent || "") }];
                        note.date = new Date().toLocaleDateString();
                        saveState();
                        renderReadingCards(project);
                    },
                });
            },
            setupIcons,
        });
    }

    async function selectProject(projectId, options = {}) {
        const { syncUrl = true } = options;
        const project = state.projects.find((item) => String(item.id) === String(projectId));
        if (!project) {
            return;
        }
        stopReadingNotesPolling();
        state.activeProjectId = project.id;

        project.lastAccessed = Date.now();
        saveState();
        refreshProjectPanels();

        switchView("reading", { syncUrl, projectId: project.id });

        if ((project.notes?.length || 0) === 0 && (project.status === "completed" || project.status === "failed")) {
            await loadProjectNotes(project);
            saveState();
            refreshProjectPanels();
        }

        if (project.notes.length > 0) {
            state.activeNoteId = project.notes[0].id;
            renderReadingCards(project);
        } else if (project.status === "failed") {
            renderReadingFailedState(setupIcons, project.error || "任务执行失败，请稍后重试");
        } else {
            renderReadingEmptyState(setupIcons);
        }

        if (project.status === "running") {
            startReadingNotesPolling(project.id);
        }
    }

    return {
        loadProjectNotes,
        deleteProject,
        retryProjectGeneration,
        retrySingleNote,
        selectNote,
        selectProject,
    };
}
