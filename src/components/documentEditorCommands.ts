// Pure DOM helpers for the document (contentEditable) editor. These operate
// directly on ranges / editable roots and hold no React or component state, so
// they live outside DocumentMode to keep that component focused on rendering
// and orchestration.

export function resolveDocumentColorValue(value: string): string {
  if (value === 'auto' || !value.startsWith('--')) return value;
  return getComputedStyle(document.documentElement).getPropertyValue(value).trim() || value;
}

// Find the contentEditable root from a range
export function rangeRoot(range: Range): HTMLElement | null {
  let n: Node | null = range.startContainer;
  while (n && (n as HTMLElement).contentEditable !== 'true') n = n.parentElement;
  return n as HTMLElement | null;
}

export function dispatchEditableInput(savedRange: Range | null): void {
  const fallbackRange = savedRange ?? (window.getSelection()?.rangeCount ? window.getSelection()!.getRangeAt(0) : null);
  if (!fallbackRange) return;
  rangeRoot(fallbackRange)?.dispatchEvent(new Event('input', { bubbles: true }));
}

export function updatePlaceholderVisibility(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>('[data-placeholder]').forEach((el) => {
    const text = (el.textContent ?? '') .replace(/\u00a0/g, ' ').trim();
    const media = el.querySelector('img, .chip-wiki, .chip-node');
    const hasMeaningfulContent = !!text || !!media;
    el.setAttribute('data-placeholder-visible', hasMeaningfulContent ? 'false' : 'true');
  });
}

export function ensureDocImageIds(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>('figure[data-doc-image="true"]').forEach((figure) => {
    if (!figure.dataset.docImageId) {
      figure.dataset.docImageId = `docimg_${Math.random().toString(36).slice(2, 10)}`;
    }
  });
}

export function ensureDocumentHeadingIds(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>('h1, h2').forEach((heading, index) => {
    if (!heading.id) {
      const base = (heading.textContent ?? '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40) || `section-${index + 1}`;
      heading.id = `doc-${base}-${index + 1}`;
    }
  });
}

// Find the closest ancestor block that is a direct child of the editable root
export function rangeBlock(range: Range, root: HTMLElement): HTMLElement | null {
  let block: HTMLElement | null = range.startContainer as HTMLElement;
  if (block.nodeType === Node.TEXT_NODE) block = block.parentElement;
  while (block && block.parentElement !== root) block = block.parentElement;
  return block && block !== root ? block : null;
}

export function rangeBlocks(range: Range, root: HTMLElement): HTMLElement[] {
  const blocks = Array.from(root.children).filter((child): child is HTMLElement => {
    try {
      return range.intersectsNode(child);
    } catch {
      return false;
    }
  });
  const fallback = rangeBlock(range, root);
  return blocks.length ? blocks : fallback ? [fallback] : [];
}

export function restoreRangeSelection(range: Range | null): HTMLElement | null {
  if (!range) return null;
  const root = rangeRoot(range);
  if (!root) return null;
  root.focus({ preventScroll: true });
  const sel = window.getSelection();
  if (sel) {
    sel.removeAllRanges();
    sel.addRange(range);
  }
  return root;
}

// Wrap or unwrap the current selection in <code>
export function toggleInlineCode(savedRange: Range | null) {
  const range = savedRange;
  if (!range) return;
  const root = restoreRangeSelection(range);
  if (!root) return;
  const sel = window.getSelection();

  const closestCode = (node: Node | null): HTMLElement | null => {
    let current = node;
    if (current?.nodeType === Node.TEXT_NODE) current = current.parentNode;
    while (current && (current as HTMLElement).contentEditable !== 'true') {
      if ((current as HTMLElement).tagName?.toLowerCase() === 'code') return current as HTMLElement;
      current = current.parentNode;
    }
    return null;
  };

  const unwrapCodeElements = (codes: HTMLElement[]) => {
    const unwrappedTextNodes: Text[] = [];
    codes.forEach((code) => {
      const unwrapped = document.createTextNode(code.textContent ?? '');
      code.replaceWith(unwrapped);
      unwrappedTextNodes.push(unwrapped);
    });

    const nextRange = document.createRange();
    const first = unwrappedTextNodes[0];
    const last = unwrappedTextNodes[unwrappedTextNodes.length - 1];
    if (first && last) {
      nextRange.setStart(first, 0);
      nextRange.setEnd(last, last.length);
      sel?.removeAllRanges();
      sel?.addRange(nextRange);
    }

    root.dispatchEvent(new Event('input', { bubbles: true }));
  };

  const codeParent =
    closestCode(range.startContainer) ||
    closestCode(range.commonAncestorContainer);

  if (codeParent) {
    unwrapCodeElements([codeParent]);
    return;
  }

  const intersectingCodes = Array.from(root.querySelectorAll<HTMLElement>('code'))
    .filter((code) => {
      try {
        return range.intersectsNode(code);
      } catch {
        return false;
      }
    });
  if (intersectingCodes.length > 0) {
    unwrapCodeElements(intersectingCodes);
    return;
  }

  if (range.collapsed) return;
  const code = document.createElement('code');
  try { range.surroundContents(code); }
  catch {
    const text = range.toString();
    range.deleteContents();
    code.textContent = text;
    range.insertNode(code);
  }
  root.dispatchEvent(new Event('input', { bubbles: true }));
}

export function getLinkHref(savedRange: Range | null): string {
  const range = savedRange ?? (window.getSelection()?.rangeCount ? window.getSelection()!.getRangeAt(0) : null);
  if (!range) return '';
  let node: Node | null = range.startContainer;
  if (node.nodeType === Node.TEXT_NODE) node = node.parentNode;
  while (node && (node as HTMLElement).contentEditable !== 'true') {
    if ((node as HTMLElement).tagName?.toLowerCase() === 'a') {
      return (node as HTMLAnchorElement).getAttribute('href') ?? '';
    }
    node = node.parentElement;
  }
  return '';
}
