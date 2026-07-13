export const WEBVIEW_SCRIPT_FOLDING = `
        function detectFoldRanges(sourceLines) {
            const ranges = [];
            const headingStack = [];
            let fenceStart = -1;
            let fenceMarkerChar = '';
            let fenceMarkerLen = 0;
            const trimTrailingBlankLines = (start, end) => {
                let trimmedEnd = end;
                while (trimmedEnd > start && (sourceLines[trimmedEnd] || '').trim() === '') {
                    trimmedEnd--;
                }
                return trimmedEnd;
            };

            for (let i = 0; i < sourceLines.length; i++) {
                const rawLine = sourceLines[i] || '';
                const trimmed = rawLine.trim();

                if (fenceStart >= 0) {
                    if (trimmed.startsWith(fenceMarkerChar.repeat(fenceMarkerLen))) {
                        const end = trimTrailingBlankLines(fenceStart, i);
                        if (end > fenceStart) {
                            ranges.push({ start: fenceStart, end });
                        }
                        fenceStart = -1;
                        fenceMarkerChar = '';
                        fenceMarkerLen = 0;
                    }
                    continue;
                }

                const fenceMatch = trimmed.match(/^([\\x60~]{3,})/);
                if (fenceMatch) {
                    fenceStart = i;
                    fenceMarkerChar = fenceMatch[1][0];
                    fenceMarkerLen = fenceMatch[1].length;
                    continue;
                }

                const headingMatch = rawLine.match(/^\\s{0,3}(#{1,6})\\s+\\S/);
                if (!headingMatch) {
                    continue;
                }

                const level = headingMatch[1].length;
                while (headingStack.length > 0 && headingStack[headingStack.length - 1].level >= level) {
                    const prev = headingStack.pop();
                    const end = trimTrailingBlankLines(prev.start, i - 1);
                    if (end > prev.start) {
                        ranges.push({ start: prev.start, end });
                    }
                }
                headingStack.push({ start: i, level });
            }

            if (fenceStart >= 0) {
                const end = trimTrailingBlankLines(fenceStart, sourceLines.length - 1);
                if (end > fenceStart) {
                    ranges.push({ start: fenceStart, end });
                }
            }

            while (headingStack.length > 0) {
                const prev = headingStack.pop();
                const end = trimTrailingBlankLines(prev.start, sourceLines.length - 1);
                if (end > prev.start) {
                    ranges.push({ start: prev.start, end });
                }
            }

            return ranges;
        }

        function prepareFoldState(sourceLines) {
            const ranges = detectFoldRanges(sourceLines);
            foldRangeByStart = new Map(ranges.map(range => [range.start, range]));
            const validStarts = new Set(ranges.map(range => range.start));
            for (const start of Array.from(collapsedFoldStarts)) {
                if (!validStarts.has(start)) {
                    collapsedFoldStarts.delete(start);
                }
            }
        }

        function isLineHiddenByFold(lineNumber) {
            for (const start of collapsedFoldStarts) {
                const range = foldRangeByStart.get(start);
                if (!range) continue;
                if (lineNumber > range.start && lineNumber <= range.end) {
                    return true;
                }
            }
            return false;
        }

        function buildFoldToggleHtml(lineNumber) {
            const range = foldRangeByStart.get(lineNumber);
            if (!range) {
                return '<button class="fold-toggle fold-toggle-spacer" type="button" tabindex="-1" aria-hidden="true"></button>';
            }
            const collapsed = collapsedFoldStarts.has(lineNumber);
            const stateClass = collapsed ? ' is-collapsed' : '';
            const title = collapsed ? 'Expand folded region' : 'Collapse region';
            return '<button class="fold-toggle' + stateClass + '" type="button" data-fold-start="' + lineNumber + '" aria-expanded="' + (!collapsed) + '" title="' + title + '"></button>';
        }

        function resolveFoldState(lineNumber) {
            if (!foldRangeByStart.has(lineNumber)) {
                return 'none';
            }
            return collapsedFoldStarts.has(lineNumber) ? 'collapsed' : 'expanded';
        }

        function setFoldCollapsed(startLine, collapsed) {
            if (collapsed) {
                collapsedFoldStarts.add(startLine);
            } else {
                collapsedFoldStarts.delete(startLine);
            }
        }

        function applyFoldStateToDom() {
            const codeLines = Array.from(document.querySelectorAll('#source-code .code-line'));
            const lineNumbers = Array.from(document.querySelectorAll('#line-numbers .line-number'));

            for (const lineEl of codeLines) {
                const sourceIndex = parseInt(lineEl.getAttribute('data-source-index') || '-1', 10);
                const hidden = isLineHiddenByFold(sourceIndex);
                lineEl.style.display = hidden ? 'none' : '';

                const foldState = resolveFoldState(sourceIndex);
                lineEl.dataset.foldState = foldState;
            }

            for (const numEl of lineNumbers) {
                const sourceIndex = parseInt(numEl.getAttribute('data-source-index') || '-1', 10);
                const hidden = isLineHiddenByFold(sourceIndex);
                numEl.style.display = hidden ? 'none' : '';
                const foldState = resolveFoldState(sourceIndex);
                numEl.dataset.foldState = foldState;

                const toggleEl = numEl.querySelector('.fold-toggle[data-fold-start]');
                if (toggleEl) {
                    const startLine = parseInt(toggleEl.getAttribute('data-fold-start') || '-1', 10);
                    const collapsed = collapsedFoldStarts.has(startLine);
                    toggleEl.classList.toggle('is-collapsed', collapsed);
                    toggleEl.setAttribute('aria-expanded', String(!collapsed));
                    toggleEl.setAttribute('title', collapsed ? 'Expand folded region' : 'Collapse region');
                }
            }

            syncLineHeights();
        }

        function bindFoldToggleEvents() {
            const toggles = document.querySelectorAll('#line-numbers .fold-toggle[data-fold-start]');
            for (const toggle of toggles) {
                toggle.addEventListener('click', (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    const startLine = parseInt(toggle.getAttribute('data-fold-start') || '-1', 10);
                    if (!Number.isFinite(startLine) || startLine < 0) return;
                    const collapsed = collapsedFoldStarts.has(startLine);
                    setFoldCollapsed(startLine, !collapsed);
                    applyFoldStateToDom();
                });
            }

            const ellipsisButtons = document.querySelectorAll('#source-code .fold-ellipsis[data-fold-open]');
            for (const ellipsis of ellipsisButtons) {
                const openFold = (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    const startLine = parseInt(ellipsis.getAttribute('data-fold-open') || '-1', 10);
                    if (!Number.isFinite(startLine) || startLine < 0) return;
                    if (!foldRangeByStart.has(startLine) || !collapsedFoldStarts.has(startLine)) return;
                    setFoldCollapsed(startLine, false);
                    applyFoldStateToDom();
                };

                ellipsis.addEventListener('click', openFold);
                ellipsis.addEventListener('keydown', (event) => {
                    if (event.key !== 'Enter' && event.key !== ' ') return;
                    openFold(event);
                });
            }
        }
`;
