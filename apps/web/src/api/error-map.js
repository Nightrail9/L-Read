export function toUserErrorMessage(error, fallback = "请求失败") {
    const code = String(error?.code || "").toUpperCase();
    const message = String(error?.message || "").trim();
    const lower = message.toLowerCase();

    if (code === "REQUEST_TIMEOUT" || lower.includes("timeout")) {
        return "请求超时，请稍后重试。";
    }
    if (code === "NETWORK_ERROR" || lower.includes("failed to fetch")) {
        return "网络连接失败，请检查后端服务和网络设置。";
    }
    if (code === "JOB_NOT_FOUND") {
        return "任务不存在，可能已被删除。";
    }
    if (code === "INVALID_FILE_TYPE") {
        return "仅支持上传 PDF 文件。";
    }
    if (code === "LLM_CONNECTIVITY_FAILED") {
        return message || "模型连通性检测失败，请检查 API Key、模型和 Base URL。";
    }
    if (code === "REQUEST_VALIDATION_ERROR") {
        return "请求参数不合法，请检查输入。";
    }

    return message || fallback;
}
