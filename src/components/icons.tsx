// Central icon registry — wraps lucide-react at consistent sizes.
// Import all icons from here, not directly from lucide-react.

import {
  GripVertical, Maximize2, FileText, Save,
  List, ListOrdered,
  AlignLeft, AlignCenter, AlignRight,
  Code, Eye, CircleDot, Copy, TextWrap,
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
