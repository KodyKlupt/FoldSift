// Derive sequence + counts from raw PDB / mmCIF text on the extension host.
// Kept deliberately dependency-free and deterministic so it is easy to test.

import type { StructureFormat } from './messages';

export interface StructureDetails {
  numChains: number;
  numResidues: number;
  numAtoms: number;
  seqLength: number;
  /** Per-chain one-letter sequence, chains joined by '/'. */
  sequence: string;
}

// Standard amino acids + a few common non-standard / modified residues.
const THREE_TO_ONE: Record<string, string> = {
  ALA: 'A', ARG: 'R', ASN: 'N', ASP: 'D', CYS: 'C', GLN: 'Q', GLU: 'E',
  GLY: 'G', HIS: 'H', ILE: 'I', LEU: 'L', LYS: 'K', MET: 'M', PHE: 'F',
  PRO: 'P', SER: 'S', THR: 'T', TRP: 'W', TYR: 'Y', VAL: 'V',
  MSE: 'M', SEC: 'U', PYL: 'O', HSD: 'H', HSE: 'H', HSP: 'H',
  // common nucleotides -> lowercase so protein chains stay distinguishable
  DA: 'a', DC: 'c', DG: 'g', DT: 't', DU: 'u',
  A: 'a', C: 'c', G: 'g', U: 'u'
};

function oneLetter(resName: string): string {
  return THREE_TO_ONE[resName.toUpperCase()] ?? 'X';
}

interface ResidueAccum {
  chains: string[]; // chain ids in first-seen order
  perChain: Map<string, string[]>; // chainId -> one-letter codes
  seen: Set<string>; // chainId|resSeq|iCode dedupe
  atoms: number;
}

function emptyAccum(): ResidueAccum {
  return { chains: [], perChain: new Map(), seen: new Set(), atoms: 0 };
}

function addResidue(
  acc: ResidueAccum,
  chainId: string,
  resKey: string,
  resName: string
): void {
  acc.atoms++;
  const dedupe = `${chainId}|${resKey}`;
  if (acc.seen.has(dedupe)) return;
  acc.seen.add(dedupe);
  if (!acc.perChain.has(chainId)) {
    acc.perChain.set(chainId, []);
    acc.chains.push(chainId);
  }
  acc.perChain.get(chainId)!.push(oneLetter(resName));
}

function finalize(acc: ResidueAccum): StructureDetails {
  const seqs = acc.chains.map((c) => acc.perChain.get(c)!.join(''));
  const numResidues = seqs.reduce((n, s) => n + s.length, 0);
  return {
    numChains: acc.chains.length,
    numResidues,
    numAtoms: acc.atoms,
    seqLength: numResidues,
    sequence: seqs.join('/')
  };
}

export function parseStructureDetails(text: string, format: StructureFormat): StructureDetails {
  switch (format) {
    case 'mmcif':
      return parseMmcif(text);
    // PDB and PDBQT share the column-based ATOM/HETATM record layout.
    case 'pdb':
    case 'pdbqt':
      return parsePdb(text);
    // Small-molecule / coordinate-only formats: Mol* still renders them, but we
    // don't extract per-chain sequences — report empty details for the CSV.
    default:
      return finalize(emptyAccum());
  }
}

// ---- PDB (column-based fixed format) ----
function parsePdb(text: string): StructureDetails {
  const acc = emptyAccum();
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const rec = line.slice(0, 6);
    if (rec !== 'ATOM  ' && rec !== 'HETATM') continue;
    const resName = line.slice(17, 20).trim();
    if (!resName) continue;
    const chainId = line.slice(21, 22).trim() || '_';
    const resSeq = line.slice(22, 26).trim();
    const iCode = line.slice(26, 27).trim();
    addResidue(acc, chainId, `${resSeq}${iCode}`, resName);
  }
  return finalize(acc);
}

// ---- mmCIF (_atom_site loop) ----
function parseMmcif(text: string): StructureDetails {
  const acc = emptyAccum();
  const lines = text.split(/\r?\n/);

  let i = 0;
  while (i < lines.length) {
    if (lines[i].trim() !== 'loop_') {
      i++;
      continue;
    }
    // collect the column headers of this loop
    const cols: string[] = [];
    let j = i + 1;
    while (j < lines.length && lines[j].trim().startsWith('_')) {
      cols.push(lines[j].trim());
      j++;
    }
    if (!cols.some((c) => c.startsWith('_atom_site.'))) {
      i = j; // not the atom_site loop; skip past its headers
      continue;
    }
    const idx = (name: string) => cols.indexOf(`_atom_site.${name}`);
    const cGroup = idx('group_PDB');
    const cComp =
      idx('label_comp_id') >= 0 ? idx('label_comp_id') : idx('auth_comp_id');
    const cAsym =
      idx('auth_asym_id') >= 0 ? idx('auth_asym_id') : idx('label_asym_id');
    const cSeq =
      idx('auth_seq_id') >= 0 ? idx('auth_seq_id') : idx('label_seq_id');
    const cIns = idx('pdbx_PDB_ins_code');

    // iterate data rows until a line that is blank, a new loop_, or a '#'/'_'
    let k = j;
    for (; k < lines.length; k++) {
      const raw = lines[k];
      const t = raw.trim();
      if (t === '' || t === '#' || t === 'loop_' || t.startsWith('_')) break;
      const f = splitCifRow(raw);
      if (f.length < cols.length) continue;
      if (cGroup >= 0 && f[cGroup] !== 'ATOM' && f[cGroup] !== 'HETATM') continue;
      const resName = cComp >= 0 ? f[cComp] : '';
      if (!resName) continue;
      const chainId = cAsym >= 0 ? f[cAsym] : '_';
      const resSeq = cSeq >= 0 ? f[cSeq] : '';
      const iCode = cIns >= 0 && f[cIns] !== '?' && f[cIns] !== '.' ? f[cIns] : '';
      addResidue(acc, chainId, `${resSeq}${iCode}`, resName);
    }
    i = k;
  }
  return finalize(acc);
}

// Whitespace-split a CIF row, honoring single/double quoted tokens.
function splitCifRow(line: string): string[] {
  const out: string[] = [];
  let i = 0;
  const n = line.length;
  while (i < n) {
    while (i < n && (line[i] === ' ' || line[i] === '\t')) i++;
    if (i >= n) break;
    const ch = line[i];
    if (ch === '"' || ch === "'") {
      i++;
      let s = '';
      while (i < n && line[i] !== ch) s += line[i++];
      i++; // closing quote
      out.push(s);
    } else {
      let s = '';
      while (i < n && line[i] !== ' ' && line[i] !== '\t') s += line[i++];
      out.push(s);
    }
  }
  return out;
}
