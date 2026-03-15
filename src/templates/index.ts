import { BoardData } from '../types';

export interface Template {
  id: string;
  name: string;
  description: string;
  data: BoardData;
}

/**
 * Estimates the minimum sticky note height so all text is visible.
 *
 * Matches StickyNote.tsx rendering:
 *   - JetBrains Mono (monospace) — char width ≈ fontSize * 0.605
 *   - lineHeight 1.5
 *   - 10 px padding on all sides (text area = width-20, height-20)
 *
 * Pass the same fontSize you set on the node (default 13).
 * A one-line buffer is added so the last line never clips.
 */
function stickyHeight(text: string, width: number, fontSize = 13): number {
  const charWidth   = fontSize * 0.605;
  const textWidth   = width - 20;
  const charsPerRow = Math.max(1, Math.floor(textWidth / charWidth));

  const lines = text.split('\n').reduce((total, para) => {
    // Empty paragraph still occupies one line
    return total + Math.max(1, Math.ceil(para.length / charsPerRow));
  }, 0);

  // content height + top/bottom padding + one-line safety buffer
  return Math.max(80, Math.ceil(lines * fontSize * 1.5) + 20 + Math.ceil(fontSize * 1.5));
}

/**
 * Computes a list of y-positions for a vertical stack of sticky notes.
 * Each item's y is placed immediately after the previous item's computed height.
 *
 * Usage:
 *   const ys = yStack(startY, [
 *     { text, width, fontSize },
 *     ...
 *   ], gap);
 *   // ys[0] is the y of the first item, ys[1] of the second, etc.
 *
 * To get the total height consumed (for sizing a parent section):
 *   const totalH = ys[ys.length-1] + stickyHeight(lastText, w, fs) - startY + bottomPad;
 */
function yStack(
  startY: number,
  items: Array<{ text: string; width: number; fontSize?: number }>,
  gap = 12,
): number[] {
  const ys: number[] = [];
  let y = startY;
  for (const item of items) {
    ys.push(y);
    y += stickyHeight(item.text, item.width, item.fontSize ?? 13) + gap;
  }
  return ys;
}

// ── Template 1: Core Gameplay Loop ───────────────────────────────────────────
// Layout constants — tweak these if you change any text below
const GL_IL_W  = 185;   // inner-loop sticky width
const GL_IL_FS = 12;    // inner-loop sticky font size
const GL_OL_W  = 205;   // outer-loop wide sticky width (top/bottom of diamond)
const GL_OL_SW = 190;   // outer-loop side sticky width (left/right of diamond)
const GL_OL_FS = 12;    // outer-loop sticky font size
const GL_R_X   = 674;   // solo-dev column x
const GL_R_W   = 362;   // solo-dev sticky width
const GL_R_FS  = 11;    // solo-dev sticky font size

// Inner loop texts
const GL_IL_T1 = 'Player Input\n\nWhat does the player actually DO?\n(press, aim, move, choose)';
const GL_IL_T2 = 'System Response\n\nHow does the world react?\n(hit lands, door opens, enemy dies)';
const GL_IL_T3 = 'Instant Payoff\n\nWhat does the player FEEL?\n(hit sound, screen shake, number pop)';

// Outer loop texts
const GL_OL_T4 = 'Entry Hook\n\nWhy start a new session?\n(unfinished goal, locked item, cliffhanger)';
const GL_OL_T5 = 'Run Inner Loop\n\n(repeat many times)\nThis is your game\'s main job.';
const GL_OL_T6 = 'Progress Revealed\n\nXP gained, new gear,\nstory beat, level unlocked.';
const GL_OL_T7 = 'Raised Stakes\n\nHarder enemy, bigger mystery,\nnew capability → back to Hook.';

// Solo dev reality check texts
const GL_R_TEXTS = [
  'Scope Gate\n\nCan 1 person code + art + audio this in your time budget? Name a week count. If no, cut a loop or shrink the outer loop first.',
  'Inner Loop First\n\nBuild ONLY the inner loop first. Is it fun with zero progression? If not, fix it before adding any outer loop features.',
  'Return Reason\n\nIs there a concrete reason to start a new session tomorrow? Name it. If you can\'t name it, the outer loop isn\'t done.',
  'The Cut Rule\n\nIf the inner loop isn\'t fun, no outer loop will save it. When scope creeps, cut outer loop features first — always.',
  '5-Min Stranger Test\n\nHand it to someone cold, no instructions. Can they feel the inner loop within 5 minutes? This is your first playtest metric.',
  'Iteration Budget\n\nPlan 3 playtests before your first public build: after inner loop alone, at mid-point, and pre-ship.',
];

// Compute inner loop section geometry
const GL_IL_SEC_Y = 20;
const GL_IL_ROW1_Y = GL_IL_SEC_Y + 48;
const GL_IL_ROW2_Y = GL_IL_ROW1_Y + stickyHeight(GL_IL_T1, GL_IL_W, GL_IL_FS) + 28;
const GL_IL_SEC_H  = stickyHeight(GL_IL_T2, GL_IL_W, GL_IL_FS) + (GL_IL_ROW2_Y - GL_IL_SEC_Y) + 40;

// Compute outer loop section geometry
const GL_OL_SEC_Y  = GL_IL_SEC_Y + GL_IL_SEC_H + 12;
const GL_OL_ROW1_Y = GL_OL_SEC_Y + 48;
const GL_OL_ROW2_Y = GL_OL_ROW1_Y + stickyHeight(GL_OL_T4, GL_OL_W, GL_OL_FS) + 28;
const GL_OL_ROW3_Y = GL_OL_ROW2_Y + Math.max(stickyHeight(GL_OL_T5, GL_OL_SW, GL_OL_FS), stickyHeight(GL_OL_T6, GL_OL_SW, GL_OL_FS)) + 28;
const GL_OL_SEC_H  = stickyHeight(GL_OL_T7, GL_OL_W, GL_OL_FS) + (GL_OL_ROW3_Y - GL_OL_SEC_Y) + 50;

// Compute solo dev column — stacked, auto y positions
const GL_R_HEADER_Y = GL_IL_SEC_Y + 48;
const GL_R_START_Y  = GL_R_HEADER_Y + 30;
const glRYs = yStack(
  GL_R_START_Y,
  GL_R_TEXTS.map(text => ({ text, width: GL_R_W, fontSize: GL_R_FS })),
  12,
);
const GL_R_LAST_H  = stickyHeight(GL_R_TEXTS[GL_R_TEXTS.length - 1], GL_R_W, GL_R_FS);
const GL_R_SEC_H   = glRYs[glRYs.length - 1] + GL_R_LAST_H - GL_IL_SEC_Y + 30;

const gameplayLoop: Template = {
  id: 'gameplay-loop',
  name: 'Core Gameplay Loop',
  description: 'Inner loop (instant fun) + outer loop (progression) + solo dev reality check',
  data: {
    boardTitle: 'Core Gameplay Loop',
    nodes: [

      // ══════════════════════════════════════════════════════════════════════
      // SECTION 1 — INNER LOOP (the fast cycle, seconds per iteration)
      // ══════════════════════════════════════════════════════════════════════
      {
        id: 'gl-sec1', type: 'section',
        x: 20, y: GL_IL_SEC_Y, width: 624, height: GL_IL_SEC_H,
        name: '⚡ Inner Loop — Moment to Moment',
        color: '#60a5fa',
      },

      // Three stickies in a triangle
      {
        id: 'gl-n1', type: 'sticky',
        x: 242, y: GL_IL_ROW1_Y,
        width: GL_IL_W, height: stickyHeight(GL_IL_T1, GL_IL_W, GL_IL_FS),
        color: '#fbbf24', fontSize: GL_IL_FS, text: GL_IL_T1,
      },
      {
        id: 'gl-n2', type: 'sticky',
        x: 50, y: GL_IL_ROW2_Y,
        width: GL_IL_W, height: stickyHeight(GL_IL_T2, GL_IL_W, GL_IL_FS),
        color: '#fb923c', fontSize: GL_IL_FS, text: GL_IL_T2,
      },
      {
        id: 'gl-n3', type: 'sticky',
        x: 430, y: GL_IL_ROW2_Y,
        width: GL_IL_W, height: stickyHeight(GL_IL_T3, GL_IL_W, GL_IL_FS),
        color: '#34d399', fontSize: GL_IL_FS, text: GL_IL_T3,
      },

      // Cycle time hint
      {
        id: 'gl-t1', type: 'textblock',
        x: 180, y: GL_IL_SEC_Y + GL_IL_SEC_H - 26, width: 300,
        text: '⏱ Typical cycle: 2–5 seconds per loop',
        fontSize: 11, color: '#64748b', bold: false, italic: true, underline: false,
      },

      // Inner loop connectors (blue)
      { id: 'gl-c1', type: 'connector', fromNodeId: 'gl-n1', fromAnchor: null, fromX: 0, fromY: 0, toNodeId: 'gl-n2', toAnchor: null, toX: 0, toY: 0, color: '#3b82f6', strokeWidth: 2, lineStyle: 'curved', strokeStyle: 'solid', arrowHeadStart: 'none', arrowHeadEnd: 'arrow' },
      { id: 'gl-c2', type: 'connector', fromNodeId: 'gl-n2', fromAnchor: null, fromX: 0, fromY: 0, toNodeId: 'gl-n3', toAnchor: null, toX: 0, toY: 0, color: '#3b82f6', strokeWidth: 2, lineStyle: 'curved', strokeStyle: 'solid', arrowHeadStart: 'none', arrowHeadEnd: 'arrow' },
      { id: 'gl-c3', type: 'connector', fromNodeId: 'gl-n3', fromAnchor: null, fromX: 0, fromY: 0, toNodeId: 'gl-n1', toAnchor: null, toX: 0, toY: 0, color: '#3b82f6', strokeWidth: 2, lineStyle: 'curved', strokeStyle: 'solid', arrowHeadStart: 'none', arrowHeadEnd: 'arrow' },

      // ══════════════════════════════════════════════════════════════════════
      // SECTION 2 — OUTER LOOP (the slow cycle, minutes per session)
      // ══════════════════════════════════════════════════════════════════════
      {
        id: 'gl-sec2', type: 'section',
        x: 20, y: GL_OL_SEC_Y, width: 624, height: GL_OL_SEC_H,
        name: '🔄 Outer Loop — Session to Session',
        color: '#a78bfa',
      },

      // Four stickies in a diamond
      {
        id: 'gl-n4', type: 'sticky',
        x: 222, y: GL_OL_ROW1_Y,
        width: GL_OL_W, height: stickyHeight(GL_OL_T4, GL_OL_W, GL_OL_FS),
        color: '#f9a8d4', fontSize: GL_OL_FS, text: GL_OL_T4,
      },
      {
        id: 'gl-n5', type: 'sticky',
        x: 42, y: GL_OL_ROW2_Y,
        width: GL_OL_SW, height: stickyHeight(GL_OL_T5, GL_OL_SW, GL_OL_FS),
        color: '#93c5fd', fontSize: GL_OL_FS, text: GL_OL_T5,
      },
      {
        id: 'gl-n6', type: 'sticky',
        x: 420, y: GL_OL_ROW2_Y,
        width: GL_OL_SW, height: stickyHeight(GL_OL_T6, GL_OL_SW, GL_OL_FS),
        color: '#6ee7b7', fontSize: GL_OL_FS, text: GL_OL_T6,
      },
      {
        id: 'gl-n7', type: 'sticky',
        x: 222, y: GL_OL_ROW3_Y,
        width: GL_OL_W, height: stickyHeight(GL_OL_T7, GL_OL_W, GL_OL_FS),
        color: '#c4b5fd', fontSize: GL_OL_FS, text: GL_OL_T7,
      },

      // Cycle time hint
      {
        id: 'gl-t2', type: 'textblock',
        x: 165, y: GL_OL_SEC_Y + GL_OL_SEC_H - 26, width: 335,
        text: '⏱ Typical cycle: 5–30 minutes per session',
        fontSize: 11, color: '#64748b', bold: false, italic: true, underline: false,
      },

      // Outer loop connectors (purple)
      { id: 'gl-c4', type: 'connector', fromNodeId: 'gl-n4', fromAnchor: null, fromX: 0, fromY: 0, toNodeId: 'gl-n5', toAnchor: null, toX: 0, toY: 0, color: '#7c3aed', strokeWidth: 2, lineStyle: 'curved', strokeStyle: 'solid', arrowHeadStart: 'none', arrowHeadEnd: 'arrow' },
      { id: 'gl-c5', type: 'connector', fromNodeId: 'gl-n5', fromAnchor: null, fromX: 0, fromY: 0, toNodeId: 'gl-n6', toAnchor: null, toX: 0, toY: 0, color: '#7c3aed', strokeWidth: 2, lineStyle: 'curved', strokeStyle: 'solid', arrowHeadStart: 'none', arrowHeadEnd: 'arrow' },
      { id: 'gl-c6', type: 'connector', fromNodeId: 'gl-n6', fromAnchor: null, fromX: 0, fromY: 0, toNodeId: 'gl-n7', toAnchor: null, toX: 0, toY: 0, color: '#7c3aed', strokeWidth: 2, lineStyle: 'curved', strokeStyle: 'solid', arrowHeadStart: 'none', arrowHeadEnd: 'arrow' },
      { id: 'gl-c7', type: 'connector', fromNodeId: 'gl-n7', fromAnchor: null, fromX: 0, fromY: 0, toNodeId: 'gl-n4', toAnchor: null, toX: 0, toY: 0, color: '#7c3aed', strokeWidth: 2, lineStyle: 'curved', strokeStyle: 'solid', arrowHeadStart: 'none', arrowHeadEnd: 'arrow' },

      // Bridge: Instant Payoff feeds the outer loop's Progress (dashed = feeds into)
      { id: 'gl-bridge', type: 'connector', fromNodeId: 'gl-n3', fromAnchor: 'bottom', fromX: 0, fromY: 0, toNodeId: 'gl-n6', toAnchor: 'top', toX: 0, toY: 0, color: '#10b981', strokeWidth: 2, lineStyle: 'curved', strokeStyle: 'dashed', arrowHeadStart: 'none', arrowHeadEnd: 'arrow' },

      // ══════════════════════════════════════════════════════════════════════
      // SECTION 3 — SOLO DEV REALITY CHECK
      // ══════════════════════════════════════════════════════════════════════
      {
        id: 'gl-sec3', type: 'section',
        x: GL_R_X - 10, y: GL_IL_SEC_Y, width: GL_R_W + 22, height: GL_R_SEC_H,
        name: '🔧 Solo Dev Reality Check',
        color: '#f97316',
      },

      {
        id: 'gl-rt0', type: 'textblock',
        x: GL_R_X, y: GL_R_HEADER_Y, width: GL_R_W,
        text: 'Answer these before writing a line of code.',
        fontSize: 13, color: '#f97316', bold: true, italic: false, underline: false,
      },

      // Reality-check stickies — y positions computed by yStack, heights by stickyHeight
      { id: 'gl-r1', type: 'sticky', x: GL_R_X, y: glRYs[0], width: GL_R_W, height: stickyHeight(GL_R_TEXTS[0], GL_R_W, GL_R_FS), color: '#fef08a', fontSize: GL_R_FS, text: GL_R_TEXTS[0] },
      { id: 'gl-r2', type: 'sticky', x: GL_R_X, y: glRYs[1], width: GL_R_W, height: stickyHeight(GL_R_TEXTS[1], GL_R_W, GL_R_FS), color: '#fed7aa', fontSize: GL_R_FS, text: GL_R_TEXTS[1] },
      { id: 'gl-r3', type: 'sticky', x: GL_R_X, y: glRYs[2], width: GL_R_W, height: stickyHeight(GL_R_TEXTS[2], GL_R_W, GL_R_FS), color: '#bfdbfe', fontSize: GL_R_FS, text: GL_R_TEXTS[2] },
      { id: 'gl-r4', type: 'sticky', x: GL_R_X, y: glRYs[3], width: GL_R_W, height: stickyHeight(GL_R_TEXTS[3], GL_R_W, GL_R_FS), color: '#fecaca', fontSize: GL_R_FS, text: GL_R_TEXTS[3] },
      { id: 'gl-r5', type: 'sticky', x: GL_R_X, y: glRYs[4], width: GL_R_W, height: stickyHeight(GL_R_TEXTS[4], GL_R_W, GL_R_FS), color: '#bbf7d0', fontSize: GL_R_FS, text: GL_R_TEXTS[4] },
      { id: 'gl-r6', type: 'sticky', x: GL_R_X, y: glRYs[5], width: GL_R_W, height: stickyHeight(GL_R_TEXTS[5], GL_R_W, GL_R_FS), color: '#e2e8f0', fontSize: GL_R_FS, text: GL_R_TEXTS[5] },

      // ── Decorative stickers ────────────────────────────────────────────────
      // Fire = inner loop is on fire
      { id: 'gl-s1', type: 'sticker', src: '/stickers/sticker__0003_Layer-7_fire.png',        x: 603, y: GL_IL_SEC_Y + 44,  width: 72, height: 72, rotation: 10  },
      // Surprised = player input moment
      { id: 'gl-s2', type: 'sticker', src: '/stickers/sticker__0000_Layer-10_surprised.png',  x: 248, y: GL_IL_SEC_Y + 2,   width: 66, height: 66, rotation: 7   },
      // Happy = instant payoff feels good
      { id: 'gl-s3', type: 'sticker', src: '/stickers/sticker__0004_Layer-6_happy.png',       x: 600, y: GL_IL_ROW2_Y + 14, width: 62, height: 62, rotation: -8  },
      // Derpy = raised stakes / harder enemies
      { id: 'gl-s4', type: 'sticker', src: '/stickers/sticker__0001_Layer-9_derpy.png',       x: 36,  y: GL_OL_ROW3_Y + 10, width: 72, height: 72, rotation: -12 },
      // Sad = cut rule
      { id: 'gl-s5', type: 'sticker', src: '/stickers/sticker__0007_Layer-3_sad.png',         x: GL_R_X + GL_R_W + 4, y: glRYs[3] + 8, width: 58, height: 58, rotation: -9 },
      // Thumbs up = playtest metric
      { id: 'gl-s6', type: 'sticker', src: '/stickers/sticker__0006_thumbA green.png',        x: GL_R_X + GL_R_W + 4, y: glRYs[4] + 8, width: 58, height: 58, rotation: 8  },
    ],
  },
};

// ── Template 2: Level / Mission Flow ─────────────────────────────────────────
const levelFlow: Template = {
  id: 'level-flow',
  name: 'Level / Mission Flow',
  description: 'Vertical flow from spawn to reward',
  data: {
    boardTitle: 'Level / Mission Flow',
    nodes: [
      // ── 5 sticky notes flowing vertically ────────────────────────────────
      {
        id: 'lf-n1', type: 'sticky',
        x: 340, y: 40,
        width: 180, height: 80,
        text: 'Spawn / Start',
        color: '#34d399',
      },
      {
        id: 'lf-n2', type: 'sticky',
        x: 340, y: 200,
        width: 180, height: 80,
        text: 'Intro / Tutorial Beat',
        color: '#fbbf24',
      },
      {
        id: 'lf-n3', type: 'sticky',
        x: 340, y: 360,
        width: 180, height: 80,
        text: 'Main Challenge',
        color: '#fb923c',
      },
      {
        id: 'lf-n4', type: 'sticky',
        x: 340, y: 520,
        width: 180, height: 80,
        text: 'Boss / Climax',
        color: '#f87171',
      },
      {
        id: 'lf-n5', type: 'sticky',
        x: 340, y: 680,
        width: 180, height: 80,
        text: 'Reward / Exit',
        color: '#60a5fa',
      },
      // ── Decorative stickers ───────────────────────────────────────────────
      // Happy near Spawn/Start
      {
        id: 'lf-s1', type: 'sticker',
        src: '/stickers/sticker__0004_Layer-6_happy.png',
        x: 205, y: 52, width: 72, height: 72, rotation: -8,
      },
      // Derpy enemy near Main Challenge
      {
        id: 'lf-s2', type: 'sticker',
        src: '/stickers/sticker__0001_Layer-9_derpy.png',
        x: 578, y: 392, width: 82, height: 82, rotation: 11,
      },
      // Evil boss near Boss/Climax
      {
        id: 'lf-s3', type: 'sticker',
        src: '/stickers/sticker__0008_Layer-2_mad_evil.png',
        x: 205, y: 548, width: 85, height: 85, rotation: -12,
      },
      // Fire also near Boss/Climax
      {
        id: 'lf-s4', type: 'sticker',
        src: '/stickers/sticker__0003_Layer-7_fire.png',
        x: 578, y: 542, width: 78, height: 78, rotation: 9,
      },
      // Green thumbs up near Reward/Exit
      {
        id: 'lf-s5', type: 'sticker',
        src: '/stickers/sticker__0006_thumbA green.png',
        x: 578, y: 708, width: 80, height: 80, rotation: 6,
      },
      // ── 4 connectors flowing downward ─────────────────────────────────────
      {
        id: 'lf-c1', type: 'connector',
        fromNodeId: 'lf-n1', fromAnchor: 'bottom', fromX: 0, fromY: 0,
        toNodeId:   'lf-n2', toAnchor:   'top',    toX:   0, toY:   0,
        color: '#94a3b8', strokeWidth: 2,
        lineStyle: 'straight', strokeStyle: 'solid',
        arrowHeadStart: 'none', arrowHeadEnd: 'arrow',
      },
      {
        id: 'lf-c2', type: 'connector',
        fromNodeId: 'lf-n2', fromAnchor: 'bottom', fromX: 0, fromY: 0,
        toNodeId:   'lf-n3', toAnchor:   'top',    toX:   0, toY:   0,
        color: '#94a3b8', strokeWidth: 2,
        lineStyle: 'straight', strokeStyle: 'solid',
        arrowHeadStart: 'none', arrowHeadEnd: 'arrow',
      },
      {
        id: 'lf-c3', type: 'connector',
        fromNodeId: 'lf-n3', fromAnchor: 'bottom', fromX: 0, fromY: 0,
        toNodeId:   'lf-n4', toAnchor:   'top',    toX:   0, toY:   0,
        color: '#94a3b8', strokeWidth: 2,
        lineStyle: 'straight', strokeStyle: 'solid',
        arrowHeadStart: 'none', arrowHeadEnd: 'arrow',
      },
      {
        id: 'lf-c4', type: 'connector',
        fromNodeId: 'lf-n4', fromAnchor: 'bottom', fromX: 0, fromY: 0,
        toNodeId:   'lf-n5', toAnchor:   'top',    toX:   0, toY:   0,
        color: '#94a3b8', strokeWidth: 2,
        lineStyle: 'straight', strokeStyle: 'solid',
        arrowHeadStart: 'none', arrowHeadEnd: 'arrow',
      },
    ],
  },
};

// ── Template 3: Game Mechanic Design (War Room) ───────────────────────────────
const mechanicDesign: Template = {
  id: 'mechanic-design',
  name: 'Game Mechanic Design',
  description: 'War Room for designing a game mechanic — start here!',
  data: {
    boardTitle: 'Game Mechanic Design',
    nodes: [

      // ── Sticker Legend (top-left locked guide) ────────────────────────────
      {
        id: 'md2-legend-sec', type: 'section',
        x: 20, y: 20, width: 340, height: 365,
        name: 'Sticker Legend', color: '#64748b',
      },
      // Row 1: Fire
      { id: 'md2-l-s1', type: 'sticker', src: '/stickers/sticker__0003_Layer-7_fire.png',         x: 32, y: 82,  width: 40, height: 40, rotation: 0 },
      { id: 'md2-l-t1', type: 'textblock', x: 80, y: 85,  width: 265, text: 'Fire = The Hook. This is why the game is fun.', fontSize: 11, color: 'auto', bold: true,  italic: false, underline: false },
      // Row 2: Monster (derpy)
      { id: 'md2-l-s2', type: 'sticker', src: '/stickers/sticker__0001_Layer-9_derpy.png',        x: 32, y: 137, width: 40, height: 40, rotation: 0 },
      { id: 'md2-l-t2', type: 'textblock', x: 80, y: 140, width: 265, text: 'Monster = Technical Beast. Hard to code / buggy.', fontSize: 11, color: 'auto', bold: false, italic: false, underline: false },
      // Row 3: Thumbs Up
      { id: 'md2-l-s3', type: 'sticker', src: '/stickers/sticker__0006_thumbA green.png',         x: 32, y: 192, width: 40, height: 40, rotation: 0 },
      { id: 'md2-l-t3', type: 'textblock', x: 80, y: 195, width: 265, text: 'Thumbs Up = Functional. The code works.', fontSize: 11, color: 'auto', bold: false, italic: false, underline: false },
      // Row 4: Happy
      { id: 'md2-l-s4', type: 'sticker', src: '/stickers/sticker__0004_Layer-6_happy.png',        x: 32, y: 247, width: 40, height: 40, rotation: 0 },
      { id: 'md2-l-t4', type: 'textblock', x: 80, y: 250, width: 265, text: 'Happy = Polished. Art, sound, juice = done.', fontSize: 11, color: 'auto', bold: false, italic: false, underline: false },
      // Row 5: Sad
      { id: 'md2-l-s5', type: 'sticker', src: '/stickers/sticker__0007_Layer-3_sad.png',          x: 32, y: 302, width: 40, height: 40, rotation: 0 },
      { id: 'md2-l-t5', type: 'textblock', x: 80, y: 305, width: 265, text: 'Sad = Needs Help. Not fun or feels clunky.', fontSize: 11, color: 'auto', bold: false, italic: false, underline: false },

      // ── "Start Here" label ────────────────────────────────────────────────
      {
        id: 'md2-start-label', type: 'textblock',
        x: 490, y: 24, width: 370,
        text: '★  Start Here — example mechanic card below',
        fontSize: 12, color: '#f97316', bold: true, italic: false, underline: false,
      },

      // ── Central "Start Here" example card ────────────────────────────────
      {
        id: 'md2-center', type: 'sticky',
        x: 490, y: 48, width: 270, height: 200,
        color: '#fb923c',
        text: 'Dash Mechanic\n\nTrigger: Press Shift while moving.\nJuice: Blue trail + FOV kick.\nGotcha: Don\'t let player dash through walls.',
        fontSize: 13,
      },
      // 🔥 sticker (Core Hook)
      { id: 'md2-cs1', type: 'sticker', src: '/stickers/sticker__0003_Layer-7_fire.png',        x: 774, y: 52,  width: 52, height: 52, rotation: 12  },
      // 👍 sticker (Logic Done)
      { id: 'md2-cs2', type: 'sticker', src: '/stickers/sticker__0006_thumbA green.png',        x: 780, y: 116, width: 46, height: 46, rotation: -8  },

      // ── Dependency Example label ──────────────────────────────────────────
      {
        id: 'md2-dep-label', type: 'textblock',
        x: 490, y: 272, width: 420,
        text: '↓  Dependency Example — connect your own cards like this',
        fontSize: 11, color: '#94a3b8', bold: false, italic: true, underline: false,
      },

      // ── Card A: Stamina System ────────────────────────────────────────────
      {
        id: 'md2-stam', type: 'sticky',
        x: 490, y: 296, width: 175, height: 75,
        color: '#a78bfa',
        text: 'Stamina System',
        fontSize: 13, bold: true,
      },

      // ── Card B: Sprint / Dash ─────────────────────────────────────────────
      {
        id: 'md2-dash', type: 'sticky',
        x: 730, y: 296, width: 175, height: 75,
        color: '#fbbf24',
        text: 'Sprint / Dash',
        fontSize: 13, bold: true,
      },

      // ── Connector: Stamina System → Sprint / Dash ─────────────────────────
      {
        id: 'md2-conn', type: 'connector',
        fromNodeId: 'md2-stam', fromAnchor: 'right', fromX: 0, fromY: 0,
        toNodeId:   'md2-dash', toAnchor:   'left',  toX:   0, toY:   0,
        color: '#94a3b8', strokeWidth: 2,
        lineStyle: 'curved', strokeStyle: 'solid',
        arrowHeadStart: 'none', arrowHeadEnd: 'arrow',
      },

      // ── Zone 1: The Character (Green) ─────────────────────────────────────
      {
        id: 'md2-zone1', type: 'section',
        x: 20, y: 422, width: 555, height: 490,
        name: 'Zone 1: The Character — "How do I move?"',
        color: '#34d399',
      },
      {
        id: 'md2-zone1-hint', type: 'textblock',
        x: 130, y: 560, width: 340,
        text: 'Drop movement & control mechanics here.\ne.g. Jump, Crouch, Sprint, Wall-run…',
        fontSize: 12, color: '#94a3b8', bold: false, italic: true, underline: false,
      },

      // ── Zone 2: The World (Blue) ──────────────────────────────────────────
      {
        id: 'md2-zone2', type: 'section',
        x: 595, y: 422, width: 555, height: 490,
        name: 'Zone 2: The World — "How do I interact?"',
        color: '#60a5fa',
      },
      {
        id: 'md2-zone2-hint', type: 'textblock',
        x: 705, y: 560, width: 340,
        text: 'Drop world interaction mechanics here.\ne.g. Pick up, Push, Destroy, Talk to NPC…',
        fontSize: 12, color: '#94a3b8', bold: false, italic: true, underline: false,
      },

      // ── Zone 3: The Systems (Grey) ────────────────────────────────────────
      {
        id: 'md2-zone3', type: 'section',
        x: 1170, y: 422, width: 555, height: 490,
        name: 'Zone 3: The Systems — "Saving, UI, Menus."',
        color: '#94a3b8',
      },
      {
        id: 'md2-zone3-hint', type: 'textblock',
        x: 1280, y: 560, width: 340,
        text: 'Drop backend systems here.\ne.g. Save/Load, Inventory, Pause Menu…',
        fontSize: 12, color: '#94a3b8', bold: false, italic: true, underline: false,
      },
    ],
  },
};

// ── Template 4: Kanban Board ──────────────────────────────────────────────────
const COL_W = 250;
const COL_H = 680;
const COL_GAP = 30;
const STICKY_W = 210;
const STICKY_H = 80;

function colX(i: number) { return 60 + i * (COL_W + COL_GAP); }
function stickyX(i: number) { return colX(i) + 20; }
function stickyY(row: number) { return 85 + row * 95; }

const kanbanBoard: Template = {
  id: 'kanban-board',
  name: 'Kanban Board',
  description: '5-column kanban: To do, In progress, In review, Completed, Backlog',
  data: {
    boardTitle: 'Kanban Board',
    nodes: [
      // ── Sections (column backgrounds) ────────────────────────────────────
      { id: 'kb-sec-0', type: 'section', x: colX(0), y: 10, width: COL_W, height: COL_H, name: 'To do',       color: '#fbbf24' },
      { id: 'kb-sec-1', type: 'section', x: colX(1), y: 10, width: COL_W, height: COL_H, name: 'In progress', color: '#60a5fa' },
      { id: 'kb-sec-2', type: 'section', x: colX(2), y: 10, width: COL_W, height: COL_H, name: 'In review',   color: '#a78bfa' },
      { id: 'kb-sec-3', type: 'section', x: colX(3), y: 10, width: COL_W, height: COL_H, name: 'Completed',   color: '#34d399' },
      { id: 'kb-sec-4', type: 'section', x: colX(4), y: 10, width: COL_W, height: COL_H, name: 'Backlog',     color: '#94a3b8' },

      // ── To do (1 card) ────────────────────────────────────────────────────
      { id: 'kb-t0', type: 'sticky', x: stickyX(0), y: stickyY(0), width: STICKY_W, height: STICKY_H, text: 'Design onboarding flow', color: '#fde68a' },

      // ── In progress (3 cards) ─────────────────────────────────────────────
      { id: 'kb-p0', type: 'sticky', x: stickyX(1), y: stickyY(0), width: STICKY_W, height: STICKY_H, text: 'Implement auth flow', color: '#bfdbfe' },
      { id: 'kb-p1', type: 'sticky', x: stickyX(1), y: stickyY(1), width: STICKY_W, height: STICKY_H, text: 'Fix navigation bug', color: '#bfdbfe' },
      { id: 'kb-p2', type: 'sticky', x: stickyX(1), y: stickyY(2), width: STICKY_W, height: STICKY_H, text: 'Write unit tests', color: '#bfdbfe' },

      // ── In review (2 cards) ───────────────────────────────────────────────
      { id: 'kb-r0', type: 'sticky', x: stickyX(2), y: stickyY(0), width: STICKY_W, height: STICKY_H, text: 'Code review PR #42', color: '#ddd6fe' },
      { id: 'kb-r1', type: 'sticky', x: stickyX(2), y: stickyY(1), width: STICKY_W, height: STICKY_H, text: 'Test edge cases', color: '#ddd6fe' },

      // ── Completed (1 card) ────────────────────────────────────────────────
      { id: 'kb-d0', type: 'sticky', x: stickyX(3), y: stickyY(0), width: STICKY_W, height: STICKY_H, text: 'Set up CI/CD pipeline', color: '#bbf7d0' },

      // ── Backlog (3 cards) ─────────────────────────────────────────────────
      { id: 'kb-b0', type: 'sticky', x: stickyX(4), y: stickyY(0), width: STICKY_W, height: STICKY_H, text: 'Performance audit', color: '#e2e8f0' },
      { id: 'kb-b1', type: 'sticky', x: stickyX(4), y: stickyY(1), width: STICKY_W, height: STICKY_H, text: 'Add dark mode', color: '#e2e8f0' },
      { id: 'kb-b2', type: 'sticky', x: stickyX(4), y: stickyY(2), width: STICKY_W, height: STICKY_H, text: 'Update documentation', color: '#e2e8f0' },
    ],
  },
};

// ── Template 5: Timeline ──────────────────────────────────────────────────────
// Layout constants
const TL_LABEL_X   = 35;    // x for row labels
const TL_MONTH1_X  = 175;   // left edge of "This month"
const TL_MONTH2_X  = 595;   // left edge of "Next month"
const TL_MONTH3_X  = 1015;  // left edge of "The month after that"
const TL_MONTH_W   = 415;   // width of each month column
const TL_HDR_Y     = 60;    // y of month header shapes
const TL_HDR_H     = 44;    // height of month headers
const TL_BAR_H     = 44;    // height of project bars
const TL_ROW_GAP   = 65;    // vertical gap between rows
const TL_ROW1_Y    = 135;   // y of first row bars
const TL_MILE_X    = 1015;  // x of milestone vertical line

function tlRowY(row: number) { return TL_ROW1_Y + row * TL_ROW_GAP; }

const darkHdr = { fill: '#1e293b', stroke: '#1e293b', strokeWidth: 0, fontColor: '#ffffff', bold: true as const, textAlign: 'center' as const, fontSize: 13 };
const purpleBar = { fill: '#ddd6fe', stroke: '#c4b5fd', strokeWidth: 1 };
const blueBar   = { fill: '#bfdbfe', stroke: '#93c5fd', strokeWidth: 1 };
const yellowBar = { fill: '#fef08a', stroke: '#fde047', strokeWidth: 1 };

const timeline: Template = {
  id: 'timeline',
  name: 'Timeline',
  description: '3-month Gantt-style timeline with 4 people and a milestone',
  data: {
    boardTitle: 'Timeline',
    nodes: [
      // ── Outer section ─────────────────────────────────────────────────────
      {
        id: 'tl-sec', type: 'section',
        x: 25, y: 25, width: 1440, height: 440,
        name: 'Timeline', color: '#64748b',
      },

      // ── Month headers ──────────────────────────────────────────────────────
      { id: 'tl-m1', type: 'shape', kind: 'rect', x: TL_MONTH1_X, y: TL_HDR_Y, width: TL_MONTH_W, height: TL_HDR_H, text: 'This month', ...darkHdr },
      { id: 'tl-m2', type: 'shape', kind: 'rect', x: TL_MONTH2_X, y: TL_HDR_Y, width: TL_MONTH_W, height: TL_HDR_H, text: 'Next month', ...darkHdr },
      { id: 'tl-m3', type: 'shape', kind: 'rect', x: TL_MONTH3_X, y: TL_HDR_Y, width: TL_MONTH_W, height: TL_HDR_H, text: 'The month after that', ...darkHdr },

      // ── Row labels ─────────────────────────────────────────────────────────
      { id: 'tl-l1', type: 'textblock', x: TL_LABEL_X, y: tlRowY(0) + 11, width: 120, text: 'Person 1', fontSize: 13, color: '#1e293b', bold: true,  italic: false, underline: false },
      { id: 'tl-l2', type: 'textblock', x: TL_LABEL_X, y: tlRowY(1) + 11, width: 120, text: 'Person 2', fontSize: 13, color: '#1e293b', bold: true,  italic: false, underline: false },
      { id: 'tl-l3', type: 'textblock', x: TL_LABEL_X, y: tlRowY(2) + 11, width: 120, text: 'Person 3', fontSize: 13, color: '#1e293b', bold: true,  italic: false, underline: false },
      { id: 'tl-l4', type: 'textblock', x: TL_LABEL_X, y: tlRowY(3) + 11, width: 120, text: 'Person 4', fontSize: 13, color: '#1e293b', bold: true,  italic: false, underline: false },

      // ── Person 1 bars ──────────────────────────────────────────────────────
      // Project 1 (purple): first ~45% of "This month"
      { id: 'tl-p1-a', type: 'shape', kind: 'rect', x: TL_MONTH1_X + 5,   y: tlRowY(0), width: 190,   height: TL_BAR_H, text: 'Project 1', fontSize: 12, fontColor: '#3b0764', textAlign: 'left', ...purpleBar },
      // Project 2 (blue): rest of "This month" + all of "Next month"
      { id: 'tl-p1-b', type: 'shape', kind: 'rect', x: TL_MONTH1_X + 200, y: tlRowY(0), width: 620,   height: TL_BAR_H, text: 'Project 2', fontSize: 12, fontColor: '#1e3a5f', textAlign: 'left', ...blueBar },
      // Project 3 (yellow): all of "The month after that"
      { id: 'tl-p1-c', type: 'shape', kind: 'rect', x: TL_MONTH3_X + 5,   y: tlRowY(0), width: TL_MONTH_W - 10, height: TL_BAR_H, text: 'Project 3', fontSize: 12, fontColor: '#713f12', textAlign: 'left', ...yellowBar },

      // ── Person 2 bar ───────────────────────────────────────────────────────
      // Project 1 (purple): all of "This month" + ~55% of "Next month"
      { id: 'tl-p2-a', type: 'shape', kind: 'rect', x: TL_MONTH1_X + 5,   y: tlRowY(1), width: 475,   height: TL_BAR_H, text: 'Project 1', fontSize: 12, fontColor: '#3b0764', textAlign: 'left', ...purpleBar },

      // ── Person 3 bar ───────────────────────────────────────────────────────
      // Project 2 (blue): starts ~45% into "This month", through "Next month", ~55% of "The month after that"
      { id: 'tl-p3-a', type: 'shape', kind: 'rect', x: TL_MONTH1_X + 200, y: tlRowY(2), width: 840,   height: TL_BAR_H, text: 'Project 2', fontSize: 12, fontColor: '#1e3a5f', textAlign: 'left', ...blueBar },

      // ── Person 4 bar ───────────────────────────────────────────────────────
      // Project 3 (yellow): all of "Next month" + all of "The month after that"
      { id: 'tl-p4-a', type: 'shape', kind: 'rect', x: TL_MONTH2_X + 5,   y: tlRowY(3), width: TL_MONTH_W * 2 - 10, height: TL_BAR_H, text: 'Project 3', fontSize: 12, fontColor: '#713f12', textAlign: 'left', ...yellowBar },

      // ── Milestone label ────────────────────────────────────────────────────
      {
        id: 'tl-mile-label', type: 'shape', kind: 'rect',
        x: TL_MILE_X - 45, y: 28, width: 90, height: 26,
        fill: '#ef4444', stroke: '#ef4444', strokeWidth: 0,
        text: 'Milestone', fontSize: 11, fontColor: '#ffffff', bold: true, textAlign: 'center',
      },

      // ── Milestone vertical line ────────────────────────────────────────────
      {
        id: 'tl-mile-line', type: 'connector',
        fromNodeId: null, fromAnchor: null, fromX: TL_MILE_X, fromY: 55,
        toNodeId:   null, toAnchor:   null, toX:   TL_MILE_X, toY:   tlRowY(3) + TL_BAR_H + 10,
        color: '#ef4444', strokeWidth: 2,
        lineStyle: 'straight', strokeStyle: 'solid',
        arrowHeadStart: 'none', arrowHeadEnd: 'none',
      },
    ],
  },
};

// ── Template 6: Data Analysis Workflow ───────────────────────────────────────
// Vertical flowchart for junior data engineers & analysts.
// 8 sections top-to-bottom: question → sources → cleaning → tables → charts →
// story → actions → learnings.

// Layout spine
const DE_X  = 40;          // section left edge (canvas x)
const DE_W  = 700;         // section width
const DE_G  = 70;          // gap between sections
const DE_CX = DE_X + DE_W / 2;  // 390 — horizontal centre for arrows

// ── Sec 1: Business Question / Ticket ────────────────────────────────────────
const DE1_T_ASK  = 'Ask:\n\n[Business question in one sentence]';
const DE1_T_DL   = 'Deadline:\n\n[YYYY-MM-DD]';
const DE1_T_REQ  = 'Requester:\n\n[Name / team]';
const DE1_T_SUCC = 'Success =\n\n[What does done look like? A chart, a number, a delivered table?]';
const DE1_T_TICK = 'Ticket #:\n\n[Jira / link]';
const DE1_WA = 280; const DE1_WB = 150; const DE1_WC = 145;
const DE1_WD = 430; const DE1_WE = 155;

const DE1_Y   = 20;
const DE1_R1Y = DE1_Y + 55;
const DE1_R1H = stickyHeight(DE1_T_ASK, DE1_WA, 13);
const DE1_R2Y = DE1_R1Y + DE1_R1H + 12;
const DE1_H   = DE1_R2Y + stickyHeight(DE1_T_SUCC, DE1_WD, 13) - DE1_Y + 35;

// ── Sec 2: Data Landscape / Sources ──────────────────────────────────────────
const DE2_T1 = 'Source 1\n\nTable: schema.table_a\nOwner: [team] | Rows: [~N]\nKey cols: [id, date, status]';
const DE2_T2 = 'Source 2\n\nTable: schema.table_b\nOwner: [team] | Rows: [~N]\nKey cols: [id, amount]';
const DE2_T3 = 'Source 3\n\nTable: schema.table_c\nOwner: [team] | Rows: [~N]\nKey cols: [id, region]';
const DE2_T4 = 'Source 4\n\nTable: schema.table_d\nOwner: [team] | Rows: [~N]\nKey cols: [id, segment]';
const DE2_T5 = 'Join Notes\n\nJoin type: [LEFT / INNER]\nOn: [src1.id = src2.id]\nWatch: [many-to-many dups?]';
const DE2_SW = 290; const DE2_JW = 630;

const DE2_Y   = DE1_Y + DE1_H + DE_G;
const DE2_R1Y = DE2_Y + 55;
const DE2_R1H = stickyHeight(DE2_T1, DE2_SW, 12);
const DE2_R2Y = DE2_R1Y + DE2_R1H + 12;
const DE2_R2H = stickyHeight(DE2_T3, DE2_SW, 12);
const DE2_R3Y = DE2_R2Y + DE2_R2H + 12;
const DE2_H   = DE2_R3Y + stickyHeight(DE2_T5, DE2_JW, 12) - DE2_Y + 35;

// ── Sec 3: Exploration & Cleaning ────────────────────────────────────────────
const DE3_T1 = '% NULLs\n\nCol: [name] → [__]% null\nAction: [drop / fill with median / flag]';
const DE3_T2 = 'Duplicates\n\nCOUNT(*) vs COUNT(DISTINCT id)\nFound: [N dups]\nAction: dedupe on [cols]';
const DE3_T3 = 'Min / Max Checks\n\nCol: [name]\nMin: [__] | Max: [__]\nExpected: [range]\nOutliers: [flag > 3σ]';
const DE3_T4 = 'Row Counts\n\nBefore cleaning: [N]\nAfter cleaning: [N]\nDropped: [N rows — reason]';
const DE3_W = 315;

const DE3_Y   = DE2_Y + DE2_H + DE_G;
const DE3_R1Y = DE3_Y + 55;
const DE3_R1H = stickyHeight(DE3_T1, DE3_W, 12);
const DE3_R2Y = DE3_R1Y + DE3_R1H + 12;
const DE3_H   = DE3_R2Y + stickyHeight(DE3_T3, DE3_W, 12) - DE3_Y + 35;

// ── Sec 4: Core Tables – Source of Truth (large) ─────────────────────────────
const DE4_Y      = DE3_Y + DE3_H + DE_G;
const DE4_TBL_Y1 = DE4_Y + 55;
const DE4_TBL_H  = 32 + 28 * 3;   // header + 3 data rows = 116
const DE4_SEP_Y  = DE4_TBL_Y1 + DE4_TBL_H + 16;
const DE4_TBL_Y2 = DE4_SEP_Y + 28 + 16;
const DE4_H      = DE4_TBL_Y2 + DE4_TBL_H - DE4_Y + 50;

// ── Sec 5: Visuals / Key Charts ───────────────────────────────────────────────
const DE5_T1 = 'Bar Chart\n\nPaste screenshot\nor sketch here\n\nX: [category]\nY: [metric]';
const DE5_T2 = 'Line Chart\n\nPaste screenshot\nor sketch here\n\nX: [date]\nY: [trend]';
const DE5_T3 = 'Pie / Donut\n\nPaste screenshot\nor sketch here\n\n% by [category]';
const DE5_T4 = 'Scatter Plot\n\nPaste screenshot\nor sketch here\n\nX vs Y: [correlation?]';
const DE5_T5 = 'Key Number\n\n[BIG STAT HERE]\n\nvs last period:\n[+/- %]';
const DE5_W1 = 190; const DE5_W2 = 295;

const DE5_Y   = DE4_Y + DE4_H + DE_G;
const DE5_R1Y = DE5_Y + 55;
const DE5_R1H = stickyHeight(DE5_T1, DE5_W1, 12);
const DE5_R2Y = DE5_R1Y + DE5_R1H + 12;
const DE5_H   = DE5_R2Y + stickyHeight(DE5_T4, DE5_W2, 12) - DE5_Y + 35;

// ── Sec 6: Story / Insights ───────────────────────────────────────────────────
const DE6_T1 = 'Finding 1\n\n[Bold stat]\n\nSo what?\n[Why it matters to the business]';
const DE6_T2 = 'Finding 2\n\n[Bold stat]\n\nSo what?\n[Why it matters to the business]';
const DE6_T3 = 'Finding 3\n\n[Bold stat]\n\nSo what?\n[Why it matters to the business]';
const DE6_T4 = 'Caveat\n\n[Limitation: data quality, time range, missing segment]';
const DE6_T5 = 'Hypothesis\n\n[Root cause or next thing to test]';
const DE6_W1 = 190; const DE6_W2 = 295;

const DE6_Y   = DE5_Y + DE5_H + DE_G;
const DE6_R1Y = DE6_Y + 55;
const DE6_R1H = stickyHeight(DE6_T1, DE6_W1, 12);
const DE6_R2Y = DE6_R1Y + DE6_R1H + 12;
const DE6_H   = DE6_R2Y + stickyHeight(DE6_T4, DE6_W2, 12) - DE6_Y + 35;

// ── Sec 7: Next Actions / Handover ───────────────────────────────────────────
const DE7_T1 = 'Recommendations\n\n[ ] Action 1 — owner: [name]\n[ ] Action 2 — owner: [name]\n[ ] Action 3 — owner: [name]';
const DE7_T2 = 'Open Questions\n\n• [Unresolved question 1]\n• [Question for data owner]\n• [Question for stakeholder]';
const DE7_T3 = 'Notebook Link\n\n[Paste URL to Jupyter / Colab / dbt]\n\nGit branch: [feature/...]';
const DE7_T4 = 'Dashboard Idea\n\n[What would recurring monitoring look like?]\n\nTool: [Tableau / Looker / Metabase]';
const DE7_W = 315;

const DE7_Y   = DE6_Y + DE6_H + DE_G;
const DE7_R1Y = DE7_Y + 55;
const DE7_R1H = stickyHeight(DE7_T1, DE7_W, 12);
const DE7_R2Y = DE7_R1Y + DE7_R1H + 12;
const DE7_H   = DE7_R2Y + stickyHeight(DE7_T3, DE7_W, 12) - DE7_Y + 35;

// ── Sec 8: Learnings / Reflections ───────────────────────────────────────────
const DE8_T1 = 'What took longest?\n\n[Data discovery / cleaning / stakeholder alignment / viz]';
const DE8_T2 = 'Next skill to learn:\n\n[What gap showed up? Write it before you forget.]';
const DE8_W = 315;

const DE8_Y = DE7_Y + DE7_H + DE_G;
const DE8_H = stickyHeight(DE8_T1, DE8_W, 12) + 80;

// Arrow helper (section-to-section, absolute coords)
function deArr(id: string, y1: number, y2: number) {
  return {
    id, type: 'connector' as const,
    fromNodeId: null, fromAnchor: null, fromX: DE_CX, fromY: y1,
    toNodeId: null, toAnchor: null, toX: DE_CX, toY: y2,
    color: '#94a3b8', strokeWidth: 2,
    lineStyle: 'straight' as const, strokeStyle: 'solid' as const,
    arrowHeadStart: 'none' as const, arrowHeadEnd: 'arrow' as const,
  };
}

const dataEngineerFlow: Template = {
  id: 'data-engineer-flow',
  name: 'Data Analysis Workflow',
  description: 'Junior data engineer / analyst canvas: question → sources → cleaning → tables → charts → story → actions',
  data: {
    boardTitle: 'Data Analysis Workflow',
    nodes: [

      // ════════════════════════════════════════════════
      // SECTION 1 — Business Question / Ticket
      // ════════════════════════════════════════════════
      {
        id: 'de-sec1', type: 'section',
        x: DE_X, y: DE1_Y, width: DE_W, height: DE1_H,
        name: '1 · Business Question / Ticket',
        color: '#f59e0b',
      },

      // Row 1: Ask | Deadline | Requester
      { id: 'de1-ask',  type: 'sticky', x: 60,  y: DE1_R1Y, width: DE1_WA, height: stickyHeight(DE1_T_ASK,  DE1_WA, 13), color: '#fef08a', fontSize: 13, text: DE1_T_ASK  },
      { id: 'de1-dl',   type: 'sticky', x: 350, y: DE1_R1Y, width: DE1_WB, height: stickyHeight(DE1_T_DL,   DE1_WB, 13), color: '#fef08a', fontSize: 13, text: DE1_T_DL   },
      { id: 'de1-req',  type: 'sticky', x: 510, y: DE1_R1Y, width: DE1_WC, height: stickyHeight(DE1_T_REQ,  DE1_WC, 13), color: '#fef08a', fontSize: 13, text: DE1_T_REQ  },
      // Row 2: Success = | Ticket #
      { id: 'de1-succ', type: 'sticky', x: 60,  y: DE1_R2Y, width: DE1_WD, height: stickyHeight(DE1_T_SUCC, DE1_WD, 13), color: '#fef08a', fontSize: 13, text: DE1_T_SUCC },
      { id: 'de1-tick', type: 'sticky', x: 500, y: DE1_R2Y, width: DE1_WE, height: stickyHeight(DE1_T_TICK, DE1_WE, 13), color: '#fef08a', fontSize: 13, text: DE1_T_TICK },

      deArr('de-arr1', DE1_Y + DE1_H, DE2_Y),

      // ════════════════════════════════════════════════
      // SECTION 2 — Data Landscape / Sources
      // ════════════════════════════════════════════════
      {
        id: 'de-sec2', type: 'section',
        x: DE_X, y: DE2_Y, width: DE_W, height: DE2_H,
        name: '2 · Data Landscape / Sources',
        color: '#f97316',
      },

      // Row 1: Source 1 | Source 2
      { id: 'de2-s1', type: 'sticky', x: 60,  y: DE2_R1Y, width: DE2_SW, height: stickyHeight(DE2_T1, DE2_SW, 12), color: '#fed7aa', fontSize: 12, text: DE2_T1 },
      { id: 'de2-s2', type: 'sticky', x: 360, y: DE2_R1Y, width: DE2_SW, height: stickyHeight(DE2_T2, DE2_SW, 12), color: '#fed7aa', fontSize: 12, text: DE2_T2 },
      // Row 2: Source 3 | Source 4
      { id: 'de2-s3', type: 'sticky', x: 60,  y: DE2_R2Y, width: DE2_SW, height: stickyHeight(DE2_T3, DE2_SW, 12), color: '#fed7aa', fontSize: 12, text: DE2_T3 },
      { id: 'de2-s4', type: 'sticky', x: 360, y: DE2_R2Y, width: DE2_SW, height: stickyHeight(DE2_T4, DE2_SW, 12), color: '#fed7aa', fontSize: 12, text: DE2_T4 },
      // Row 3: Join Notes (full width)
      { id: 'de2-jn',  type: 'sticky', x: 60,  y: DE2_R3Y, width: DE2_JW, height: stickyHeight(DE2_T5, DE2_JW, 12), color: '#ffedd5', fontSize: 12, text: DE2_T5 },

      // Source arrows: row1 cross-link, row2 cross-link, rows→join
      { id: 'de2-c1', type: 'connector', fromNodeId: 'de2-s1', fromAnchor: 'right',  fromX: 0, fromY: 0, toNodeId: 'de2-s2', toAnchor: 'left',  toX: 0, toY: 0, color: '#f97316', strokeWidth: 2, lineStyle: 'straight',  strokeStyle: 'solid',  arrowHeadStart: 'none', arrowHeadEnd: 'arrow' },
      { id: 'de2-c2', type: 'connector', fromNodeId: 'de2-s3', fromAnchor: 'right',  fromX: 0, fromY: 0, toNodeId: 'de2-s4', toAnchor: 'left',  toX: 0, toY: 0, color: '#f97316', strokeWidth: 2, lineStyle: 'straight',  strokeStyle: 'solid',  arrowHeadStart: 'none', arrowHeadEnd: 'arrow' },
      { id: 'de2-c3', type: 'connector', fromNodeId: 'de2-s2', fromAnchor: 'bottom', fromX: 0, fromY: 0, toNodeId: 'de2-jn', toAnchor: 'top',   toX: 0, toY: 0, color: '#fb923c', strokeWidth: 1, lineStyle: 'curved',   strokeStyle: 'dashed', arrowHeadStart: 'none', arrowHeadEnd: 'arrow' },
      { id: 'de2-c4', type: 'connector', fromNodeId: 'de2-s4', fromAnchor: 'bottom', fromX: 0, fromY: 0, toNodeId: 'de2-jn', toAnchor: 'top',   toX: 0, toY: 0, color: '#fb923c', strokeWidth: 1, lineStyle: 'curved',   strokeStyle: 'dashed', arrowHeadStart: 'none', arrowHeadEnd: 'arrow' },

      deArr('de-arr2', DE2_Y + DE2_H, DE3_Y),

      // ════════════════════════════════════════════════
      // SECTION 3 — Exploration & Cleaning
      // ════════════════════════════════════════════════
      {
        id: 'de-sec3', type: 'section',
        x: DE_X, y: DE3_Y, width: DE_W, height: DE3_H,
        name: '3 · Exploration & Cleaning',
        color: '#3b82f6',
      },

      // Row 1: % NULLs | Duplicates
      { id: 'de3-nl', type: 'sticky', x: 60,  y: DE3_R1Y, width: DE3_W, height: stickyHeight(DE3_T1, DE3_W, 12), color: '#bfdbfe', fontSize: 12, text: DE3_T1 },
      { id: 'de3-du', type: 'sticky', x: 385, y: DE3_R1Y, width: DE3_W, height: stickyHeight(DE3_T2, DE3_W, 12), color: '#bfdbfe', fontSize: 12, text: DE3_T2 },
      // Row 2: Min/Max | Row Counts
      { id: 'de3-mm', type: 'sticky', x: 60,  y: DE3_R2Y, width: DE3_W, height: stickyHeight(DE3_T3, DE3_W, 12), color: '#bfdbfe', fontSize: 12, text: DE3_T3 },
      { id: 'de3-rc', type: 'sticky', x: 385, y: DE3_R2Y, width: DE3_W, height: stickyHeight(DE3_T4, DE3_W, 12), color: '#bfdbfe', fontSize: 12, text: DE3_T4 },

      deArr('de-arr3', DE3_Y + DE3_H, DE4_Y),

      // ════════════════════════════════════════════════
      // SECTION 4 — Core Tables – Source of Truth (tall)
      // ════════════════════════════════════════════════
      {
        id: 'de-sec4', type: 'section',
        x: DE_X, y: DE4_Y, width: DE_W, height: DE4_H,
        name: '4 · Core Tables — Source of Truth',
        color: '#ea580c',
      },

      // Sub-header above tables
      {
        id: 'de4-sub', type: 'textblock',
        x: 60, y: DE4_TBL_Y1 - 22, width: 630,
        text: 'Summary pivots / cleaned aggregates first — paste or build your cleaned master table below',
        fontSize: 11, color: '#ea580c', bold: true, italic: false, underline: false,
      },

      // Table 1: orders_clean
      {
        id: 'de4-tbl1', type: 'table',
        x: 60, y: DE4_TBL_Y1,
        colWidths: [95, 95, 80, 90],
        rowHeights: [32, 28, 28, 28],
        cells: [
          ['order_id', 'customer_id', 'amount', 'status'],
          ['1001', 'C_042', '124.50', 'completed'],
          ['1002', 'C_019', '87.00', 'pending'],
          ['1003', 'C_007', '210.00', 'completed'],
        ],
        headerRow: true, fill: '#ffffff', headerFill: '#1e293b',
        stroke: '#cbd5e1', fontSize: 11,
      },
      { id: 'de4-lbl1', type: 'textblock', x: 60, y: DE4_TBL_Y1 + DE4_TBL_H + 4, width: 360, text: 'orders_clean', fontSize: 11, color: '#64748b', bold: true, italic: false, underline: false },

      // Table 2: customers_dim
      {
        id: 'de4-tbl2', type: 'table',
        x: 400, y: DE4_TBL_Y1,
        colWidths: [95, 75, 70, 85],
        rowHeights: [32, 28, 28, 28],
        cells: [
          ['customer_id', 'region', 'tier', 'churn_risk'],
          ['C_042', 'West', 'Gold', '0.12'],
          ['C_019', 'East', 'Silver', '0.45'],
          ['C_007', 'South', 'Bronze', '0.71'],
        ],
        headerRow: true, fill: '#ffffff', headerFill: '#1e293b',
        stroke: '#cbd5e1', fontSize: 11,
      },
      { id: 'de4-lbl2', type: 'textblock', x: 400, y: DE4_TBL_Y1 + DE4_TBL_H + 4, width: 340, text: 'customers_dim', fontSize: 11, color: '#64748b', bold: true, italic: false, underline: false },

      // Separator hint
      {
        id: 'de4-sep', type: 'textblock',
        x: 60, y: DE4_SEP_Y + 4, width: 630,
        text: '↓  Cleaned master / aggregate table (build this last — this is the source of truth)',
        fontSize: 11, color: '#ea580c', bold: true, italic: false, underline: false,
      },

      // Table 3: weekly_summary (aggregate / source of truth)
      {
        id: 'de4-tbl3', type: 'table',
        x: 60, y: DE4_TBL_Y2,
        colWidths: [105, 80, 110, 100],
        rowHeights: [32, 28, 28, 28],
        cells: [
          ['week_start', 'region', 'total_orders', 'revenue'],
          ['2024-01-01', 'West', '142', '17,580'],
          ['2024-01-01', 'East', '98', '11,270'],
          ['[add yours]', '[...]', '[...]', '[...]'],
        ],
        headerRow: true, fill: '#ffffff', headerFill: '#ea580c',
        stroke: '#fed7aa', fontSize: 11,
      },
      { id: 'de4-lbl3', type: 'textblock', x: 60, y: DE4_TBL_Y2 + DE4_TBL_H + 4, width: 440, text: 'weekly_summary  ← source of truth', fontSize: 11, color: '#64748b', bold: true, italic: false, underline: false },

      // Arrows: raw tables → aggregate
      { id: 'de4-c1', type: 'connector', fromNodeId: 'de4-tbl1', fromAnchor: 'bottom', fromX: 0, fromY: 0, toNodeId: 'de4-tbl3', toAnchor: 'top', toX: 0, toY: 0, color: '#ea580c', strokeWidth: 1, lineStyle: 'curved', strokeStyle: 'dashed', arrowHeadStart: 'none', arrowHeadEnd: 'arrow' },
      { id: 'de4-c2', type: 'connector', fromNodeId: 'de4-tbl2', fromAnchor: 'bottom', fromX: 0, fromY: 0, toNodeId: 'de4-tbl3', toAnchor: 'top', toX: 0, toY: 0, color: '#ea580c', strokeWidth: 1, lineStyle: 'curved', strokeStyle: 'dashed', arrowHeadStart: 'none', arrowHeadEnd: 'arrow' },

      deArr('de-arr4', DE4_Y + DE4_H, DE5_Y),

      // ════════════════════════════════════════════════
      // SECTION 5 — Visuals / Key Charts
      // ════════════════════════════════════════════════
      {
        id: 'de-sec5', type: 'section',
        x: DE_X, y: DE5_Y, width: DE_W, height: DE5_H,
        name: '5 · Visuals / Key Charts',
        color: '#16a34a',
      },

      // Row 1: Bar | Line | Pie  (3 × 190, gap 10)
      { id: 'de5-bar',  type: 'sticky', x: 60,  y: DE5_R1Y, width: DE5_W1, height: stickyHeight(DE5_T1, DE5_W1, 12), color: '#bbf7d0', fontSize: 12, text: DE5_T1 },
      { id: 'de5-line', type: 'sticky', x: 260, y: DE5_R1Y, width: DE5_W1, height: stickyHeight(DE5_T2, DE5_W1, 12), color: '#bbf7d0', fontSize: 12, text: DE5_T2 },
      { id: 'de5-pie',  type: 'sticky', x: 460, y: DE5_R1Y, width: DE5_W1, height: stickyHeight(DE5_T3, DE5_W1, 12), color: '#bbf7d0', fontSize: 12, text: DE5_T3 },
      // Row 2: Scatter | Key Number  (2 × 295, gap 10)
      { id: 'de5-scat', type: 'sticky', x: 60,  y: DE5_R2Y, width: DE5_W2, height: stickyHeight(DE5_T4, DE5_W2, 12), color: '#dcfce7', fontSize: 12, text: DE5_T4 },
      { id: 'de5-num',  type: 'sticky', x: 365, y: DE5_R2Y, width: DE5_W2, height: stickyHeight(DE5_T5, DE5_W2, 12), color: '#dcfce7', fontSize: 12, text: DE5_T5 },

      deArr('de-arr5', DE5_Y + DE5_H, DE6_Y),

      // ════════════════════════════════════════════════
      // SECTION 6 — Story / Insights
      // ════════════════════════════════════════════════
      {
        id: 'de-sec6', type: 'section',
        x: DE_X, y: DE6_Y, width: DE_W, height: DE6_H,
        name: '6 · Story / Insights',
        color: '#9333ea',
      },

      // Row 1: Findings 1–3  (3 × 190, gap 10)
      { id: 'de6-f1', type: 'sticky', x: 60,  y: DE6_R1Y, width: DE6_W1, height: stickyHeight(DE6_T1, DE6_W1, 12), color: '#e9d5ff', fontSize: 12, text: DE6_T1 },
      { id: 'de6-f2', type: 'sticky', x: 260, y: DE6_R1Y, width: DE6_W1, height: stickyHeight(DE6_T2, DE6_W1, 12), color: '#e9d5ff', fontSize: 12, text: DE6_T2 },
      { id: 'de6-f3', type: 'sticky', x: 460, y: DE6_R1Y, width: DE6_W1, height: stickyHeight(DE6_T3, DE6_W1, 12), color: '#e9d5ff', fontSize: 12, text: DE6_T3 },
      // Row 2: Caveat | Hypothesis  (2 × 295, gap 10)
      { id: 'de6-cav', type: 'sticky', x: 60,  y: DE6_R2Y, width: DE6_W2, height: stickyHeight(DE6_T4, DE6_W2, 12), color: '#f3e8ff', fontSize: 12, text: DE6_T4 },
      { id: 'de6-hyp', type: 'sticky', x: 365, y: DE6_R2Y, width: DE6_W2, height: stickyHeight(DE6_T5, DE6_W2, 12), color: '#f3e8ff', fontSize: 12, text: DE6_T5 },

      deArr('de-arr6', DE6_Y + DE6_H, DE7_Y),

      // ════════════════════════════════════════════════
      // SECTION 7 — Next Actions / Handover
      // ════════════════════════════════════════════════
      {
        id: 'de-sec7', type: 'section',
        x: DE_X, y: DE7_Y, width: DE_W, height: DE7_H,
        name: '7 · Next Actions / Handover',
        color: '#64748b',
      },

      // Row 1: Recommendations | Open Questions
      { id: 'de7-rec', type: 'sticky', x: 60,  y: DE7_R1Y, width: DE7_W, height: stickyHeight(DE7_T1, DE7_W, 12), color: '#f1f5f9', fontSize: 12, text: DE7_T1 },
      { id: 'de7-oq',  type: 'sticky', x: 385, y: DE7_R1Y, width: DE7_W, height: stickyHeight(DE7_T2, DE7_W, 12), color: '#f1f5f9', fontSize: 12, text: DE7_T2 },
      // Row 2: Notebook Link | Dashboard Idea
      { id: 'de7-nb',  type: 'sticky', x: 60,  y: DE7_R2Y, width: DE7_W, height: stickyHeight(DE7_T3, DE7_W, 12), color: '#e2e8f0', fontSize: 12, text: DE7_T3 },
      { id: 'de7-db',  type: 'sticky', x: 385, y: DE7_R2Y, width: DE7_W, height: stickyHeight(DE7_T4, DE7_W, 12), color: '#e2e8f0', fontSize: 12, text: DE7_T4 },

      deArr('de-arr7', DE7_Y + DE7_H, DE8_Y),

      // ════════════════════════════════════════════════
      // SECTION 8 — Learnings / Reflections (small)
      // ════════════════════════════════════════════════
      {
        id: 'de-sec8', type: 'section',
        x: DE_X, y: DE8_Y, width: DE_W, height: DE8_H,
        name: '8 · Learnings / Reflections',
        color: '#94a3b8',
      },

      { id: 'de8-t1', type: 'sticky', x: 60,  y: DE8_Y + 55, width: DE8_W, height: stickyHeight(DE8_T1, DE8_W, 12), color: '#e2e8f0', fontSize: 12, text: DE8_T1 },
      { id: 'de8-t2', type: 'sticky', x: 385, y: DE8_Y + 55, width: DE8_W, height: stickyHeight(DE8_T2, DE8_W, 12), color: '#e2e8f0', fontSize: 12, text: DE8_T2 },
    ],
  },
};

export const TEMPLATES: Template[] = [gameplayLoop, levelFlow, mechanicDesign, kanbanBoard, timeline, dataEngineerFlow];
