let markedConfigured = false;

function extractMathSegments(markdown) {
    const source = String(markdown || "");
    const segments = [];
    const tokenPrefix = "@@LREAD_MATH_";
    const pattern = /\\\((?:\\.|[^\\])*?\\\)|\\\[(?:\\.|[^\\])*?\\\]|\$\$(?:\\.|[^\\])*?\$\$|\$(?:\\.|[^$\\\n]|\\.)+\$/g;
    const text = source.replace(pattern, (match) => {
        const token = `${tokenPrefix}${segments.length}@@`;
        segments.push(match);
        return token;
    });
    return { text, segments, tokenPrefix };
}

function restoreMathSegments(html, segments, tokenPrefix) {
    if (!segments.length) {
        return html;
    }
    const tokenPattern = new RegExp(`${tokenPrefix}(\\d+)@@`, "g");
    return String(html || "").replace(tokenPattern, (_all, idx) => {
        const index = Number(idx);
        if (!Number.isInteger(index) || index < 0 || index >= segments.length) {
            return "";
        }
        return segments[index];
    });
}

function getMarked() {
    const candidate = window.marked;
    if (!candidate || typeof candidate.parse !== "function") {
        return null;
    }
    return candidate;
}

function getSanitizer() {
    const candidate = window.DOMPurify;
    if (!candidate || typeof candidate.sanitize !== "function") {
        return null;
    }
    return candidate;
}

function ensureMarkedOptions(marked) {
    if (markedConfigured || !marked || typeof marked.setOptions !== "function") {
        return;
    }
    marked.setOptions({
        gfm: true,
        breaks: true,
        headerIds: true,
        mangle: false,
    });
    markedConfigured = true;
}

export function markdownLibReady() {
    return Boolean(getMarked() && getSanitizer());
}

export function renderMarkdownSafe(markdown) {
    const source = String(markdown || "").trim();
    if (!source) {
        return '<article class="markdown-body markdown-body-empty"><p>暂无内容</p></article>';
    }

    const marked = getMarked();
    const sanitizer = getSanitizer();
    if (!marked || !sanitizer) {
        return "";
    }

    ensureMarkedOptions(marked);

    const { text, segments, tokenPrefix } = extractMathSegments(source);

    let parsed = "";
    try {
        parsed = String(marked.parse(text));
    } catch {
        return "";
    }

    const restored = restoreMathSegments(parsed, segments, tokenPrefix);

    try {
        const sanitized = sanitizer.sanitize(restored, {
            USE_PROFILES: { html: true },
        });
        return `<article class="markdown-body">${sanitized}</article>`;
    } catch {
        return "";
    }
}

export function renderMathInElement(container) {
    if (!container) {
        return false;
    }
    const renderer = window.renderMathInElement;
    const katex = window.katex;
    if (typeof renderer !== "function" || !katex) {
        return false;
    }

    try {
        renderer(container, {
            delimiters: [
                { left: "$$", right: "$$", display: true },
                { left: "$", right: "$", display: false },
                { left: "\\(", right: "\\)", display: false },
                { left: "\\[", right: "\\]", display: true },
            ],
            throwOnError: false,
            strict: "ignore",
        });
        return true;
    } catch {
        return false;
    }
}
