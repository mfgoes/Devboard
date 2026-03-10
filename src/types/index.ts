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
}

export interface ConnectorNode {
  id: string;
  type: 'connector';
  // Source endpoint
  fromNodeId: string | null;
  fromAnchor: AnchorSide | null; // null = auto-pick best side
  fromX: number; // fallback coords (free endpoint or initial snapshot)
  fromY: number;
  // Target endpoint
  toNodeId: string | null;
  toAnchor: AnchorSide | null; // null = auto-pick best side
  toX: number;
  toY: number;
  // Style
  color: string;
  strokeWidth: number;
  hasArrow: boolean;
  dashed: boolean;
}

export type CanvasNode = StickyNoteNode | ConnectorNode;

export interface Camera {
  x: number;
  y: number;
  scale: number;
}

export interface BoardData {
  boardTitle: string;
  nodes: CanvasNode[];
}
