export const WEBVIEW_SCRIPT_NAVIGATION = `
        function clamp(value, min, max) {
            return Math.max(min, Math.min(max, value));
        }

        function parseDataLine(el) {
            const line = Number(el.getAttribute('data-line'));
            return Number.isFinite(line) && line >= 0 ? line : undefined;
        }

        function parseDataSourceIndex(el) {
            const line = Number(el.getAttribute('data-source-index'));
            return Number.isFinite(line) && line >= 0 ? line : undefined;
        }

        function isVisibleLineElement(el) {
            if (!el || el.style.display === 'none') return false;
            const rect = el.getBoundingClientRect();
            return rect.width > 0 || rect.height > 0 || el.getClientRects().length > 0;
        }

        function buildLineRegions(elements, getTop, getLine) {
            const byLine = new Map();
            for (const el of elements) {
                if (!isVisibleLineElement(el)) continue;
                const line = getLine(el);
                if (!Number.isFinite(line)) continue;
                const top = getTop(el);
                const height = Math.max(1, el.getBoundingClientRect().height || el.offsetHeight || 1);
                const bottom = top + height;
                const existing = byLine.get(line);
                if (existing) {
                    existing.top = Math.min(existing.top, top);
                    existing.bottom = Math.max(existing.bottom, bottom);
                    existing.elements.push(el);
                } else {
                    byLine.set(line, { line, top, bottom, elements: [el] });
                }
            }

            const regions = Array.from(byLine.values()).sort((a, b) => {
                if (a.line === b.line) return a.top - b.top;
                return a.line - b.line;
            });
            if (regions.length > 0 && regions[0].line > 0) {
                regions.unshift({ line: 0, top: 0, bottom: 1, elements: [] });
            }
            return regions;
        }

        function findRegionPairForLine(regions, line) {
            if (regions.length === 0) return { previous: null, next: null };
            let previous = regions[0];
            let next = null;
            for (const region of regions) {
                if (region.line <= line) {
                    previous = region;
                    continue;
                }
                next = region;
                break;
            }
            return { previous, next };
        }

        function interpolateOffsetForLine(regions, line) {
            const normalizedLine = Number.isFinite(Number(line)) ? Math.max(0, Number(line)) : 0;
            if (normalizedLine <= 0 || regions.length === 0) return 0;

            const { previous, next } = findRegionPairForLine(regions, normalizedLine);
            if (!previous) return 0;
            if (!next || next.line <= previous.line) {
                return previous.top + clamp(normalizedLine - previous.line, 0, 1) * Math.max(1, previous.bottom - previous.top);
            }

            const progress = clamp((normalizedLine - previous.line) / (next.line - previous.line), 0, 1);
            return previous.top + progress * (next.top - previous.top);
        }

        function interpolateLineForOffset(regions, offset) {
            if (regions.length === 0) return undefined;
            const normalizedOffset = Math.max(0, Number(offset) || 0);
            let previous = regions[0];
            let next = null;

            for (const region of regions) {
                if (region.top <= normalizedOffset + 1) {
                    previous = region;
                    continue;
                }
                next = region;
                break;
            }

            if (next && next.line > previous.line && next.top > previous.top) {
                const progress = clamp((normalizedOffset - previous.top) / (next.top - previous.top), 0, 1);
                return previous.line + progress * (next.line - previous.line);
            }

            const height = Math.max(1, previous.bottom - previous.top);
            const progress = clamp((normalizedOffset - previous.top) / height, 0, 1);
            return previous.line + progress;
        }

        function getPreviewLineRegions() {
            return buildLineRegions(
                Array.from(document.querySelectorAll('#preview-container [data-line]')),
                el => Math.max(0, el.getBoundingClientRect().top + window.scrollY),
                parseDataLine
            );
        }

        function getSourceLineRegions() {
            const sourceContainer = document.getElementById('source-container');
            if (!sourceContainer) return [];
            return buildLineRegions(
                Array.from(document.querySelectorAll('#source-code .code-line[data-source-index]')),
                el => el.offsetTop,
                parseDataSourceIndex
            );
        }

        function getPreviewEditorLineForPageOffset(pageOffset) {
            return interpolateLineForOffset(getPreviewLineRegions(), pageOffset);
        }

        function getEditorLineForSourceContainerOffset(containerOffset) {
            return interpolateLineForOffset(getSourceLineRegions(), containerOffset);
        }

        function getSourceAnchorLineAtContainerTop(containerOffset) {
            const offset = Math.max(0, Number(containerOffset) || 0);
            const gutterRows = Array.from(document.querySelectorAll('#line-numbers .line-number[data-line]'));
            const codeRows = Array.from(document.querySelectorAll('#source-code .code-line[data-line]'));
            const rows = gutterRows.length > 0 ? gutterRows : codeRows;
            let firstVisibleLine = undefined;
            let anchorLine = undefined;

            for (const row of rows) {
                if (row.style.display === 'none') continue;
                const line = parseDataSourceIndex(row) ?? parseDataLine(row);
                if (!Number.isFinite(line)) continue;
                if (firstVisibleLine === undefined) {
                    firstVisibleLine = line;
                }
                const top = row.offsetTop;
                if (top <= offset + 1) {
                    anchorLine = line;
                    continue;
                }
                break;
            }

            return anchorLine ?? firstVisibleLine;
        }

        function scrollPreviewToSourceLine(line) {
            const nextScrollTop = interpolateOffsetForLine(getPreviewLineRegions(), line);
            isSyncingScroll = true;
            window.scrollTo({ top: Math.max(0, nextScrollTop), behavior: 'auto' });
            clearTimeout(scrollTimeout);
            scrollTimeout = setTimeout(() => { isSyncingScroll = false; }, 150);
        }

        function scrollSourceToOriginalLine(line) {
            const sourceContainer = document.getElementById('source-container');
            if (!sourceContainer) return;
            const nextScrollTop = interpolateOffsetForLine(getSourceLineRegions(), line);
            isSyncingScroll = true;
            sourceContainer.scrollTop = Math.max(0, nextScrollTop);
            updateSourceScrollbar();
            renderSourceStickyHeadings(true);
            clearTimeout(scrollTimeout);
            scrollTimeout = setTimeout(() => { isSyncingScroll = false; }, 150);
        }

        function findSourceLineBySourceIndex(sourceIndex) {
            const elements = Array.from(document.querySelectorAll('#source-code .code-line[data-source-index]'));
            if (elements.length === 0) return null;
            let closest = null;
            let closestDiff = Infinity;
            for (const el of elements) {
                if (el.style.display === 'none') continue;
                const elIndex = parseInt(el.getAttribute('data-source-index'), 10);
                if (!Number.isFinite(elIndex)) continue;
                if (elIndex === sourceIndex) return el;
                const diff = sourceIndex - elIndex;
                if (diff >= 0 && diff < closestDiff) {
                    closestDiff = diff;
                    closest = el;
                }
            }
            return closest || elements.find(el => el.style.display !== 'none') || null;
        }

        function isSourceModeActive() {
            return document.body.classList.contains('mt-source-mode');
        }

        function scrollToLine(line) {
            if (isSourceModeActive()) {
                scrollSourceToOriginalLine(line);
                return;
            }

            scrollPreviewToSourceLine(line);
        }

        function scrollToSourceIndex(sourceIndex) {
            const sourceContainer = document.getElementById('source-container');
            const sourceLine = findSourceLineBySourceIndex(sourceIndex);
            if (!sourceContainer || !sourceLine) return;
            isSyncingScroll = true;
            sourceContainer.scrollTop = sourceLine.offsetTop;
            updateSourceScrollbar();
            renderSourceStickyHeadings(true);
            clearTimeout(scrollTimeout);
            scrollTimeout = setTimeout(() => { isSyncingScroll = false; }, 150);
        }
`;
