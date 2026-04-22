/** Rich text utilities for sticky note formatting */

export interface RichRun {
  text: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  link?: boolean;
  href?: string;
}

export interface PositionedRun extends RichRun {
  x: number;
  y: number;
}

/** Returns true if the string contains HTML markup */
export function isRichText(text: string): boolean {
  return /<[a-z][\s\S]*>/i.test(text);
}

/** Convert plain text (with \n line breaks) to contenteditable HTML */
export function textToHtml(text: string): string {
  if (!text) return '';
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const htmlLines = escaped.split('\n');
  if (htmlLines.length === 1) return escaped;
  // First line is bare, subsequent lines wrapped in divs (contenteditable convention)
  return (
    htmlLines[0] +
    htmlLines.slice(1).map((l) => `<div>${l || '<br>'}</div>`).join('')
  );
}

/** Strip all HTML tags and return plain text */
export function htmlToPlainText(html: string): string {
  const div = document.createElement('div');
  div.innerHTML = html;
  // Replace <br> and block closers with newlines before extracting text
  return (div.textContent ?? '').replace(/\u00a0/g, ' ');
}

/** Extract first N non-empty lines of plain text from HTML for preview display */
export function htmlToPreviewLines(html: string, maxLines = 5): string {
  if (!html) return '';
  const text = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|h[1-6]|li|blockquote|pre)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return text.split('\n').filter(l => l.trim()).slice(0, maxLines).join('\n');
}

export interface PreviewSegment {
  text: string;
  bold: boolean;
  italic: boolean;
}

export interface PreviewLine {
  kind: 'h1' | 'h2' | 'h3' | 'bullet' | 'numbered' | 'text';
  segments: PreviewSegment[];
}

/** Parse HTML into structured preview lines for Markdown-light rendering */
export function htmlToPreviewStructured(html: string, maxLines = 5): PreviewLine[] {
  if (!html) return [];
  const root = document.createElement('div');
  root.innerHTML = html;
  const lines: PreviewLine[] = [];

  function extractSegs(node: Node, bold: boolean, italic: boolean): PreviewSegment[] {
    const out: PreviewSegment[] = [];
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        const t = child.textContent ?? '';
        if (t) out.push({ text: t, bold, italic });
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const el = child as HTMLElement;
        const tag = el.tagName.toLowerCase();
        if (tag === 'br') continue;
        let b = bold, i = italic;
        if (tag === 'b' || tag === 'strong') b = true;
        if (tag === 'i' || tag === 'em') i = true;
        if (tag === 'span') {
          const fw = el.style.fontWeight;
          if (fw === 'bold' || fw === '700') b = true;
          if (el.style.fontStyle === 'italic') i = true;
        }
        out.push(...extractSegs(el, b, i));
      }
    }
    return out;
  }

  function mergeSegs(raw: PreviewSegment[]): PreviewSegment[] {
    const out: PreviewSegment[] = [];
    for (const s of raw) {
      const last = out[out.length - 1];
      if (last && last.bold === s.bold && last.italic === s.italic) {
        last.text += s.text;
      } else if (s.text) {
        out.push({ ...s });
      }
    }
    return out;
  }

  function pushLine(node: Node, kind: PreviewLine['kind']) {
    if (lines.length >= maxLines) return;
    const segments = mergeSegs(extractSegs(node, false, false));
    const text = segments.map(s => s.text).join('').trim();
    if (text) lines.push({ kind, segments });
  }

  function walk(el: Element) {
    if (lines.length >= maxLines) return;
    const tag = el.tagName.toLowerCase();

    if (tag === 'h1') { pushLine(el, 'h1'); return; }
    if (tag === 'h2') { pushLine(el, 'h2'); return; }
    if (tag === 'h3') { pushLine(el, 'h3'); return; }

    if (tag === 'ul' || tag === 'ol') {
      const kind: PreviewLine['kind'] = tag === 'ol' ? 'numbered' : 'bullet';
      for (const child of Array.from(el.children)) {
        if (lines.length >= maxLines) break;
        if (child.tagName.toLowerCase() === 'li') pushLine(child, kind);
      }
      return;
    }

    if (tag === 'li') { pushLine(el, 'bullet'); return; }

    if (tag === 'div' || tag === 'p') {
      const hasBlock = Array.from(el.childNodes).some(n => {
        if (n.nodeType !== Node.ELEMENT_NODE) return false;
        const t = (n as HTMLElement).tagName.toLowerCase();
        return ['h1','h2','h3','ul','ol','li','div','p'].includes(t);
      });
      if (hasBlock) {
        for (const child of Array.from(el.childNodes)) {
          if (lines.length >= maxLines) break;
          if (child.nodeType === Node.ELEMENT_NODE) walk(child as Element);
          else if (child.nodeType === Node.TEXT_NODE) {
            const t = (child.textContent ?? '').trim();
            if (t) lines.push({ kind: 'text', segments: [{ text: t, bold: false, italic: false }] });
          }
        }
      } else {
        pushLine(el, 'text');
      }
      return;
    }

    pushLine(el, 'text');
  }

  for (const child of Array.from(root.childNodes)) {
    if (lines.length >= maxLines) break;
    if (child.nodeType === Node.TEXT_NODE) {
      const t = (child.textContent ?? '').trim();
      if (t) lines.push({ kind: 'text', segments: [{ text: t, bold: false, italic: false }] });
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      walk(child as Element);
    }
  }

  return lines;
}

/** Parse HTML into an array of logical lines, each line an array of styled runs */
export function parseRichText(html: string): RichRun[][] {
  const div = document.createElement('div');
  div.innerHTML = html;

  const lines: RichRun[][] = [];
  let currentLine: RichRun[] = [];

  function flush() {
    lines.push(currentLine);
    currentLine = [];
  }

  function append(text: string, b: boolean, i: boolean, u: boolean, lk: boolean, href?: string) {
    if (!text) return;
    const last = currentLine[currentLine.length - 1];
    if (last && last.bold === b && last.italic === i && last.underline === u && !!last.link === lk && last.href === href) {
      last.text += text;
    } else {
      currentLine.push({ text, bold: b, italic: i, underline: u, link: lk || undefined, href });
    }
  }

  function walk(node: Node, b: boolean, i: boolean, u: boolean, lk: boolean, href?: string) {
    if (node.nodeType === Node.TEXT_NODE) {
      append(node.textContent ?? '', b, i, u, lk, href);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();

    // Inherit styles from element tag or inline style
    if (tag === 'b' || tag === 'strong') b = true;
    if (tag === 'i' || tag === 'em') i = true;
    if (tag === 'u') u = true;
    if (tag === 'a') { u = true; lk = true; href = (el as HTMLAnchorElement).getAttribute('href') || undefined; }
    if (tag === 'span') {
      if (el.style.fontWeight === 'bold') b = true;
      if (el.style.fontStyle === 'italic') i = true;
      if (el.style.textDecoration?.includes('underline')) u = true;
    }

    if (tag === 'br') {
      // Only flush for <br> if we haven't just started a new line (avoids
      // double-blank from <div><br></div> pattern used by contenteditable)
      if (currentLine.length > 0 || lines.length === 0) {
        flush();
      } else {
        lines.push([]);
      }
      return;
    }

    const isBlock = tag === 'div' || tag === 'p';
    if (isBlock && currentLine.length > 0) flush();

    for (const child of Array.from(el.childNodes)) {
      walk(child, b, i, u, lk);
    }

    if (isBlock && currentLine.length > 0) flush();
  }

  for (const child of Array.from(div.childNodes)) {
    walk(child, false, false, false, false);
  }
  if (currentLine.length > 0) flush();

  // Remove trailing empty lines (artifacts of trailing <br> / <div>)
  while (lines.length > 1 && lines[lines.length - 1].length === 0) {
    lines.pop();
  }
  if (lines.length === 0) lines.push([]);

  return lines;
}

// ── Text measurement ──────────────────────────────────────────────────────────

let _measureCtx: CanvasRenderingContext2D | null = null;

function getCtx(): CanvasRenderingContext2D {
  if (!_measureCtx) _measureCtx = document.createElement('canvas').getContext('2d')!;
  return _measureCtx;
}

function measureText(text: string, bold: boolean, italic: boolean, fontSize: number): number {
  const ctx = getCtx();
  const style = [bold ? 'bold' : '', italic ? 'italic' : ''].filter(Boolean).join(' ') || 'normal';
  ctx.font = `${style} ${fontSize}px 'Plus Jakarta Sans', sans-serif`;
  return ctx.measureText(text).width;
}

/**
 * Lay out rich text HTML into positioned Konva Text segments.
 * Returns one entry per visual token (word + trailing space) with canvas x/y coords.
 */
export function layoutRichText(
  html: string,
  containerWidth: number,
  fontSize: number,
  lineHeightRatio: number,
  baseBold: boolean,
  baseItalic: boolean,
): PositionedRun[] {
  const lines = parseRichText(html);
  const lineH = Math.round(fontSize * lineHeightRatio);
  const result: PositionedRun[] = [];
  let y = 0;

  for (const lineRuns of lines) {
    // Apply whole-note base styles
    const runs = lineRuns.map((r) => ({
      ...r,
      bold: r.bold || baseBold,
      italic: r.italic || baseItalic,
    }));

    // Tokenize into word-level chunks (word + trailing space)
    interface Token {
      text: string;
      bold: boolean;
      italic: boolean;
      underline: boolean;
      link?: boolean;
      w: number;
    }
    const tokens: Token[] = [];
    for (const run of runs) {
      const parts = run.text.match(/\S+\s*|\s+/g) ?? [];
      for (const p of parts) {
        const tw = measureText(p, run.bold, run.italic, fontSize);
        // Break tokens wider than the container into character chunks
        if (tw > containerWidth && p.trim().length > 1) {
          let remaining = p;
          while (remaining.length > 0) {
            let end = 1;
            while (end < remaining.length && measureText(remaining.slice(0, end + 1), run.bold, run.italic, fontSize) <= containerWidth) {
              end++;
            }
            const chunk = remaining.slice(0, end);
            tokens.push({
              text: chunk,
              bold: run.bold,
              italic: run.italic,
              underline: run.underline,
              link: run.link,
              w: measureText(chunk, run.bold, run.italic, fontSize),
            });
            remaining = remaining.slice(end);
          }
        } else {
          tokens.push({
            text: p,
            bold: run.bold,
            italic: run.italic,
            underline: run.underline,
            link: run.link,
            w: tw,
          });
        }
      }
    }

    // Word-wrap and lay out
    let x = 0;
    type RowToken = Token & { x: number };
    let rowTokens: RowToken[] = [];

    const flushRow = () => {
      // Trim trailing whitespace
      while (rowTokens.length > 0 && /^\s+$/.test(rowTokens[rowTokens.length - 1].text)) {
        rowTokens.pop();
      }
      for (const rt of rowTokens) {
        result.push({ x: rt.x, y, text: rt.text, bold: rt.bold, italic: rt.italic, underline: rt.underline, link: rt.link });
      }
      rowTokens = [];
      x = 0;
      y += lineH;
    };

    for (const token of tokens) {
      const isWS = /^\s+$/.test(token.text);
      if (!isWS && x > 0 && x + token.w > containerWidth) {
        flushRow();
      }
      if (x === 0 && isWS) continue; // skip leading whitespace on a wrapped row
      rowTokens.push({ ...token, x });
      x += token.w;
    }
    flushRow();
  }

  return result;
}
