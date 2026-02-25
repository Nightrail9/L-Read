import {
    markdownLibReady,
    renderMathInElement,
    renderMarkdownSafe,
} from "../services/markdown-renderer.js";

function formatPlainTextAsHtml(text) {
    return String(text || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\n/g, "<br>");
}

function escapeHtml(value) {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function getBlockText(block) {
    if (!block) {
        return "";
    }
    if (block.type === "toggle") {
        return `${block.summary || ""}\n${block.details || ""}`.trim();
    }
    return String(block.text || "").trim();
}

function getNoteText(note) {
    const blocks = Array.isArray(note?.content) ? note.content : [];
    return blocks.map(getBlockText).filter(Boolean).join("\n\n");
}

function getPreviewSnippet(note, maxLen = 220) {
    const text = getNoteText(note).replace(/\s+/g, " ").trim();
    if (text.length <= maxLen) {
        return text;
    }
    return `${text.slice(0, maxLen)}...`;
}

function stripMarkdownSyntax(text) {
    return String(text || "")
        .replace(/```[\s\S]*?```/g, " ")
        .replace(/`([^`]+)`/g, "$1")
        .replace(/^\s{0,3}#{1,6}\s+/gm, "")
        .replace(/^\s{0,3}>\s?/gm, "")
        .replace(/^\s*[-*+]\s+/gm, "")
        .replace(/^\s*\d+\.\s+/gm, "")
        .replace(/\*\*([^*]+)\*\*/g, "$1")
        .replace(/\*([^*]+)\*/g, "$1")
        .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
        .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function getReadablePreviewSnippet(note, maxLen = 220) {
    const raw = getNoteText(note);
    const rendered = renderMarkdownSafe(raw);
    let text = "";

    if (rendered && typeof document !== "undefined") {
        const temp = document.createElement("div");
        temp.innerHTML = rendered;
        text = String(temp.textContent || "").replace(/\s+/g, " ").trim();
    }

    if (!text) {
        text = stripMarkdownSyntax(raw);
    }

    if (!text) {
        return "";
    }
    if (text.length <= maxLen) {
        return text;
    }
    return `${text.slice(0, maxLen)}...`;
}

function renderMarkdownContent(rawText, fallbackClassName) {
    const text = String(rawText || "");
    const rendered = renderMarkdownSafe(text);
    if (rendered) {
        return rendered;
    }

    const fallbackClass = fallbackClassName || "note-preview-text";
    const safeHtml = formatPlainTextAsHtml(text || "暂无内容");
    return `<div class="${fallbackClass}">${safeHtml}</div>`;
}

function resolveProjectByState(state) {
    return state.projects.find((item) => String(item.id) === String(state.activeProjectId));
}

function resolveNoteByState(state) {
    const project = resolveProjectByState(state);
    if (!project) {
        return { project: null, note: null };
    }
    const notes = Array.isArray(project.notes) ? project.notes : [];
    const note = notes.find((item) => String(item.id) === String(state.activeNoteId)) || notes[0] || null;
    return { project, note };
}

export function buildNoteMarkdown(project, note) {
    if (!project || !note) {
        return "";
    }

    const text = getNoteText(note);
    let markdown = `# ${note.title}\n\n`;
    markdown += `**Category:** ${note.category || ""}\n`;
    markdown += `**Project:** ${project.name || ""}\n`;
    markdown += `**Date:** ${note.date || ""}\n\n`;
    markdown += "---\n\n";
    markdown += `${text}\n`;
    return markdown;
}

export function getActiveNoteAsMarkdown(state) {
    const { project, note } = resolveNoteByState(state);
    return buildNoteMarkdown(project, note);
}

export function downloadNoteAsMarkdown(project, note) {
    const markdown = buildNoteMarkdown(project, note);
    if (!markdown) {
        return;
    }
    const fileName = `${project.name}_${note.title}.md`.replace(/[^\w\u4e00-\u9fa5.-]+/g, "_");
    const blob = new Blob([markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
}

export function downloadActiveNoteAsMarkdown(state) {
    const { project, note } = resolveNoteByState(state);
    if (!project || !note) {
        return;
    }
    downloadNoteAsMarkdown(project, note);
}

function setReadingHeader(project) {
    const titleEl = document.getElementById("reading-project-title");
    const countEl = document.getElementById("note-count-badge");
    if (titleEl) {
        titleEl.innerText = project?.name || "项目详情";
    }
    if (countEl) {
        const count = Array.isArray(project?.notes) ? project.notes.length : 0;
        countEl.innerText = `${count} / 4`;
    }
}

export function renderNoteCards({
    state,
    project,
    onPreviewNote,
    onDownloadNote,
    onEditNote,
    setupIcons,
}) {
    const container = document.getElementById("note-card-grid");
    if (!container) {
        return;
    }

    setReadingHeader(project);
    container.innerHTML = "";
    const notes = Array.isArray(project?.notes) ? project.notes : [];

    notes.forEach((note) => {
        const card = document.createElement("article");
        card.className = "note-card";
        card.dataset.noteId = String(note.id);

        const snippet = escapeHtml(getReadablePreviewSnippet(note));
        const safeTitle = escapeHtml(note.title || "未命名笔记");
        const safeCategory = escapeHtml(note.category || "GENERAL");
        card.innerHTML = `
            <div class="note-card-head">
                <div class="note-card-icon-wrap">
                    <i data-lucide="${note.icon || "file-text"}" class="w-4 h-4"></i>
                </div>
                <div class="min-w-0 flex-1">
                    <h3 class="note-card-title" title="${safeTitle}">${safeTitle}</h3>
                    <p class="note-card-category">${safeCategory}</p>
                </div>
            </div>
            <div class="note-card-preview">${snippet || "暂无内容"}</div>
            <div class="note-card-actions">
                <button type="button" class="note-card-btn note-preview-btn" data-note-action="preview" data-note-id="${note.id}">
                    <i data-lucide="eye" class="w-3.5 h-3.5"></i>
                    <span>预览</span>
                </button>
                <button type="button" class="note-card-btn note-download-btn" data-note-action="download" data-note-id="${note.id}">
                    <i data-lucide="download" class="w-3.5 h-3.5"></i>
                    <span>下载</span>
                </button>
                <button type="button" class="note-card-btn note-edit-btn" data-note-action="edit" data-note-id="${note.id}">
                    <i data-lucide="square-pen" class="w-3.5 h-3.5"></i>
                    <span>编辑</span>
                </button>
            </div>
        `;

        card.addEventListener("click", (event) => {
            const actionButton = event.target.closest("[data-note-action]");
            if (!actionButton) {
                return;
            }
            const action = actionButton.dataset.noteAction;
            if (action === "preview" && typeof onPreviewNote === "function") {
                onPreviewNote(note.id);
            }
            if (action === "download" && typeof onDownloadNote === "function") {
                onDownloadNote(note);
            }
            if (action === "edit" && typeof onEditNote === "function") {
                onEditNote(note);
            }
        });

        container.appendChild(card);
    });

    if (notes.length === 0) {
        container.innerHTML = `
            <div class="reading-empty-state">
                <div class="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                <p class="text-sm text-[#37352f]/40 uppercase font-bold tracking-widest">正在深度分析文献内容</p>
            </div>
        `;
    }

    state.activeNoteId = notes[0]?.id || null;
    setupIcons();
}

const previewState = {
    project: null,
    notes: [],
    index: 0,
    setupIcons: null,
    isFullscreen: false,
    bound: false,
};

function setPreviewFullscreen(isFullscreen) {
    const overlay = document.getElementById("note-preview-overlay");
    const modal = document.getElementById("note-preview-modal");
    const fullscreenBtn = document.getElementById("note-preview-fullscreen");
    if (!overlay || !modal || !fullscreenBtn) {
        return;
    }

    previewState.isFullscreen = Boolean(isFullscreen);
    overlay.classList.toggle("p-0", previewState.isFullscreen);
    overlay.classList.toggle("p-4", !previewState.isFullscreen);

    modal.classList.toggle("w-screen", previewState.isFullscreen);
    modal.classList.toggle("h-screen", previewState.isFullscreen);
    modal.classList.toggle("max-w-none", previewState.isFullscreen);
    modal.classList.toggle("rounded-none", previewState.isFullscreen);

    modal.classList.toggle("w-full", !previewState.isFullscreen);
    modal.classList.toggle("h-[82vh]", !previewState.isFullscreen);
    modal.classList.toggle("max-w-5xl", !previewState.isFullscreen);
    modal.classList.toggle("rounded-2xl", !previewState.isFullscreen);

    const icon = fullscreenBtn.querySelector("i");
    if (icon) {
        icon.setAttribute("data-lucide", previewState.isFullscreen ? "minimize" : "maximize");
    }
    fullscreenBtn.setAttribute("title", previewState.isFullscreen ? "退出网页全屏" : "网页全屏");

    if (typeof previewState.setupIcons === "function") {
        previewState.setupIcons();
    }
}

function togglePreviewFullscreen() {
    setPreviewFullscreen(!previewState.isFullscreen);
}

function renderPreviewCurrent() {
    const titleEl = document.getElementById("note-preview-title");
    const metaEl = document.getElementById("note-preview-meta");
    const contentEl = document.getElementById("note-preview-content");
    const prevBtn = document.getElementById("note-preview-prev");
    const nextBtn = document.getElementById("note-preview-next");
    if (!titleEl || !metaEl || !contentEl || !prevBtn || !nextBtn) {
        return;
    }

    const total = previewState.notes.length;
    const safeIndex = Math.max(0, Math.min(previewState.index, total - 1));
    previewState.index = safeIndex;
    const note = previewState.notes[safeIndex];
    if (!note) {
        return;
    }

    titleEl.innerText = note.title || "笔记预览";
    metaEl.innerText = `${note.category || "GENERAL"} · ${safeIndex + 1} / ${total}`;
    contentEl.innerHTML = renderMarkdownContent(getNoteText(note), "note-preview-text");
    renderMathInElement(contentEl);

    const canSwitch = total > 1;
    prevBtn.disabled = !canSwitch;
    nextBtn.disabled = !canSwitch;
}

function movePreviewIndex(step) {
    const total = previewState.notes.length;
    if (total <= 1) {
        return;
    }
    previewState.index = (previewState.index + step + total) % total;
    renderPreviewCurrent();
}

function closeNotePreviewModal() {
    const overlay = document.getElementById("note-preview-overlay");
    const modal = document.getElementById("note-preview-modal");
    if (!overlay || !modal) {
        return;
    }
    setPreviewFullscreen(false);
    modal.classList.add("scale-95", "opacity-0");
    modal.classList.remove("scale-100", "opacity-100");
    setTimeout(() => {
        overlay.classList.add("hidden");
    }, 140);
}

function bindPreviewEvents() {
    if (previewState.bound) {
        return;
    }
    const overlay = document.getElementById("note-preview-overlay");
    const closeBtn = document.getElementById("note-preview-close");
    const prevBtn = document.getElementById("note-preview-prev");
    const nextBtn = document.getElementById("note-preview-next");
    const fullscreenBtn = document.getElementById("note-preview-fullscreen");
    if (!overlay || !closeBtn || !prevBtn || !nextBtn || !fullscreenBtn) {
        return;
    }

    closeBtn.addEventListener("click", closeNotePreviewModal);
    overlay.addEventListener("click", (event) => {
        if (event.target === overlay) {
            closeNotePreviewModal();
        }
    });
    prevBtn.addEventListener("click", () => {
        movePreviewIndex(-1);
    });
    nextBtn.addEventListener("click", () => {
        movePreviewIndex(1);
    });
    fullscreenBtn.addEventListener("click", togglePreviewFullscreen);

    document.addEventListener("keydown", (event) => {
        const isOpen = !overlay.classList.contains("hidden");
        if (!isOpen) {
            return;
        }
        if (event.key === "Escape") {
            closeNotePreviewModal();
        }
        if (event.key === "ArrowLeft") {
            event.preventDefault();
            movePreviewIndex(-1);
        }
        if (event.key === "ArrowRight") {
            event.preventDefault();
            movePreviewIndex(1);
        }
    });

    previewState.bound = true;
}

export function openNotePreviewModal({ project, noteId, setupIcons }) {
    const notes = Array.isArray(project?.notes) ? project.notes : [];
    if (!notes.length) {
        return;
    }
    const overlay = document.getElementById("note-preview-overlay");
    const modal = document.getElementById("note-preview-modal");
    if (!overlay || !modal) {
        return;
    }

    const index = Math.max(0, notes.findIndex((item) => String(item.id) === String(noteId)));
    previewState.project = project;
    previewState.notes = notes;
    previewState.index = index;
    previewState.setupIcons = setupIcons;
    setPreviewFullscreen(false);
    bindPreviewEvents();
    renderPreviewCurrent();

    overlay.classList.remove("hidden");
    setTimeout(() => {
        modal.classList.remove("scale-95", "opacity-0");
        modal.classList.add("scale-100", "opacity-100");
    }, 10);
    setupIcons();
}

const editState = {
    note: null,
    onSave: null,
    setupIcons: null,
    initialText: "",
    isSaving: false,
    isFullscreen: false,
    bound: false,
    isSyncingScroll: false,
};

function getScrollRatio(element) {
    if (!element) {
        return 0;
    }
    const maxScroll = element.scrollHeight - element.clientHeight;
    if (maxScroll <= 0) {
        return 0;
    }
    return Math.max(0, Math.min(1, element.scrollTop / maxScroll));
}

function setScrollRatio(element, ratio) {
    if (!element) {
        return;
    }
    const maxScroll = element.scrollHeight - element.clientHeight;
    if (maxScroll <= 0) {
        element.scrollTop = 0;
        return;
    }
    const safeRatio = Math.max(0, Math.min(1, Number(ratio) || 0));
    element.scrollTop = maxScroll * safeRatio;
}

function syncScrollBetween(fromEl, toEl) {
    if (!fromEl || !toEl || editState.isSyncingScroll) {
        return;
    }
    editState.isSyncingScroll = true;
    setScrollRatio(toEl, getScrollRatio(fromEl));
    requestAnimationFrame(() => {
        editState.isSyncingScroll = false;
    });
}

function renderEditPreview() {
    const textarea = document.getElementById("note-edit-textarea");
    const previewEl = document.getElementById("note-edit-preview");
    const renderStateEl = document.getElementById("note-edit-render-state");
    if (!textarea || !previewEl) {
        return;
    }

    const sourceRatio = getScrollRatio(textarea);
    previewEl.innerHTML = renderMarkdownContent(textarea.value || "", "note-edit-preview-text");
    renderMathInElement(previewEl);
    setScrollRatio(previewEl, sourceRatio);

    if (renderStateEl) {
        renderStateEl.innerText = markdownLibReady()
            ? "Markdown 渲染"
            : "纯文本预览（降级）";
    }
}

function setEditFullscreen(isFullscreen) {
    const overlay = document.getElementById("note-edit-overlay");
    const modal = document.getElementById("note-edit-modal");
    const fullscreenBtn = document.getElementById("note-edit-fullscreen");
    if (!overlay || !modal || !fullscreenBtn) {
        return;
    }

    editState.isFullscreen = Boolean(isFullscreen);
    overlay.classList.toggle("p-0", editState.isFullscreen);
    overlay.classList.toggle("p-4", !editState.isFullscreen);

    modal.classList.toggle("w-screen", editState.isFullscreen);
    modal.classList.toggle("h-screen", editState.isFullscreen);
    modal.classList.toggle("max-w-none", editState.isFullscreen);
    modal.classList.toggle("rounded-none", editState.isFullscreen);

    modal.classList.toggle("w-full", !editState.isFullscreen);
    modal.classList.toggle("h-[80vh]", !editState.isFullscreen);
    modal.classList.toggle("max-w-4xl", !editState.isFullscreen);
    modal.classList.toggle("rounded-2xl", !editState.isFullscreen);

    const icon = fullscreenBtn.querySelector("i");
    if (icon) {
        icon.setAttribute("data-lucide", editState.isFullscreen ? "minimize" : "maximize");
    }
    fullscreenBtn.setAttribute("title", editState.isFullscreen ? "退出网页全屏" : "网页全屏");

    if (typeof editState.setupIcons === "function") {
        editState.setupIcons();
    }
}

function toggleEditFullscreen() {
    setEditFullscreen(!editState.isFullscreen);
}

function hasUnsavedEdit() {
    const textarea = document.getElementById("note-edit-textarea");
    if (!textarea) {
        return false;
    }
    return textarea.value !== editState.initialText;
}

function closeNoteEditModal({ force = false } = {}) {
    const overlay = document.getElementById("note-edit-overlay");
    const modal = document.getElementById("note-edit-modal");
    if (!overlay || !modal) {
        return;
    }
    if (!force) {
        if (editState.isSaving) {
            return;
        }
        if (hasUnsavedEdit()) {
            const shouldClose = confirm("当前有未保存修改，确定要关闭吗？");
            if (!shouldClose) {
                return;
            }
        }
    }
    setEditFullscreen(false);
    modal.classList.add("scale-95", "opacity-0");
    modal.classList.remove("scale-100", "opacity-100");
    editState.initialText = "";
    editState.isSaving = false;
    setTimeout(() => {
        overlay.classList.add("hidden");
    }, 140);
}

function bindEditEvents() {
    if (editState.bound) {
        return;
    }
    const overlay = document.getElementById("note-edit-overlay");
    const closeBtn = document.getElementById("note-edit-close");
    const cancelBtn = document.getElementById("note-edit-cancel");
    const fullscreenBtn = document.getElementById("note-edit-fullscreen");
    const saveBtn = document.getElementById("note-edit-save");
    const textarea = document.getElementById("note-edit-textarea");
    const previewEl = document.getElementById("note-edit-preview");
    if (!overlay || !closeBtn || !cancelBtn || !fullscreenBtn || !saveBtn || !textarea || !previewEl) {
        return;
    }

    closeBtn.addEventListener("click", closeNoteEditModal);
    cancelBtn.addEventListener("click", closeNoteEditModal);
    fullscreenBtn.addEventListener("click", toggleEditFullscreen);
    overlay.addEventListener("click", (event) => {
        if (event.target === overlay) {
            closeNoteEditModal();
        }
    });
    saveBtn.addEventListener("click", async () => {
        if (typeof editState.onSave !== "function") {
            closeNoteEditModal({ force: true });
            return;
        }
        editState.isSaving = true;
        saveBtn.disabled = true;
        saveBtn.innerText = "保存中...";
        try {
            await editState.onSave(textarea.value || "");
            editState.initialText = textarea.value || "";
            closeNoteEditModal({ force: true });
        } catch (error) {
            alert(error?.message || "保存失败，请稍后重试");
        } finally {
            editState.isSaving = false;
            saveBtn.disabled = false;
            saveBtn.innerText = "保存修改";
        }
    });
    textarea.addEventListener("input", renderEditPreview);
    textarea.addEventListener("scroll", () => {
        syncScrollBetween(textarea, previewEl);
    });
    previewEl.addEventListener("scroll", () => {
        syncScrollBetween(previewEl, textarea);
    });

    document.addEventListener("keydown", (event) => {
        const isOpen = !overlay.classList.contains("hidden");
        if (!isOpen) {
            return;
        }

        const isSaveShortcut =
            (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s";
        if (isSaveShortcut) {
            event.preventDefault();
            if (!saveBtn.disabled) {
                saveBtn.click();
            }
            return;
        }

        if (event.key === "Escape") {
            event.preventDefault();
            closeNoteEditModal();
        }
    });

    editState.bound = true;
}

export function openNoteEditModal({ note, onSave, setupIcons }) {
    const overlay = document.getElementById("note-edit-overlay");
    const modal = document.getElementById("note-edit-modal");
    const title = document.getElementById("note-edit-title");
    const textarea = document.getElementById("note-edit-textarea");
    if (!overlay || !modal || !title || !textarea) {
        return;
    }

    editState.note = note;
    editState.onSave = onSave;
    editState.setupIcons = setupIcons;
    setEditFullscreen(false);
    bindEditEvents();

    title.innerText = `编辑：${note?.title || "笔记"}`;
    textarea.value = getNoteText(note);
    editState.initialText = textarea.value;
    textarea.scrollTop = 0;
    textarea.setSelectionRange(0, 0);
    renderEditPreview();
    const previewEl = document.getElementById("note-edit-preview");
    if (previewEl) {
        previewEl.scrollTop = 0;
    }

    overlay.classList.remove("hidden");
    setTimeout(() => {
        modal.classList.remove("scale-95", "opacity-0");
        modal.classList.add("scale-100", "opacity-100");
        textarea.setSelectionRange(0, 0);
        textarea.focus();
    }, 10);
    setupIcons();
}

export function renderReadingEmptyState(setupIcons) {
    const container = document.getElementById("note-card-grid");
    if (!container) {
        return;
    }
    setReadingHeader({ name: "项目详情", notes: [] });
    container.innerHTML = `
        <div class="reading-empty-state">
            <div class="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p class="text-sm text-[#37352f]/40 uppercase font-bold tracking-widest">正在深度分析文献内容</p>
        </div>
    `;
    setupIcons();
}

export function renderReadingFailedState(setupIcons, message = "任务执行失败，请稍后重试") {
    const container = document.getElementById("note-card-grid");
    if (!container) {
        return;
    }
    container.innerHTML = `
        <div class="reading-failed-state">
            <div class="w-12 h-12 rounded-full bg-red-50 border border-red-100 text-red-500 flex items-center justify-center mx-auto mb-4">
                <i data-lucide="circle-alert" class="w-6 h-6"></i>
            </div>
            <p class="text-sm text-red-600 font-bold tracking-wide">本次任务未完成</p>
            <p class="text-xs text-[#37352f]/55 mt-3 max-w-xl mx-auto leading-relaxed">${formatPlainTextAsHtml(message)}</p>
        </div>
    `;
    setupIcons();
}
