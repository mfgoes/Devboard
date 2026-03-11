export type Tool =
  | 'select'
  | 'pan'
  | 'sticky'
  | 'shape'
  | 'text'
  | 'line'
  | 'pen'
  | 'section';

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
}

export type CanvasNode = StickyNoteNode | ConnectorNode | TextBlockNode | ShapeNode | SectionNode;

export interface Camera {
  x: number;
  y: number;
  scale: number;
}

export interface BoardData {
  boardTitle: string;
  nodes: CanvasNode[];
}
