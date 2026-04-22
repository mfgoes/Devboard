import { CanvasNode, DocumentNode } from '../types';

// ── HTML → Markdown ───────────────────────────────────────────────────────────

function inlineToMd(node: Node, bold = false, italic = false): string {
  let out = '';
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      let t = child.textContent ?? '';
      if (bold && italic) t = `***${t}***`;
      else if (bold)      t = `**${t}**`;
      else if (italic)    t = `_${t}_`;
      out += t;
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      const el = child as HTMLElement;
      const tag = el.tagName.toLowerCase();
      if (tag === 'br') { out += '\n'; continue; }
      let b = bold, i = italic;
      if (tag === 'b' || tag === 'strong') b = true;
      if (tag === 'i' || tag === 'em')     i = true;
      if (tag === 'span') {
        const fw = el.style.fontWeight;
        if (fw === 'bold' || fw === '700') b = true;
        if (el.style.fontStyle === 'italic') i = true;
      }
      if (tag === 'a') {
        out += `[${inlineToMd(el, b, i)}](${el.getAttribute('href') ?? ''})`;
        continue;
      }
      out += inlineToMd(el, b, i);
    }
  }
  return out;
}

export function htmlToMarkdown(html: string): string {
  if (!html) return '';
  const root = document.createElement('div');
  root.innerHTML = html;
  const lines: string[] = [];

  function walk(el: Element) {
    const tag = el.tagName.toLowerCase();
    if (tag === 'h1') { lines.push(`# ${el.textContent?.trim() ?? ''}`); return; }
    if (tag === 'h2') { lines.push(`## ${el.textContent?.trim() ?? ''}`); return; }
    if (tag === 'h3') { lines.push(`### ${el.textContent?.trim() ?? ''}`); return; }
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
        return ['h1','h2','h3','ul','ol','li','div','p'].includes((n as HTMLElement).tagName.toLowerCase());
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

// ── Markdown → HTML ───────────────────────────────────────────────────────────

function inlineMdToHtml(text: string): string {
  return text
    .replace(/\*\*\*(.+?)\*\*\*/g, '<b><i>$1</i></b>')
    .replace(/\*\*(.+?)\*\*/g,     '<b>$1</b>')
    .replace(/\*(.+?)\*/g,         '<i>$1</i>')
    .replace(/_(.+?)_/g,           '<i>$1</i>')
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>');
}

export function markdownToHtml(md: string): string {
  if (!md) return '';
  const lines = md.split('\n');
  const parts: string[] = [];
  let inUl = false, inOl = false, olIdx = 0;

  const closeList = () => {
    if (inUl) { parts.push('</ul>'); inUl = false; }
    if (inOl) { parts.push('</ol>'); inOl = false; olIdx = 0; }
  };

  for (const line of lines) {
    const h3 = line.match(/^### (.+)/);  if (h3)  { closeList(); parts.push(`<h3>${inlineMdToHtml(h3[1])}</h3>`);  continue; }
    const h2 = line.match(/^## (.+)/);   if (h2)  { closeList(); parts.push(`<h2>${inlineMdToHtml(h2[1])}</h2>`);  continue; }
    const h1 = line.match(/^# (.+)/);    if (h1)  { closeList(); parts.push(`<h1>${inlineMdToHtml(h1[1])}</h1>`);  continue; }
    const ul = line.match(/^[-*] (.+)/); if (ul)  { if (inOl) closeList(); if (!inUl) { parts.push('<ul>'); inUl = true; } parts.push(`<li>${inlineMdToHtml(ul[1])}</li>`); continue; }
    const ol = line.match(/^\d+\. (.+)/);if (ol)  { if (inUl) closeList(); if (!inOl) { parts.push('<ol>'); inOl = true; } parts.push(`<li>${inlineMdToHtml(ol[1])}</li>`); continue; }
    closeList();
    parts.push(line.trim() === '' ? '<div><br></div>' : `<div>${inlineMdToHtml(line)}</div>`);
  }
  closeList();
  return parts.join('');
}

// ── Document export ───────────────────────────────────────────────────────────

/**
 * Convert a single DocumentNode to Markdown
 */
export function documentToMarkdown(node: DocumentNode): string {
  const parts: string[] = [];
  if (node.title) { parts.push(`# ${node.title}`); parts.push(''); }
  if (node.content) parts.push(htmlToMarkdown(node.content));
  return parts.join('\n');
}

/**
 * Export multiple documents as a single Markdown file
 * Sorts by orderIndex if present, otherwise uses array order
 */
export function exportDocumentsAsMarkdown(nodes: CanvasNode[]): string {
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

  return docs.map(documentToMarkdown).join('\n\n---\n\n');
}

/**
 * Generate a filename for Markdown export
 */
export function generateMarkdownFilename(title?: string, isMultiple = false): string {
  const base = (title || 'untitled document').replace(/\s+/g, '_').toLowerCase();
  return isMultiple ? `${base}-documents.md` : `${base}.md`;
}
