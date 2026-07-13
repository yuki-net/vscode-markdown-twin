import * as vscode from 'vscode';
import { PreviewController } from '../adapters/vscode/preview/previewController';

describe('PreviewController lifecycle', () => {
  beforeEach(() => jest.clearAllMocks());

  it('starts translation through the coordinator when an active panel is selected', () => {
    const { controller, coordinator, registry } = createController();
    const panel = createPanel();

    controller.panelActivated(panel as any);

    expect(registry.setCurrentPanel).toHaveBeenCalledWith(panel);
    expect(coordinator.run).toHaveBeenCalledWith(panel.editorDocument);
  });

  it('stops only the disposed document while another preview remains', () => {
    const { controller, coordinator, registry } = createController();
    const panel = createPanel();
    registry.unregister.mockReturnValue({ hasDocument: false, hasPanels: true });

    controller.panelDisposed(panel as any);

    expect(coordinator.stopDocument).toHaveBeenCalledWith(panel.editorDocumentUri);
    expect(coordinator.stop).not.toHaveBeenCalled();
  });

  it('stops all translation state after the final preview is disposed', () => {
    const { controller, coordinator, registry } = createController();
    const panel = createPanel();
    registry.unregister.mockReturnValue({ hasDocument: false, hasPanels: false });

    controller.panelDisposed(panel as any);

    expect(coordinator.stopDocument).toHaveBeenCalledWith(panel.editorDocumentUri);
    expect(coordinator.stop).toHaveBeenCalledTimes(1);
  });
});

function createController() {
  const coordinator = {
    onDidChange: jest.fn(),
    isActive: jest.fn(() => true),
    run: jest.fn(async () => true),
    stopDocument: jest.fn(),
    stop: jest.fn(),
  };
  const registry = {
    setCurrentPanel: jest.fn(),
    unregister: jest.fn(),
    isCurrentDocument: jest.fn(() => false),
    findForDocument: jest.fn(() => []),
    getPanels: jest.fn(() => []),
  };
  const highlightService = { onDidChange: jest.fn(() => ({ dispose: jest.fn() })) };
  const controller = new PreviewController(
    coordinator as any,
    registry as any,
    highlightService as any
  );
  return { controller, coordinator, registry };
}

function createPanel() {
  const editorDocumentUri = vscode.Uri.file('/workspace/readme.md');
  return {
    editorDocumentUri,
    editorDocument: { uri: editorDocumentUri, languageId: 'markdown' },
    refresh: jest.fn(),
  };
}
