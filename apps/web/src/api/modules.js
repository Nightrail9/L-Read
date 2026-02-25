import { request } from "./http.js";

export const ApiService = {
    listJobs() {
        return request("/api/jobs");
    },

    syncJobs() {
        return request("/api/jobs/sync", { method: "POST" });
    },

    createJob() {
        return request("/api/jobs", { method: "POST" });
    },

    uploadPdf(jobId, file) {
        const formData = new FormData();
        formData.append("file", file);
        return request(`/api/jobs/${jobId}/pdf`, {
            method: "POST",
            body: formData,
        });
    },

    configureRepo(jobId, payload) {
        return request(`/api/jobs/${jobId}/repo`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
    },

    configureLlm(jobId, payload) {
        return request(`/api/jobs/${jobId}/llm-config`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
    },

    checkLlmConfig(payload) {
        return request("/api/llm-config/check", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
    },

    queueExtract(jobId) {
        return request(`/api/jobs/${jobId}/extract`, { method: "POST" });
    },

    queueIndex(jobId) {
        return request(`/api/jobs/${jobId}/index`, { method: "POST" });
    },

    queueRun(jobId, payload = null) {
        if (!payload) {
            return request(`/api/jobs/${jobId}/run`, { method: "POST" });
        }
        return request(`/api/jobs/${jobId}/run`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
    },

    getJob(jobId) {
        return request(`/api/jobs/${jobId}`);
    },

    deleteJob(jobId) {
        return request(`/api/jobs/${jobId}`, { method: "DELETE" });
    },

    getOutput(jobId, moduleName) {
        return request(`/api/jobs/${jobId}/outputs/${moduleName}`);
    },

    updateOutput(jobId, moduleName, payload) {
        return request(`/api/jobs/${jobId}/outputs/${moduleName}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
    },
};
