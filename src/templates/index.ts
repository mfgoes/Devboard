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

// ── Template 3: Game Mechanic Design ─────────────────────────────────────────
const mechanicDesign: Template = {
  id: 'mechanic-design',
  name: 'Game Mechanic Design',
  description: 'Hub-and-spoke breakdown of a single mechanic',
  data: {
    boardTitle: 'Game Mechanic Design',
    nodes: [
      // ── Central shape ─────────────────────────────────────────────────────
      {
        id: 'md-center', type: 'shape',
        kind: 'rect',
        x: 260, y: 200,
        width: 200, height: 80,
        fill: '#6366f1', stroke: '#818cf8', strokeWidth: 2,
        text: 'Mechanic Name',
        fontSize: 14, fontColor: '#ffffff',
        bold: true, textAlign: 'center',
      },
      // ── 4 sticky notes around the center ─────────────────────────────────
      {
        id: 'md-n1', type: 'sticky',
        x: 40, y: 60,
        width: 160, height: 80,
        text: 'Core Loop',
        color: '#fbbf24',
      },
      {
        id: 'md-n2', type: 'sticky',
        x: 520, y: 60,
        width: 160, height: 80,
        text: 'Player Goal',
        color: '#34d399',
      },
      {
        id: 'md-n3', type: 'sticky',
        x: 40, y: 360,
        width: 160, height: 80,
        text: 'Obstacles / Risks',
        color: '#f87171',
      },
      {
        id: 'md-n4', type: 'sticky',
        x: 520, y: 360,
        width: 160, height: 80,
        text: 'Rewards / Feedback',
        color: '#60a5fa',
      },
      // ── 4 connectors from center to each spoke ────────────────────────────
      {
        id: 'md-c1', type: 'connector',
        fromNodeId: 'md-center', fromAnchor: null, fromX: 0, fromY: 0,
        toNodeId:   'md-n1',     toAnchor:   null, toX:   0, toY:   0,
        color: '#94a3b8', strokeWidth: 2,
        lineStyle: 'curved', strokeStyle: 'solid',
        arrowHeadStart: 'none', arrowHeadEnd: 'none',
      },
      {
        id: 'md-c2', type: 'connector',
        fromNodeId: 'md-center', fromAnchor: null, fromX: 0, fromY: 0,
        toNodeId:   'md-n2',     toAnchor:   null, toX:   0, toY:   0,
        color: '#94a3b8', strokeWidth: 2,
        lineStyle: 'curved', strokeStyle: 'solid',
        arrowHeadStart: 'none', arrowHeadEnd: 'none',
      },
      {
        id: 'md-c3', type: 'connector',
        fromNodeId: 'md-center', fromAnchor: null, fromX: 0, fromY: 0,
        toNodeId:   'md-n3',     toAnchor:   null, toX:   0, toY:   0,
        color: '#94a3b8', strokeWidth: 2,
        lineStyle: 'curved', strokeStyle: 'solid',
        arrowHeadStart: 'none', arrowHeadEnd: 'none',
      },
      {
        id: 'md-c4', type: 'connector',
        fromNodeId: 'md-center', fromAnchor: null, fromX: 0, fromY: 0,
        toNodeId:   'md-n4',     toAnchor:   null, toX:   0, toY:   0,
        color: '#94a3b8', strokeWidth: 2,
        lineStyle: 'curved', strokeStyle: 'solid',
        arrowHeadStart: 'none', arrowHeadEnd: 'none',
      },
    ],
  },
};

export const TEMPLATES: Template[] = [gameplayLoop, levelFlow, mechanicDesign];
