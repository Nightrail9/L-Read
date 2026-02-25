export const ROOT_PATH = "/";
export const TASK_PATH = "/task";
export const PROJECTS_PATH = "/projects";

export function getNormalizedPath(pathname) {
    const raw = String(pathname || "").trim();
    if (!raw || raw === ROOT_PATH) {
        return ROOT_PATH;
    }
    return raw.endsWith("/") ? raw.slice(0, -1) || ROOT_PATH : raw;
}

export function getPathForView(viewId, projectId = null, activeProjectId = null) {
    if (viewId === "new-task") {
        return TASK_PATH;
    }
    if (viewId === "reading") {
        const targetId = projectId ?? activeProjectId;
        return targetId == null ? PROJECTS_PATH : `${PROJECTS_PATH}/${encodeURIComponent(String(targetId))}`;
    }
    return PROJECTS_PATH;
}

export function parseRoute(pathname) {
    const normalizedPath = getNormalizedPath(pathname);
    if (normalizedPath === ROOT_PATH || normalizedPath === TASK_PATH) {
        return { viewId: "new-task" };
    }
    if (normalizedPath === PROJECTS_PATH) {
        return { viewId: "project-list" };
    }

    const detailMatch = normalizedPath.match(/^\/projects\/([^/]+)$/);
    if (detailMatch) {
        return { viewId: "reading", projectId: decodeURIComponent(detailMatch[1]) };
    }

    return { viewId: "new-task" };
}

export function updateBrowserPath(path, replaceState = false) {
    const targetPath = getNormalizedPath(path);
    const currentPath = getNormalizedPath(window.location.pathname);
    if (targetPath === currentPath) {
        return;
    }
    const method = replaceState ? "replaceState" : "pushState";
    window.history[method]({}, "", targetPath);
}
