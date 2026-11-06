# Contributing to Markdown Twin

Thanks for your interest in improving Markdown Twin. Issues and pull requests are welcome in English or Japanese.

By participating, you agree to follow [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## Prerequisites

- Node.js 20 or later
- npm 10 or later
- VS Code 1.85 or later

## Set up

```bash
git clone https://github.com/yuki-net/vscode-markdown-twin.git
cd vscode-markdown-twin
npm ci
npm run build
```

## Development workflow

| Task | Command |
| --- | --- |
| Type check | `npm run compile` |
| Run tests | `npm test` |
| Watch build (esbuild) | `npm run watch` |
| One-shot build | `npm run build` |
| Validate icon size for Marketplace | `npm run check:icon` |
| Full pre-release check | `npm run release:check` |

To run the extension, open the repository in VS Code and press <kbd>F5</kbd> (Run Extension). The `Build` task runs automatically before launch.

## Architecture

Read [ARCHITECTURE.md](ARCHITECTURE.md) before making structural changes.

The code is organized into layers:

- `src/domain/` — pure Markdown and translation rules (no VS Code API)
- `src/ports/` — contracts for external capabilities
- `src/application/` — translation use cases and state (no VS Code API)
- `src/adapters/` — VS Code, providers, and Webview implementations
- `src/extension/` — activation, commands, and event wiring
- `src/webview/` — Webview runtime and protocol types

Dependency direction matters. `src/test/architecture/boundaries.test.ts` enforces that `domain`, `ports`, and `application` never import `vscode`, and that translation code does not depend on concrete UI adapters.

## Coding guidelines

- Keep TypeScript `strict` clean.
- Do not add cross-layer static state. Inject dependencies through constructors.
- Keep the Markdown transformation core free of VS Code APIs.
- Add or update tests for behavior changes, especially in `src/application/` and `src/domain/`.
- When you add UI text or a setting, update all locales in `src/locales/` and the relevant `package.nls*.json` files.
- Keep Webview message types in `src/webview/protocol.ts` and validate incoming messages.
- Never log API keys, tokens, or private document content.

## Pull requests

1. Branch from `develop`.
2. Make focused changes and include tests.
3. Run `npm run release:check` before pushing.
4. Describe **what** changed and **why**, and link the related issue.
5. Add a `CHANGELOG.md` entry for user-facing changes.
6. Attach screenshots for UI changes.

Commit messages may be written in English or Japanese. Clear, imperative messages are preferred.

## Reporting bugs and security issues

- Bugs and feature requests: use the issue templates.
- Security issues: follow [SECURITY.md](SECURITY.md) and **do not open a public issue**.
