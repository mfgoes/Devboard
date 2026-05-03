/** Rich text utilities for sticky note formatting */

export interface RichRun {
  text: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  link?: boolean;
  href?: string;
}

export type RichLineKind = 'text' | 'h1' | 'h2' | 'bullet';

export interface RichLine {
  kind: RichLineKind;
  runs: RichRun[];
}

export interface PositionedRun extends RichRun {
  x: number;
  y: number;
  fontSize: number;
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
  kind: 'h1' | 'h2' | 'h3' | 'bullet' | 'numbered' | 'callout' | 'text';
  emoji?: string;
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

  function pushLine(node: Node, kind: PreviewLine['kind'], emoji?: string) {
    if (lines.length >= maxLines) return;
    const segments = mergeSegs(extractSegs(node, false, false));
    const text = segments.map(s => s.text).join('').trim();
    if (text) lines.push({ kind, emoji, segments });
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

    if (tag === 'blockquote') {
      if (el.classList.contains('doc-callout') || el.getAttribute('data-callout') === 'true') {
        const body = (el.querySelector('.doc-callout__body') as HTMLElement | null) ?? el;
        pushLine(body, 'callout', el.getAttribute('data-callout-emoji') ?? undefined);
      } else {
        pushLine(el, 'text');
      }
      return;
    }

    if (tag === 'div' || tag === 'p') {
      const hasBlock = Array.from(el.childNodes).some(n => {
        if (n.nodeType !== Node.ELEMENT_NODE) return false;
        const t = (n as HTMLElement).tagName.toLowerCase();
        return ['h1','h2','h3','ul','ol','li','div','p','blockquote'].includes(t);
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

function appendRichRun(list: RichRun[], next: RichRun) {
  if (!next.text) return;
  const last = list[list.length - 1];
  if (
    last
    && last.bold === next.bold
    && last.italic === next.italic
    && last.underline === next.underline
    && !!last.link === !!next.link
    && last.href === next.href
  ) {
    last.text += next.text;
    return;
  }
  list.push(next);
}

function extractInlineRuns(node: Node, target: RichRun[], bold = false, italic = false, underline = false, link = false, href?: string) {
  if (node.nodeType === Node.TEXT_NODE) {
    appendRichRun(target, { text: node.textContent ?? '', bold, italic, underline, link: link || undefined, href });
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return;

  const el = node as HTMLElement;
  const tag = el.tagName.toLowerCase();

  if (tag === 'b' || tag === 'strong') bold = true;
  if (tag === 'i' || tag === 'em') italic = true;
  if (tag === 'u') underline = true;
  if (tag === 'a') {
    underline = true;
    link = true;
    href = (el as HTMLAnchorElement).getAttribute('href') || undefined;
  }
  if (tag === 'span') {
    if (el.style.fontWeight === 'bold' || el.style.fontWeight === '700') bold = true;
    if (el.style.fontStyle === 'italic') italic = true;
    if (el.style.textDecoration?.includes('underline')) underline = true;
  }

  if (tag === 'br') {
    appendRichRun(target, { text: '\n', bold, italic, underline, link: link || undefined, href });
    return;
  }

  for (const child of Array.from(el.childNodes)) {
    extractInlineRuns(child, target, bold, italic, underline, link, href);
  }
}

/** Parse HTML into logical lines with block-level kind metadata */
export function parseStructuredRichText(html: string): RichLine[] {
  const div = document.createElement('div');
  div.innerHTML = html;

  const lines: RichLine[] = [];
  let currentInlineRuns: RichRun[] = [];

  const flushInlineLine = () => {
    lines.push({ kind: 'text', runs: currentInlineRuns });
    currentInlineRuns = [];
  };

  const pushBlockLines = (kind: RichLineKind, node: Node) => {
    const blockRuns: RichRun[] = [];
    extractInlineRuns(node, blockRuns);
    const textParts: Array<RichRun & { isBreak: boolean }> = blockRuns.length === 0
      ? [{ text: '', bold: false, italic: false, underline: false, isBreak: false }]
      : blockRuns.flatMap((run) => run.text.split('\n').map((text, index, arr) => ({
          ...run,
          text,
          isBreak: index < arr.length - 1,
        })));

    let lineRuns: RichRun[] = [];
    for (const part of textParts) {
      appendRichRun(lineRuns, {
        text: part.text,
        bold: part.bold,
        italic: part.italic,
        underline: part.underline,
        link: part.link,
        href: part.href,
      });
      if (part.isBreak) {
        lines.push({ kind, runs: lineRuns });
        lineRuns = [];
      }
    }
    lines.push({ kind, runs: lineRuns });
  };

  for (const child of Array.from(div.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      appendRichRun(currentInlineRuns, {
        text: child.textContent ?? '',
        bold: false,
        italic: false,
        underline: false,
      });
      continue;
    }

    if (child.nodeType !== Node.ELEMENT_NODE) continue;
    const el = child as HTMLElement;
    const tag = el.tagName.toLowerCase();

    if (tag === 'br') {
      flushInlineLine();
      continue;
    }

    if (tag === 'ul' || tag === 'ol') {
      if (currentInlineRuns.length > 0) flushInlineLine();
      const items = Array.from(el.children).filter((item) => item.tagName.toLowerCase() === 'li');
      if (items.length === 0) {
        lines.push({ kind: 'bullet', runs: [] });
      } else {
        items.forEach((item) => pushBlockLines('bullet', item));
      }
      continue;
    }

    if (tag === 'li') {
      if (currentInlineRuns.length > 0) flushInlineLine();
      pushBlockLines('bullet', el);
      continue;
    }

    const kind: RichLineKind = tag === 'h1'
      ? 'h1'
      : tag === 'h2'
        ? 'h2'
        : 'text';

    if (['div', 'p', 'blockquote', 'h1', 'h2', 'h3'].includes(tag)) {
      if (currentInlineRuns.length > 0) flushInlineLine();
      pushBlockLines(kind, el);
      continue;
    }

    extractInlineRuns(el, currentInlineRuns);
  }

  if (currentInlineRuns.length > 0) flushInlineLine();

  while (lines.length > 1 && lines[lines.length - 1].runs.length === 0) {
    lines.pop();
  }
  if (lines.length === 0) lines.push({ kind: 'text', runs: [] });

  return lines;
}

/** Parse HTML into an array of logical lines, each line an array of styled runs */
export function parseRichText(html: string): RichRun[][] {
  return parseStructuredRichText(html).map((line) => line.runs);
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
  const lines = parseStructuredRichText(html);
  const result: PositionedRun[] = [];
  let y = 0;

  for (const line of lines) {
    const lineFontSize = line.kind === 'h1'
      ? Math.round(fontSize * 1.6)
      : line.kind === 'h2'
        ? Math.round(fontSize * 1.3)
        : fontSize;
    const lineH = Math.round(lineFontSize * lineHeightRatio);
    const lineOffsetX = line.kind === 'bullet' ? Math.max(14, lineFontSize * 1.15) : 0;

    // Apply whole-note base styles
    const runs = line.runs.map((r) => ({
      ...r,
      bold: line.kind === 'h1' || line.kind === 'h2' ? true : (r.bold || baseBold),
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
    if (line.kind === 'bullet') {
      tokens.push({
        text: '• ',
        bold: false,
        italic: false,
        underline: false,
        w: measureText('• ', false, false, lineFontSize),
      });
    }
    for (const run of runs) {
      const parts = run.text.match(/\S+\s*|\s+/g) ?? [];
      for (const p of parts) {
        const tw = measureText(p, run.bold, run.italic, lineFontSize);
        // Break tokens wider than the container into character chunks
        if (tw > containerWidth && p.trim().length > 1) {
          let remaining = p;
          while (remaining.length > 0) {
            let end = 1;
            while (end < remaining.length && measureText(remaining.slice(0, end + 1), run.bold, run.italic, lineFontSize) <= containerWidth) {
              end++;
            }
            const chunk = remaining.slice(0, end);
            tokens.push({
              text: chunk,
              bold: run.bold,
              italic: run.italic,
              underline: run.underline,
              link: run.link,
              w: measureText(chunk, run.bold, run.italic, lineFontSize),
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
        result.push({
          x: rt.x,
          y,
          text: rt.text,
          bold: rt.bold,
          italic: rt.italic,
          underline: rt.underline,
          link: rt.link,
          fontSize: lineFontSize,
        });
      }
      rowTokens = [];
      x = lineOffsetX;
      y += lineH;
    };

    x = lineOffsetX;
    for (const token of tokens) {
      const isWS = /^\s+$/.test(token.text);
      if (!isWS && x > 0 && x + token.w > containerWidth) {
        flushRow();
      }
      if (x === lineOffsetX && isWS) continue; // skip leading whitespace on a wrapped row
      rowTokens.push({ ...token, x });
      x += token.w;
    }
    flushRow();
  }

  return result;
}
