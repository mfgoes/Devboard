// Central icon registry — wraps lucide-react at consistent sizes.
// Import all icons from here, not directly from lucide-react.

import {
  GripVertical, Maximize2, FileText, Save, Folder,
  List, ListOrdered,
  AlignLeft, AlignCenter, AlignRight,
  Code, Eye, CircleDot, Copy, TextWrap, Columns2,
  Quote, Code2, Minus, Cloud, Pencil,
  Link2, Star, ArrowLeft, ArrowRight, Unlink, Brackets, MoreHorizontal,
  Search, Plus, User, ChevronDown, Check,
} from 'lucide-react';

export function IconGrip()         { return <GripVertical  size={12} />; }
export function IconExpand()       { return <Maximize2     size={13} />; }
export function IconPencil()       { return <Pencil        size={13} />; }
export function IconDoc()          { return <FileText      size={11} />; }
export function IconCanvasDoc({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="2.5" y="3" width="11" height="8.5" rx="1.4" stroke="currentColor" strokeWidth="1.4" />
      <path d="M5 13.5h6M8 11.5v2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M5.2 7.2h2.1M8.7 7.2h2.1M8 5.5v3.4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}
export function IconSaveFile()     { return <Save          size={13} />; }
export function IconFolder({ size = 13 }: { size?: number }) { return <Folder size={size} />; }
export function IconCloud({ size = 15 }: { size?: number }) { return <Cloud size={size} />; }
export function IconSearch({ size = 15 }: { size?: number }) { return <Search size={size} />; }
export function IconPlus({ size = 16 }: { size?: number }) { return <Plus size={size} />; }
export function IconUser({ size = 15 }: { size?: number }) { return <User size={size} />; }
export function IconChevronDown({ size = 14 }: { size?: number }) { return <ChevronDown size={size} strokeWidth={2.25} />; }
export function IconList()         { return <List          size={14} />; }
export function IconListOrdered()  { return <ListOrdered   size={14} />; }
export function IconAlignLeft()    { return <AlignLeft     size={13} />; }
export function IconAlignCenter()  { return <AlignCenter   size={13} />; }
export function IconAlignRight()   { return <AlignRight    size={13} />; }
export function IconCode()         { return <Code          size={13} />; }
export function IconEye()          { return <Eye           size={13} />; }
export function IconColumns()      { return <Columns2      size={13} />; }
export function IconNodeLink()     { return <CircleDot     size={13} />; }
export function IconCopy()         { return <Copy          size={13} />; }
export function IconTextWrap()     { return <TextWrap      size={13} />; }
export function IconQuote()        { return <Quote          size={13} />; }
export function IconCodeBlock()    { return <Code2          size={13} />; }
export function IconHorizontalRule() { return <Minus        size={14} />; }
export function IconLink()         { return <Link2         size={13} />; }
export function IconWikiLink()     { return <Brackets      size={14} />; }
export function IconMoreHorizontal({ size = 15 }: { size?: number }) { return <MoreHorizontal size={size} />; }
export function IconArrowLeft({ size = 14 }: { size?: number }) { return <ArrowLeft size={size} />; }
export function IconArrowRight({ size = 14 }: { size?: number }) { return <ArrowRight size={size} />; }
export function IconUnlink({ size = 14 }: { size?: number }) { return <Unlink size={size} />; }
export function IconStar({ filled = false, size = 13 }: { filled?: boolean; size?: number }) {
  return <Star size={size} fill={filled ? 'currentColor' : 'none'} />;
}
export function IconCheck({ size = 12 }: { size?: number }) { return <Check size={size} strokeWidth={3} />; }
export function IconSidebarToggle({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="2.75" y="2.5" width="10.5" height="11" rx="1.8" stroke="currentColor" strokeWidth="1.55" />
      <path d="M6.35 2.75v10.5" stroke="currentColor" strokeWidth="1.55" strokeLinecap="round" />
    </svg>
  );
}
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
