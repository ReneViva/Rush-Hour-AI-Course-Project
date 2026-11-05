import type { SearchTrace, TreeNode } from './protocol';

export const CARD_WIDTH = 126;
export const CARD_HEIGHT = 78;

const PADDING = 24;
const SIBLING_GAP = 24;
const LEVEL_GAP = 54;
const TOP_STUB_SPACE = 30;

type LayoutNode = {
  node: TreeNode;
  x: number;
  y: number;
  onPath: boolean;
  missingParent: boolean;
};

type LayoutEdge = { from: number; to: number; path: string; onPath: boolean };

type TreeLayout = { nodes: LayoutNode[]; edges: LayoutEdge[]; width: number; height: number };

type Branch = {
  node: TreeNode;
  parent: Branch | null;
  children: Branch[];
  width: number;
  childrenWidth: number;
};

function totalWidth(branches: Branch[]) {
  return branches.reduce((width, branch) => width + branch.width, 0)
    + Math.max(0, branches.length - 1) * SIBLING_GAP;
}

/** Place cards by search depth and draw only known parent links. */
export function layoutSearchTree(trace: SearchTrace): TreeLayout {
  const byId = new Map<number, Branch>();
  for (const node of [...trace.nodes, ...trace.activePath]) {
    byId.set(node.id, { node, parent: null, children: [], width: CARD_WIDTH, childrenWidth: 0 });
  }

  const pathIds = new Set(trace.activePath.map(({ id }) => id));
  const pathParentIds = new Map(trace.activePath.slice(1).map(({ id }, index) => [id, trace.activePath[index].id]));
  const branches = [...byId.values()].sort((a, b) => a.node.id - b.node.id);
  const roots: Branch[] = [];
  for (const branch of branches) {
    const { depth, parentId } = branch.node;
    const parent = parentId === null ? undefined : byId.get(parentId);
    // Real parent links always descend. Reject inconsistent links to avoid a cycle.
    if (parent && parent.node.depth < depth) {
      branch.parent = parent;
      parent.children.push(branch);
    } else {
      roots.push(branch);
    }
  }
  roots.sort((a, b) => a.node.depth - b.node.depth || a.node.id - b.node.id);

  const depths = [...new Set(branches.map(({ node }) => node.depth))].sort((a, b) => a - b);
  const top = PADDING + (roots.some(({ node }) => node.depth === depths[0] && node.parentId !== null)
    ? TOP_STUB_SPACE : 0);
  const yAtDepth = new Map(depths.map((depth, band) => [depth, top + band * (CARD_HEIGHT + LEVEL_GAP)]));

  // Measure from the deepest nodes upward so every child already has its width.
  const deepestFirst = [...branches].sort((a, b) => b.node.depth - a.node.depth);
  for (const branch of deepestFirst) {
    branch.childrenWidth = totalWidth(branch.children);
    branch.width = Math.max(CARD_WIDTH, branch.childrenWidth);
  }

  const positioned = new Map<number, LayoutNode>();
  function place(branch: Branch, left: number) {
    const { node } = branch;
    positioned.set(node.id, {
      node,
      x: left + (branch.width - CARD_WIDTH) / 2,
      y: yAtDepth.get(node.depth)!,
      onPath: pathIds.has(node.id),
      missingParent: node.parentId !== null && branch.parent === null,
    });
    let childLeft = left + (branch.width - branch.childrenWidth) / 2;
    for (const child of branch.children) {
      place(child, childLeft);
      childLeft += child.width + SIBLING_GAP;
    }
  }

  let left = PADDING;
  for (const root of roots) {
    place(root, left);
    left += root.width + SIBLING_GAP;
  }

  const edges: LayoutEdge[] = [];
  for (const { node, parent } of branches) {
    if (!parent) continue;
    const from = positioned.get(parent.node.id)!;
    const to = positioned.get(node.id)!;
    const x1 = from.x + CARD_WIDTH / 2;
    const y1 = from.y + CARD_HEIGHT;
    const x2 = to.x + CARD_WIDTH / 2;
    const y2 = to.y;
    const midY = (y1 + y2) / 2;
    edges.push({ from: from.node.id, to: node.id,
      path: `M ${x1} ${y1} C ${x1} ${midY} ${x2} ${midY} ${x2} ${y2}`,
      onPath: pathParentIds.get(node.id) === from.node.id });
  }

  return {
    nodes: [...positioned.values()].sort((a, b) => a.y - b.y || a.x - b.x),
    edges,
    width: totalWidth(roots) + 2 * PADDING,
    height: top + depths.length * CARD_HEIGHT + Math.max(0, depths.length - 1) * LEVEL_GAP + PADDING,
  };
}
