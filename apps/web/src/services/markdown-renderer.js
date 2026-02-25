let markedConfigured = false;
let hljsConfigured = false;

const autoDetectLanguages = [
    "javascript",
    "typescript",
    "python",
    "java",
    "c",
    "cpp",
    "csharp",
    "go",
    "rust",
    "json",
    "bash",
    "powershell",
    "yaml",
    "toml",
    "xml",
    "css",
    "sql",
    "markdown",
];

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

export function highlightCodeInElement(container) {
    if (!container) {
        return false;
    }
    const highlighter = window.hljs;
    if (!highlighter || typeof highlighter.highlightElement !== "function") {
        return false;
    }

    if (!hljsConfigured && typeof highlighter.configure === "function") {
        highlighter.configure({
            ignoreUnescapedHTML: true,
        });
        hljsConfigured = true;
    }

    const detectSubset = autoDetectLanguages.filter((lang) =>
        typeof highlighter.getLanguage === "function" ? Boolean(highlighter.getLanguage(lang)) : true
    );

    const codeBlocks = container.querySelectorAll("pre code");
    codeBlocks.forEach((codeBlock) => {
        const languageClass = Array.from(codeBlock.classList).find((name) =>
            /^language-/.test(name)
        );
        if (languageClass) {
            try {
                highlighter.highlightElement(codeBlock);
            } catch {
                // ignore highlight errors for malformed snippets
            }
            return;
        }

        try {
            const source = String(codeBlock.textContent || "");
            const result = typeof highlighter.highlightAuto === "function"
                ? highlighter.highlightAuto(source, detectSubset)
                : null;

            if (result && Number(result.relevance) > 0) {
                codeBlock.classList.add("hljs");
                if (result.language) {
                    codeBlock.classList.add(`language-${result.language}`);
                }
                codeBlock.innerHTML = result.value;
                return;
            }

            codeBlock.classList.add("hljs", "language-plaintext");
            if (typeof highlighter.highlight === "function") {
                const plain = highlighter.highlight(source, { language: "plaintext" });
                codeBlock.innerHTML = plain.value;
            }
        } catch {
            // ignore highlight errors for malformed snippets
        }
    });
    return codeBlocks.length > 0;
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
