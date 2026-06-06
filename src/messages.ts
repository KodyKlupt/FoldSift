// Shared message-protocol types between the extension host and the webview.

// Text-based molecular formats Mol* can parse directly from raw text.
export type StructureFormat =
  | 'pdb'
  | 'mmcif'
  | 'pdbqt'
  | 'gro'
  | 'mol2'
  | 'sdf'
  | 'mol'
  | 'xyz';

/** Extension host -> webview */
export type HostToWebview =
  | {
      type: 'load';
      filename: string;
      format: StructureFormat;
      /** Raw text content of the structure file. */
      data: string;
      backgroundColor: string;
    }
  | {
      // Tells the nav bar where we are in a folder/multi-file session.
      type: 'folder';
      total: number;
      index: number; // 0-based
      filename: string;
      /** Whether nav + curation chrome should be shown at all. */
      navEnabled: boolean;
    }
  | {
      // Reflects curation session state back to the nav bar.
      type: 'selectionState';
      active: boolean;
      /** Paths kept so far this session (count shown in the bar). */
      keptCount: number;
      /** Whether the *current* structure is currently kept. */
      currentKept: boolean;
      /** Comment stored for the current structure (empty if none). */
      currentComment: string;
    };

/** Webview -> extension host */
export type WebviewToHost =
  | { type: 'ready' }
  | { type: 'next' }
  | { type: 'prev' }
  | { type: 'goto'; index: number }
  | { type: 'startSelection' }
  | { type: 'keep' } // toggle keep for the current structure
  | { type: 'comment'; text: string } // set the comment for the current structure
  | { type: 'endSelection' };
