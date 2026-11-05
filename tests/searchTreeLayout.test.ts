import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SearchTrace, TreeNode } from '../src/protocol.ts';
import { CARD_HEIGHT, CARD_WIDTH, layoutSearchTree } from '../src/searchTreeLayout.ts';

function node(id: number, parentId: number | null, depth: number): TreeNode {
  const value = { id, parentId, depth, move: null, h: null, status: 'frontier' as const, anchors: [] };
  return value;
}

function trace(nodes: TreeNode[], activePath: TreeNode[] = []): SearchTrace {
  return { nodes, activePath, activeId: activePath.at(-1)?.id ?? 0, omittedAncestors: 0, discovered: nodes.length };
}

test('diagram uses true parents, centers their subtrees, and orders siblings by ID', () => {
  const root = node(0, null, 0);
  const first = node(1, 0, 1);
  const second = node(2, 0, 1);
  const child = node(3, 1, 2);
  const layout = layoutSearchTree(trace([second, child, root, first], [root, first, child]));
  const [start, left, right, end] = layout.nodes;
  assert.deepEqual(layout.nodes.map(({ node: card }) => card.id), [0, 1, 2, 3]);
  assert.deepEqual(layout.nodes.map(({ onPath }) => onPath), [true, true, false, true]);
  assert.equal(left.y, right.y);
  assert.equal(right.x - (left.x + CARD_WIDTH), 24);
  assert.equal(start.x, (left.x + right.x) / 2);
  assert.equal(left.x, end.x);
  assert.deepEqual(layout.edges.map(({ from, to, onPath }) => [from, to, onPath]), [
    [0, 1, true], [0, 2, false], [1, 3, true],
  ]);
  assert.match(layout.edges[0].path, new RegExp(`^M ${start.x + CARD_WIDTH / 2} ${start.y + CARD_HEIGHT} C .+ ${left.x + CARD_WIDTH / 2} ${left.y}$`));
});

test('diagram uses the current parent of a reparented ID without duplicate cards', () => {
  const root = node(0, null, 0);
  const oldParent = node(1, 0, 1);
  const newParent = node(2, 0, 1);
  const oldChild = node(3, 1, 2);
  const newChild = node(3, 2, 2);
  const layout = layoutSearchTree(trace([root, oldParent, newParent, oldChild], [root, newParent, newChild]));
  assert.equal(layout.nodes.length, 4);
  assert.deepEqual(layout.edges.map(({ from, to, onPath }) => [from, to, onPath]), [
    [0, 1, false], [0, 2, true], [2, 3, true],
  ]);
});

test('diagram separates detached roots and compresses undisplayed depth bands', () => {
  const root = node(0, null, 0);
  const detached = node(71, 70, 9);
  const child = node(72, 71, 10);
  const layout = layoutSearchTree(trace([root], [detached, child]));
  const [start, branch, leaf] = layout.nodes;
  assert.equal(branch.missingParent, true);
  assert.equal(start.missingParent, false);
  assert.equal(branch.y - start.y, CARD_HEIGHT + 54);
  assert.equal(leaf.y - branch.y, CARD_HEIGHT + 54);
  assert.ok(branch.x >= start.x + CARD_WIDTH + 24);
  assert.deepEqual(layout.edges.map(({ from, to, onPath }) => [from, to, onPath]), [[71, 72, true]]);
  assert.equal(layout.width - (branch.x + CARD_WIDTH), 24);
  assert.equal(layout.height - (leaf.y + CARD_HEIGHT), 24);
  assert.equal(layoutSearchTree(trace([], [detached, child])).nodes[0].y, 54);
});
