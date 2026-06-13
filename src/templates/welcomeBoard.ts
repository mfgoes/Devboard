import type { BoardData } from '../types';
import { taskListItemHtml } from '../utils/taskListHtml';

const WELCOME_STACK_PAGE_ID = 'page-1';

export function createWelcomeBoard(now: number = Date.now()): BoardData {
  return {
    boardTitle: 'Welcome to DevBoard',
    nodes: [],
    pages: [
      {
        id: WELCOME_STACK_PAGE_ID,
        name: 'Start here',
        layoutMode: 'stack',
        noteSort: 'custom',
        nodes: [],
        camera: { x: 0, y: 0, scale: 1 },
      },
    ],
    activePageId: WELCOME_STACK_PAGE_ID,
    documents: [
      {
        id: 'doc_welcome_workspace',
        title: 'Open or create a workspace folder',
        emoji: '📁',
        pageId: WELCOME_STACK_PAGE_ID,
        orderIndex: 0,
        createdAt: now,
        updatedAt: now,
        tags: ['workspace'],
        content: '<p>Start by attaching a real workspace folder so your board, notes, and files live together.</p><p>Use the top bar to <strong>Open workspace folder</strong> for an existing project, or <strong>Create workspace folder</strong> to start fresh.</p><p>Once connected, DevBoard can keep notes beside your project files instead of in a throwaway canvas.</p>',
      },
      {
        id: 'doc_welcome_notes',
        title: 'Jot down notes first',
        emoji: '📝',
        pageId: WELCOME_STACK_PAGE_ID,
        orderIndex: 1,
        createdAt: now,
        updatedAt: now,
        tags: ['notes'],
        content: '<p>This page opens in <strong>Stack mode</strong> so new ideas start as simple notes, not scattered stickies.</p><p>Use <strong>⌘N</strong> to make a note and capture:</p><ul><li>next steps</li><li>questions</li><li>ideas worth keeping</li></ul><p>Think of this as your project notebook.</p>',
      },
      {
        id: 'doc_welcome_checklists',
        title: 'Track tasks with checklists',
        emoji: '✅',
        pageId: WELCOME_STACK_PAGE_ID,
        orderIndex: 2,
        createdAt: now,
        updatedAt: now,
        tags: ['tasks', 'checklist'],
        content:
          '<p>Use checklist blocks when a note turns into action.</p>' +
          taskListItemHtml({ checked: true, text: 'Capture the rough plan' }) +
          taskListItemHtml({ text: 'Click this box to mark it done' }) +
          taskListItemHtml({ text: 'Press Enter here to add another checklist item' }) +
          '<p>In source or Markdown export these show up as readable <code>- [ ]</code> tasks.</p>',
      },
      {
        id: 'doc_welcome_canvas',
        title: 'Switch to canvas when ideas need space',
        emoji: '🗺️',
        pageId: WELCOME_STACK_PAGE_ID,
        orderIndex: 3,
        createdAt: now,
        updatedAt: now,
        tags: ['canvas'],
        content: '<p>Canvas is still there when you need it.</p><p>Use <strong>+ New</strong> to create an empty canvas document inside this folder for spatial work like arranging stickies, drawing flows, or mapping relationships.</p>',
      },
    ],
    schemaVersion: 3,
  };
}
