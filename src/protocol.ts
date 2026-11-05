import type { Board, Move } from './model';

export type Difficulty = 'Beginner' | 'Intermediate' | 'Advanced' | 'Expert';
export type Preset = { id: string; name: string; difficulty: Difficulty; optimalMoves: number; board: Board; seed?: number };
export type Algorithm = 'bfs' | 'astar';
export type FrameStatus = 'ready' | 'running' | 'solved' | 'unsolvable' | 'limited';

export type TreeNode = {
  id: number;
  parentId: number | null;
  move: Move | null;
  depth: number;
  h: number | null;
  status: 'frontier' | 'expanded' | 'active' | 'goal';
};

export type SearchTrace = {
  nodes: TreeNode[];
  activeId: number;
  activePath: TreeNode[];
  omittedAncestors: number;
  discovered: number;
};

export type Frame = {
  status: FrameStatus;
  board: Board;
  frontier: number;
  expanded: number;
  peakFrontier: number;
  runtimeMs: number;
  g: number | null;
  h: number | null;
  f: number | null;
  blockers: string[];
  moves: Move[] | null;
  tree: SearchTrace;
};

export type FramePair = { bfs: Frame; astar: Frame };
