export const WEBVIEW_SCRIPT_SHARED = `
        function applyViewModeLayout(mode) {
            const root = document.documentElement;
            const body = document.body;
            const isSourceMode = mode === 'source';
            root.classList.toggle('mt-source-mode', isSourceMode);
            body.classList.toggle('mt-source-mode', isSourceMode);
            root.classList.toggle('mt-preview-mode', !isSourceMode);
            body.classList.toggle('mt-preview-mode', !isSourceMode);
        }

        function applySourceEditorMetrics(lineHeight) {
            const px = Number(lineHeight);
            if (!Number.isFinite(px) || px <= 0) return;
            const root = document.documentElement;
            root.style.setProperty('--mt-source-line-height', px + 'px');
        }

        function isOrderedListLine(rawLine) {
            return /^\\s*\\d+\\.\\s/.test(rawLine);
        }

        function parseSourceLines(sourceText, expectedLineCount) {
            const raw = typeof sourceText === 'string' ? sourceText : '';
            const lines = raw.split(/\\r?\\n/);
            return alignLineCount(lines, expectedLineCount);
        }

        function normalizeSourceLineOrigins(lineOrigins, expectedLineCount) {
            const targetCount = normalizeExpectedLineCount(expectedLineCount);
            const normalized = Array.isArray(lineOrigins)
                ? lineOrigins.map((value, index) => {
                    const line = Number(value);
                    return Number.isFinite(line) && line >= 0 ? Math.floor(line) : index;
                })
                : [];
            if (normalized.length < targetCount) {
                const fallback = normalized.length > 0 ? normalized[normalized.length - 1] : 0;
                for (let i = normalized.length; i < targetCount; i++) {
                    normalized.push(fallback);
                }
            }
            return normalized.slice(0, targetCount);
        }

        function normalizeExpectedLineCount(expectedLineCount) {
            const count = Number(expectedLineCount);
            return Number.isFinite(count) && count > 0 ? Math.floor(count) : 1;
        }

        function alignLineCount(lines, expectedLineCount) {
            const targetCount = normalizeExpectedLineCount(expectedLineCount);
            if (lines.length < targetCount) {
                for (let i = lines.length; i < targetCount; i++) {
                    lines.push('');
                }
            }
            return lines;
        }
`;
