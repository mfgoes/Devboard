import { useBoardStore } from '../store/boardStore';
import TextEditor from './TextEditor';
import TableCellEditor from './TableCellEditor';
import StickyColorPicker from './StickyColorPicker';
import EmojiReactionPicker from './EmojiReactionPicker';
import ShapeToolbar from './ShapeToolbar';
import ImageToolbar from './ImageToolbar';
import TextBlockToolbar from './TextBlockToolbar';
import ConnectorToolbar from './ConnectorToolbar';
import SectionToolbar from './SectionToolbar';
import TableToolbar from './TableToolbar';
import TableInsertControls from './TableInsertControls';
import TableReorderControls from './TableReorderControls';
import MultiSelectToolbar from './MultiSelectToolbar';
import ContextMenu from './ContextMenu';
import CodeBlockToolbar from './CodeBlockToolbar';
import LinkToolbar from './LinkToolbar';
import DocumentToolbar from './DocumentToolbar';
import type { ContextMenuState } from './ContextMenu';
import type { StickyNoteNode } from '../types';

interface Props {
  contextMenu: ContextMenuState | null;
  setContextMenu: (menu: ContextMenuState | null) => void;
}

export default function CanvasToolbars({ contextMenu, setContextMenu }: Props) {
  const { nodes, selectedIds, editingId, appMode } = useBoardStore();

  if (appMode === 'document') return null;

  const singleSelected =
    selectedIds.length === 1 && !editingId
      ? nodes.find((n) => n.id === selectedIds[0])
      : null;

  const selectedConnectorId =
    selectedIds.length === 1
      ? (nodes.find((n) => n.id === selectedIds[0] && n.type === 'connector')?.id ?? null)
      : null;

  const activeTextBlockId =
    (selectedIds.length === 1 &&
      nodes.find((n) => n.id === selectedIds[0] && n.type === 'textblock')?.id) ||
    (editingId && nodes.find((n) => n.id === editingId && n.type === 'textblock')?.id) ||
    null;

  const activeStickyId =
    (singleSelected?.type === 'sticky' ? singleSelected.id : null) ||
    (editingId && nodes.find((n) => n.id === editingId && n.type === 'sticky')?.id) ||
    null;

  return (
    <>
      <TextEditor />
      <TableCellEditor />
      {activeStickyId && (
        <StickyColorPicker nodeId={activeStickyId} isEditing={!!editingId && editingId === activeStickyId} />
      )}
      {nodes
        .filter((n) => n.type === 'sticky')
        .map((n) => {
          const isNodeSelected = selectedIds.includes(n.id) && !editingId;
          const hasReaction = !!(n as StickyNoteNode).reaction;
          if (!hasReaction && !isNodeSelected) return null;
          return (
            <EmojiReactionPicker key={n.id} nodeId={n.id} isSelected={isNodeSelected} />
          );
        })}
      {singleSelected?.type === 'shape'     && <ShapeToolbar nodeId={singleSelected.id} />}
      {singleSelected?.type === 'image'     && <ImageToolbar nodeId={singleSelected.id} />}
      {singleSelected?.type === 'codeblock' && <CodeBlockToolbar nodeId={singleSelected.id} />}
      {singleSelected?.type === 'link'      && <LinkToolbar nodeId={singleSelected.id} />}
      {singleSelected?.type === 'section'   && <SectionToolbar nodeId={singleSelected.id} />}
      {singleSelected?.type === 'table' && (
        <>
          <TableToolbar nodeId={singleSelected.id} />
          <TableInsertControls nodeId={singleSelected.id} />
          <TableReorderControls nodeId={singleSelected.id} />
        </>
      )}
      {activeTextBlockId   && <TextBlockToolbar nodeId={activeTextBlockId} />}
      {singleSelected?.type === 'document' && <DocumentToolbar nodeId={singleSelected.id} />}
      {selectedConnectorId && <ConnectorToolbar nodeId={selectedConnectorId} />}
      {selectedIds.length > 1 && !editingId && <MultiSelectToolbar />}
      {contextMenu && (
        <ContextMenu menu={contextMenu} onClose={() => setContextMenu(null)} />
      )}
    </>
  );
}
