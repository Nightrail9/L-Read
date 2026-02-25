export function createProjectTagEditor({
    state,
    fixedTags,
    normalizeProjectTags,
    saveState,
    refreshProjectPanels,
    setupIcons,
}) {
    let tagEditorBound = false;
    let tagEditorProjectId = null;

    function populateTagEditorSelect() {
        const select = document.getElementById("tag-editor-select");
        if (!select) {
            return;
        }

        select.innerHTML = "";
        fixedTags.forEach((tag) => {
            const option = document.createElement("option");
            option.value = tag;
            option.textContent = tag;
            select.appendChild(option);
        });
    }

    function closeProjectTagEditor() {
        const overlay = document.getElementById("tag-editor-overlay");
        const modal = document.getElementById("tag-editor-modal");
        if (!overlay || !modal) {
            return;
        }
        modal.classList.add("scale-95", "opacity-0");
        modal.classList.remove("scale-100", "opacity-100");
        tagEditorProjectId = null;
        setTimeout(() => {
            overlay.classList.add("hidden");
        }, 150);
    }

    function openProjectTagEditor(projectId) {
        const project = state.projects.find((item) => String(item.id) === String(projectId));
        if (!project) {
            return;
        }

        const overlay = document.getElementById("tag-editor-overlay");
        const modal = document.getElementById("tag-editor-modal");
        const title = document.getElementById("tag-editor-project-name");
        const select = document.getElementById("tag-editor-select");
        if (!overlay || !modal || !title || !select) {
            return;
        }

        tagEditorProjectId = project.id;
        title.innerText = project.name;
        populateTagEditorSelect();
        const currentTag = normalizeProjectTags(project.tags || [])[0] || fixedTags[0];
        select.value = currentTag;

        overlay.classList.remove("hidden");
        setTimeout(() => {
            modal.classList.remove("scale-95", "opacity-0");
            modal.classList.add("scale-100", "opacity-100");
            select.focus();
        }, 10);
        setupIcons();
    }

    function bindTagEditorEvents() {
        if (tagEditorBound) {
            return;
        }

        const overlay = document.getElementById("tag-editor-overlay");
        const closeBtn = document.getElementById("tag-editor-close");
        const cancelBtn = document.getElementById("tag-editor-cancel");
        const saveBtn = document.getElementById("tag-editor-save");
        const select = document.getElementById("tag-editor-select");

        if (!overlay || !closeBtn || !cancelBtn || !saveBtn || !select) {
            return;
        }

        closeBtn.addEventListener("click", closeProjectTagEditor);
        cancelBtn.addEventListener("click", closeProjectTagEditor);
        overlay.addEventListener("click", (event) => {
            if (event.target === overlay) {
                closeProjectTagEditor();
            }
        });
        document.addEventListener("keydown", (event) => {
            if (event.key === "Escape" && !overlay.classList.contains("hidden")) {
                closeProjectTagEditor();
            }
        });
        saveBtn.addEventListener("click", () => {
            if (!tagEditorProjectId) {
                closeProjectTagEditor();
                return;
            }
            const project = state.projects.find((item) => String(item.id) === String(tagEditorProjectId));
            if (!project) {
                closeProjectTagEditor();
                return;
            }
            const selected = String(select.value || "").trim() || fixedTags[0];
            project.tags = normalizeProjectTags([selected]);
            saveState();
            refreshProjectPanels();
            closeProjectTagEditor();
        });

        tagEditorBound = true;
    }

    return {
        openProjectTagEditor,
        bindTagEditorEvents,
    };
}
