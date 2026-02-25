import { toUserErrorMessage } from "../api/error-map.js";
import { fetchModuleNotes } from "../services/module-notes.js";

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizePipelineError(error) {
    const mapped = toUserErrorMessage(error, "");
    if (mapped) {
        return mapped;
    }
    const message = (error?.message || "").trim();
    const lower = message.toLowerCase();
    if (lower.includes("schannel") || lower.includes("ssl/tls") || lower.includes("curl:(35)")) {
        return "文献下载失败（SSL/TLS 握手异常），请稍后重试或检查网络代理设置。";
    }
    if (lower.includes("download zip failed")) {
        return "文献下载失败，请稍后重试。";
    }
    return message || "未知错误";
}

async function waitForTaskDone(api, jobId, taskName, timeoutMs = 15 * 60 * 1000) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
        const payload = await api.getJob(jobId);
        const task = (payload.tasks || []).find((item) => item.name === taskName);
        const job = payload.job || {};

        if (task?.status === "done") {
            return payload;
        }
        if (task?.status === "failed") {
            throw new Error(task.error || `${taskName} failed`);
        }
        if (job.status === "failed") {
            throw new Error(job.error || "job failed");
        }

        await sleep(1500);
    }
    throw new Error(`${taskName} timeout`);
}

async function waitForJobDone(api, jobId, timeoutMs = 20 * 60 * 1000) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
        const payload = await api.getJob(jobId);
        const job = payload.job || {};
        if (job.status === "completed") {
            return payload;
        }
        if (job.status === "failed") {
            throw new Error(job.error || "job failed");
        }
        await sleep(1500);
    }
    throw new Error("run timeout");
}

export function createAnalysisPipeline({
    state,
    api,
    updateProgressBar,
    updateStatus,
    addDevLog,
    saveState,
    selectProject,
    getRepoInputs,
    onCompleted,
    onFailed,
    onRunStateChange,
}) {
    return async function startAnalysisPipeline(projectId) {
        if (state.isProcessing) {
            return;
        }
        state.isProcessing = true;

        const startedAt = Date.now();
        const applyRunState = (patch) => {
            state.activeRun = {
                projectId,
                startedAt,
                ...(state.activeRun || {}),
                ...patch,
            };
            saveState();
            if (typeof onRunStateChange === "function") {
                onRunStateChange();
            }
        };

        const applyPipelineProgress = (percent, message, stage, logText = null) => {
            updateProgressBar(percent);
            updateStatus(message, true);
            if (logText) {
                addDevLog(logText);
            }
            applyRunState({
                status: "running",
                percent,
                message,
                stage,
            });
        };

        try {
            const project = state.projects.find((item) => item.id === projectId);
            if (!project) {
                throw new Error("project not found");
            }

            applyPipelineProgress(8, "正在创建任务", "create_job", "正在创建后端任务...");

            const created = await api.createJob();
            const jobId = created.job_id;
            project.jobId = jobId;
            project.status = "running";
            applyRunState({ jobId });

            addDevLog(`正在应用模型配置（${state.llmConfig.provider}）...`);
            await api.configureLlm(jobId, {
                provider: state.llmConfig.provider,
                api_key: state.llmConfig.key,
                model: state.llmConfig.model,
                base_url: state.llmConfig.baseUrl,
            });

            applyPipelineProgress(16, "正在上传 PDF", "upload_pdf", `正在上传 PDF（${state.pendingFile.name}）...`);
            await api.uploadPdf(jobId, state.pendingFile);

            let hasRepo = false;
            const { gitUrl, localPath } = getRepoInputs();
            if (gitUrl || localPath) {
                hasRepo = true;
                applyPipelineProgress(25, "正在配置仓库", "configure_repo", "正在配置仓库来源...");

                const payload = gitUrl ? { type: "git", git_url: gitUrl } : { type: "local_path", path: localPath };
                let repoResult = await api.configureRepo(jobId, payload);
                if (repoResult.status === "needs_confirmation" && !gitUrl) {
                    const confirmed = confirm("本地路径看起来较大或复杂，是否继续建立索引？");
                    if (!confirmed) {
                        throw new Error("index cancelled by user");
                    }
                    repoResult = await api.configureRepo(jobId, {
                        ...payload,
                        force_confirm: true,
                    });
                }
                addDevLog(`仓库配置完成（${repoResult.status || "ok"}）`);
            }

            applyPipelineProgress(35, "正在提取文献", "extract_pdf", "已提交文献提取任务...");
            await api.queueExtract(jobId);
            await waitForTaskDone(api, jobId, "extract_pdf");
            addDevLog("文献提取完成。");

            if (hasRepo) {
                applyPipelineProgress(55, "正在索引仓库", "prepare_repo", "已提交仓库索引任务...");
                await api.queueIndex(jobId);
                await waitForTaskDone(api, jobId, "prepare_repo");
                addDevLog("仓库索引完成。");
            }

            applyPipelineProgress(75, "正在生成分析模块", "run_modules", "已提交分析模块任务...");
            await api.queueRun(jobId, { mode: "all" });
            const runPayload = await waitForJobDone(api, jobId);
            const runError = String(runPayload?.job?.error || "").trim();
            addDevLog("模块处理完成，正在加载结果...");

            const notes = await fetchModuleNotes(api, jobId, { noteIdPrefix: projectId });
            project.notes = notes;
            project.status = runError ? "failed" : "completed";
            project.error = runError || null;
            project.lastAccessed = Date.now();
            if (runError) {
                applyPipelineProgress(100, "处理完成（部分失败）", "completed", `处理完成：已生成 ${notes.length} 篇笔记，部分模块可重试。`);
                applyRunState({ status: "failed", message: `部分模块失败：${runError}` });
            } else {
                applyPipelineProgress(100, "处理完成", "completed", `处理成功：已生成 ${notes.length} 篇笔记。`);
                applyRunState({ status: "completed" });
            }
            selectProject(projectId);
        } catch (error) {
            const project = state.projects.find((item) => item.id === projectId);
            if (project) {
                project.status = "failed";
                saveState();
            }
            const normalizedError = normalizePipelineError(error);
            updateStatus("处理失败", true);
            addDevLog(`处理失败：${error?.message || normalizedError}`);
            applyRunState({
                status: "failed",
                message: `处理失败：${normalizedError}`,
                stage: "failed",
            });
            if (typeof onFailed === "function") {
                onFailed(projectId, normalizedError);
            }
            alert(`分析失败：${normalizedError}`);
        } finally {
            state.isProcessing = false;
            setTimeout(() => {
                updateProgressBar(0);
                updateStatus("", false);

                state.pendingFile = null;
                if (state.activeRun?.projectId === projectId && state.activeRun.status !== "running") {
                    state.activeRun = null;
                    saveState();
                    if (typeof onRunStateChange === "function") {
                        onRunStateChange();
                    }
                }
                onCompleted();
            }, 1200);
        }
    };
}
