import { saveAs } from 'file-saver';
import { Document } from '../types';
import { documentMarkdownFromParts, generateMarkdownFilename } from './exportMarkdown';
import { toast } from './toast';

export function stripHtmlPreview(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function generatePlainTextFilename(title?: string): string {
  return generateMarkdownFilename(title).replace(/\.md$/i, '.txt');
}

export function exportDocumentAsMarkdownFile(doc: Document): void {
  const md = `${documentMarkdownFromParts(doc.title || 'Untitled note', doc.content)}\n`;
  saveAs(new Blob([md], { type: 'text/markdown;charset=utf-8' }), generateMarkdownFilename(doc.title));
}

export function exportDocumentAsTextFile(doc: Document): void {
  const text = stripHtmlPreview(doc.content ?? '');
  const body = text ? `${doc.title || 'Untitled note'}\n\n${text}\n` : `${doc.title || 'Untitled note'}\n`;
  saveAs(new Blob([body], { type: 'text/plain;charset=utf-8' }), generatePlainTextFilename(doc.title));
}

export function exportDocumentAsPdf(doc: Document): void {
  const printWindow = window.open('', '_blank', 'noopener,noreferrer,width=900,height=720');
  if (!printWindow) {
    toast('Allow pop-ups to export as PDF');
    return;
  }

  const safeTitle = doc.title || 'Untitled note';
  const escapedTitle = safeTitle.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const content = doc.content?.trim() || '<p></p>';
  printWindow.document.write(`
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${escapedTitle}</title>
        <style>
          body { font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 48px; color: #1f1a16; line-height: 1.65; }
          h1 { font-size: 30px; margin: 0 0 24px; }
          h2, h3 { margin-top: 24px; }
          p, li, blockquote, pre { font-size: 14px; }
          blockquote { margin: 16px 0; padding: 10px 16px; border-left: 3px solid #b87750; background: #f5ede3; border-radius: 10px; }
          pre { background: #f6f1ea; padding: 14px 16px; border-radius: 10px; overflow: auto; white-space: pre-wrap; }
          code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
          hr { border: none; border-top: 1px solid #d7cdbf; margin: 24px 0; }
          a { color: #8b4f2d; }
          .doc-wrap { max-width: 760px; margin: 0 auto; }
          @media print {
            body { margin: 24px; }
          }
        </style>
      </head>
      <body>
        <div class="doc-wrap">
          <h1>${escapedTitle}</h1>
          ${content}
        </div>
      </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.focus();
  printWindow.onload = () => {
    printWindow.print();
  };
}
