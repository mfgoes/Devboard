import { CanvasNode, Document, DocumentNode } from '../types';
import { taskListItemHtml } from './taskListHtml';

// ── HTML → Markdown ───────────────────────────────────────────────────────────

function inlineToMd(node: Node, bold = false, italic = false, strike = false): string {
  let out = '';
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      let t = child.textContent ?? '';
      if (strike)         t = `~~${t}~~`;
      if (bold && italic) t = `***${t}***`;
      else if (bold)      t = `**${t}**`;
      else if (italic)    t = `_${t}_`;
      out += t;
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      const el = child as HTMLElement;
      const tag = el.tagName.toLowerCase();
      if (tag === 'br') { out += '\n'; continue; }
      if (tag === 'input') continue;
      if (tag === 'hr') { out += '\n---\n'; continue; }
      if (tag === 'img') {
        const src = el.getAttribute('data-workspace-src') ?? el.getAttribute('src') ?? '';
        const alt = el.getAttribute('alt') ?? '';
        out += `![${alt}](${src})`;
        continue;
      }
      if (tag === 'code' && el.parentElement?.tagName.toLowerCase() !== 'pre') {
        out += `\`${el.textContent ?? ''}\``;
        continue;
      }
      let b = bold, i = italic, s = strike;
      if (tag === 'b' || tag === 'strong') b = true;
      if (tag === 'i' || tag === 'em')     i = true;
      if (tag === 's' || tag === 'strike' || tag === 'del') s = true;
      const color = el.style.color || el.getAttribute('color') || '';
      if (tag === 'span') {
        const fw = el.style.fontWeight;
        if (fw === 'bold' || fw === '700') b = true;
        if (el.style.fontStyle === 'italic') i = true;
        if (el.style.textDecoration?.includes('line-through')) s = true;
      }
      if (tag === 'a') {
        out += `[${inlineToMd(el, b, i, s)}](${el.getAttribute('href') ?? ''})`;
        continue;
      }
      const inner = inlineToMd(el, b, i, s);
      if (color && tag !== 'a') {
        out += `<span style="color: ${color};">${inner}</span>`;
        continue;
      }
      out += inner;
    }
  }
  return out;
}

type TableAlignment = 'left' | 'center' | 'right' | null;

function splitMarkdownTableRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  const cells: string[] = [];
  let cell = '';
  let escaped = false;

  for (const ch of trimmed) {
    if (escaped) {
      cell += ch;
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (ch === '|') {
      cells.push(cell.trim());
      cell = '';
      continue;
    }
    cell += ch;
  }

  cells.push(cell.trim());
  return cells;
}

function parseMarkdownTableAlignment(cell: string): TableAlignment {
  const value = cell.replace(/\s+/g, '');
  if (!/^:?-{3,}:?$/.test(value)) return null;
  if (value.startsWith(':') && value.endsWith(':')) return 'center';
  if (value.endsWith(':')) return 'right';
  if (value.startsWith(':')) return 'left';
  return null;
}

function markdownTableRowToHtml(tag: 'th' | 'td', cells: string[], aligns: TableAlignment[]): string {
  return `<tr>${cells.map((cell, index) => {
    const align = aligns[index];
    const style = align ? ` style="text-align: ${align};"` : '';
    const body = inlineMdToHtml(cell || '');
    return `<${tag}${style}>${body || '<br>'}</${tag}>`;
  }).join('')}</tr>`;
}

function tryParseMarkdownTable(lines: string[], startIndex: number): { html: string; nextIndex: number } | null {
  const headerLine = lines[startIndex];
  const separatorLine = lines[startIndex + 1];
  if (!headerLine?.includes('|') || !separatorLine) return null;

  const headerCells = splitMarkdownTableRow(headerLine);
  const separatorCells = splitMarkdownTableRow(separatorLine);
  if (headerCells.length < 2 || separatorCells.length < 2) return null;
  if (!separatorCells.every((cell) => /^:?-{3,}:?$/.test(cell.replace(/\s+/g, '')))) return null;

  const bodyRows: string[][] = [];
  let nextIndex = startIndex + 2;
  while (nextIndex < lines.length) {
    const line = lines[nextIndex];
    if (!line.trim() || !line.includes('|')) break;
    const cells = splitMarkdownTableRow(line);
    if (cells.length < 2) break;
    bodyRows.push(cells);
    nextIndex += 1;
  }

  const colCount = Math.max(
    headerCells.length,
    separatorCells.length,
    ...bodyRows.map((row) => row.length),
  );
  const aligns = Array.from({ length: colCount }, (_, index) => parseMarkdownTableAlignment(separatorCells[index] ?? ''));
  const normalizedHeader = Array.from({ length: colCount }, (_, index) => headerCells[index] ?? '');
  const normalizedBody = bodyRows.map((row) => Array.from({ length: colCount }, (_, index) => row[index] ?? ''));

  return {
    html:
      `<table>` +
        `<thead>${markdownTableRowToHtml('th', normalizedHeader, aligns)}</thead>` +
        (normalizedBody.length > 0
          ? `<tbody>${normalizedBody.map((row) => markdownTableRowToHtml('td', row, aligns)).join('')}</tbody>`
          : '') +
      `</table>`,
    nextIndex,
  };
}

function escapeMarkdownTableCell(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n+/g, ' ')
    .trim();
}

function tableCellAlignment(cell: Element): TableAlignment {
  const el = cell as HTMLElement;
  const align = (el.getAttribute('align') ?? el.style.textAlign ?? '').toLowerCase();
  if (align === 'left' || align === 'center' || align === 'right') return align;
  return null;
}

export function htmlToMarkdown(html: string): string {
  if (!html) return '';
  const root = document.createElement('div');
  root.innerHTML = html;
  const lines: string[] = [];

  function walk(el: Element) {
    const tag = el.tagName.toLowerCase();
    const taskCheckbox = el.querySelector<HTMLInputElement>('input[type="checkbox"]');
    if (taskCheckbox) {
      const checked = taskCheckbox.checked || taskCheckbox.hasAttribute('checked');
      lines.push(`- [${checked ? 'x' : ' '}] ${inlineToMd(el).trim()}`);
      return;
    }
    if (tag === 'h1') { lines.push(`# ${el.textContent?.trim() ?? ''}`); return; }
    if (tag === 'h2') { lines.push(`## ${el.textContent?.trim() ?? ''}`); return; }
    if (tag === 'h3') { lines.push(`### ${el.textContent?.trim() ?? ''}`); return; }
    if (tag === 'hr') { lines.push('---'); return; }
    if (tag === 'pre') {
      const codeEl = el.querySelector('code');
      const body = (codeEl?.textContent ?? el.textContent ?? '').replace(/\n+$/, '');
      lines.push('```');
      lines.push(...body.split('\n'));
      lines.push('```');
      return;
    }
    if (tag === 'blockquote') {
      const blockquote = el as HTMLElement;
      const isCallout = blockquote.classList.contains('doc-callout') || blockquote.dataset.callout === 'true';
      const bodyRoot = (blockquote.querySelector('.doc-callout__body') as HTMLElement | null) ?? blockquote;
      const inner = inlineToMd(bodyRoot).trimEnd();
      const bodyLines = inner ? inner.split('\n') : [];
      if (isCallout) {
        const emoji = blockquote.dataset.calloutEmoji?.trim();
        const firstLine = bodyLines[0] ?? '';
        lines.push(`> [!callout]${emoji ? ` ${emoji}` : ''}${firstLine ? ` ${firstLine}` : ''}`);
        for (const sub of bodyLines.slice(1)) lines.push(`> ${sub}`);
      } else {
        for (const sub of inner.split('\n')) lines.push(`> ${sub}`);
      }
      return;
    }
    if (tag === 'table') {
      const table = el as HTMLTableElement;
      const headRows = Array.from(table.querySelectorAll('thead tr'));
      const bodyRows = Array.from(table.querySelectorAll('tbody tr'));
      const rows = headRows.length > 0 ? headRows : Array.from(table.querySelectorAll('tr')).slice(0, 1);
      const firstRow = rows[0];
      if (!firstRow) return;
      const headerCells = Array.from(firstRow.querySelectorAll('th, td'));
      if (headerCells.length < 2) return;
      const bodySourceRows = headRows.length > 0 ? bodyRows : Array.from(table.querySelectorAll('tr')).slice(1);
      const alignments = headerCells.map((cell) => tableCellAlignment(cell));
      const headerLine = `| ${headerCells.map((cell) => escapeMarkdownTableCell(inlineToMd(cell).trim())).join(' | ')} |`;
      const separatorLine = `| ${alignments.map((align) => (
        align === 'center' ? ':---:' : align === 'right' ? '---:' : align === 'left' ? ':---' : '---'
      )).join(' | ')} |`;
      lines.push(headerLine);
      lines.push(separatorLine);
      for (const row of bodySourceRows) {
        const cells = Array.from(row.querySelectorAll('th, td'));
        if (cells.length === 0) continue;
        const rowLine = `| ${cells.map((cell) => escapeMarkdownTableCell(inlineToMd(cell).trim())).join(' | ')} |`;
        lines.push(rowLine);
      }
      return;
    }
    if (tag === 'ul' || tag === 'ol') {
      const ordered = tag === 'ol';
      let n = 1;
      for (const child of Array.from(el.children)) {
        if (child.tagName.toLowerCase() === 'li') {
          lines.push(ordered ? `${n++}. ${inlineToMd(child)}` : `- ${inlineToMd(child)}`);
        }
      }
      return;
    }
    if (tag === 'li') { lines.push(`- ${inlineToMd(el)}`); return; }
    if (tag === 'div' || tag === 'p') {
      const hasBlock = Array.from(el.childNodes).some(n => {
        if (n.nodeType !== Node.ELEMENT_NODE) return false;
        return ['h1','h2','h3','ul','ol','li','div','p','blockquote','pre','hr'].includes((n as HTMLElement).tagName.toLowerCase());
      });
      if (hasBlock) {
        for (const child of Array.from(el.childNodes)) {
          if (child.nodeType === Node.ELEMENT_NODE) walk(child as Element);
          else if (child.nodeType === Node.TEXT_NODE) {
            const t = (child.textContent ?? '').trim();
            if (t) lines.push(t);
          }
        }
      } else {
        const text = inlineToMd(el).trimEnd();
        lines.push(text === '' ? '' : text);
      }
      return;
    }
    const text = inlineToMd(el).trim();
    if (text) lines.push(text);
  }

  for (const child of Array.from(root.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      const t = (child.textContent ?? '').trim();
      if (t) lines.push(t);
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      walk(child as Element);
    }
  }

  // Collapse 3+ consecutive blank lines to 2
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// ── Document title/body normalization ────────────────────────────────────────

function normalizeHeadingText(text: string): string {
  return text.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function titleFromMarkdown(filename: string, content: string): string {
  const heading = content.match(/^#\s+(.+)$/m)?.[1]?.trim();
  if (heading) return heading;
  const stem = filename.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim();
  return stem ? stem.replace(/\b\w/g, (ch) => ch.toUpperCase()) : 'Untitled note';
}

export function stripLeadingMarkdownTitle(content: string, title?: string): string {
  const lines = content.replace(/\r\n?/g, '\n').split('\n');
  let firstContentIndex = lines.findIndex((line) => line.trim() !== '');
  if (firstContentIndex < 0) return '';

  const firstHeading = lines[firstContentIndex].match(/^#\s+(.+?)\s*$/);
  if (!firstHeading) return content;

  const expectedHeadingText = normalizeHeadingText(title ?? firstHeading[1]);
  while (firstContentIndex >= 0) {
    const heading = lines[firstContentIndex]?.match(/^#\s+(.+?)\s*$/);
    if (!heading || normalizeHeadingText(heading[1]) !== expectedHeadingText) break;
    lines.splice(firstContentIndex, 1);
    while (lines[firstContentIndex]?.trim() === '') lines.splice(firstContentIndex, 1);
    firstContentIndex = lines.findIndex((line) => line.trim() !== '');
  }
  return lines.join('\n').trim();
}

export function documentMarkdownFromParts(title: string | undefined, htmlContent: string | undefined): string {
  const body = htmlContent ? stripLeadingMarkdownTitle(htmlToMarkdown(htmlContent), title) : '';
  const parts: string[] = [];
  if (title?.trim()) {
    parts.push(`# ${title.trim()}`);
    parts.push('');
  }
  if (body) parts.push(body);
  return parts.join('\n').trimEnd();
}

export function markdownBodyToHtml(content: string, title?: string): string {
  return markdownToHtml(stripLeadingMarkdownTitle(content, title));
}

// ── Markdown → HTML ───────────────────────────────────────────────────────────

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function isEmojiToken(token: string): boolean {
  return /\p{Extended_Pictographic}/u.test(token);
}

function parseCalloutQuote(lines: string[]): { emoji?: string; bodyLines: string[] } | null {
  if (lines.length === 0) return null;
  const match = lines[0].match(/^\[!callout\]\s*(.*)$/i);
  if (!match) return null;

  const headerRest = match[1].trim();
  let emoji: string | undefined;
  let firstBodyLine = '';

  if (headerRest) {
    const [firstToken, ...restTokens] = headerRest.split(/\s+/);
    if (isEmojiToken(firstToken)) {
      emoji = firstToken;
      firstBodyLine = restTokens.join(' ');
    } else {
      firstBodyLine = headerRest;
    }
  }

  return {
    emoji,
    bodyLines: [
      ...(firstBodyLine ? [firstBodyLine] : []),
      ...lines.slice(1),
    ],
  };
}

// Sentinels for protecting inline code spans during inline-markdown replacement.
// Private-use-area chars; will never appear in normal user text.
const CODE_OPEN = '';
const CODE_CLOSE = '';

function inlineMdToHtml(text: string): string {
  const codes: string[] = [];
  let out = text.replace(/`([^`]+?)`/g, (_, code) => {
    codes.push(escapeHtml(code));
    return CODE_OPEN + (codes.length - 1) + CODE_CLOSE;
  });
  out = out
    .replace(/!\[(.*?)\]\((.+?)\)/g, '<img src="$2" alt="$1">')
    .replace(/\*\*\*(.+?)\*\*\*/g,   '<b><i>$1</i></b>')
    .replace(/\*\*(.+?)\*\*/g,       '<b>$1</b>')
    .replace(/~~(.+?)~~/g,           '<s>$1</s>')
    .replace(/\*(.+?)\*/g,           '<i>$1</i>')
    .replace(/_(.+?)_/g,             '<i>$1</i>')
    .replace(/\[(.+?)\]\((.+?)\)/g,  '<a href="$2">$1</a>');
  return out.replace(
    new RegExp(CODE_OPEN + '(\\d+)' + CODE_CLOSE, 'g'),
    (_, i) => `<code>${codes[+i]}</code>`,
  );
}

export function markdownToHtml(md: string): string {
  if (!md) return '';
  const lines = md.split('\n');
  const parts: string[] = [];
  let inUl = false, inOl = false;
  let inQuote = false;
  let quoteBuf: string[] = [];
  let inCode = false;
  let codeBuf: string[] = [];

  const closeList = () => {
    if (inUl) { parts.push('</ul>'); inUl = false; }
    if (inOl) { parts.push('</ol>'); inOl = false; }
  };
  const closeQuote = () => {
    if (!inQuote) return;
    const callout = parseCalloutQuote(quoteBuf);
    if (callout) {
      parts.push(
        `<blockquote class="doc-callout" data-callout="true"${callout.emoji ? ` data-callout-emoji="${escapeHtml(callout.emoji)}"` : ''}>` +
          `${callout.emoji ? `<span class="doc-callout__emoji" contenteditable="false">${escapeHtml(callout.emoji)}</span>` : ''}` +
          `<div class="doc-callout__body">${callout.bodyLines.map(inlineMdToHtml).join('<br>') || '<br>'}</div>` +
        `</blockquote>`,
      );
    } else {
      parts.push(`<blockquote>${quoteBuf.map(inlineMdToHtml).join('<br>')}</blockquote>`);
    }
    quoteBuf = [];
    inQuote = false;
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    // Fenced code block — toggles on a line that starts with ```
    if (/^```/.test(line)) {
      if (inCode) {
        parts.push(`<pre><code>${escapeHtml(codeBuf.join('\n'))}</code></pre>`);
        codeBuf = [];
        inCode = false;
      } else {
        closeList(); closeQuote();
        inCode = true;
      }
      continue;
    }
    if (inCode) { codeBuf.push(line); continue; }

    // Horizontal rule
    if (/^---+\s*$/.test(line)) { closeList(); closeQuote(); parts.push('<hr>'); continue; }

    // Blockquote — group consecutive `> ` lines
    const bq = line.match(/^>\s?(.*)$/);
    if (bq) { closeList(); inQuote = true; quoteBuf.push(bq[1]); continue; }
    if (inQuote) closeQuote();

    const h3 = line.match(/^### (.+)/);  if (h3)  { closeList(); parts.push(`<h3>${inlineMdToHtml(h3[1])}</h3>`);  continue; }
    const h2 = line.match(/^## (.+)/);   if (h2)  { closeList(); parts.push(`<h2>${inlineMdToHtml(h2[1])}</h2>`);  continue; }
    const h1 = line.match(/^# (.+)/);    if (h1)  { closeList(); parts.push(`<h1>${inlineMdToHtml(h1[1])}</h1>`);  continue; }
    const task = line.match(/^[-*]\s+\[([ xX])\]\s*(.*)$/);
    if (task) {
      closeList();
      parts.push(taskListItemHtml({
        checked: task[1].toLowerCase() === 'x',
        bodyHtml: inlineMdToHtml(task[2]) || '<br>',
      }));
      continue;
    }
    const ul = line.match(/^[-*] (.+)/); if (ul)  { if (inOl) closeList(); if (!inUl) { parts.push('<ul>'); inUl = true; } parts.push(`<li>${inlineMdToHtml(ul[1])}</li>`); continue; }
    const ol = line.match(/^\d+\. (.+)/);if (ol)  { if (inUl) closeList(); if (!inOl) { parts.push('<ol>'); inOl = true; } parts.push(`<li>${inlineMdToHtml(ol[1])}</li>`); continue; }

    const table = tryParseMarkdownTable(lines, index);
    if (table) {
      closeList();
      closeQuote();
      parts.push(table.html);
      index = table.nextIndex - 1;
      continue;
    }

    closeList();
    parts.push(line.trim() === '' ? '<div><br></div>' : `<div>${inlineMdToHtml(line)}</div>`);
  }
  closeList();
  closeQuote();
  if (inCode) parts.push(`<pre><code>${escapeHtml(codeBuf.join('\n'))}</code></pre>`);
  return parts.join('');
}

/** Heuristic: does this plain text carry enough markdown syntax to be worth parsing? */
export function looksLikeMarkdown(text: string): boolean {
  if (!text.trim()) return false;
  let score = 0;
  for (const line of text.split('\n')) {
    if (/^```/.test(line)) score += 2;
    else if (/^#{1,3}\s+\S/.test(line)) score += 2;
    else if (/^[-*]\s+\[[ xX]\]\s+\S/.test(line)) score += 2;
    else if (/^>\s?\S/.test(line)) score += 1;
    else if (/^[-*]\s+\S/.test(line)) score += 1;
    else if (/^\d+\.\s+\S/.test(line)) score += 1;
    else if (/\*\*[^*\n]+\*\*/.test(line) || /`[^`\n]+`/.test(line) || /\[[^\]\n]+\]\([^)\n]+\)/.test(line)) score += 1;
    if (score >= 2) return true;
  }
  return false;
}

// ── Document export ───────────────────────────────────────────────────────────

/**
 * Convert a single DocumentNode to Markdown
 */
export function documentToMarkdown(node: DocumentNode, documents: Document[] = []): string {
  const doc = node.docId ? documents.find((d) => d.id === node.docId) : undefined;
  if (doc?.docType === 'canvas') return '';
  const title = doc?.title ?? node.title;
  const content = doc?.content ?? node.content;
  return documentMarkdownFromParts(title, content);
}

/**
 * Export multiple documents as a single Markdown file
 * Sorts by orderIndex if present, otherwise uses array order
 */
export function exportDocumentsAsMarkdown(nodes: CanvasNode[], documents: Document[] = []): string {
  const docs = nodes.filter(n => n.type === 'document') as DocumentNode[];

  // Sort by orderIndex, with fallback to array order
  docs.sort((a, b) => {
    if (a.orderIndex != null && b.orderIndex != null) {
      return a.orderIndex - b.orderIndex;
    }
    if (a.orderIndex != null) return -1;
    if (b.orderIndex != null) return 1;
    return 0; // stable: maintain array order for nodes without orderIndex
  });

  return docs.map((node) => documentToMarkdown(node, documents)).filter(Boolean).join('\n\n---\n\n');
}

/**
 * Generate a filename for Markdown export
 */
export function generateMarkdownFilename(title?: string, isMultiple = false): string {
  const base = (title || 'untitled note').replace(/\s+/g, '_').toLowerCase();
  return isMultiple ? `${base}-notes.md` : `${base}.md`;
}
