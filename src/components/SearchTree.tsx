import type { Axis, Board, Move } from '../model';
import type { Algorithm, SearchTrace, TreeNode } from '../protocol';

const statusNames: Record<TreeNode['status'], string> = {
  frontier: 'Frontier',
  expanded: 'Expanded',
  active: 'Current',
  goal: 'Goal',
};
const count = new Intl.NumberFormat();

function moveLabel(move: Move | null, axes: ReadonlyMap<string, Axis>) {
  if (!move) return 'Start';
  const direction = axes.get(move.id) === 'V'
    ? (move.delta < 0 ? 'up' : 'down')
    : (move.delta < 0 ? 'left' : 'right');
  return `${move.id} ${direction} ${Math.abs(move.delta)}`;
}

function Branch({ node, childrenByParent, axes, levels }: {
  node: TreeNode;
  childrenByParent: ReadonlyMap<number | null, TreeNode[]>;
  axes: ReadonlyMap<string, Axis>;
  levels: number;
}) {
  const children = childrenByParent.get(node.id) ?? [];
  const current = node.status === 'active' || node.status === 'goal';

  return (
    <li className="search-tree-node" aria-current={current ? 'step' : undefined}>
      <div className={`search-tree-entry search-tree-entry--${node.status}`}>
        <span className="search-tree-node-id">#{node.id}</span>
        <strong>{moveLabel(node.move, axes)}</strong>
        <span className="search-tree-node-cost">
          {node.h === null ? `depth ${node.depth}` : `f = ${node.depth} + ${node.h} = ${node.depth + node.h}`}
        </span>
        <span className="search-tree-node-state">{statusNames[node.status]}</span>
      </div>
      {children.length > 0 && (
        <ul role="list" className={`search-tree-list${levels >= 5 ? ' search-tree-list--tight' : ''}`}>
          {children.map((child) => <Branch key={child.id} node={child} childrenByParent={childrenByParent} axes={axes} levels={levels + 1} />)}
        </ul>
      )}
    </li>
  );
}

export function SearchTree({ algorithm, board, trace }: { algorithm: Algorithm; board: Board; trace: SearchTrace }) {
  const name = algorithm === 'bfs' ? 'BFS' : 'A*';
  const axes = new Map(board.vehicles.map(({ id, axis }) => [id, axis]));
  const sampledIds = new Set(trace.nodes.map(({ id }) => id));
  const childrenByParent = new Map<number | null, TreeNode[]>();
  const detached: TreeNode[] = [];
  for (const node of trace.nodes) {
    if (node.parentId !== null && !sampledIds.has(node.parentId)) {
      detached.push(node);
      continue;
    }
    const siblings = childrenByParent.get(node.parentId);
    if (siblings) siblings.push(node);
    else childrenByParent.set(node.parentId, [node]);
  }
  const active = trace.activePath.at(-1);
  const sampled = trace.nodes.length;

  return (
    <section className="search-tree" aria-label={`${name} search tree`}>
      <div className="search-tree-overview">
        <h3>Search tree</h3>
        <p>{algorithm === 'bfs' ? 'Depth is the number of moves from Start.' : 'Each f score adds moves so far and estimated moves left.'}</p>
      </div>
      <div className="search-tree-viewport" role="region" aria-label={`${name} discovered branches`} tabIndex={0}>
        <ul role="list" className="search-tree-list search-tree-list--root">
          {(childrenByParent.get(null) ?? []).map((root) => (
            <Branch key={root.id} node={root} childrenByParent={childrenByParent} axes={axes} levels={0} />
          ))}
          {detached.map((root) => (
            <li className="search-tree-detached" key={root.id}>
              <span>Continues from #{root.parentId} outside the sample</span>
              <ul role="list" className="search-tree-list search-tree-list--root">
                <Branch node={root} childrenByParent={childrenByParent} axes={axes} levels={0} />
              </ul>
            </li>
          ))}
        </ul>
        {sampled === 1 && active?.status === 'active' && <p className="search-tree-hint">Use Next step to see what branches from the starting position.</p>}
      </div>
      <p className="search-tree-count">
        {trace.discovered > sampled
          ? `Showing the first ${count.format(sampled)} of ${count.format(trace.discovered)} discovered positions.`
          : `${count.format(trace.discovered)} ${trace.discovered === 1 ? 'position' : 'positions'} discovered.`}
      </p>
      {active && (
        <div className="search-tree-path">
          <p><strong>{active.status === 'goal' ? 'Path to the goal' : 'Path to the current position'}</strong> <span>#{trace.activeId} · {active.depth} {active.depth === 1 ? 'move' : 'moves'}</span></p>
          <ol role="list" className="search-tree-crumbs" aria-label="Moves from the starting position">
            {trace.omittedAncestors > 0 && <li className="search-tree-omitted">{trace.omittedAncestors} earlier steps</li>}
            {trace.activePath.map((node) => (
              <li key={node.id} aria-current={node.id === trace.activeId ? 'step' : undefined}>{moveLabel(node.move, axes)}</li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}
