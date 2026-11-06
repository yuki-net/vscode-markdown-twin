# Accessibility

Markdown Twin aims to keep the translated preview usable with VS Code's accessibility features and settings.

## Supported environments

- VS Code 1.85 or later
- Light, dark, and high-contrast color themes
- Keyboard navigation provided by VS Code and Webview focus handling
- Screen readers to the extent supported by VS Code Webviews

## What we do

- Preview colors follow VS Code theme variables where possible.
- `markdownTwin.syntaxTheme` can switch syntax highlighting to VS Code's built-in Dark/Light theme when the active theme makes Markdown tokens hard to distinguish.
- Source view keeps line numbers and text structure instead of relying on color alone.
- Translated text can be copied or exported with commands, so it is available outside the Webview.
- The README includes text alternatives for its screenshots.

## Known limitations

- Webview accessibility depends on the VS Code Webview implementation and the active screen reader.
- Some color themes intentionally render Markdown headings and punctuation in the same color as body text. Use `markdownTwin.syntaxTheme: builtin` if the preview looks flat.
- Scroll synchronization between the editor and the preview is visual; it does not announce changes to screen readers.
- Very large documents may be slow to navigate with assistive technology, as with any long Markdown preview.

## Reporting an accessibility barrier

Open an issue with:

- The feature or screen involved
- VS Code version, operating system, and color theme
- Screen reader or other assistive technology, if used
- Steps to reproduce the barrier

Please avoid including private document content in the report.
