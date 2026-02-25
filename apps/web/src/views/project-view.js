import { showDeleteConfirmModal } from "../ui/components.js";

function toTimestamp(value, fallback = 0) {
    const timestamp = Number(value);
    return Number.isFinite(timestamp) ? timestamp : fallback;
}

function compareByCreatedAtDesc(a, b) {
    const aCreatedAt = toTimestamp(a.createdAt);
    const bCreatedAt = toTimestamp(b.createdAt);
    if (bCreatedAt !== aCreatedAt) {
        return bCreatedAt - aCreatedAt;
    }

    return String(b.id || "").localeCompare(String(a.id || ""));
}

function compareByLastAccessedDesc(a, b) {
    const aCreatedAt = toTimestamp(a.createdAt);
    const bCreatedAt = toTimestamp(b.createdAt);
    const aLastAccessed = toTimestamp(a.lastAccessed, aCreatedAt);
    const bLastAccessed = toTimestamp(b.lastAccessed, bCreatedAt);
    if (bLastAccessed !== aLastAccessed) {
        return bLastAccessed - aLastAccessed;
    }

    return compareByCreatedAtDesc(a, b);
}

function getProjectsSortedByCreatedAt(state) {
    return [...state.projects].sort(compareByCreatedAtDesc);
}

function getProjectsSortedByRecentAccess(state) {
    return [...state.projects].sort(compareByLastAccessedDesc);
}

function getProjectNoteCount(project) {
    const localCount = Array.isArray(project.notes) ? project.notes.length : 0;
    const backendCount = Number(project.notesCount || 0);
    return Math.max(localCount, backendCount);
}

function escapeHtml(value) {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function normalizeTag(tag) {
    return String(tag || "").trim();
}

const DEFAULT_LITERATURE_TAG = "待分类";

const LITERATURE_TAG_DEFS = [
    { value: "待分类", icon: "tag", toneClass: "tag-tone-default" },
    { value: "方法创新", icon: "lightbulb", toneClass: "tag-tone-method" },
    { value: "理论分析", icon: "sigma", toneClass: "tag-tone-theory" },
    { value: "实验评估", icon: "flask-conical", toneClass: "tag-tone-experiment" },
    { value: "工程实现", icon: "code", toneClass: "tag-tone-code" },
    { value: "应用研究", icon: "rocket", toneClass: "tag-tone-application" },
    { value: "综述调研", icon: "book-open", toneClass: "tag-tone-survey" },
];

const LITERATURE_TAG_META = new Map(
    LITERATURE_TAG_DEFS.map((item) => [item.value, item])
);

function getAllLiteratureTagValues() {
    return LITERATURE_TAG_DEFS.map((item) => item.value);
}

function resolveLiteratureTagMeta(tag) {
    const label = normalizeTag(tag) || DEFAULT_LITERATURE_TAG;
    const matched = LITERATURE_TAG_META.get(label);
    if (matched) {
        return {
            label,
            icon: matched.icon,
            toneClass: matched.toneClass,
        };
    }

    return {
        label: DEFAULT_LITERATURE_TAG,
        icon: "tag",
        toneClass: "tag-tone-default",
    };
}

function getProjectTags(project) {
    const source = Array.isArray(project?.tags) ? project.tags : [];
    const seen = new Set();
    const tags = [];
    const allowed = new Set(getAllLiteratureTagValues());
    source.forEach((tag) => {
        const normalized = normalizeTag(tag);
        if (!normalized) {
            return;
        }
        if (!allowed.has(normalized)) {
            return;
        }
        const key = normalized.toLowerCase();
        if (seen.has(key)) {
            return;
        }
        seen.add(key);
        tags.push(normalized);
    });
    if (tags.length === 0) {
        return [DEFAULT_LITERATURE_TAG];
    }
    return tags;
}

function collectAllTags() {
    return getAllLiteratureTagValues();
}

function syncTagFilterIcon(state) {
    const iconEl = document.getElementById("project-tag-filter-icon");
    if (!iconEl) {
        return;
    }

    const selected = String(state.selectedTag || "all");
    const iconName =
        selected === "all" ? "tag" : resolveLiteratureTagMeta(selected).icon;
    iconEl.setAttribute("data-lucide", iconName);
}

function syncTagFilterOptions(state) {
    const select = document.getElementById("project-tag-filter");
    if (!select) {
        return;
    }

    const tags = collectAllTags();
    const selected = String(state.selectedTag || "all");
    const hasSelected = selected === "all" || tags.some((tag) => tag === selected);
    if (!hasSelected) {
        state.selectedTag = "all";
    }

    select.innerHTML = "";
    const allOption = document.createElement("option");
    allOption.value = "all";
    allOption.textContent = "全部";
    select.appendChild(allOption);

    tags.forEach((tag) => {
        const option = document.createElement("option");
        option.value = tag;
        option.textContent = tag;
        select.appendChild(option);
    });

    select.value = state.selectedTag || "all";
    syncTagFilterIcon(state);
}

function getStatusMeta(status, hasError) {
    if (status === "failed") {
        return { label: "失败", className: "project-status-failed" };
    }
    if (status === "completed" || status === "done") {
        if (hasError) {
            return { label: "部分失败", className: "project-status-partial" };
        }
        return { label: "已完成", className: "project-status-done" };
    }
    if (status === "running") {
        return { label: "运行中", className: "project-status-running" };
    }
    if (status === "indexed") {
        return { label: "已索引", className: "project-status-queued" };
    }
    if (status === "extracted") {
        return { label: "已提取", className: "project-status-queued" };
    }
    if (status === "pdf_uploaded") {
        return { label: "已上传", className: "project-status-queued" };
    }
    return { label: "已创建", className: "project-status-queued" };
}

export function renderHistoryPopover({ state, onSelectProject, setupIcons }) {
    const container = document.getElementById("history-popover-list");
    container.innerHTML = "";
    const sorted = getProjectsSortedByRecentAccess(state);

    if (sorted.length === 0) {
        container.innerHTML =
            '<div class="p-5 text-center text-[10px] text-[#37352f]/40 font-bold uppercase tracking-wider">无历史记录</div>';
        return;
    }

    sorted.forEach((project) => {
        const timeValue = project.lastAccessed || project.createdAt;
        const timeText = Number.isFinite(timeValue)
            ? new Date(timeValue).toLocaleDateString("zh-CN", {
                month: "2-digit",
                day: "2-digit",
            })
            : "--/--";
        const item = document.createElement("button");
        item.className = "history-item-card w-full flex items-center gap-3 p-3 rounded-xl group text-left";
        item.innerHTML = `
            <div class="history-item-icon p-1.5 rounded-md border border-[#E9E9E7] shadow-sm">
                <i data-lucide="file-text" class="w-3.5 h-3.5 text-[#37352f]/40 group-hover:text-black"></i>
            </div>
            <div class="flex-1 overflow-hidden">
                <p class="text-[11px] font-bold text-[#37352F] truncate leading-tight">${project.name}</p>
                <p class="text-[9px] text-[#37352f]/45 uppercase tracking-tighter mt-0.5">${getProjectNoteCount(project)} 笔记</p>
            </div>
            <div class="history-item-meta text-right flex-shrink-0">
                <p class="text-[9px] font-bold text-[#37352f]/35 uppercase tracking-wider">${timeText}</p>
                <i data-lucide="chevron-right" class="w-3.5 h-3.5 text-[#37352f]/20 ml-auto mt-0.5"></i>
            </div>
        `;
        item.onclick = (event) => {
            event.stopPropagation();
            onSelectProject(project.id);
            document.getElementById("history-popover").classList.add("hidden");
        };
        container.appendChild(item);
    });
    setupIcons();
}

export function renderSidebarShortcuts({ state, onSelectProject, setupIcons }) {
    const container = document.getElementById("project-list-sidebar");
    container.innerHTML = "";
    const sorted = getProjectsSortedByCreatedAt(state);

    sorted.slice(0, 4).forEach((project) => {
        const button = document.createElement("button");
        button.className = "w-full flex items-center gap-3 p-2 rounded-lg hover:bg-[#EDEDEB] transition-colors group";
        button.innerHTML = `
            <i data-lucide="file-text" class="w-3.5 h-3.5 flex-shrink-0 text-[#37352f]/40 group-hover:text-black"></i>
            <span class="text-[11px] font-medium truncate sidebar-label text-[#37352f]/70 group-hover:text-black">${project.name}</span>
        `;
        button.onclick = () => onSelectProject(project.id);
        container.appendChild(button);
    });
    if (setupIcons) {
        setupIcons();
    }
}

export function renderProjectList({
    state,
    onSelectProject,
    onDeleteProject,
    onRetryProject,
    onEditTags,
    setupIcons,
}) {
    const tableBody = document.getElementById("project-table-body");
    tableBody.innerHTML = "";
    syncTagFilterOptions(state);

    const selectedTag = String(state.selectedTag || "all");

    const filtered = getProjectsSortedByRecentAccess(state).filter((project) => {
        const tags = getProjectTags(project);
        const matchesTag = selectedTag === "all" || tags.includes(selectedTag);
        if (!matchesTag) {
            return false;
        }
        if (!state.searchQuery) {
            return true;
        }
        return (
            project.name.toLowerCase().includes(state.searchQuery) ||
            (project.repo && project.repo.toLowerCase().includes(state.searchQuery)) ||
            tags.some((tag) => tag.toLowerCase().includes(state.searchQuery))
        );
    });

    if (filtered.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="6" class="project-empty-cell">
                    <div class="flex flex-col items-center">
                        <i data-lucide="search-x" class="w-10 h-10 text-[#37352f]/10 mb-3"></i>
                        <p class="text-sm text-[#37352f]/40 font-medium">没有找到匹配的项目</p>
                    </div>
                </td>
            </tr>
        `;
        setupIcons();
        return;
    }

    filtered.forEach((project) => {
        const statusMeta = getStatusMeta(project.status, Boolean(project.error));
        const isRunning = project.status === "running";
        const canRetry = project.status === "failed" || Boolean(project.error);
        const projectTags = getProjectTags(project);
        const primaryTag = projectTags[0] || DEFAULT_LITERATURE_TAG;
        const primaryTagMeta = resolveLiteratureTagMeta(primaryTag);
        const extraTagCount = Math.max(projectTags.length - 1, 0);
        const tagLine = `
            <span class="project-tag-chip ${primaryTagMeta.toneClass}">
                <i data-lucide="${primaryTagMeta.icon}" class="project-tag-icon"></i>
                ${escapeHtml(primaryTagMeta.label)}
            </span>
            ${extraTagCount > 0 ? `<span class="project-tag-extra">+${extraTagCount}</span>` : ""}
        `;
        const color = project.color || "#64748B";
        const noteCount = getProjectNoteCount(project);
        const row = document.createElement("tr");
        row.className = "project-row";
        row.innerHTML = `
            <td class="project-cell project-cell-logo">
                <div class="project-logo-box" style="background-color: ${color}22; color: ${color};">
                    <i data-lucide="file-text" class="w-4 h-4"></i>
                </div>
            </td>
            <td class="project-cell project-cell-title">
                <p class="project-title-text" title="${escapeHtml(project.name)}" data-full-title="${escapeHtml(project.name)}">${escapeHtml(project.name)}</p>
            </td>
            <td class="project-cell project-cell-status">
                <span class="project-status-chip ${statusMeta.className}">
                    ${isRunning ? '<span class="project-status-dot"></span>' : ""}
                    <span>${escapeHtml(statusMeta.label)}</span>
                </span>
            </td>
            <td class="project-cell project-cell-tag">
                <button type="button" class="project-tag-trigger" title="编辑文献标签">
                    <span class="project-tag-row">${tagLine}</span>
                </button>
            </td>
            <td class="project-cell project-cell-count">
                <span class="project-note-count ${noteCount > 0 ? "has-notes" : "no-notes"}">${noteCount}</span>
            </td>
            <td class="project-cell project-cell-actions">
                <div class="project-actions-wrap">
                    <button class="delete-project-btn project-action-icon" title="删除项目">
                        <i data-lucide="trash-2" class="w-4 h-4"></i>
                    </button>
                    ${canRetry ? '<button class="retry-project-btn project-action-icon" title="重试失败模块"><i data-lucide="refresh-cw" class="w-4 h-4"></i></button>' : ""}
                    <button class="view-project-btn project-action-icon" title="查看项目" aria-label="查看项目">
                        <i data-lucide="arrow-right" class="w-4 h-4"></i>
                    </button>
                </div>
            </td>
        `;

        row.addEventListener("click", async (event) => {
            if (event.target.closest(".delete-project-btn")) {
                event.stopPropagation();
                const confirmed = await showDeleteConfirmModal();
                if (confirmed) {
                    await onDeleteProject(project.id);
                }
                return;
            }
            if (event.target.closest(".retry-project-btn")) {
                event.stopPropagation();
                if (typeof onRetryProject === "function") {
                    await onRetryProject(project.id);
                }
                return;
            }
            if (event.target.closest(".project-tag-trigger")) {
                event.stopPropagation();
                if (typeof onEditTags === "function") {
                    onEditTags(project.id);
                }
                return;
            }
            if (event.target.closest(".view-project-btn")) {
                event.stopPropagation();
                onSelectProject(project.id);
                return;
            }
            onSelectProject(project.id);
        });

        tableBody.appendChild(row);
    });
    setupIcons();
}
