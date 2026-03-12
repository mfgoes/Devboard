import { BoardData } from '../types';

export interface Template {
  id: string;
  name: string;
  description: string;
  data: BoardData;
}

// ── Template 1: Core Gameplay Loop ───────────────────────────────────────────
const gameplayLoop: Template = {
  id: 'gameplay-loop',
  name: 'Core Gameplay Loop',
  description: 'Circular player → system → reward flow',
  data: {
    boardTitle: 'Core Gameplay Loop',
    nodes: [
      // ── 5 sticky notes in a pentagon ────────────────────────────────────
      {
        id: 'gl-n1', type: 'sticky',
        x: 500, y: 40,
        width: 160, height: 80,
        text: 'Player Action',
        color: '#fbbf24',
      },
      {
        id: 'gl-n2', type: 'sticky',
        x: 790, y: 210,
        width: 160, height: 80,
        text: 'Game System Response',
        color: '#fb923c',
      },
      {
        id: 'gl-n3', type: 'sticky',
        x: 680, y: 480,
        width: 160, height: 80,
        text: 'Reward / Feedback',
        color: '#34d399',
      },
      {
        id: 'gl-n4', type: 'sticky',
        x: 220, y: 480,
        width: 160, height: 80,
        text: 'Progression / Upgrade',
        color: '#60a5fa',
      },
      {
        id: 'gl-n5', type: 'sticky',
        x: 110, y: 210,
        width: 160, height: 80,
        text: 'New Challenge',
        color: '#a78bfa',
      },
      // ── Decorative stickers ───────────────────────────────────────────────
      // Fire + happy near Reward/Feedback
      {
        id: 'gl-s1', type: 'sticker',
        src: '/stickers/sticker__0003_Layer-7_fire.png',
        x: 890, y: 510, width: 80, height: 80, rotation: 10,
      },
      {
        id: 'gl-s2', type: 'sticker',
        src: '/stickers/sticker__0004_Layer-6_happy.png',
        x: 875, y: 595, width: 70, height: 70, rotation: -6,
      },
      // Derpy enemy near New Challenge
      {
        id: 'gl-s3', type: 'sticker',
        src: '/stickers/sticker__0001_Layer-9_derpy.png',
        x: 68, y: 178, width: 85, height: 85, rotation: -13,
      },
      // Surprised near Player Action (top)
      {
        id: 'gl-s4', type: 'sticker',
        src: '/stickers/sticker__0000_Layer-10_surprised.png',
        x: 548, y: -18, width: 72, height: 72, rotation: 7,
      },
      // Green thumbs up near Progression/Upgrade
      {
        id: 'gl-s5', type: 'sticker',
        src: '/stickers/sticker__0006_thumbA green.png',
        x: 185, y: 595, width: 72, height: 72, rotation: -8,
      },
      // ── 5 connectors forming the loop ────────────────────────────────────
      {
        id: 'gl-c1', type: 'connector',
        fromNodeId: 'gl-n1', fromAnchor: null, fromX: 0, fromY: 0,
        toNodeId:   'gl-n2', toAnchor:   null, toX:   0, toY:   0,
        color: '#94a3b8', strokeWidth: 2,
        lineStyle: 'curved', strokeStyle: 'solid',
        arrowHeadStart: 'none', arrowHeadEnd: 'arrow',
      },
      {
        id: 'gl-c2', type: 'connector',
        fromNodeId: 'gl-n2', fromAnchor: null, fromX: 0, fromY: 0,
        toNodeId:   'gl-n3', toAnchor:   null, toX:   0, toY:   0,
        color: '#94a3b8', strokeWidth: 2,
        lineStyle: 'curved', strokeStyle: 'solid',
        arrowHeadStart: 'none', arrowHeadEnd: 'arrow',
      },
      {
        id: 'gl-c3', type: 'connector',
        fromNodeId: 'gl-n3', fromAnchor: null, fromX: 0, fromY: 0,
        toNodeId:   'gl-n4', toAnchor:   null, toX:   0, toY:   0,
        color: '#94a3b8', strokeWidth: 2,
        lineStyle: 'curved', strokeStyle: 'solid',
        arrowHeadStart: 'none', arrowHeadEnd: 'arrow',
      },
      {
        id: 'gl-c4', type: 'connector',
        fromNodeId: 'gl-n4', fromAnchor: null, fromX: 0, fromY: 0,
        toNodeId:   'gl-n5', toAnchor:   null, toX:   0, toY:   0,
        color: '#94a3b8', strokeWidth: 2,
        lineStyle: 'curved', strokeStyle: 'solid',
        arrowHeadStart: 'none', arrowHeadEnd: 'arrow',
      },
      {
        id: 'gl-c5', type: 'connector',
        fromNodeId: 'gl-n5', fromAnchor: null, fromX: 0, fromY: 0,
        toNodeId:   'gl-n1', toAnchor:   null, toX:   0, toY:   0,
        color: '#94a3b8', strokeWidth: 2,
        lineStyle: 'curved', strokeStyle: 'solid',
        arrowHeadStart: 'none', arrowHeadEnd: 'arrow',
      },
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
      { id: 'md2-l-t1', type: 'textblock', x: 80, y: 85,  width: 265, text: 'Fire = The Hook. This is why the game is fun.', fontSize: 11, color: '#1e293b', bold: true,  italic: false, underline: false },
      // Row 2: Monster (derpy)
      { id: 'md2-l-s2', type: 'sticker', src: '/stickers/sticker__0001_Layer-9_derpy.png',        x: 32, y: 137, width: 40, height: 40, rotation: 0 },
      { id: 'md2-l-t2', type: 'textblock', x: 80, y: 140, width: 265, text: 'Monster = Technical Beast. Hard to code / buggy.', fontSize: 11, color: '#1e293b', bold: false, italic: false, underline: false },
      // Row 3: Thumbs Up
      { id: 'md2-l-s3', type: 'sticker', src: '/stickers/sticker__0006_thumbA green.png',         x: 32, y: 192, width: 40, height: 40, rotation: 0 },
      { id: 'md2-l-t3', type: 'textblock', x: 80, y: 195, width: 265, text: 'Thumbs Up = Functional. The code works.', fontSize: 11, color: '#1e293b', bold: false, italic: false, underline: false },
      // Row 4: Happy
      { id: 'md2-l-s4', type: 'sticker', src: '/stickers/sticker__0004_Layer-6_happy.png',        x: 32, y: 247, width: 40, height: 40, rotation: 0 },
      { id: 'md2-l-t4', type: 'textblock', x: 80, y: 250, width: 265, text: 'Happy = Polished. Art, sound, juice = done.', fontSize: 11, color: '#1e293b', bold: false, italic: false, underline: false },
      // Row 5: Sad
      { id: 'md2-l-s5', type: 'sticker', src: '/stickers/sticker__0007_Layer-3_sad.png',          x: 32, y: 302, width: 40, height: 40, rotation: 0 },
      { id: 'md2-l-t5', type: 'textblock', x: 80, y: 305, width: 265, text: 'Sad = Needs Help. Not fun or feels clunky.', fontSize: 11, color: '#1e293b', bold: false, italic: false, underline: false },

      // ── "Start Here" label ────────────────────────────────────────────────
      {
        id: 'md2-start-label', type: 'textblock',
        x: 490, y: 24, width: 280,
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

export const TEMPLATES: Template[] = [gameplayLoop, levelFlow, mechanicDesign, kanbanBoard, timeline];
