import * as vscode from 'vscode';
import { StructureDetails } from './structureDetails';
import { basename } from './folderScan';
import type { StructureFormat } from './messages';

interface KeptRow {
  index: number;
  uri: vscode.Uri;
  details: StructureDetails;
  comment: string;
  selectedAt: string;
}

const CSV_HEADER = [
  'index',
  'filename',
  'full_path',
  'format',
  'num_chains',
  'num_residues',
  'num_atoms',
  'seq_length',
  'sequence',
  'comment',
  'selected_at'
];

/**
 * A single curation pass over a set of structures. Kept rows live in memory
 * keyed by file path; the backing CSV is rewritten atomically on every change
 * so de-selecting (toggling Keep off) cleanly removes a row.
 */
export class CurationSession {
  private readonly kept = new Map<string, KeptRow>();
  readonly csvUri: vscode.Uri;

  constructor(folder: vscode.Uri) {
    this.csvUri = vscode.Uri.joinPath(folder, `foldsift_selections_${timestamp()}.csv`);
  }

  get count(): number {
    return this.kept.size;
  }

  isKept(uri: vscode.Uri): boolean {
    return this.kept.has(uri.toString());
  }

  /** Toggle keep state for a structure. Returns the new kept state. */
  async toggle(
    index: number,
    uri: vscode.Uri,
    format: StructureFormat,
    details: StructureDetails,
    comment: string
  ): Promise<boolean> {
    const key = uri.toString();
    let nowKept: boolean;
    if (this.kept.has(key)) {
      this.kept.delete(key);
      nowKept = false;
    } else {
      this.kept.set(key, { index, uri, details, comment, selectedAt: new Date().toISOString() });
      nowKept = true;
    }
    await this.flush(format);
    return nowKept;
  }

  /**
   * Update the comment on an already-kept structure and rewrite the CSV.
   * No-op (returns false) if the structure isn't currently kept — comments for
   * unkept structures are held by the host until the structure is kept.
   */
  async updateComment(uri: vscode.Uri, comment: string, format: StructureFormat): Promise<boolean> {
    const row = this.kept.get(uri.toString());
    if (!row) return false;
    if (row.comment === comment) return true;
    row.comment = comment;
    await this.flush(format);
    return true;
  }

  /** Write (or rewrite) the CSV atomically: temp file then rename. */
  private async flush(format: StructureFormat): Promise<void> {
    const rows = [...this.kept.values()].sort((a, b) => a.index - b.index);
    const lines = [CSV_HEADER.map(csvField).join(',')];
    for (const r of rows) {
      lines.push(
        [
          String(r.index + 1),
          basename(r.uri.path),
          r.uri.fsPath,
          format,
          String(r.details.numChains),
          String(r.details.numResidues),
          String(r.details.numAtoms),
          String(r.details.seqLength),
          r.details.sequence,
          r.comment,
          r.selectedAt
        ]
          .map(csvField)
          .join(',')
      );
    }
    const content = Buffer.from(lines.join('\n') + '\n', 'utf8');
    const tmp = this.csvUri.with({ path: this.csvUri.path + '.tmp' });
    await vscode.workspace.fs.writeFile(tmp, content);
    await vscode.workspace.fs.rename(tmp, this.csvUri, { overwrite: true });
  }
}

function csvField(v: string): string {
  // RFC 4180: quote if it contains comma, quote, CR or LF; escape quotes by doubling.
  if (/[",\r\n]/.test(v)) {
    return '"' + v.replace(/"/g, '""') + '"';
  }
  return v;
}

function timestamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}` +
    `-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
  );
}
