// Standalone test for the binary/gzip structure-decoding path.
// Bundled with esbuild (platform=node) and run with node — see npm script.

import * as fs from 'fs';
import * as path from 'path';
import { decodeStructure, formatFor } from '../src/structureData';
import { parseStructureDetails } from '../src/structureDetails';
import { CIF } from 'molstar/lib/mol-io/reader/cif';

const DATA = process.env.FOLDSIFT_DATA || path.join(__dirname, '..', 'test-data');
let failures = 0;

function check(name: string, cond: boolean, detail = ''): void {
  if (cond) {
    console.log(`  ✓ ${name}`);
  } else {
    failures++;
    console.error(`  ✗ ${name}${detail ? ' — ' + detail : ''}`);
  }
}

function read(file: string): Uint8Array {
  return new Uint8Array(fs.readFileSync(path.join(DATA, file)));
}

async function main(): Promise<void> {
  // --- formatFor handles .gz and .bcif --------------------------------------
  console.log('formatFor:');
  check('model.pdb.gz -> pdb', formatFor('model.pdb.gz') === 'pdb');
  check('foo.cif.gz -> mmcif', formatFor('foo.cif.gz') === 'mmcif');
  check('foo.bcif -> mmcif', formatFor('foo.bcif') === 'mmcif');
  check('foo.bcif.gz -> mmcif', formatFor('foo.bcif.gz') === 'mmcif');
  check('foo.pdb -> pdb', formatFor('foo.pdb') === 'pdb');

  // --- gzip text round-trips and parses for details -------------------------
  console.log('gzip (.pdb.gz):');
  const gz = decodeStructure(read('1crn.pdb.gz'), '1crn.pdb.gz');
  check('format pdb', gz.format === 'pdb');
  check('not binary', gz.isBinary === false);
  check('decompressed to PDB text', gz.text.includes('ATOM') && gz.data === gz.text);
  const gzDetails = parseStructureDetails(gz.text, gz.format);
  check('1 chain', gzDetails.numChains === 1, `got ${gzDetails.numChains}`);
  check('46 residues', gzDetails.numResidues === 46, `got ${gzDetails.numResidues}`);

  console.log('gzip (.cif.gz):');
  const cgz = decodeStructure(read('1crn.cif.gz'), '1crn.cif.gz');
  check('format mmcif', cgz.format === 'mmcif');
  check('not binary', cgz.isBinary === false);
  check('decompressed CIF text', cgz.text.includes('_atom_site'));

  // --- binary cif: base64 round-trip is lossless and Mol*-parseable ---------
  console.log('binary (.bcif):');
  const origBcif = read('1crn.bcif');
  const dec = decodeStructure(origBcif, '1crn.bcif');
  check('format mmcif', dec.format === 'mmcif');
  check('isBinary true', dec.isBinary === true);
  check('no host text', dec.text === '');

  const roundTrip = new Uint8Array(Buffer.from(dec.data, 'base64'));
  check(
    'base64 round-trip lossless',
    roundTrip.length === origBcif.length && roundTrip.every((b, i) => b === origBcif[i]),
    `len ${roundTrip.length} vs ${origBcif.length}`
  );

  // The OLD path coerced binary to UTF-8 — prove that was lossy.
  const oldPath = new Uint8Array(Buffer.from(Buffer.from(origBcif).toString('utf8'), 'utf8'));
  check(
    'old utf8 path WAS corrupting (sanity)',
    oldPath.length !== origBcif.length ||
      !oldPath.every((b, i) => b === origBcif[i])
  );

  // Feed the decoded bytes to Mol*'s BinaryCIF parser (same one the viewer uses).
  const parsed = await CIF.parseBinary(roundTrip).run();
  check('Mol* parseBinary succeeds', !parsed.isError, parsed.isError ? parsed.message : '');
  if (!parsed.isError) {
    const block = parsed.result.blocks[0];
    const atomSite = block?.categories['atom_site'];
    check('has atom_site category', !!atomSite);
    check('atom_site has rows', (atomSite?.rowCount ?? 0) > 0, `rows ${atomSite?.rowCount}`);
  }

  console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
