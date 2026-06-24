import { type CanvasNode, type Document } from '../types';
import { markdownToHtml } from '../utils/exportMarkdown';

const CHIP_PATTERN = /(\[\[[^\]]+\]\])|(@node:[a-zA-Z0-9_-]+)|(#[a-zA-Z][a-zA-Z0-9_-]*)/g;

export function parseWikiLink(raw: string): { title: string; alias: string } {
  const [titlePart, ...aliasParts] = raw.split('|');
  const title = titlePart.trim();
  const alias = aliasParts.join('|').trim();
  return { title, alias };
}

export function getWikiChipTitle(chip: HTMLElement): string {
  return (chip.dataset.title ?? chip.textContent ?? '').trim();
}

export function normalizeTitleText(text: string): string {
  return text.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function findDocumentByTitle(documents: Document[], title: string): Document | null {
  const target = title.trim();
  if (!target) return null;
  const exactMatch = documents.find((doc) => normalizeTitleText(doc.title) === normalizeTitleText(target));
  return exactMatch ?? null;
}

export function wikiLinkRaw(title: string, alias?: string): string {
  const cleanTitle = title.trim();
  const cleanAlias = alias?.trim();
  return cleanAlias && cleanAlias !== cleanTitle
    ? `[[${cleanTitle}|${cleanAlias}]]`
    : `[[${cleanTitle}]]`;
}

export function copyPlainText(text: string): boolean {
  let copied = false;
  const activeElement = document.activeElement as HTMLElement | null;
  const selection = window.getSelection();
  const ranges: Range[] = [];
  for (let i = 0; i < (selection?.rangeCount ?? 0); i += 1) {
    const range = selection?.getRangeAt(i);
    if (range) ranges.push(range.cloneRange());
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', 'true');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  textarea.style.top = '0';

  const onCopy = (event: ClipboardEvent) => {
    event.clipboardData?.setData('text/plain', text);
    event.preventDefault();
    copied = true;
  };

  document.body.appendChild(textarea);
  textarea.select();
  document.addEventListener('copy', onCopy);
  const ok = document.execCommand('copy');
  document.removeEventListener('copy', onCopy);
  textarea.remove();

  selection?.removeAllRanges();
  ranges.forEach((range) => selection?.addRange(range));
  activeElement?.focus?.();

  return ok && copied;
}

export function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

export function isBlankEditorBlock(el: HTMLElement): boolean {
  if (el.querySelector('img, figure, table, hr, pre, code, [data-chip]')) return false;
  return (el.textContent ?? '').replace(/\u00a0/g, ' ').trim() === '';
}

export function stripLeadingHtmlTitle(html: string, title?: string): string {
  const expected = normalizeTitleText(title ?? '');
  if (!html || !expected) return html;

  const root = document.createElement('div');
  root.innerHTML = html;

  while (true) {
    const children = Array.from(root.children) as HTMLElement[];
    const firstContentIndex = children.findIndex((child) => !isBlankEditorBlock(child));
    if (firstContentIndex < 0) return '';

    const firstContent = children[firstContentIndex];
    const isMatchingTitle =
      firstContent.tagName === 'H1' &&
      normalizeTitleText(firstContent.textContent ?? '') === expected;
    if (!isMatchingTitle) return root.innerHTML;

    for (let i = 0; i <= firstContentIndex; i += 1) children[i].remove();
    while (root.firstElementChild && isBlankEditorBlock(root.firstElementChild as HTMLElement)) {
      root.firstElementChild.remove();
    }
  }
}

function blockTextForMarkdownTable(el: HTMLElement): string | null {
  const tag = el.tagName.toLowerCase();
  if (tag !== 'div' && tag !== 'p') return null;
  if (el.querySelector('img, figure, table, hr, pre, blockquote, ul, ol, h1, h2, h3')) return null;
  return (el.textContent ?? '').replace(/\u00a0/g, ' ').trimEnd();
}

export function normalizeMarkdownTablesInHtml(html: string): string {
  if (!html || !html.includes('|')) return html;

  const root = document.createElement('div');
  root.innerHTML = html;
  let changed = false;
  let index = 0;

  while (index < root.children.length - 1) {
    const children = Array.from(root.children) as HTMLElement[];
    const start = children[index];
    const startText = blockTextForMarkdownTable(start);
    if (!startText || !startText.includes('|')) {
      index += 1;
      continue;
    }

    const candidateBlocks: HTMLElement[] = [];
    const candidateLines: string[] = [];
    let cursor = index;

    while (cursor < children.length) {
      const current = children[cursor];
      const text = blockTextForMarkdownTable(current);
      if (!text || !text.trim()) break;
      candidateBlocks.push(current);
      candidateLines.push(text);
      cursor += 1;
    }

    let bestLength = 0;
    let bestHtml = '';
    for (let length = candidateLines.length; length >= 2; length -= 1) {
      const parsed = markdownToHtml(candidateLines.slice(0, length).join('\n')).trim();
      if (parsed.startsWith('<table>') && parsed.endsWith('</table>')) {
        bestLength = length;
        bestHtml = parsed;
        break;
      }
    }

    if (bestLength < 2) {
      index += 1;
      continue;
    }

    const wrapper = document.createElement('div');
    wrapper.innerHTML = bestHtml;
    const table = wrapper.firstElementChild;
    if (!table || table.tagName.toLowerCase() !== 'table') {
      index += 1;
      continue;
    }

    candidateBlocks[0].before(table);
    candidateBlocks.slice(0, bestLength).forEach((block) => block.remove());
    changed = true;
    index += 1;
  }

  return changed ? root.innerHTML : html;
}

export function documentTextWithRawLinks(html: string): string {
  return stripChipsFromHTML(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
}

export function stripChipsFromHTML(html: string): string {
  const div = document.createElement('div');
  div.innerHTML = html;
  div.querySelectorAll('[data-chip]').forEach((el) => {
    const chip = el as HTMLElement;
    const type = chip.dataset.chip;
    let raw = '';
    if (type === 'wiki') {
      const title = chip.dataset.title ?? chip.textContent ?? '';
      const text = chip.textContent ?? '';
      const status = chip.dataset.wikiStatus;
      raw = text.trim()
        ? wikiLinkRaw(title, text !== title ? text : '')
        : status === 'missing'
          ? '[[ ]]'
          : '';
    } else if (type === 'node') raw = `@node:${chip.dataset.nodeid ?? chip.textContent}`;
    else raw = chip.textContent ?? '';
    chip.replaceWith(document.createTextNode(raw));
  });
  return div.innerHTML;
}

export function syncWikiChipState(chip: HTMLElement, documents: Document[]): void {
  const title = getWikiChipTitle(chip);
  const linked = findDocumentByTitle(documents, title);
  const isMissing = !linked;

  chip.classList.add('chip-wiki');
  chip.classList.toggle('chip-wiki--missing', isMissing);
  chip.dataset.wikiStatus = isMissing ? 'missing' : 'resolved';
  chip.removeAttribute('title');

  if (isMissing) {
    chip.setAttribute('aria-label', title ? `Unresolved note link: ${title}` : 'Unresolved note link');
    chip.title = title ? `Create note: ${title}` : 'Create note';
    if (!chip.textContent?.trim()) {
      chip.dataset.missingLabel = 'Create note';
    } else {
      delete chip.dataset.missingLabel;
    }
  } else {
    chip.setAttribute('aria-label', `Open note: ${title}`);
    chip.title = title;
    delete chip.dataset.missingLabel;
  }
}

export function applyChipsToDOM(container: HTMLElement, documents: Document[] = []): void {
  container.querySelectorAll<HTMLElement>('[data-chip="wiki"]').forEach((chip) => {
    chip.removeAttribute('contenteditable');
    syncWikiChipState(chip, documents);
  });

  const textNodes: Text[] = [];
  function walk(node: Node) {
    if (node.nodeType === Node.TEXT_NODE) { textNodes.push(node as Text); return; }
    if (node.nodeType === Node.ELEMENT_NODE && (node as HTMLElement).dataset.chip) return;
    node.childNodes.forEach(walk);
  }
  walk(container);

  for (const textNode of textNodes) {
    const text = textNode.textContent ?? '';
    CHIP_PATTERN.lastIndex = 0;
    if (!CHIP_PATTERN.test(text)) continue;
    CHIP_PATTERN.lastIndex = 0;

    const parent = textNode.parentNode;
    if (!parent) continue;

    const frag = document.createDocumentFragment();
    let lastIdx = 0;
    let match: RegExpExecArray | null;

    while ((match = CHIP_PATTERN.exec(text)) !== null) {
      if (match.index > lastIdx) frag.appendChild(document.createTextNode(text.slice(lastIdx, match.index)));

      if (match[1]) {
        const { title, alias } = parseWikiLink(match[1].slice(2, -2));
        const span = document.createElement('span');
        span.className = 'chip-wiki';
        span.dataset.chip = 'wiki';
        span.dataset.title = title;
        if (alias) span.dataset.alias = alias;
        span.textContent = alias || title;
        syncWikiChipState(span, documents);
        frag.appendChild(span);
      } else if (match[2]) {
        const nodeId = match[2].slice(6);
        const span = document.createElement('span');
        span.contentEditable = 'false';
        span.className = 'chip-node';
        span.dataset.chip = 'node';
        span.dataset.nodeid = nodeId;
        span.textContent = nodeId;
        frag.appendChild(span);
      } else if (match[3]) {
        const span = document.createElement('span');
        span.contentEditable = 'false';
        span.className = 'chip-tag';
        span.dataset.chip = 'tag';
        span.textContent = match[3];
        frag.appendChild(span);
      }
      lastIdx = match.index + match[0].length;
    }
    if (lastIdx < text.length) frag.appendChild(document.createTextNode(text.slice(lastIdx)));
    parent.replaceChild(frag, textNode);
  }
}

function closestWikiChip(node: Node | null, root: HTMLElement): HTMLElement | null {
  let current = node;
  if (current?.nodeType === Node.TEXT_NODE) current = current.parentNode;
  while (current && current !== root) {
    if (
      current.nodeType === Node.ELEMENT_NODE &&
      (current as HTMLElement).classList.contains('chip-wiki') &&
      root.contains(current)
    ) {
      return current as HTMLElement;
    }
    current = current.parentNode;
  }
  return null;
}

function siblingWikiChip(node: Node | null, direction: 'previous' | 'next'): HTMLElement | null {
  let current = node;
  while (current) {
    const sibling = direction === 'previous' ? current.previousSibling : current.nextSibling;
    if (sibling?.nodeType === Node.ELEMENT_NODE && (sibling as HTMLElement).classList.contains('chip-wiki')) {
      return sibling as HTMLElement;
    }
    if (sibling) return null;
    current = current.parentNode;
  }
  return null;
}

export function activeWikiChipFromRange(range: Range | null, root: HTMLElement | null): HTMLElement | null {
  if (!range || !root) return null;

  const fromCommonAncestor = closestWikiChip(range.commonAncestorContainer, root);
  if (fromCommonAncestor) return fromCommonAncestor;

  const fromStart = closestWikiChip(range.startContainer, root);
  if (fromStart) return fromStart;

  const fromEnd = closestWikiChip(range.endContainer, root);
  if (fromEnd) return fromEnd;

  if (
    !range.collapsed &&
    range.startContainer === range.endContainer &&
    range.startContainer.nodeType === Node.ELEMENT_NODE &&
    range.endOffset === range.startOffset + 1
  ) {
    const selectedNode = range.startContainer.childNodes[range.startOffset];
    if (selectedNode?.nodeType === Node.ELEMENT_NODE && (selectedNode as HTMLElement).classList.contains('chip-wiki')) {
      return selectedNode as HTMLElement;
    }
  }

  if (!range.collapsed) return null;

  if (range.startContainer.nodeType === Node.TEXT_NODE) {
    const text = range.startContainer.textContent ?? '';
    if (range.startOffset === 0) {
      const previous = siblingWikiChip(range.startContainer, 'previous');
      if (previous && root.contains(previous)) return previous;
    }
    if (range.startOffset === text.length) {
      const next = siblingWikiChip(range.startContainer, 'next');
      if (next && root.contains(next)) return next;
    }
  }

  if (range.startContainer.nodeType === Node.ELEMENT_NODE) {
    const container = range.startContainer;
    const before = container.childNodes[range.startOffset - 1];
    const after = container.childNodes[range.startOffset];
    if (before?.nodeType === Node.ELEMENT_NODE && (before as HTMLElement).classList.contains('chip-wiki')) return before as HTMLElement;
    if (after?.nodeType === Node.ELEMENT_NODE && (after as HTMLElement).classList.contains('chip-wiki')) return after as HTMLElement;
  }

  return null;
}

export function documentOutlineFromHtml(html: string): Array<{ id: string; level: 'h1' | 'h2'; text: string }> {
  const div = document.createElement('div');
  div.innerHTML = html;
  return Array.from(div.querySelectorAll<HTMLElement>('h1, h2'))
    .map((heading, index) => ({
      id: heading.id || `outline-${index}`,
      level: heading.tagName.toLowerCase() as 'h1' | 'h2',
      text: (heading.textContent ?? '').trim(),
    }))
    .filter((entry) => entry.text);
}

export function generateMarkdownFilename(title: string): string {
  return (title.trim() || 'untitled').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') + '.md';
}

export function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function escapeInlineHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function isRenderableExternalImageSrc(src: string): boolean {
  return /^(blob:|data:|https?:\/\/)/i.test(src);
}

export function normalizeAssetStem(name: string): string {
  const stem = name.replace(/\.[^.]+$/, '').trim() || 'image';
  return stem
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'image';
}

export function ensureImageExtension(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) return ext;
  return 'png';
}

export function buildImageAssetName(name: string): string {
  const stem = normalizeAssetStem(name);
  const ext = ensureImageExtension(name);
  return `${stem}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('Could not read image file'));
    reader.readAsDataURL(file);
  });
}

export function relativeTime(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

export function wordCountFromHtml(html: string): number {
  const text = stripHtml(html)
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/@node:([a-zA-Z0-9_-]+)/g, '$1')
    .trim();
  if (!text) return 0;
  return text.split(/\s+/).filter(Boolean).length;
}

export function readingTimeLabel(words: number): string {
  if (words <= 0) return '0 min read';
  return `${Math.max(1, Math.ceil(words / 200))} min read`;
}

export function getDocumentHistorySignature(doc: Pick<Document, 'title' | 'content' | 'emoji' | 'linkedFile'> | null | undefined): string {
  if (!doc) return '';
  return [doc.title ?? '', doc.content ?? '', doc.emoji ?? '', doc.linkedFile ?? ''].join('\u0001');
}

export function getNodeLabel(node: CanvasNode, docs: Document[]): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const n = node as any;
  switch (node.type) {
    case 'sticky': return (n.text as string).split('\n')[0].slice(0, 60) || 'Sticky';
    case 'textblock': return (n.text as string).slice(0, 60) || 'Text block';
    case 'shape': return n.text || n.kind || 'Shape';
    case 'document': {
      const linked = docs.find((d) => d.id === n.docId);
      return linked?.title || n.title || 'Note';
    }
    case 'section': return n.name || 'Section';
    case 'taskcard': return n.title || 'Task card';
    case 'codeblock': return n.title || 'Code block';
    default: return node.type;
  }
}

export function resizeDocumentTitleTextarea(el: HTMLTextAreaElement): void {
  const style = getComputedStyle(el);
  const fontSize = Number.parseFloat(style.fontSize) || 30;
  const lineHeight = Number.parseFloat(style.lineHeight) || fontSize * 1.16;
  const minHeight = Number.parseFloat(style.minHeight) || lineHeight;
  const explicitMaxHeight = Number.parseFloat(style.maxHeight);
  const maxHeight = Number.isFinite(explicitMaxHeight)
    ? Math.max(minHeight, explicitMaxHeight)
    : Math.max(minHeight, lineHeight * 6);

  el.style.height = '0px';
  const measured = el.scrollHeight;
  const nextHeight = Math.min(Math.max(measured, minHeight), maxHeight);
  el.style.height = `${nextHeight}px`;
  el.style.overflowY = measured > maxHeight ? 'auto' : 'hidden';
}
