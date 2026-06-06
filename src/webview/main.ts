import { createPluginUI } from 'molstar/lib/mol-plugin-ui';
import { renderReact18 } from 'molstar/lib/mol-plugin-ui/react18';
import { DefaultPluginUISpec } from 'molstar/lib/mol-plugin-ui/spec';
import type { PluginUIContext } from 'molstar/lib/mol-plugin-ui/context';
import { Color } from 'molstar/lib/mol-util/color';
import { NavBar } from './nav';
import navCss from './styles.css';
import type { HostToWebview, StructureFormat, WebviewToHost } from '../messages';

declare function acquireVsCodeApi(): { postMessage(m: unknown): void };
const vscode = acquireVsCodeApi();
const send = (m: WebviewToHost) => vscode.postMessage(m);

// Inject nav-bar styles (CSP allows 'unsafe-inline' for styles).
const styleEl = document.createElement('style');
styleEl.textContent = navCss as unknown as string;
document.head.appendChild(styleEl);

// The keep hotkey is injected by the host as a body data attribute (from the
// `foldsift.keepHotkey` setting); default to 's'.
const KEEP_HOTKEY = document.body.dataset.keepHotkey || 's';

let plugin: PluginUIContext | null = null;
let nav: NavBar | null = null;
let loadToken = 0;

async function init(): Promise<void> {
  const target = document.getElementById('app')!;
  plugin = await createPluginUI({
    target,
    render: renderReact18,
    spec: {
      ...DefaultPluginUISpec(),
      layout: {
        initial: {
          isExpanded: false,
          showControls: true,
          controlsDisplay: 'reactive'
        }
      }
    }
  });

  nav = new NavBar(
    {
      onPrev: () => send({ type: 'prev' }),
      onNext: () => send({ type: 'next' }),
      onGoto: (index) => send({ type: 'goto', index }),
      onStart: () => send({ type: 'startSelection' }),
      onKeep: () => send({ type: 'keep' }),
      onComment: (text) => send({ type: 'comment', text }),
      onEnd: () => send({ type: 'endSelection' })
    },
    { curationAllowed: true, keepHotkey: KEEP_HOTKEY }
  );

  window.addEventListener('message', (ev: MessageEvent<HostToWebview>) => {
    void handle(ev.data);
  });

  send({ type: 'ready' });
}

async function handle(msg: HostToWebview): Promise<void> {
  if (!plugin || !nav) return;
  switch (msg.type) {
    case 'load':
      await loadStructure(msg.data, msg.format, msg.isBinary, msg.backgroundColor);
      break;
    case 'folder':
      nav.setFolder(msg.total, msg.index, msg.filename, msg.navEnabled);
      break;
    case 'selectionState':
      nav.setSelection(msg.active, msg.keptCount, msg.currentKept, msg.currentComment);
      break;
  }
}

async function loadStructure(
  data: string,
  format: StructureFormat,
  isBinary: boolean,
  background: string
): Promise<void> {
  if (!plugin) return;
  const token = ++loadToken;
  await plugin.clear();
  // A newer load may have superseded this one while clearing.
  if (token !== loadToken) return;

  // Binary payloads (e.g. .bcif) arrive base64-encoded; decode to a Uint8Array,
  // which Mol* treats as binary data. Text formats pass straight through.
  const raw = isBinary
    ? await plugin.builders.data.rawData({ data: base64ToBytes(data) })
    : await plugin.builders.data.rawData({ data });
  const trajectory = await plugin.builders.structure.parseTrajectory(raw, format);
  await plugin.builders.structure.hierarchy.applyPreset(trajectory, 'default');

  applyBackground(background);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function applyBackground(hex: string): void {
  if (!plugin?.canvas3d) return;
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return;
  plugin.canvas3d.setProps({
    renderer: { backgroundColor: Color(parseInt(m[1], 16)) }
  });
}

void init();
