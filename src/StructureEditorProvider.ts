import * as vscode from 'vscode';
import { buildWebviewHtml } from './webviewHtml';
import { basename } from './folderScan';
import { decodeStructure } from './structureData';
import { HostToWebview } from './messages';

/**
 * Custom editor so double-clicking a .pdb/.cif/... file opens it directly in the
 * Mol* viewer. This is a single-structure, read-only view (no nav/curation bar).
 */
export class StructureEditorProvider implements vscode.CustomReadonlyEditorProvider {
  public static readonly viewType = 'foldsift.structure';

  constructor(private readonly extensionUri: vscode.Uri) {}

  openCustomDocument(uri: vscode.Uri): vscode.CustomDocument {
    return { uri, dispose: () => {} };
  }

  async resolveCustomEditor(
    document: vscode.CustomDocument,
    panel: vscode.WebviewPanel
  ): Promise<void> {
    panel.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'dist')]
    };
    panel.webview.html = buildWebviewHtml(panel.webview, this.extensionUri);

    const post = (m: HostToWebview) => panel.webview.postMessage(m);

    panel.webview.onDidReceiveMessage(async (msg) => {
      if (msg?.type === 'ready') {
        // Single-file mode: hide nav chrome, then load the structure.
        post({ type: 'folder', total: 1, index: 0, filename: basename(document.uri.path), navEnabled: false });
        await loadInto(post, document.uri);
      }
    });
  }
}

async function loadInto(
  post: (m: HostToWebview) => void,
  uri: vscode.Uri
): Promise<void> {
  const bytes = await vscode.workspace.fs.readFile(uri);
  const cfg = vscode.workspace.getConfiguration('foldsift');
  const decoded = decodeStructure(bytes, basename(uri.path));
  post({
    type: 'load',
    filename: basename(uri.path),
    format: decoded.format,
    data: decoded.data,
    isBinary: decoded.isBinary,
    backgroundColor: cfg.get<string>('backgroundColor', '#1e1e1e')
  });
}
