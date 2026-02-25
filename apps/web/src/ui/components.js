export function setupIcons() {
    if (window.lucide) {
        window.lucide.createIcons();
    }
}

export function toggleModal(id, show) {
    const overlay = document.getElementById("modal-overlay");
    const modal = document.getElementById(id);

    if (show) {
        overlay.classList.remove("hidden");
        overlay.classList.add("flex");
        modal.classList.remove("hidden");
        setTimeout(() => {
            modal.classList.remove("scale-95", "opacity-0");
            modal.classList.add("scale-100", "opacity-100");
        }, 10);
    } else {
        modal.classList.add("scale-95", "opacity-0");
        modal.classList.remove("scale-100", "opacity-100");
        setTimeout(() => {
            modal.classList.add("hidden");
            overlay.classList.add("hidden");
            overlay.classList.remove("flex");
        }, 200);
    }
}

export function updateProgressBar(percent) {
    const bar = document.getElementById("task-progress-bar");
    const percentEl = document.getElementById("task-progress-percent");
    const clamped = Math.max(0, Math.min(100, Number(percent) || 0));
    if (bar) {
        bar.style.width = `${clamped}%`;
    }
    if (percentEl) {
        percentEl.innerText = `${Math.round(clamped)}%`;
    }
}

export function updateStatus(text, visible) {
    const panel = document.getElementById("task-progress-panel");
    const textEl = document.getElementById("task-progress-status");
    if (panel) {
        panel.classList.toggle("hidden", !visible);
    }
    if (textEl && visible) {
        textEl.innerText = text;
    }
}

export function showGlobalTaskBanner() {
    const banner = document.getElementById("global-task-banner");
    if (banner) {
        banner.classList.remove("hidden");
    }
}

export function hideGlobalTaskBanner() {
    const banner = document.getElementById("global-task-banner");
    if (banner) {
        banner.classList.add("hidden");
    }
}

export function updateGlobalTaskBanner({ status = "running", message = "", percent = 0 } = {}) {
    const statusEl = document.getElementById("global-task-status");
    const percentEl = document.getElementById("global-task-percent");
    const bar = document.getElementById("global-task-bar");
    const dot = document.getElementById("global-task-dot");
    const clamped = Math.max(0, Math.min(100, Number(percent) || 0));

    if (statusEl) {
        statusEl.innerText = message || "任务进行中";
    }
    if (percentEl) {
        percentEl.innerText = `${Math.round(clamped)}%`;
    }
    if (bar) {
        bar.style.width = `${clamped}%`;
    }
    if (dot) {
        dot.className = "w-2 h-2 rounded-full";
        if (status === "failed") {
            dot.classList.add("bg-red-500");
            return;
        }
        if (status === "completed") {
            dot.classList.add("bg-emerald-500");
            return;
        }
        dot.classList.add("bg-blue-500", "animate-pulse");
    }
}

let deleteConfirmBound = false;
let deleteConfirmResolver = null;

function settleDeleteConfirm(result) {
    const overlay = document.getElementById("delete-confirm-overlay");
    const modal = document.getElementById("delete-confirm-modal");
    if (modal) {
        modal.classList.add("scale-95", "opacity-0");
        modal.classList.remove("scale-100", "opacity-100");
    }
    setTimeout(() => {
        if (overlay) {
            overlay.classList.add("hidden");
        }
    }, 150);
    if (deleteConfirmResolver) {
        deleteConfirmResolver(result);
        deleteConfirmResolver = null;
    }
}

function bindDeleteConfirmEvents() {
    if (deleteConfirmBound) {
        return;
    }

    const overlay = document.getElementById("delete-confirm-overlay");
    const cancelBtn = document.getElementById("delete-confirm-cancel");
    const submitBtn = document.getElementById("delete-confirm-submit");

    if (!overlay || !cancelBtn || !submitBtn) {
        return;
    }

    cancelBtn.addEventListener("click", () => settleDeleteConfirm(false));
    submitBtn.addEventListener("click", () => settleDeleteConfirm(true));
    overlay.addEventListener("click", (event) => {
        if (event.target === overlay) {
            settleDeleteConfirm(false);
        }
    });
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && !overlay.classList.contains("hidden")) {
            settleDeleteConfirm(false);
        }
    });

    deleteConfirmBound = true;
}

export function showDeleteConfirmModal() {
    bindDeleteConfirmEvents();
    const overlay = document.getElementById("delete-confirm-overlay");
    const modal = document.getElementById("delete-confirm-modal");
    if (!overlay || !modal) {
        return Promise.resolve(false);
    }

    if (window.lucide) {
        window.lucide.createIcons();
    }

    overlay.classList.remove("hidden");
    setTimeout(() => {
        modal.classList.remove("scale-95", "opacity-0");
        modal.classList.add("scale-100", "opacity-100");
    }, 10);

    return new Promise((resolve) => {
        deleteConfirmResolver = resolve;
    });
}

export function renderToggleBlock(summary, details) {
    const detailsEl = document.createElement("details");
    detailsEl.className = "toggle-block";
    detailsEl.innerHTML = `
        <summary class="toggle-summary">
            <i data-lucide="chevron-right" class="w-4 h-4 text-[#37352f]/40 transition-transform"></i>
            <span>${summary}</span>
        </summary>
        <div class="toggle-content">
            ${details}
        </div>
    `;
    return detailsEl;
}

export function addDevLog(message) {
    const time = new Date().toLocaleTimeString("en-US", {
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
    });
    console.log(`[${time}] ${message}`);
}
