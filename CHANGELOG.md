# Changelog

All notable changes to Markdown Twin will be documented in this file.

## 1.2.0 - 2026-11-07

### Added

- Added `markdownTwin.syntaxTheme` to choose between the active VS Code theme and VS Code's built-in Dark/Light theme for preview syntax highlighting.

## 1.1.0 - 2026-07-15

### Added

- Support independent translation sessions for multiple Markdown documents.
- Show combined progress for multiple translations in the status bar.
- Open Markdown Twin from VS Code's built-in Markdown preview.

### Fixed

- Prevent invalid batch sizes from stalling translation.
- Correct status bar and preview/source action states.
- Prevent one document from interrupting another document's translation.

### Major Refactor

- Rebuilt the translation flow around domain, application, port, and adapter layers.
- Separated preview, settings, provider, status, and translation responsibilities.
- Expanded regression tests and documented the new architecture.

## 1.0.0 - 2026-06-13

Initial release of Markdown Twin.

### Added

- Translate Markdown documents with Google Cloud Translation, Azure Translator, DeepL, or Papago.
- Show translated Markdown in a VS Code webview with translation-only and bilingual display modes.
- Show a translated source view with Markdown-like rendering.
- Preserve Markdown structure for headings, lists, tables, links, images, code blocks, and front matter.
- Support multiple Markdown tabs and target-language-specific preview panels.
- Copy or export translated Markdown from the Twin preview.
- Configure provider, API key, Azure region, source language, target language, display mode, batch size, and debounce delay, including from the Markdown Twin Quick Pick menu.
- Support translation targets for Japanese, English, Korean, Simplified Chinese, Traditional Chinese, Spanish, French, German, Italian, Portuguese, Russian, Vietnamese, Thai, Indonesian, Arabic, and Hindi.
- Localize the extension UI in English, Japanese, Korean, Simplified Chinese, and Traditional Chinese.

### Security

- Store API keys using VS Code SecretStorage.
- Do not collect telemetry.
- Send translated text only to the translation provider selected by the user.
