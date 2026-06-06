// Overlay navigation + curation bar. Pure DOM; no framework.

export interface NavCallbacks {
  onPrev(): void;
  onNext(): void;
  onGoto(index: number): void;
  onStart(): void;
  onKeep(): void;
  onComment(text: string): void;
  onEnd(): void;
}

export class NavBar {
  private root: HTMLDivElement;
  private filenameEl: HTMLSpanElement;
  private counterEl: HTMLSpanElement;
  private slider: HTMLInputElement;
  private prevBtn: HTMLButtonElement;
  private nextBtn: HTMLButtonElement;
  private startBtn: HTMLButtonElement;
  private keepBtn: HTMLButtonElement;
  private endBtn: HTMLButtonElement;
  private keptCountEl: HTMLSpanElement;
  private commentInput: HTMLInputElement;

  private total = 1;
  private curationAllowed: boolean;
  private keepHotkey: string;
  private commentTimer: number | undefined;

  constructor(cb: NavCallbacks, opts: { curationAllowed: boolean; keepHotkey: string }) {
    this.curationAllowed = opts.curationAllowed;
    this.keepHotkey = (opts.keepHotkey || 's').toLowerCase();

    this.root = document.createElement('div');
    this.root.className = 'foldsift-nav hidden';

    this.prevBtn = button('◀', () => cb.onPrev());
    this.nextBtn = button('▶', () => cb.onNext());
    this.filenameEl = span('fs-filename', '');
    this.counterEl = span('fs-counter', '');

    this.slider = document.createElement('input');
    this.slider.type = 'range';
    this.slider.min = '0';
    this.slider.value = '0';
    this.slider.addEventListener('input', () => cb.onGoto(Number(this.slider.value)));

    this.startBtn = button('Start selection', () => cb.onStart());
    this.startBtn.className = 'fs-start';
    this.keepBtn = button(`Keep (${this.keepHotkey.toUpperCase()})`, () => cb.onKeep());
    this.keepBtn.className = 'fs-keep';
    this.endBtn = button('End selection', () => cb.onEnd());
    this.endBtn.className = 'fs-end';
    this.keptCountEl = span('fs-kept-count', '');

    this.commentInput = document.createElement('input');
    this.commentInput.type = 'text';
    this.commentInput.className = 'fs-comment';
    this.commentInput.placeholder = 'Comment…';
    // Debounce while typing; flush immediately on blur / Enter so a comment is
    // never lost if the user keeps a structure right after typing.
    this.commentInput.addEventListener('input', () => {
      window.clearTimeout(this.commentTimer);
      this.commentTimer = window.setTimeout(() => cb.onComment(this.commentInput.value), 350);
    });
    const flush = () => {
      window.clearTimeout(this.commentTimer);
      cb.onComment(this.commentInput.value);
    };
    this.commentInput.addEventListener('change', flush);
    this.commentInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        flush();
        this.commentInput.blur();
      }
    });

    this.root.append(
      this.prevBtn,
      this.filenameEl,
      this.counterEl,
      this.nextBtn,
      this.slider
    );

    if (this.curationAllowed) {
      this.root.append(
        sep(),
        this.startBtn,
        this.keepBtn,
        this.commentInput,
        this.keptCountEl,
        this.endBtn
      );
    }

    document.body.appendChild(this.root);
    this.setSelection(false, 0, false, '');

    window.addEventListener('keydown', (e) => this.onKey(e, cb));
  }

  setFolder(total: number, index: number, filename: string, navEnabled: boolean): void {
    this.total = Math.max(1, total);
    this.root.classList.toggle('hidden', !navEnabled);
    this.filenameEl.textContent = filename;
    this.filenameEl.title = filename;
    this.counterEl.textContent = `${index + 1} / ${total}`;
    this.slider.max = String(this.total - 1);
    this.slider.value = String(index);

    const single = total <= 1;
    this.prevBtn.disabled = single;
    this.nextBtn.disabled = single;
    this.slider.style.display = single ? 'none' : '';
  }

  setSelection(
    active: boolean,
    keptCount: number,
    currentKept: boolean,
    currentComment: string
  ): void {
    if (!this.curationAllowed) return;
    this.startBtn.style.display = active ? 'none' : '';
    this.keepBtn.style.display = active ? '' : 'none';
    this.endBtn.style.display = active ? '' : 'none';
    this.keptCountEl.style.display = active ? '' : 'none';
    this.commentInput.style.display = active ? '' : 'none';
    // Don't clobber what the user is mid-typing; only sync when not focused.
    if (document.activeElement !== this.commentInput) {
      this.commentInput.value = currentComment;
    }
    this.keptCountEl.textContent = `kept ${keptCount}`;
    this.keepBtn.classList.toggle('kept', currentKept);
    this.keepBtn.textContent = currentKept
      ? `Kept ✓ (${this.keepHotkey.toUpperCase()})`
      : `Keep (${this.keepHotkey.toUpperCase()})`;
  }

  private onKey(e: KeyboardEvent, cb: NavCallbacks): void {
    const target = e.target as HTMLElement | null;
    if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
    if (e.key === 'ArrowLeft') {
      cb.onPrev();
      e.preventDefault();
    } else if (e.key === 'ArrowRight') {
      cb.onNext();
      e.preventDefault();
    } else if (
      this.curationAllowed &&
      this.keepBtn.style.display !== 'none' &&
      e.key.toLowerCase() === this.keepHotkey
    ) {
      cb.onKeep();
      e.preventDefault();
    }
  }
}

function button(label: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = label;
  b.addEventListener('click', onClick);
  return b;
}

function span(cls: string, text: string): HTMLSpanElement {
  const s = document.createElement('span');
  s.className = cls;
  s.textContent = text;
  return s;
}

function sep(): HTMLSpanElement {
  const s = document.createElement('span');
  s.className = 'fs-sep';
  return s;
}
