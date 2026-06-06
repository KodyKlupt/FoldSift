import * as vscode from 'vscode';
import { buildWebviewHtml } from './webviewHtml';
import { basename, formatFor } from './folderScan';
import { parseStructureDetails } from './structureDetails';
import { CurationSession } from './CurationSession';
import { HostToWebview, WebviewToHost } from './messages';

/**
 * Owns a single webview panel that cycles through an ordered list of structure
 * files. Files are loaded lazily (one at a time) so a folder of hundreds of
 * structures never sits in memory at once. Optionally hosts a curation session
 * that exports kept structures to a CSV.
 */
export class ViewerPanelManager {
  private constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly panel: vscode.WebviewPanel,
    private readonly files: vscode.Uri[],
    private readonly curationEnabled: boolean
  ) {}

  private index = 0;
  private session: CurationSession | null = null;
  /** Cached raw text of the current structure (for detail extraction on Keep). */
  private currentText = '';
  /** Per-structure comments, keyed by URI string; survives navigation. */
  private readonly comments = new Map<string, string>();

  static open(
    extensionUri: vscode.Uri,
    files: vscode.Uri[],
    opts: { title: string; curation: boolean }
  ): ViewerPanelManager {
    const panel = vscode.window.createWebviewPanel(
      'foldsift.viewer',
      opts.title,
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'dist')]
      }
    );
    const keepHotkey = vscode.workspace
      .getConfiguration('foldsift')
      .get<string>('keepHotkey', 's');
    panel.webview.html = buildWebviewHtml(panel.webview, extensionUri, { keepHotkey });
    const mgr = new ViewerPanelManager(extensionUri, panel, files, opts.curation);
    mgr.wire();
    return mgr;
  }

  private post(m: HostToWebview): void {
    this.panel.webview.postMessage(m);
  }

  private wire(): void {
    this.panel.webview.onDidReceiveMessage((msg: WebviewToHost) => {
      switch (msg?.type) {
        case 'ready':
          this.sendFolderState();
          void this.loadCurrent();
          break;
        case 'next':
          this.go(this.index + 1);
          break;
        case 'prev':
          this.go(this.index - 1);
          break;
        case 'goto':
          this.go(msg.index);
          break;
        case 'startSelection':
          void this.startSelection();
          break;
        case 'keep':
          void this.keepCurrent();
          break;
        case 'comment':
          void this.setComment(msg.text);
          break;
        case 'endSelection':
          void this.endSelection();
          break;
      }
    });
  }

  private sendFolderState(): void {
    this.post({
      type: 'folder',
      total: this.files.length,
      index: this.index,
      filename: basename(this.files[this.index].path),
      navEnabled: true
    });
  }

  private go(target: number): void {
    const n = this.files.length;
    if (n === 0) return;
    // wrap around for convenient cycling
    this.index = ((target % n) + n) % n;
    this.sendFolderState();
    void this.loadCurrent();
  }

  private async loadCurrent(): Promise<void> {
    const uri = this.files[this.index];
    const bytes = await vscode.workspace.fs.readFile(uri);
    this.currentText = Buffer.from(bytes).toString('utf8');
    const cfg = vscode.workspace.getConfiguration('foldsift');
    this.post({
      type: 'load',
      filename: basename(uri.path),
      format: formatFor(uri.path),
      data: this.currentText,
      backgroundColor: cfg.get<string>('backgroundColor', '#1e1e1e')
    });
    this.emitSelectionState();
  }

  private async startSelection(): Promise<void> {
    const folder = parentFolder(this.files);
    this.session = new CurationSession(folder);
    this.emitSelectionState();
    vscode.window.showInformationMessage(
      `FoldSift: curation started → ${basename(this.session.csvUri.path)}`
    );
  }

  private async keepCurrent(): Promise<void> {
    if (!this.session) return;
    const uri = this.files[this.index];
    const format = formatFor(uri.path);
    const details = parseStructureDetails(this.currentText, format);
    const comment = this.comments.get(uri.toString()) ?? '';
    await this.session.toggle(this.index, uri, format, details, comment);
    this.emitSelectionState();
  }

  private async setComment(text: string): Promise<void> {
    const uri = this.files[this.index];
    this.comments.set(uri.toString(), text);
    // If this structure is already kept, push the edit through to the CSV.
    if (this.session) {
      await this.session.updateComment(uri, text, formatFor(uri.path));
    }
  }

  private async endSelection(): Promise<void> {
    if (!this.session) return;
    const { count, csvUri } = { count: this.session.count, csvUri: this.session.csvUri };
    this.session = null;
    this.emitSelectionState();
    const open = 'Open CSV';
    const choice = await vscode.window.showInformationMessage(
      `FoldSift: kept ${count} structure${count === 1 ? '' : 's'} → ${csvUri.fsPath}`,
      open
    );
    if (choice === open) {
      await vscode.window.showTextDocument(csvUri);
    }
  }

  private emitSelectionState(): void {
    this.post({
      type: 'selectionState',
      active: this.session !== null,
      keptCount: this.session?.count ?? 0,
      currentKept: this.session?.isKept(this.files[this.index]) ?? false,
      currentComment: this.comments.get(this.files[this.index].toString()) ?? ''
    });
  }
}

/** Common parent directory for the kept-CSV. Uses the first file's folder. */
function parentFolder(files: vscode.Uri[]): vscode.Uri {
  const first = files[0];
  return first.with({ path: first.path.slice(0, first.path.lastIndexOf('/')) || '/' });
}
