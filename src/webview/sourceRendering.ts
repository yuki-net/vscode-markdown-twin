export const WEBVIEW_SCRIPT_SOURCE_RENDERING = `
        function splitHtmlIntoLines(html) {
            try {
                const lines = [];
                let currentLine = '';
                const tagStack = [];
                const regex = /(<[^>]+>|[^<]+)/g;
                let match;

                while ((match = regex.exec(html)) !== null) {
                    const token = match[0];
                    if (token.startsWith('<')) {
                        if (token.startsWith('<' + '/')) {
                            tagStack.pop();
                            currentLine += token;
                        } else {
                            if (!token.endsWith('/>') && !token.startsWith('<!--')) {
                                const tagNameMatch = token.match(/<([a-zA-Z0-9]+)/);
                                if (tagNameMatch) {
                                    tagStack.push(token);
                                }
                            }
                            currentLine += token;
                        }
                    } else {
                        const newline = String.fromCharCode(10);
                        const textLines = token.split(newline);
                        for (let i = 0; i < textLines.length; i++) {
                            if (i > 0) {
                                let closeTags = '';
                                for (let j = tagStack.length - 1; j >= 0; j--) {
                                    const openTag = tagStack[j];
                                    const tagMatch = openTag.match(/<([a-zA-Z0-9]+)/);
                                    const tagName = tagMatch ? tagMatch[1] : '';
                                    if (tagName) {
                                        closeTags += '<' + '/' + tagName + '>';
                                    }
                                }
                                currentLine += closeTags;
                                lines.push(currentLine);

                                let openTags = '';
                                for (let j = 0; j < tagStack.length; j++) {
                                    openTags += tagStack[j];
                                }
                                currentLine = openTags;
                            }
                            currentLine += textLines[i];
                        }
                    }
                }
                if (currentLine) {
                    lines.push(currentLine);
                }
                return lines;
            } catch (err) {
                console.error('Error splitting HTML into lines:', err);
                const newline = String.fromCharCode(10);
                return (html || '').split(newline);
            }
        }

        function syncLineHeights() {
            const codeEl = document.getElementById('source-code');
            const lineNumbersEl = document.getElementById('line-numbers');
            if (!codeEl || !lineNumbersEl) {
                updateSourceScrollbar();
                return;
            }

            const codeLines = codeEl.querySelectorAll('.code-line');
            const lineNumbers = lineNumbersEl.querySelectorAll('.line-number');

            if (codeLines.length !== lineNumbers.length) {
                updateScrollBeyondLastLinePadding();
                updateSourceScrollbar();
                return;
            }

            for (let i = 0; i < codeLines.length; i++) {
                const height = codeLines[i].getBoundingClientRect().height;
                lineNumbers[i].style.height = height + 'px';
            }
            updateScrollBeyondLastLinePadding();
            updateSourceScrollbar();
        }

        function renderSourceCode(rawHtml, sourceText, expectedLineCount, sourceLineOrigins) {
            const codeEl = document.getElementById('source-code');
            const lineNumbersEl = document.getElementById('line-numbers');
            if (!codeEl || !lineNumbersEl) return;

            const htmlLines = alignLineCount(splitHtmlIntoLines(rawHtml), expectedLineCount);
            const sourceLines = parseSourceLines(sourceText, expectedLineCount);
            const normalizedLineOrigins = normalizeSourceLineOrigins(sourceLineOrigins, expectedLineCount);
            prepareFoldState(sourceLines);

            let codeHtml = '';
            let lineNumHtml = '';

            sourceLines.forEach((rawLine, index) => {
                const highlightedLine = htmlLines[index] || '';
                const originalLine = normalizedLineOrigins[index] ?? index;
                const displayLine = highlightedLine.trim() === '' ? '&nbsp;' : highlightedLine;
                const foldState = resolveFoldState(index);
                const hiddenByFold = isLineHiddenByFold(index);
                const styleAttr = hiddenByFold ? ' style="display:none;"' : '';
                const classes = ['code-line'];
                if (isOrderedListLine(rawLine)) {
                    classes.push('ordered-list-line');
                }
                const summaryHtml = foldRangeByStart.has(index)
                  ? '<span class="code-line-content">' + displayLine + '</span>'
                    + '<span class="folded-summary" title="Collapsed region">'
                    + '<span class="folded-summary-text">' + displayLine + '</span>'
                    + '<span class="fold-ellipsis" role="button" tabindex="0" data-fold-open="' + index + '" title="Expand folded region" aria-label="Expand folded region">⋯</span>'
                    + '</span>'
                  : '<span class="code-line-content">' + displayLine + '</span>';

                codeHtml += '<div class="' + classes.join(' ') + '" data-line="' + originalLine + '" data-source-index="' + index + '" data-fold-state="' + foldState + '"' + styleAttr + '>'
                  + summaryHtml
                  + '</div>';
                lineNumHtml += '<div class="line-number" data-line="' + originalLine + '" data-source-index="' + index + '" data-fold-state="' + foldState + '"' + styleAttr + '>'
                  + '<span class="line-number-value">' + (index + 1) + '</span>'
                  + '<span class="line-number-fold-slot">' + buildFoldToggleHtml(index) + '</span>'
                  + '</div>';
            });

            codeEl.innerHTML = codeHtml;
            lineNumbersEl.innerHTML = lineNumHtml;
            bindFoldRailHoverState();
            bindFoldToggleEvents();
            syncLineHeights();
            renderSourceStickyHeadings(true);
        }
`;
