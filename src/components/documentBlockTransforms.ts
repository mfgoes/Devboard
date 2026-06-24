import { taskListItemHtml } from '../utils/taskListHtml';
import { type DocumentCommandId } from './documentCommands';

const CONVERTIBLE_COMMAND_IDS = new Set<DocumentCommandId>([
  'text',
  'heading-1',
  'heading-2',
  'bullet-list',
  'numbered-list',
  'todo-list',
  'quote',
  'callout',
  'code-block',
]);

export function isConvertibleDocumentCommand(id: DocumentCommandId): boolean {
  return CONVERTIBLE_COMMAND_IDS.has(id);
}

export function isSupportedTurnIntoBlock(block: HTMLElement, root: HTMLElement): boolean {
  if (block.parentElement !== root) return false;
  if (block.matches('figure, table, hr')) return false;
  if (block.closest('.doc-callout__body')) return false;
  return true;
}

function sourceContentHost(block: HTMLElement): HTMLElement {
  if (block.matches('[data-task-list-item="true"]')) {
    return block.querySelector<HTMLElement>('.doc-task-text') ?? block;
  }

  if (block.tagName.toLowerCase() === 'blockquote') {
    const calloutBody = block.querySelector<HTMLElement>('.doc-callout__body');
    if (calloutBody) return sourceContentHost(calloutBody);
    const onlyElementChild = block.children.length === 1 ? block.children[0] as HTMLElement : null;
    if (onlyElementChild && ['div', 'p', 'h1', 'h2', 'h3'].includes(onlyElementChild.tagName.toLowerCase())) {
      return onlyElementChild;
    }
  }

  const onlyElementChild = block.children.length === 1 ? block.children[0] as HTMLElement : null;
  if (onlyElementChild && ['div', 'p', 'h1', 'h2', 'h3', 'li'].includes(onlyElementChild.tagName.toLowerCase())) {
    return onlyElementChild;
  }

  return block;
}

function fragmentFromBlock(block: HTMLElement, plainText = false): DocumentFragment {
  const fragment = document.createDocumentFragment();
  const tag = block.tagName.toLowerCase();

  if (plainText || tag === 'pre') {
    fragment.appendChild(document.createTextNode((block.textContent ?? '').replace(/\n+$/g, '')));
    return fragment;
  }

  if (tag === 'ul' || tag === 'ol') {
    const items = Array.from(block.children).filter((child): child is HTMLElement => child.tagName.toLowerCase() === 'li');
    items.forEach((item, index) => {
      if (index > 0) fragment.appendChild(document.createElement('br'));
      const host = sourceContentHost(item);
      Array.from(host.childNodes).forEach((child) => fragment.appendChild(child.cloneNode(true)));
    });
    return fragment;
  }

  const host = sourceContentHost(block);
  Array.from(host.childNodes).forEach((child) => {
    if (child.nodeType === Node.ELEMENT_NODE && (child as HTMLElement).matches('input[type="checkbox"]')) return;
    fragment.appendChild(child.cloneNode(true));
  });
  return fragment;
}

function fragmentHasVisibleContent(fragment: DocumentFragment): boolean {
  const wrapper = document.createElement('div');
  wrapper.appendChild(fragment.cloneNode(true));
  if (wrapper.querySelector('img, figure, table, hr, [data-chip]')) return true;
  return (wrapper.textContent ?? '').replace(/\u00a0/g, ' ').trim() !== '';
}

function appendContentOrBreak(target: HTMLElement, fragment: DocumentFragment): void {
  if (fragmentHasVisibleContent(fragment)) {
    target.appendChild(fragment);
  } else {
    target.appendChild(document.createElement('br'));
  }
}

function setPlaceholderAttrs(el: HTMLElement, placeholder: string): void {
  el.dataset.placeholder = placeholder;
  el.dataset.placeholderVisible = fragmentHasVisibleContent(fragmentFromBlock(el)) ? 'false' : 'true';
}

export function caretHostForConvertedBlock(block: HTMLElement): HTMLElement {
  return block.querySelector<HTMLElement>('.doc-task-text, .doc-callout__body, li, code') ?? block;
}

export function restoreCaretAtEnd(host: HTMLElement): void {
  const range = document.createRange();
  range.selectNodeContents(host);
  range.collapse(false);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
}

function buildConvertedBlock(commandId: DocumentCommandId, sourceBlock: HTMLElement): HTMLElement | null {
  const plainTextTarget = commandId === 'code-block';
  const content = fragmentFromBlock(sourceBlock, plainTextTarget);
  let nextBlock: HTMLElement;

  switch (commandId) {
    case 'text':
      nextBlock = document.createElement('div');
      appendContentOrBreak(nextBlock, content);
      setPlaceholderAttrs(nextBlock, 'Type something...');
      return nextBlock;
    case 'heading-1':
      nextBlock = document.createElement('h1');
      appendContentOrBreak(nextBlock, content);
      setPlaceholderAttrs(nextBlock, 'Heading 1');
      return nextBlock;
    case 'heading-2':
      nextBlock = document.createElement('h2');
      appendContentOrBreak(nextBlock, content);
      setPlaceholderAttrs(nextBlock, 'Heading 2');
      return nextBlock;
    case 'bullet-list': {
      nextBlock = document.createElement('ul');
      const item = document.createElement('li');
      appendContentOrBreak(item, content);
      setPlaceholderAttrs(item, 'List item');
      nextBlock.appendChild(item);
      return nextBlock;
    }
    case 'numbered-list': {
      nextBlock = document.createElement('ol');
      const item = document.createElement('li');
      appendContentOrBreak(item, content);
      setPlaceholderAttrs(item, 'List item');
      nextBlock.appendChild(item);
      return nextBlock;
    }
    case 'todo-list': {
      const wrapper = document.createElement('div');
      const body = document.createElement('div');
      appendContentOrBreak(body, content);
      wrapper.innerHTML = taskListItemHtml({ bodyHtml: body.innerHTML, placeholder: 'Todo item' });
      return wrapper.firstElementChild as HTMLElement | null;
    }
    case 'quote':
      nextBlock = document.createElement('blockquote');
      appendContentOrBreak(nextBlock, content);
      setPlaceholderAttrs(nextBlock, 'Quoted text...');
      return nextBlock;
    case 'callout': {
      nextBlock = document.createElement('blockquote');
      nextBlock.className = 'doc-callout';
      nextBlock.dataset.callout = 'true';
      nextBlock.dataset.calloutEmoji = '💡';
      const emojiEl = document.createElement('span');
      emojiEl.className = 'doc-callout__emoji';
      emojiEl.contentEditable = 'false';
      emojiEl.textContent = '💡';
      const body = document.createElement('div');
      body.className = 'doc-callout__body';
      appendContentOrBreak(body, content);
      setPlaceholderAttrs(body, 'Type a callout...');
      nextBlock.append(emojiEl, body);
      return nextBlock;
    }
    case 'code-block': {
      nextBlock = document.createElement('pre');
      const code = document.createElement('code');
      appendContentOrBreak(code, content);
      setPlaceholderAttrs(code, 'Write some code...');
      nextBlock.appendChild(code);
      return nextBlock;
    }
    default:
      return null;
  }
}

export function turnBlockInto(commandId: DocumentCommandId, block: HTMLElement, root: HTMLElement): HTMLElement | null {
  if (!isConvertibleDocumentCommand(commandId) || !isSupportedTurnIntoBlock(block, root)) return null;
  const nextBlock = buildConvertedBlock(commandId, block);
  if (!nextBlock) return null;
  block.replaceWith(nextBlock);
  return nextBlock;
}
