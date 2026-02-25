export function createRunTracker({
    state,
    api,
    saveState,
    syncProjectsFromBackend,
    updateStatus,
    updateProgressBar,
    showGlobalTaskBanner,
    hideGlobalTaskBanner,
    updateGlobalTaskBanner,
}) {
    let activeRunPollTimer = null;
    let activeRunPollInFlight = false;

    function mapRunProgressFromJob(payload, fallbackPercent = 12) {
        const job = payload?.job || {};
        const tasks = Array.isArray(payload?.tasks) ? payload.tasks : [];
        if (job.status === "completed") {
            if (job.error) {
                return {
                    percent: 100,
                    message: `部分模块失败：${job.error}`,
                    status: "failed",
                };
            }
            return { percent: 100, message: "处理完成", status: "completed" };
        }
        if (job.status === "failed") {
            return {
                percent: Math.max(0, Number(fallbackPercent) || 0),
                message: job.error || "处理失败",
                status: "failed",
            };
        }

        const total = tasks.length;
        const done = tasks.filter((item) => item?.status === "done").length;
        const runningTask = tasks.find((item) => item?.status === "running");
        const ratio = total > 0 ? done / total : 0;
        const percent = Math.max(12, Math.min(94, Math.round(12 + ratio * 78)));
        const message = runningTask?.name
            ? `后台处理中：${runningTask.name}`
            : "后台处理中，已自动恢复进度跟踪";

        return { percent, message, status: "running" };
    }

    function syncActiveRunUi() {
        const run = state.activeRun;
        if (!run) {
            hideGlobalTaskBanner();
            updateStatus("", false);
            updateProgressBar(0);
            return;
        }

        const percent = Number(run.percent) || 0;
        updateGlobalTaskBanner({
            status: run.status || "running",
            message: run.message || "任务进行中",
            percent,
        });
        if (state.currentView === "new-task") {
            hideGlobalTaskBanner();
        } else {
            showGlobalTaskBanner();
        }

        if (state.currentView === "new-task") {
            updateProgressBar(percent);
            updateStatus(run.message || "任务进行中", true);
        } else {
            updateProgressBar(0);
            updateStatus("", false);
        }
    }

    function stopActiveRunPolling() {
        if (activeRunPollTimer) {
            clearInterval(activeRunPollTimer);
            activeRunPollTimer = null;
        }
    }

    async function pollActiveRunOnce() {
        if (activeRunPollInFlight || state.isProcessing) {
            return;
        }

        const run = state.activeRun;
        if (!run?.jobId) {
            stopActiveRunPolling();
            return;
        }

        activeRunPollInFlight = true;
        try {
            const payload = await api.getJob(run.jobId);
            const mapped = mapRunProgressFromJob(payload, run.percent);
            state.activeRun = {
                ...run,
                ...mapped,
                stage: payload?.job?.status || run.stage || "running",
            };
            saveState();
            syncActiveRunUi();

            if (mapped.status === "completed" || mapped.status === "failed") {
                stopActiveRunPolling();
                await syncProjectsFromBackend({ force: true, silent: state.currentView !== "project-list" });
                setTimeout(() => {
                    state.activeRun = null;
                    saveState();
                    syncActiveRunUi();
                }, 1500);
            }
        } catch (error) {
            console.error("恢复任务状态失败:", error);
        } finally {
            activeRunPollInFlight = false;
        }
    }

    function startActiveRunPolling() {
        if (!state.activeRun?.jobId || state.isProcessing) {
            return;
        }
        stopActiveRunPolling();
        void pollActiveRunOnce();
        activeRunPollTimer = setInterval(() => {
            void pollActiveRunOnce();
        }, 2500);
    }

    function resolveActiveRunProjectId() {
        const run = state.activeRun;
        if (!run) {
            return null;
        }

        const byProjectId = state.projects.find((item) => String(item.id) === String(run.projectId));
        if (byProjectId) {
            return byProjectId.id;
        }

        const jobId = String(run.jobId || "").trim();
        if (!jobId) {
            return null;
        }

        const byJobId = state.projects.find((item) => String(item.jobId || item.id) === jobId);
        if (!byJobId) {
            return null;
        }

        state.activeRun = {
            ...run,
            projectId: byJobId.id,
        };
        saveState();
        return byJobId.id;
    }

    return {
        syncActiveRunUi,
        startActiveRunPolling,
        stopActiveRunPolling,
        resolveActiveRunProjectId,
    };
}
