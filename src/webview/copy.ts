export const WEBVIEW_SCRIPT_COPY = `
        function setLastInteractedLine(line) {
            if (!Number.isFinite(line) || line < 0) return;
            lastInteractedLine = Math.floor(line);
        }

        function findSourceIndexFromNode(node) {
            if (!node) return null;
            const element = node.nodeType === 1 ? node : node.parentElement;
            if (!element || !element.closest) return null;

            const lineHost = element.closest('#source-code .code-line[data-source-index], #line-numbers .line-number[data-source-index], .mt-source-sticky-line[data-source-index]');
            if (!lineHost) return null;

            const sourceIndex = parseInt(lineHost.getAttribute('data-source-index') || '-1', 10);
            return Number.isFinite(sourceIndex) && sourceIndex >= 0 ? sourceIndex : null;
        }

        function findLineFromNode(node) {
            if (!node) return null;
            const element = node.nodeType === 1 ? node : node.parentElement;
            if (!element || !element.closest) return null;

            const lineHost = element.closest('#preview-container [data-line]');
            if (!lineHost) return null;

            const line = parseInt(lineHost.getAttribute('data-line') || '-1', 10);
            return Number.isFinite(line) && line >= 0 ? line : null;
        }

        function updateLastInteractedLineFromEvent(event) {
            const line = findSourceIndexFromNode(event.target) ?? findLineFromNode(event.target);
            if (line === null) return;
            setLastInteractedLine(line);
        }

        function updateLastInteractedLineFromSelection() {
            const selection = window.getSelection();
            if (!selection) return;
            const line = findSourceIndexFromNode(selection.anchorNode)
                ?? findSourceIndexFromNode(selection.focusNode)
                ?? findLineFromNode(selection.anchorNode)
                ?? findLineFromNode(selection.focusNode);
            if (line === null) return;
            setLastInteractedLine(line);
        }

        function getCurrentSelectionText() {
            const selection = window.getSelection();
            if (!selection || selection.rangeCount === 0) return null;
            const range = selection.getRangeAt(0);
            if (range.collapsed) return null;
            return selection.toString();
        }

        function getPreviewLineText(line) {
            const element = findElementByLine(line);
            if (!element) return '';
            return (element.innerText || element.textContent || '').replace(/\\r/g, '');
        }

        function normalizeLineForSource(line) {
            if (latestSourceLines.length === 0) return 0;
            if (!Number.isFinite(line) || line < 0) return 0;
            const index = Math.floor(line);
            return Math.min(index, latestSourceLines.length - 1);
        }

        function resolveFallbackLine() {
            if (isSourceModeActive()) {
                const sourceTop = findSourceLineAtTop();
                if (sourceTop) {
                    const line = parseInt(sourceTop.getAttribute('data-source-index') || '-1', 10);
                    if (Number.isFinite(line) && line >= 0) return line;
                }
                return 0;
            }

            const previewTop = findElementAtViewportTop();
            if (previewTop) {
                const line = parseInt(previewTop.getAttribute('data-line') || '-1', 10);
                if (Number.isFinite(line) && line >= 0) return line;
            }
            return 0;
        }

        function resolveCopyTextWithoutSelection() {
            const fallbackLine = resolveFallbackLine();
            const requestedLine = Number.isFinite(lastInteractedLine) ? lastInteractedLine : fallbackLine;
            const targetLine = requestedLine >= 0 ? requestedLine : fallbackLine;
            setLastInteractedLine(targetLine);

            if (isSourceModeActive()) {
                return latestSourceLines[normalizeLineForSource(targetLine)] || '';
            }

            return getPreviewLineText(targetLine);
        }

        function handleCopyEvent(event) {
            updateLastInteractedLineFromSelection();

            const selectedText = getCurrentSelectionText();
            if (selectedText !== null) {
                if (event.clipboardData) {
                    event.preventDefault();
                    event.clipboardData.setData('text/plain', selectedText);
                }
                return;
            }

            const textToCopy = resolveCopyTextWithoutSelection();
            if (!event.clipboardData) return;
            event.preventDefault();
            event.clipboardData.setData('text/plain', textToCopy);
        }
`;
