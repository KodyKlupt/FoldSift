import * as vscode from 'vscode';

/** Build the webview HTML with a strict CSP (nonce for scripts, wasm-unsafe-eval for Mol*). */
export function buildWebviewHtml(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  opts: { keepHotkey: string } = { keepHotkey: 's' }
): string {
  const nonce = makeNonce();
  const scriptUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'dist', 'webview.js')
  );
  const cssUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'dist', 'molstar.css')
  );

  // Normalize to a single character and HTML-escape it for safe attribute use.
  const keepHotkey = escapeAttr((opts.keepHotkey || 's').trim().slice(0, 1) || 's');

  const csp = [
    `default-src 'none'`,
    `img-src ${webview.cspSource} data: blob:`,
    `font-src ${webview.cspSource} data:`,
    `style-src ${webview.cspSource} 'unsafe-inline'`,
    // Mol* compiles WASM; workers run from blob URLs.
    `script-src 'nonce-${nonce}' 'wasm-unsafe-eval' blob:`,
    `worker-src blob:`,
    `connect-src blob: data:`
  ].join('; ');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link rel="stylesheet" href="${cssUri}" />
  <title>FoldSift</title>
  <style>
    html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; }
    #app { position: absolute; inset: 0; }
  </style>
</head>
<body data-keep-hotkey="${keepHotkey}">
  <div id="app"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}

function escapeAttr(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function makeNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  for (let i = 0; i < 32; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
  return s;
}
