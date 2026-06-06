import esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/** Copy Mol* default CSS into dist so the webview can reference it via asWebviewUri. */
function copyMolstarCss() {
  const candidates = [
    'node_modules/molstar/lib/mol-plugin-ui/skin/light.scss', // not usable directly
    'node_modules/molstar/build/viewer/molstar.css',
    'node_modules/molstar/lib/mol-plugin-ui/skin/light.css'
  ];
  const dest = path.join('dist', 'molstar.css');
  for (const c of candidates) {
    if (fs.existsSync(c) && c.endsWith('.css')) {
      fs.copyFileSync(c, dest);
      console.log(`[css] copied ${c} -> ${dest}`);
      return;
    }
  }
  console.warn('[css] WARNING: could not find a prebuilt molstar.css; viewer may be unstyled.');
}

const baseOptions = {
  bundle: true,
  minify: production,
  sourcemap: !production,
  logLevel: 'info'
};

/** Extension host bundle: Node/CommonJS, vscode external. */
const extensionConfig = {
  ...baseOptions,
  entryPoints: ['src/extension.ts'],
  outfile: 'dist/extension.js',
  platform: 'node',
  format: 'cjs',
  target: 'node18',
  external: ['vscode']
};

/** Webview bundle: browser IIFE, includes Mol* + React. */
const webviewConfig = {
  ...baseOptions,
  entryPoints: ['src/webview/main.ts'],
  outfile: 'dist/webview.js',
  platform: 'browser',
  format: 'iife',
  target: 'es2020',
  loader: {
    '.ts': 'ts',
    '.tsx': 'tsx',
    '.jsx': 'jsx',
    '.woff': 'dataurl',
    '.woff2': 'dataurl',
    '.ttf': 'dataurl',
    '.svg': 'dataurl',
    '.css': 'text'
  },
  define: {
    'process.env.NODE_ENV': production ? '"production"' : '"development"'
  }
};

fs.mkdirSync('dist', { recursive: true });

async function run() {
  if (watch) {
    const ctxExt = await esbuild.context(extensionConfig);
    const ctxWeb = await esbuild.context(webviewConfig);
    await ctxExt.watch();
    await ctxWeb.watch();
    copyMolstarCss();
    console.log('[watch] building...');
  } else {
    await esbuild.build(extensionConfig);
    await esbuild.build(webviewConfig);
    copyMolstarCss();
    console.log('[build] done');
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
