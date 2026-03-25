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
      flush();
      return;
    }

    const isBlock = tag === 'div' || tag === 'p';
    if (isBlock && (currentLine.length > 0 || lines.length > 0)) flush();

    for (const child of Array.from(el.childNodes)) {
      walk(child, b, i, u, lk);
    }

    if (isBlock) flush();
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
  ctx.font = `${style} ${fontSize}px 'JetBrains Mono', 'Fira Code', monospace`;
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
