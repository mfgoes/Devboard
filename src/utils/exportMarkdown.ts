import { CanvasNode, Document, DocumentNode } from '../types';

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
      if (tag === 'hr') { out += '\n---\n'; continue; }
      if (tag === 'img') {
        const src = el.getAttribute('src') ?? '';
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
      out += inlineToMd(el, b, i, s);
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
      const inner = inlineToMd(el).trimEnd();
      for (const sub of inner.split('\n')) lines.push(`> ${sub}`);
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

// ── Markdown → HTML ───────────────────────────────────────────────────────────

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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
    parts.push(`<blockquote>${quoteBuf.map(inlineMdToHtml).join('<br>')}</blockquote>`);
    quoteBuf = [];
    inQuote = false;
  };

  for (const line of lines) {
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
    const ul = line.match(/^[-*] (.+)/); if (ul)  { if (inOl) closeList(); if (!inUl) { parts.push('<ul>'); inUl = true; } parts.push(`<li>${inlineMdToHtml(ul[1])}</li>`); continue; }
    const ol = line.match(/^\d+\. (.+)/);if (ol)  { if (inUl) closeList(); if (!inOl) { parts.push('<ol>'); inOl = true; } parts.push(`<li>${inlineMdToHtml(ol[1])}</li>`); continue; }
    closeList();
    parts.push(line.trim() === '' ? '<div><br></div>' : `<div>${inlineMdToHtml(line)}</div>`);
  }
  closeList();
  closeQuote();
  if (inCode) parts.push(`<pre><code>${escapeHtml(codeBuf.join('\n'))}</code></pre>`);
  return parts.join('');
}

// ── Document export ───────────────────────────────────────────────────────────

/**
 * Convert a single DocumentNode to Markdown
 */
export function documentToMarkdown(node: DocumentNode, documents: Document[] = []): string {
  const doc = node.docId ? documents.find((d) => d.id === node.docId) : undefined;
  const title = doc?.title ?? node.title;
  const content = doc?.content ?? node.content;
  const parts: string[] = [];
  if (title) { parts.push(`# ${title}`); parts.push(''); }
  if (content) parts.push(htmlToMarkdown(content));
  return parts.join('\n');
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

  return docs.map((node) => documentToMarkdown(node, documents)).join('\n\n---\n\n');
}

/**
 * Generate a filename for Markdown export
 */
export function generateMarkdownFilename(title?: string, isMultiple = false): string {
  const base = (title || 'untitled note').replace(/\s+/g, '_').toLowerCase();
  return isMultiple ? `${base}-notes.md` : `${base}.md`;
}
