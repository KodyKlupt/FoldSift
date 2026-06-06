import * as vscode from 'vscode';

export const STRUCTURE_EXTS = [
  'pdb',
  'cif',
  'mmcif',
  'ent',
  'pdbqt',
  'gro',
  'mol2',
  'sdf',
  'sd',
  'mol',
  'xyz',
  'bcif'
];

// Any structure extension, optionally gzip-compressed (e.g. `model.pdb.gz`).
const EXT_RE = /\.(pdb|cif|mmcif|ent|pdbqt|gro|mol2|sdf|sd|mol|xyz|bcif)(\.gz)?$/i;

export function isStructureFile(name: string): boolean {
  return EXT_RE.test(name);
}

/** Natural ("human") sort so design_2 < design_10. */
export function naturalCompare(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

/**
 * Resolve a command invocation into an ordered list of structure file URIs.
 *
 * VS Code passes a single resource as `uri` and, when multiple items are
 * selected in the Explorer, the full selection as `selected`. A folder is
 * scanned (optionally recursively); files are filtered to structure types.
 */
export async function resolveStructureFiles(
  uri: vscode.Uri | undefined,
  selected: vscode.Uri[] | undefined,
  recursive: boolean
): Promise<vscode.Uri[]> {
  const inputs: vscode.Uri[] =
    selected && selected.length > 0 ? selected : uri ? [uri] : [];

  const out: vscode.Uri[] = [];
  for (const input of inputs) {
    let stat: vscode.FileStat;
    try {
      stat = await vscode.workspace.fs.stat(input);
    } catch {
      continue;
    }
    if (stat.type & vscode.FileType.Directory) {
      await collectFromDir(input, recursive, out);
    } else if (isStructureFile(input.path)) {
      out.push(input);
    }
  }

  // De-duplicate (a file could appear via both a folder and an explicit pick).
  const seen = new Set<string>();
  const unique = out.filter((u) => {
    if (seen.has(u.toString())) return false;
    seen.add(u.toString());
    return true;
  });

  unique.sort((a, b) => naturalCompare(basename(a.path), basename(b.path)));
  return unique;
}

async function collectFromDir(
  dir: vscode.Uri,
  recursive: boolean,
  out: vscode.Uri[]
): Promise<void> {
  let entries: [string, vscode.FileType][];
  try {
    entries = await vscode.workspace.fs.readDirectory(dir);
  } catch {
    return;
  }
  for (const [name, type] of entries) {
    const child = vscode.Uri.joinPath(dir, name);
    if (type & vscode.FileType.Directory) {
      if (recursive) await collectFromDir(child, recursive, out);
    } else if (isStructureFile(name)) {
      out.push(child);
    }
  }
}

export function basename(p: string): string {
  const i = p.lastIndexOf('/');
  return i >= 0 ? p.slice(i + 1) : p;
}
