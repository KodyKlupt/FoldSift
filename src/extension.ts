import * as vscode from 'vscode';
import { StructureEditorProvider } from './StructureEditorProvider';
import { ViewerPanelManager } from './ViewerPanelManager';
import { resolveStructureFiles, basename, STRUCTURE_EXTS } from './folderScan';

export function activate(context: vscode.ExtensionContext): void {
  const extUri = context.extensionUri;

  // Custom editor: double-click a structure file -> Mol* viewer.
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(
      StructureEditorProvider.viewType,
      new StructureEditorProvider(extUri),
      {
        webviewOptions: { retainContextWhenHidden: true }
      }
    )
  );

  // View a single structure via command / right-click.
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'foldsift.viewStructure',
      async (uri?: vscode.Uri) => {
        const files = await resolveStructureFiles(uri, undefined, false);
        if (files.length === 0) {
          vscode.window.showWarningMessage('FoldSift: no structure file selected.');
          return;
        }
        ViewerPanelManager.open(extUri, [files[0]], {
          title: `FoldSift — ${basename(files[0].path)}`,
          curation: false
        });
      }
    )
  );

  // Cycle through a folder / multi-selection (no curation).
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'foldsift.viewFolder',
      (uri?: vscode.Uri, selected?: vscode.Uri[]) => openCycler(extUri, uri, selected, false)
    )
  );

  // Cycle + curate.
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'foldsift.curateStructures',
      (uri?: vscode.Uri, selected?: vscode.Uri[]) => openCycler(extUri, uri, selected, true)
    )
  );
}

async function openCycler(
  extUri: vscode.Uri,
  uri: vscode.Uri | undefined,
  selected: vscode.Uri[] | undefined,
  curation: boolean
): Promise<void> {
  const recursive = vscode.workspace
    .getConfiguration('foldsift')
    .get<boolean>('recursiveFolderScan', false);
  const files = await resolveStructureFiles(uri, selected, recursive);
  if (files.length === 0) {
    vscode.window.showWarningMessage(
      `FoldSift: no structure files (${STRUCTURE_EXTS.map((e) => '.' + e).join('/')}) found.`
    );
    return;
  }
  const label = uri ? basename(uri.path) : `${files.length} files`;
  ViewerPanelManager.open(extUri, files, {
    title: `FoldSift — ${label}${curation ? ' (curate)' : ''}`,
    curation
  });
}

export function deactivate(): void {}
