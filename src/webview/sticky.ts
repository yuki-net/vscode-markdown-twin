export const WEBVIEW_SCRIPT_STICKY = `
        function collectSourceHeadings() {
            const parsedHeadings = latestSourceLines.map((rawLine, index) => parseSourceHeading(rawLine, index)).filter(Boolean);
            const lastDocumentLine = getLastStickyContentLine();

            sourceHeadings = parsedHeadings.map((heading, index) => {
                let endLine = lastDocumentLine;
                for (let nextIndex = index + 1; nextIndex < parsedHeadings.length; nextIndex++) {
                    const nextHeading = parsedHeadings[nextIndex];
                    if (nextHeading.level <= heading.level) {
                        endLine = nextHeading.line - 1;
                        break;
                    }
                }

                return {
                    ...heading,
                    endLine: Math.max(heading.line, endLine),
                };
            });
        }

        function getLastStickyContentLine() {
            const lastLine = Math.max(0, latestSourceLines.length - 1);
            if (lastLine > 0 && (latestSourceLines[lastLine] || '') === '') {
                return lastLine - 1;
            }
            return lastLine;
        }


        function renderSourceStickyHeadings(force) {
            const { sticky, content } = getSourceStickyParts();
            if (!sticky || !content) return;

            if (!isSourceModeActive()) {
                sticky.classList.add('is-empty');
                content.innerHTML = '';
                sticky.style.transform = '';
                sticky.style.height = '';
                sourceStickySignature = '';
                return;
            }

            const sourceContainer = document.getElementById('source-container');
            const scrollTop = sourceContainer?.scrollTop || 0;
            const stickyState = findSourceStickyWidgetState(scrollTop);
            const visibleHeadings = stickyState.headings;
            const signature = visibleHeadings.map((heading) => heading.level + ':' + heading.line + ':' + heading.text).join('|') + ':' + stickyState.lastLineRelativePosition;
            if (visibleHeadings.length === 0) {
                sticky.classList.add('is-empty');
                content.innerHTML = '';
                sticky.style.transform = '';
                sticky.style.height = '';
                sourceStickySignature = signature;
                return;
            }

            if (!force && signature === sourceStickySignature) {
                applySourceStickyState(sticky, content, stickyState.lastLineRelativePosition);
                return;
            }

            sourceStickySignature = signature;

            const nextContentHtml = visibleHeadings.map((heading) => {
                const lineEl = findSourceLineBySourceIndex(heading.line);
                if (!lineEl) return '';
                const stickyLineNumber = heading.line + 1;
                const stickyCodeHtml = lineEl.innerHTML;
                const titleText = heading.text.replace(/"/g, '&quot;');
                return '<button class="mt-source-sticky-line" type="button" data-source-index="' + heading.line + '" title="' + titleText + '">'
                    + '<span class="mt-source-sticky-line-number">' + stickyLineNumber + '</span>'
                    + '<span class="mt-source-sticky-line-code">' + stickyCodeHtml + '</span>'
                    + '</button>';
            }).join('');

            sticky.classList.remove('is-empty');
            content.innerHTML = nextContentHtml;
            applySourceStickyState(sticky, content, stickyState.lastLineRelativePosition);
        }

        function buildSourceStickyCandidates() {
            const candidates = [];
            const headingStack = [];

            for (const heading of sourceHeadings) {
                const lineEl = findSourceLineBySourceIndex(heading.line);
                if (!lineEl) continue;

                while (headingStack.length > 0 && headingStack[headingStack.length - 1].level >= heading.level) {
                    headingStack.pop();
                }

                const top = headingStack.reduce((sum, ancestor) => {
                    const ancestorEl = findSourceLineBySourceIndex(ancestor.line);
                    return sum + (ancestorEl ? getSourceModelLineHeight(ancestorEl) : 0);
                }, 0);

                candidates.push({
                    heading,
                    top,
                    height: getSourceModelLineHeight(lineEl),
                });
                headingStack.push(heading);
            }

            return candidates;
        }

        function findSourceStickyWidgetState(scrollTop) {
            const candidates = buildSourceStickyCandidates();
            const headings = [];
            let lastLineRelativePosition = 0;

            for (const candidate of candidates) {
                const heading = candidate.heading;
                const startLineEl = findSourceLineBySourceIndex(heading.line);
                const endLineEl = findSourceLineBySourceIndex(heading.endLine);
                if (!startLineEl || !endLineEl) continue;

                const topOfElement = candidate.top;
                const bottomOfElement = topOfElement + candidate.height;
                const topOfBeginningLine = startLineEl.offsetTop - scrollTop;
                const bottomOfEndLine = getSourceModelLineBottom(endLineEl) - scrollTop;

                if (topOfElement > topOfBeginningLine && topOfElement <= bottomOfEndLine) {
                    headings.push(heading);
                    if (bottomOfElement > bottomOfEndLine) {
                        lastLineRelativePosition = bottomOfEndLine - bottomOfElement;
                    } else {
                        lastLineRelativePosition = 0;
                    }
                }
            }

            return { headings, lastLineRelativePosition };
        }

        function getSourceModelLineHeight(lineEl) {
            const lineHeight = parseFloat(getComputedStyle(lineEl).lineHeight);
            if (Number.isFinite(lineHeight) && lineHeight > 0) {
                return lineHeight;
            }
            const rootLineHeight = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--mt-source-line-height'));
            if (Number.isFinite(rootLineHeight) && rootLineHeight > 0) {
                return rootLineHeight;
            }
            return Math.max(1, lineEl.offsetHeight || 1);
        }

        function getSourceModelLineBottom(lineEl) {
            return lineEl.offsetTop + getSourceModelLineHeight(lineEl);
        }

        function applySourceStickyState(sticky, content, lastLineRelativePosition) {
            if (!sticky || !content) return;
            resetSourceStickyLineState(content);
            applySourceStickyLastLinePosition(content, lastLineRelativePosition);
            applySourceStickyHeight(sticky, content, lastLineRelativePosition);
        }

        function applySourceStickyHeight(sticky, content, lastLineRelativePosition) {
            if (!sticky || !content) return;
            const contentHeight = content.scrollHeight;
            if (!Number.isFinite(contentHeight) || contentHeight <= 0) {
                sticky.style.height = '';
                return;
            }

            const nextHeight = Math.max(0, contentHeight + Math.min(0, lastLineRelativePosition || 0));
            sticky.style.height = nextHeight > 0 ? (nextHeight + 'px') : '';
        }

        function applySourceStickyLastLinePosition(content, lastLineRelativePosition) {
            const stickyLines = Array.from(content.querySelectorAll('.mt-source-sticky-line'));
            if (stickyLines.length === 0) return;

            const lastLine = stickyLines[stickyLines.length - 1];
            const offset = Math.min(0, lastLineRelativePosition || 0);
            lastLine.style.transform = offset < 0 ? 'translateY(' + offset + 'px)' : '';
        }

        function resetSourceStickyLineState(content) {
            const stickyLines = Array.from(content.querySelectorAll('.mt-source-sticky-line'));
            const total = stickyLines.length;
            for (let index = 0; index < stickyLines.length; index++) {
                const line = stickyLines[index];
                line.style.transform = '';
                line.style.opacity = '';
                line.style.zIndex = String(total - index);
            }
        }


        function bindSourceStickyEvents() {
            const { sticky } = getSourceStickyParts();
            if (!sticky || sticky.dataset.mtBound === '1') return;
            sticky.dataset.mtBound = '1';

            sticky.addEventListener('click', (event) => {
                const target = event.target;
                if (!(target instanceof Element)) return;
                const button = target.closest('.mt-source-sticky-line[data-source-index]');
                if (!button) return;
                const sourceIndex = parseInt(button.getAttribute('data-source-index') || '-1', 10);
                if (!Number.isFinite(sourceIndex) || sourceIndex < 0) return;
                scrollToSourceIndex(sourceIndex);
            });
        }
`;
