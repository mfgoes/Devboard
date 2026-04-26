// Central icon registry — wraps lucide-react at consistent sizes.
// Import all icons from here, not directly from lucide-react.

import {
  GripVertical, Maximize2, FileText, Save,
  List, ListOrdered,
  AlignLeft, AlignCenter, AlignRight,
  Code, Eye, CircleDot, Copy, TextWrap,
  Quote, Code2, Minus,
} from 'lucide-react';

export function IconGrip()         { return <GripVertical  size={12} />; }
export function IconExpand()       { return <Maximize2     size={13} />; }
export function IconDoc()          { return <FileText      size={11} />; }
export function IconSaveFile()     { return <Save          size={13} />; }
export function IconList()         { return <List          size={14} />; }
export function IconListOrdered()  { return <ListOrdered   size={14} />; }
export function IconAlignLeft()    { return <AlignLeft     size={13} />; }
export function IconAlignCenter()  { return <AlignCenter   size={13} />; }
export function IconAlignRight()   { return <AlignRight    size={13} />; }
export function IconCode()         { return <Code          size={13} />; }
export function IconEye()          { return <Eye           size={13} />; }
export function IconNodeLink()     { return <CircleDot     size={13} />; }
export function IconCopy()         { return <Copy          size={13} />; }
export function IconTextWrap()     { return <TextWrap      size={13} />; }
export function IconQuote()        { return <Quote          size={13} />; }
export function IconCodeBlock()    { return <Code2          size={13} />; }
export function IconHorizontalRule() { return <Minus        size={14} />; }
export function IconFreeformPage() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
      <rect x="1.5" y="1.5" width="3" height="3" rx="0.7" stroke="currentColor" strokeWidth="1.1" />
      <rect x="8.5" y="1.5" width="3" height="3" rx="0.7" stroke="currentColor" strokeWidth="1.1" />
      <rect x="1.5" y="8.5" width="3" height="3" rx="0.7" stroke="currentColor" strokeWidth="1.1" />
      <rect x="8.5" y="8.5" width="3" height="3" rx="0.7" stroke="currentColor" strokeWidth="1.1" />
    </svg>
  );
}
export function IconStackPage() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
      <path d="M1.5 4.5h10M1.5 6.5h10M1.5 8.5h10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}
