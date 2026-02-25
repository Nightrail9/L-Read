const PROJECT_COLORS = ["#FF7369", "#FFAB00", "#36B37E", "#00B8D9"];

export const FIXED_LITERATURE_TAGS = [
    "待分类",
    "方法创新",
    "理论分析",
    "实验评估",
    "工程实现",
    "应用研究",
    "综述调研",
];

const FIXED_LITERATURE_TAG_SET = new Set(FIXED_LITERATURE_TAGS);

function parseTimestamp(value, fallback) {
    const ts = Date.parse(value || "");
    return Number.isFinite(ts) ? ts : fallback;
}

function pickProjectColor(seed, fallback) {
    if (fallback) {
        return fallback;
    }
    const text = String(seed || "");
    let hash = 0;
    for (let i = 0; i < text.length; i += 1) {
        hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
    }
    return PROJECT_COLORS[hash % PROJECT_COLORS.length];
}

function deriveProjectName(job, existingProject) {
    const pdfPath = String(job.pdf_path || "").trim();
    if (pdfPath) {
        const leaf = pdfPath.split(/[\\/]/).pop() || "";
        const stem = leaf.replace(/\.pdf$/i, "") || leaf;
        if (stem && stem.toLowerCase() !== "original") {
            return stem;
        }

        const normalized = pdfPath.replace(/\\/g, "/");
        const parts = normalized.split("/").filter(Boolean);
        const paperIndex = parts.lastIndexOf("paper");
        if (paperIndex > 0) {
            const folderName = parts[paperIndex - 1];
            if (folderName) {
                return folderName;
            }
        }
    }
    if (existingProject?.name && existingProject.name.toLowerCase() !== "original") {
        return existingProject.name;
    }
    return `任务 ${job.id}`;
}

function deriveProjectRepo(job, existingProject) {
    const meta = job.repo_meta_json || {};
    if (meta.type === "git") {
        return meta.git_url || existingProject?.repo || "Git Repo";
    }
    if (meta.type === "local_path") {
        return meta.path || existingProject?.repo || "本地路径";
    }
    return existingProject?.repo || "User Upload";
}

export function normalizeProjectTags(tags) {
    const source = Array.isArray(tags) ? tags : [];
    const seen = new Set();
    const output = [];
    source.forEach((tag) => {
        const normalized = String(tag || "").trim();
        if (!normalized) {
            return;
        }
        if (!FIXED_LITERATURE_TAG_SET.has(normalized)) {
            return;
        }
        const key = normalized.toLowerCase();
        if (seen.has(key)) {
            return;
        }
        seen.add(key);
        output.push(normalized);
    });
    return output.slice(0, 1);
}

function buildProjectFromJob(job, existingByKey) {
    const key = String(job.id);
    const existingProject = existingByKey.get(key);
    const createdAt = parseTimestamp(job.created_at, existingProject?.createdAt || Date.now());
    const persistedLastAccessed = Number(existingProject?.lastAccessed);
    const lastAccessed = Number.isFinite(persistedLastAccessed) && persistedLastAccessed > 0
        ? persistedLastAccessed
        : createdAt;
    const existingNotes = Array.isArray(existingProject?.notes) ? existingProject.notes : [];
    const outputsCount = Number(job.outputs_count || 0);
    const tags = normalizeProjectTags(existingProject?.tags || []);

    return {
        id: key,
        jobId: key,
        createdAt,
        lastAccessed,
        name: deriveProjectName(job, existingProject),
        repo: deriveProjectRepo(job, existingProject),
        color: pickProjectColor(key, existingProject?.color),
        status: job.status || existingProject?.status || "created",
        error: job.error || null,
        notes: existingNotes,
        notesCount: Math.max(existingNotes.length, outputsCount),
        tags,
    };
}

function getProjectKey(project) {
    return String(project?.jobId || project?.id || "");
}

export function createProjectSync({
    state,
    api,
    saveState,
    refreshProjectPanels,
    onActiveProjectMissing,
}) {
    let syncProjectsPromise = null;

    function resolveBackendJobId(project) {
        const jobId = String(project?.jobId || "").trim();
        return jobId || null;
    }

    function applyJobsPayloadToState(payload, { silent = false } = {}) {
        const previousProjects = state.projects;
        const previousByKey = new Map();
        previousProjects.forEach((project) => {
            const key = getProjectKey(project);
            if (key) {
                previousByKey.set(key, project);
            }
        });

        const previousActiveProject = previousProjects.find(
            (project) => String(project.id) === String(state.activeProjectId)
        );
        const previousActiveKey = getProjectKey(previousActiveProject);

        const jobs = Array.isArray(payload?.items) ? payload.items : [];
        state.projects = jobs.map((job) => buildProjectFromJob(job, previousByKey));

        if (state.activeRun?.jobId) {
            const runJobId = String(state.activeRun.jobId);
            const matchedProject = state.projects.find(
                (project) => String(project.jobId || project.id) === runJobId
            );
            if (matchedProject && String(state.activeRun.projectId) !== String(matchedProject.id)) {
                state.activeRun = {
                    ...state.activeRun,
                    projectId: matchedProject.id,
                };
            }
        }

        if (previousActiveKey) {
            const nextActive = state.projects.find(
                (project) => String(project.jobId) === previousActiveKey
            );
            state.activeProjectId = nextActive ? nextActive.id : null;
            if (!nextActive) {
                state.activeNoteId = null;
                if (state.currentView === "reading" && typeof onActiveProjectMissing === "function") {
                    onActiveProjectMissing();
                }
            }
        }

        saveState();

        if (!silent) {
            refreshProjectPanels();
        }
    }

    async function syncProjectsFromBackend({ silent = false, force = false } = {}) {
        if (state.isProcessing && !force) {
            return;
        }
        if (syncProjectsPromise) {
            return syncProjectsPromise;
        }

        syncProjectsPromise = (async () => {
            const payload = await api.listJobs();
            applyJobsPayloadToState(payload, { silent });
        })().catch((error) => {
            console.error("同步项目列表失败:", error);
        }).finally(() => {
            syncProjectsPromise = null;
        });

        return syncProjectsPromise;
    }

    async function syncProjectsWithDirectory() {
        const payload = await api.syncJobs();
        applyJobsPayloadToState(payload, { silent: false });
    }

    return {
        resolveBackendJobId,
        syncProjectsFromBackend,
        syncProjectsWithDirectory,
    };
}
