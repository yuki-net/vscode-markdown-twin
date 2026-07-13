export const WEBVIEW_SCRIPT_SOURCE_UI = `
        function isTransparentColor(value) {
            const normalized = String(value || '').trim().toLowerCase();
            if (!normalized) return true;
            if (normalized === 'transparent') return true;
            if (normalized === '#0000') return true;
            if (normalized === 'rgba(0, 0, 0, 0)' || normalized === 'rgba(0,0,0,0)') return true;
            return false;
        }

        function resolveFoldBackgroundColor() {
            const style = getComputedStyle(document.documentElement);
            const candidates = [
                '--vscode-editor-foldBackground',
                '--vscode-list-hoverBackground',
                '--vscode-editor-selectionHighlightBackground',
                '--vscode-editor-selectionBackground',
            ];
            for (const name of candidates) {
                const value = style.getPropertyValue(name);
                if (!isTransparentColor(value)) {
                    return value.trim();
                }
            }
            return 'rgba(128, 128, 128, 0.22)';
        }

        function applyResolvedFoldBackground() {
            const sourceContainer = document.getElementById('source-container');
            if (!sourceContainer) return;
            sourceContainer.style.setProperty('--mt-fold-bg', resolveFoldBackgroundColor());
        }

        function updateScrollBeyondLastLinePadding() {
            const sourceContainerEl = document.getElementById('source-container');
            const codeLineEl = document.querySelector('#source-code .code-line');
            if (!sourceContainerEl || !codeLineEl) return;

            const lineHeight = codeLineEl.getBoundingClientRect().height;
            const viewportHeight = sourceContainerEl.clientHeight;
            const minPadding = 22;
            const bottomPadding = Math.max(minPadding, viewportHeight - lineHeight);
            sourceContainerEl.style.setProperty('--mt-scroll-beyond-last-line', bottomPadding + 'px');
        }

        function setSourceHighlightError(message) {
            const text = typeof message === 'string' ? message.trim() : '';
            const bannerIds = ['mt-source-highlight-error', 'mt-preview-highlight-error'];

            for (const id of bannerIds) {
                const banner = document.getElementById(id);
                if (!banner) continue;
                if (!text) {
                    banner.style.display = 'none';
                    banner.textContent = '';
                    continue;
                }
                banner.style.display = 'block';
                banner.textContent = text;
            }
        }

        function getSourceStickyParts() {
            const sticky = document.getElementById('mt-source-sticky');
            const content = document.getElementById('mt-source-sticky-content');
            return { sticky, content };
        }

        function parseSourceHeading(rawLine, lineNumber) {
            const match = String(rawLine || '').match(/^\\s{0,3}(#{1,6})\\s+(.+?)\\s*#*\\s*$/);
            if (!match) return null;
            return {
                level: match[1].length,
                line: lineNumber,
                text: match[2].trim().replace(/\\s+/g, ' '),
            };
        }

        function getSourceScrollbarParts() {
            const sourceContainer = document.getElementById('source-container');
            const scrollbar = document.getElementById('mt-source-scrollbar');
            const track = document.getElementById('mt-source-scrollbar-track');
            const thumb = document.getElementById('mt-source-scrollbar-thumb');
            return { sourceContainer, scrollbar, track, thumb };
        }

        function updateSourceScrollbar() {
            const { sourceContainer, scrollbar, track, thumb } = getSourceScrollbarParts();
            if (!sourceContainer || !scrollbar || !track || !thumb) return;

            const maxScroll = sourceContainer.scrollHeight - sourceContainer.clientHeight;
            if (!Number.isFinite(maxScroll) || maxScroll <= 0) {
                scrollbar.classList.add('is-inactive');
                thumb.style.height = '0px';
                thumb.style.transform = 'translateY(0px)';
                return;
            }

            const trackHeight = track.clientHeight;
            if (!Number.isFinite(trackHeight) || trackHeight <= 0) {
                scrollbar.classList.add('is-inactive');
                return;
            }

            scrollbar.classList.remove('is-inactive');

            const minThumbHeight = 24;
            const rawThumbHeight = Math.floor((sourceContainer.clientHeight / sourceContainer.scrollHeight) * trackHeight);
            const thumbHeight = Math.max(minThumbHeight, Math.min(trackHeight, rawThumbHeight));
            const maxThumbTop = Math.max(0, trackHeight - thumbHeight);
            const progress = Math.max(0, Math.min(1, sourceContainer.scrollTop / maxScroll));
            const thumbTop = Math.round(progress * maxThumbTop);

            thumb.style.height = thumbHeight + 'px';
            thumb.style.transform = 'translateY(' + thumbTop + 'px)';
        }

        function bindSourceScrollbar() {
            const { sourceContainer, scrollbar, track, thumb } = getSourceScrollbarParts();
            if (!sourceContainer || !scrollbar || !track || !thumb) return;
            if (scrollbar.dataset.mtBound === '1') return;
            scrollbar.dataset.mtBound = '1';

            let dragging = false;
            let dragPointerOffset = 0;

            const stopDrag = () => {
                if (!dragging) return;
                dragging = false;
                document.body.classList.remove('mt-scrollbar-dragging');
            };

            const dragToClientY = (clientY) => {
                const rect = track.getBoundingClientRect();
                const maxScroll = sourceContainer.scrollHeight - sourceContainer.clientHeight;
                if (maxScroll <= 0) return;

                const thumbHeight = thumb.offsetHeight;
                const maxThumbTop = Math.max(0, rect.height - thumbHeight);
                const nextThumbTop = Math.max(0, Math.min(maxThumbTop, clientY - rect.top - dragPointerOffset));
                const progress = maxThumbTop > 0 ? nextThumbTop / maxThumbTop : 0;
                sourceContainer.scrollTop = progress * maxScroll;
                updateSourceScrollbar();
            };

            thumb.addEventListener('mousedown', (event) => {
                event.preventDefault();
                event.stopPropagation();
                noteWebviewUserScrollIntent('source');
                const thumbRect = thumb.getBoundingClientRect();
                dragging = true;
                dragPointerOffset = event.clientY - thumbRect.top;
                document.body.classList.add('mt-scrollbar-dragging');
            });

            track.addEventListener('mousedown', (event) => {
                if (event.target === thumb) return;
                event.preventDefault();
                noteWebviewUserScrollIntent('source');
                dragPointerOffset = thumb.offsetHeight / 2;
                dragToClientY(event.clientY);
            });

            window.addEventListener('mousemove', (event) => {
                if (!dragging) return;
                dragToClientY(event.clientY);
            });

            window.addEventListener('mouseup', stopDrag);
            window.addEventListener('mouseleave', stopDrag);

            sourceContainer.addEventListener('scroll', updateSourceScrollbar, { passive: true });
            updateSourceScrollbar();
        }

        function bindFoldRailHoverState() {
            const rail = document.getElementById('line-numbers');
            if (!rail || rail.dataset.mtFoldRailBound === '1') return;
            rail.dataset.mtFoldRailBound = '1';

            rail.addEventListener('mouseover', (event) => {
                const target = event.target;
                if (!(target instanceof Element)) return;
                if (!target.closest('.line-number-fold-slot')) return;
                rail.classList.add('mt-fold-rail-hover');
            });

            rail.addEventListener('mouseout', (event) => {
                const to = event.relatedTarget;
                if (to instanceof Element && rail.contains(to) && to.closest('.line-number-fold-slot')) {
                    return;
                }
                rail.classList.remove('mt-fold-rail-hover');
            });
        }
`;
