import { MODULE_META } from "../constants/modules.js";

export async function fetchModuleNotes(api, jobId, options = {}) {
    const { noteIdPrefix = jobId } = options;
    const notes = [];

    for (const moduleItem of MODULE_META) {
        try {
            const output = await api.getOutput(jobId, moduleItem.key);
            notes.push({
                id: `${noteIdPrefix}-${moduleItem.key}`,
                moduleKey: moduleItem.key,
                title: moduleItem.title,
                category: moduleItem.category,
                date: new Date().toLocaleDateString(),
                icon: moduleItem.icon,
                content: [{ type: "text", text: output.content || "" }],
            });
        } catch {
        }
    }

    return notes;
}
