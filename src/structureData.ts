// Host-side decoding of structure files into something the Mol* webview can
// parse. Handles plain text, gzip (`.gz`) decompression, and binary inputs
// (`.bcif`). Deliberately free of `vscode` imports so it can be unit-tested in
// plain Node.

import * as zlib from 'zlib';
import type { StructureFormat } from './messages';

/** Strip a trailing `.gz` so the underlying structure extension is visible. */
function stripGz(name: string): string {
  return name.replace(/\.gz$/i, '');
}

/** True when the (de-gzipped) filename names a binary structure format. */
export function isBinaryName(name: string): boolean {
  return /\.bcif$/i.test(stripGz(name));
}

/** Pick the Mol* trajectory format from a filename's extension (ignores `.gz`). */
export function formatFor(name: string): StructureFormat {
  const base = stripGz(name);
  const ext = base.slice(base.lastIndexOf('.') + 1).toLowerCase();
  switch (ext) {
    case 'cif':
    case 'mmcif':
    case 'bcif': // binary mmCIF — same Mol* trajectory format, binary payload
      return 'mmcif';
    case 'pdbqt':
      return 'pdbqt';
    case 'gro':
      return 'gro';
    case 'mol2':
      return 'mol2';
    case 'sdf':
    case 'sd':
      return 'sdf';
    case 'mol':
      return 'mol';
    case 'xyz':
      return 'xyz';
    // .pdb, .ent and anything else fall back to PDB.
    default:
      return 'pdb';
  }
}

export interface DecodedStructure {
  format: StructureFormat;
  /** Whether `data` is a base64-encoded binary payload (vs UTF-8 text). */
  isBinary: boolean;
  /** Payload for the webview: base64 when binary, UTF-8 text otherwise. */
  data: string;
  /**
   * Decompressed UTF-8 text for host-side detail extraction. Empty for binary
   * formats (we don't parse BinaryCIF on the host).
   */
  text: string;
}

/**
 * Decode raw file bytes for a given filename:
 *  - `.gz` is gunzipped first, and the inner extension decides the rest.
 *  - binary formats (`.bcif`) are base64-encoded and flagged `isBinary`.
 *  - everything else is decoded as UTF-8 text.
 */
export function decodeStructure(bytes: Uint8Array, filename: string): DecodedStructure {
  let buf = Buffer.from(bytes);
  if (/\.gz$/i.test(filename)) {
    buf = zlib.gunzipSync(buf);
  }
  const format = formatFor(filename);
  if (isBinaryName(filename)) {
    return { format, isBinary: true, data: buf.toString('base64'), text: '' };
  }
  const text = buf.toString('utf8');
  return { format, isBinary: false, data: text, text };
}
