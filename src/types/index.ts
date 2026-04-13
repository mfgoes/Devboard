export type Tool =
  | 'select'
  | 'pan'
  | 'sticky'
  | 'shape'
  | 'text'
  | 'line'
  | 'pen'
  | 'section'
  | 'sticker'
  | 'table'
  | 'code'
  | 'image'
  | 'link'
  | 'task';

export type AnchorSide = 'top' | 'right' | 'bottom' | 'left';

export interface StickyNoteNode {
  id: string;
  type: 'sticky';
  x: number;
  y: number;
  text: string;
  color: string;
  width: number;
  height: number;
  bulletList?: boolean;
  fontSize?: number;
  fontSizeMode?: 'fixed' | 'dynamic'; // 'fixed' = manual size, 'dynamic' = auto-adjust
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  reaction?: string;
  locked?: boolean;
  groupId?: string;
}

export type LineStyle      = 'curved' | 'straight' | 'orthogonal';
export type StrokeStyle    = 'solid' | 'dashed' | 'dotted';
export type ArrowHeadStyle = 'arrow' | 'flat' | 'circle' | 'none';

export interface ConnectorNode {
  id: string;
  type: 'connector';
  // Source endpoint
  fromNodeId: string | null;
  fromAnchor: AnchorSide | null;
  fromX: number;
  fromY: number;
  // Target endpoint
  toNodeId: string | null;
  toAnchor: AnchorSide | null;
  toX: number;
  toY: number;
  // Style
  color: string;
  strokeWidth: number;
  lineStyle: LineStyle;
  strokeStyle: StrokeStyle;
  arrowHeadStart: ArrowHeadStyle;
  arrowHeadEnd: ArrowHeadStyle;
  // Legacy fields — kept for loading old saved boards
  arrowHead?: ArrowHeadStyle;
  hasArrow?: boolean;
  dashed?: boolean;
}

export interface TextBlockNode {
  id: string;
  type: 'textblock';
  x: number;
  y: number;
  text: string;
  fontSize: number;
  width: number;
  color: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  bulletList?: boolean;
  link?: string;
  textAlign?: 'left' | 'center' | 'right';
  locked?: boolean;
  groupId?: string;
}

export type ShapeKind = 'rect' | 'ellipse' | 'diamond' | 'triangle';

export interface ShapeNode {
  id: string;
  type: 'shape';
  kind: ShapeKind;
  x: number;
  y: number;
  width: number;
  height: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
  text?: string;
  fontSize?: number;
  fontColor?: string;
  bold?: boolean;
  italic?: boolean;
  textAlign?: 'left' | 'center' | 'right';
  rotation?: number;
  locked?: boolean;
  groupId?: string;
}

export interface StickerNode {
  id: string;
  type: 'sticker';
  src: string;
  x: number; // center x
  y: number; // center y
  width: number;
  height: number;
  rotation: number; // degrees
  locked?: boolean;
  groupId?: string;
}

export interface SectionNode {
  id: string;
  type: 'section';
  x: number;
  y: number;
  width: number;
  height: number;
  name: string;
  color: string; // accent hex
  matchStickies?: boolean; // auto-recolor stickies dropped into this section
  locked?: boolean;
  groupId?: string;
}

export interface TableNode {
  id: string;
  type: 'table';
  locked?: boolean;
  groupId?: string;
  x: number;
  y: number;
  colWidths: number[];
  rowHeights: number[];
  cells: string[][];      // cells[row][col]
  headerRow: boolean;
  fill: string;           // cell background
  headerFill: string;     // header row background
  stroke: string;         // border color
  fontSize: number;
  merges?: Array<{ row: number; col: number; colSpan: number }>;
}

export type CodeLanguage = 'sql' | 'python' | 'javascript' | 'typescript' | 'json' | 'bash' | 'gdscript' | 'csharp' | 'text';

export interface CodeBlockNode {
  id: string;
  type: 'codeblock';
  locked?: boolean;
  groupId?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  code: string;
  language: CodeLanguage;
  title: string;
  showLineNumbers: boolean;
  result?: string;
  description?: string;
  linkedFile?: string; // path relative to workspace root
}

export interface ImageNode {
  id: string;
  type: 'image';
  x: number;
  y: number;
  width: number;
  height: number;
  src: string; // base64 data URL
  assetName?: string;   // filename in workspace subfolder
  assetFolder?: string; // subfolder within workspace (default: 'assets')
  rotation?: number;
  locked?: boolean;
  groupId?: string;
  imageRendering?: 'smooth' | 'pixelated';
}

export type LinkDisplayMode = 'compact' | 'embed';

export interface LinkNode {
  id: string;
  type: 'link';
  x: number;
  y: number;
  width: number;
  height: number;
  url: string;
  displayMode: LinkDisplayMode;
  title?: string;
  description?: string;
  favicon?: string;
  image?: string;    // og:image URL
  siteName?: string; // og:site_name
  locked?: boolean;
  groupId?: string;
}

export interface TaskItem {
  id: string;
  text: string;
  done: boolean;
}

export interface TaskCardNode {
  id: string;
  type: 'taskcard';
  x: number;
  y: number;
  width: number;
  height?: number; // tracked by ResizeObserver for connector anchors
  title: string;
  tasks: TaskItem[];
  color?: string; // accent dot color
  locked?: boolean;
  groupId?: string;
}

export type CanvasNode = StickyNoteNode | ConnectorNode | TextBlockNode | ShapeNode | SectionNode | StickerNode | TableNode | CodeBlockNode | ImageNode | LinkNode | TaskCardNode;

export interface Camera {
  x: number;
  y: number;
  scale: number;
}

export interface PageMeta {
  id: string;
  name: string;
}

export interface BoardData {
  boardTitle: string;
  nodes: CanvasNode[];
  // Multi-page (v2) — absent in legacy saves
  pages?: Array<{ id: string; name: string; nodes: CanvasNode[]; camera: Camera }>;
  activePageId?: string;
}
