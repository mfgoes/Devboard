export type DocumentCommandSurface = 'slash' | 'bubble' | 'toolbar';

export type DocumentCommandGroup = 'Basic' | 'Link' | 'Media' | 'Meta';

export type DocumentCommandId =
  | 'text'
  | 'heading-1'
  | 'heading-2'
  | 'bullet-list'
  | 'numbered-list'
  | 'todo-list'
  | 'quote'
  | 'callout'
  | 'code-block'
  | 'divider'
  | 'external-link'
  | 'wiki-link'
  | 'node-link'
  | 'image-upload'
  | 'tag';

export interface DocumentCommandDefinition {
  id: DocumentCommandId;
  group: DocumentCommandGroup;
  surfaces: DocumentCommandSurface[];
  label: string;
  glyph: string;
  search: string;
  description: string;
  hint?: string;
}

export interface DocumentCommandContext {
  insertTextBlock: () => void;
  insertHeading1: () => void;
  insertHeading2: () => void;
  insertBulletList: () => void;
  insertNumberedList: () => void;
  insertTodoList: () => void;
  insertQuote: () => void;
  insertCallout: () => void;
  insertCodeBlock: () => void;
  insertDivider: () => void;
  insertExternalLink: () => void;
  insertWikiLink: () => void;
  insertNodeLink: () => void;
  insertImageUpload: () => void;
  insertTag: () => void;
}

export const DOCUMENT_COMMANDS: DocumentCommandDefinition[] = [
  { id: 'text', group: 'Basic', surfaces: ['slash'], label: 'Text', glyph: 'T', search: 'text paragraph basic body', description: 'Start with a normal body paragraph.' },
  { id: 'heading-1', group: 'Basic', surfaces: ['slash'], label: 'Heading 1', glyph: 'H1', hint: '#', search: 'heading 1 title basic h1', description: 'Large section heading for major note sections.' },
  { id: 'heading-2', group: 'Basic', surfaces: ['slash'], label: 'Heading 2', glyph: 'H2', hint: '##', search: 'heading 2 subtitle basic h2', description: 'Medium heading for subsections inside the current note.' },
  { id: 'bullet-list', group: 'Basic', surfaces: ['slash'], label: 'Bullet list', glyph: '•', search: 'bullet list todo checklist basic', description: 'Create a simple unordered list for ideas or references.' },
  { id: 'numbered-list', group: 'Basic', surfaces: ['slash'], label: 'Numbered list', glyph: '1.', search: 'numbered ordered list basic', description: 'Create an ordered list for steps, sequences, or priorities.' },
  { id: 'todo-list', group: 'Basic', surfaces: ['slash'], label: 'Todo list', glyph: '☐', search: 'todo checklist task basic', description: 'Insert a lightweight checklist block for action items.' },
  { id: 'quote', group: 'Basic', surfaces: ['slash'], label: 'Quote', glyph: '"', search: 'quote blockquote citation basic', description: 'Set off a quoted passage or referenced note.' },
  { id: 'callout', group: 'Basic', surfaces: ['slash'], label: 'Callout', glyph: '!', search: 'callout quote basic note tip', description: 'Draw attention to an important note, decision, or warning.' },
  { id: 'code-block', group: 'Basic', surfaces: ['slash'], label: 'Code block', glyph: '</>', search: 'code block basic snippet pre', description: 'Insert a fixed-width code block for commands or snippets.' },
  { id: 'divider', group: 'Basic', surfaces: ['slash'], label: 'Divider', glyph: '—', search: 'divider rule hr separator basic', description: 'Break a note into sections with a horizontal divider.' },
  { id: 'external-link', group: 'Link', surfaces: ['slash'], label: 'External link', glyph: '↗', search: 'link external url reference', description: 'Add a link to a website or document outside the board.' },
  { id: 'wiki-link', group: 'Link', surfaces: ['slash', 'bubble'], label: 'Wiki link', glyph: '[]', search: 'wiki link note reference related note', description: 'Link to another note inside this workspace.' },
  { id: 'node-link', group: 'Link', surfaces: ['slash'], label: 'Node link', glyph: '@', search: 'node link canvas mention canvas node', description: 'Reference a canvas node so the note can jump back to it.' },
  { id: 'image-upload', group: 'Media', surfaces: ['slash'], label: 'Image upload', glyph: 'I', search: 'image upload media paste drag file photo picture', description: 'Insert a visual reference by choosing, pasting, or dropping an image.' },
  { id: 'tag', group: 'Meta', surfaces: ['slash'], label: 'Tag', glyph: '#', search: 'tag label metadata hashtag', description: 'Insert a tag chip inline so the note can be categorized quickly.' },
];

const DOCUMENT_COMMAND_RUNNERS: Record<DocumentCommandId, (ctx: DocumentCommandContext) => void> = {
  text: (ctx) => ctx.insertTextBlock(),
  'heading-1': (ctx) => ctx.insertHeading1(),
  'heading-2': (ctx) => ctx.insertHeading2(),
  'bullet-list': (ctx) => ctx.insertBulletList(),
  'numbered-list': (ctx) => ctx.insertNumberedList(),
  'todo-list': (ctx) => ctx.insertTodoList(),
  quote: (ctx) => ctx.insertQuote(),
  callout: (ctx) => ctx.insertCallout(),
  'code-block': (ctx) => ctx.insertCodeBlock(),
  divider: (ctx) => ctx.insertDivider(),
  'external-link': (ctx) => ctx.insertExternalLink(),
  'wiki-link': (ctx) => ctx.insertWikiLink(),
  'node-link': (ctx) => ctx.insertNodeLink(),
  'image-upload': (ctx) => ctx.insertImageUpload(),
  tag: (ctx) => ctx.insertTag(),
};

export function getDocumentCommandsForSurface(surface: DocumentCommandSurface): DocumentCommandDefinition[] {
  return DOCUMENT_COMMANDS.filter((command) => command.surfaces.includes(surface));
}

export function runDocumentCommand(id: DocumentCommandId, ctx: DocumentCommandContext): void {
  DOCUMENT_COMMAND_RUNNERS[id](ctx);
}
