import * as fs from 'fs';
import * as path from 'path';

const root = path.resolve(__dirname, '..');

function typescriptFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return typescriptFiles(absolute);
    return entry.isFile() && entry.name.endsWith('.ts') ? [absolute] : [];
  });
}

describe('architecture boundaries', () => {
  it.each(['domain', 'ports', 'application'])('%s does not depend on the VS Code runtime', layer => {
    for (const file of typescriptFiles(path.join(root, layer))) {
      const source = fs.readFileSync(file, 'utf8');
      expect(source).not.toMatch(/from\s+['"]vscode['"]/);
    }
  });

  it('domain does not depend on providers or UI adapters', () => {
    for (const file of typescriptFiles(path.join(root, 'domain'))) {
      const source = fs.readFileSync(file, 'utf8');
      expect(source).not.toMatch(/from\s+['"][^'"]*(providers|preview|vscode)[^'"]*['"]/);
    }
  });

  it('ports depend only on domain contracts', () => {
    for (const file of typescriptFiles(path.join(root, 'ports'))) {
      const source = fs.readFileSync(file, 'utf8');
      const imports = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map(match => match[1]);
      expect(imports.every(specifier => (
        specifier.startsWith('../domain/') || specifier.startsWith('./')
      ))).toBe(true);
    }
  });

  it('translation coordinator depends on contracts, not concrete adapters', () => {
    const source = fs.readFileSync(path.join(root, 'application', 'translationCoordinator.ts'), 'utf8');
    expect(source).not.toMatch(/from\s+['"][^'"]*(providers|preview|vscode)[^'"]*['"]/);
  });

  it('keeps entrypoints, use cases, adapters, and webview code in their owned directories', () => {
    const required = [
      'extension/activate.ts',
      'extension/commandRegistry.ts',
      'extension/vscodeEventBindings.ts',
      'application/translationCoordinator.ts',
      'application/translationStore.ts',
      'application/translationEvents.ts',
      'domain/markdown/extractTranslationUnits.ts',
      'domain/markdown/translatedMarkdownBuilder.ts',
      'ports/settingsRepository.ts',
      'ports/secretRepository.ts',
      'ports/translationCache.ts',
      'adapters/providers/providerRegistry.ts',
      'adapters/vscode/vscodeSettingsRepository.ts',
      'adapters/vscode/vscodeSecretRepository.ts',
      'adapters/vscode/preview/previewRegistry.ts',
      'adapters/vscode/preview/previewController.ts',
      'adapters/vscode/preview/previewPanel.ts',
      'webview/protocol.ts',
      'webview/main.ts',
    ];
    for (const relativePath of required) {
      expect(fs.existsSync(path.join(root, relativePath))).toBe(true);
    }
  });

  it('does not restore legacy root-level architecture files', () => {
    const forbidden = [
      'extension.ts',
      'translationManager.ts',
      'translationService.ts',
      'translationCache.ts',
      'previewPanel.ts',
      'previewRegistry.ts',
      'previewController.ts',
      'providerSelector.ts',
      'statusBar.ts',
    ];
    for (const relativePath of forbidden) {
      expect(fs.existsSync(path.join(root, relativePath))).toBe(false);
    }
  });
});
