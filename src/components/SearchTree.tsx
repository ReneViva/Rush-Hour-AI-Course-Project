import { useEffect, useMemo, useState } from 'react';
import type { Axis, Board as Puzzle, Move } from '../model';
import type { Algorithm, SearchTrace, TreeNode } from '../protocol';
import { CARD_HEIGHT, CARD_WIDTH, layoutSearchTree } from '../searchTreeLayout';
import { useSearchTreeCamera } from '../useSearchTreeCamera';
import { Board } from './Board';
import { Icon } from './Icons';
import '../search-tree.css';

const statusNames: Record<TreeNode['status'], string> = {
  frontier: 'Frontier',
  expanded: 'Expanded',
  active: 'Current',
  goal: 'Goal',
};
const count = new Intl.NumberFormat();

type CardPosition = ReturnType<typeof layoutSearchTree>['nodes'][number];

function moveCount(value: number) {
  return `${value} ${value === 1 ? 'move' : 'moves'}`;
}

function moveLabel(move: Move | null, axes: ReadonlyMap<string, Axis>) {
  if (!move) return 'Start';
  const direction = axes.get(move.id) === 'V'
    ? (move.delta < 0 ? 'up' : 'down')
    : (move.delta < 0 ? 'left' : 'right');
  return `${move.id} ${direction} ${Math.abs(move.delta)}`;
}

function previewBoard(board: Puzzle, node: TreeNode, current: boolean): Puzzle | null {
  if (current) return board;
  if (node.anchors?.length !== board.vehicles.length) return null;
  return {
    ...board,
    vehicles: board.vehicles.map((vehicle, index) => vehicle.axis === 'H'
      ? { ...vehicle, col: node.anchors[index] }
      : { ...vehicle, row: node.anchors[index] }),
  };
}

function PositionCard({ position, label, pinned, keyboardTabStop, compact, stubId, onSelect }: {
  position: CardPosition;
  label: string;
  pinned: boolean;
  keyboardTabStop: boolean;
  compact: boolean;
  stubId?: string;
  onSelect(): void;
}) {
  const { node, x, y, onPath } = position;
  const classes = [
    'search-tree-node', `search-tree-node--${node.status}`,
    onPath && 'search-tree-node--path', pinned && 'search-tree-node--selected',
  ].filter(Boolean).join(' ');
  const style = { left: x, top: y, width: CARD_WIDTH, height: CARD_HEIGHT };

  if (compact) return <div className={classes} style={style} aria-hidden="true" />;

  const cost = node.h === null ? `depth ${node.depth}` : `f = ${node.depth + node.h}`;
  return (
    <button className={classes} style={style} type="button" tabIndex={keyboardTabStop ? 0 : -1} aria-pressed={pinned}
      aria-current={node.status === 'active' || node.status === 'goal' ? 'step' : undefined}
      aria-describedby={stubId}
      onClick={onSelect}>
      <span className="search-tree-node-meta">
        <span className="search-tree-node-id">#{node.id}</span>
        <span className="search-tree-node-state">{statusNames[node.status]}</span>
      </span>
      <span className="search-tree-node-move">{label}</span>
      <span className="search-tree-node-cost">{cost}</span>
    </button>
  );
}

export function SearchTree({ algorithm, board, trace }: { algorithm: Algorithm; board: Puzzle; trace: SearchTrace }) {
  const name = algorithm === 'bfs' ? 'BFS' : 'A*';
  const [pinnedId, setPinnedId] = useState<number | null>(null);
  const [notice, setNotice] = useState('');
  const layout = useMemo(() => layoutSearchTree(trace), [trace]);
  const axes = new Map(board.vehicles.map(({ id, axis }) => [id, axis]));
  const activeCard = layout.nodes.find(({ node }) => node.id === trace.activeId);
  const pinnedCard = pinnedId === null ? undefined : layout.nodes.find(({ node }) => node.id === pinnedId);
  const inspected = pinnedCard ?? activeCard;
  const camera = useSearchTreeCamera(layout, activeCard);
  const compact = camera.mode === 'overview' && camera.scale < 0.65;

  useEffect(() => {
    if (pinnedId !== null && !pinnedCard) {
      setPinnedId(null);
      setNotice('That position left the recorded path. Showing the current position.');
    }
  }, [pinnedCard, pinnedId]);

  function inspect(position: CardPosition, center = false) {
    setPinnedId(position.node.id);
    setNotice('');
    camera.inspect(position, center);
  }

  const nodesById = [...layout.nodes].sort((first, second) => first.node.id - second.node.id);
  const branches = [...layout.edges].sort((first, second) => Number(first.onPath) - Number(second.onPath));
  const continuations = layout.nodes.filter(({ missingParent }) => missingParent);
  const sampled = trace.nodes.length;
  const extra = layout.nodes.length - sampled;
  const active = activeCard?.node;
  const inspectedNode = inspected?.node;
  const preview = inspectedNode ? previewBoard(board, inspectedNode, inspectedNode.id === trace.activeId) : null;

  return (
    <section className="search-tree" aria-label={`${name} search tree`}>
      <div className="search-tree-overview">
        <h3>Search tree</h3>
        <p>{algorithm === 'bfs' ? 'Depth counts the moves from Start.' : 'A* favors the lowest estimated total cost, f.'} Select a position to see its board.</p>
      </div>
      <div className="search-tree-toolbar">
        <div className="search-tree-tools" role="group" aria-label={`${name} diagram controls`}>
          <button className="button button--quiet" type="button" aria-pressed={camera.mode === 'follow'}
            onClick={() => {
              setPinnedId(null);
              setNotice('');
              camera.followCurrent();
            }}>Follow current</button>
          <button className="button button--quiet" type="button" aria-pressed={camera.mode === 'overview'}
            onClick={camera.showOverview}>Overview</button>
        </div>
        <div className="search-tree-tools" role="group" aria-label={`${name} diagram zoom`}>
          <button className="button button--quiet button--icon" type="button" aria-label="Zoom out"
            disabled={!camera.canZoomOut} onClick={() => camera.changeZoom(-1)}><Icon name="minus" size={16} /></button>
          <output aria-label="Tree zoom">{Math.round(camera.scale * 100)}%</output>
          <button className="button button--quiet button--icon" type="button" aria-label="Zoom in"
            disabled={!camera.canZoomIn} onClick={() => camera.changeZoom(1)}><Icon name="add" size={16} /></button>
        </div>
      </div>

      <div className="search-tree-viewport" ref={camera.viewport} role="region" aria-label={`${name} diagram`}
        tabIndex={0} data-dragging={camera.dragging || undefined} data-mode={camera.mode}
        onScroll={camera.onScroll} onPointerDown={camera.onPointerDown} onPointerMove={camera.onPointerMove}
        onPointerUp={camera.endDrag} onPointerCancel={camera.endDrag} onLostPointerCapture={camera.endDrag}>
        <div className="search-tree-spacer" style={{ width: camera.displayedWidth, height: camera.displayedHeight }}>
          <div className={`search-tree-canvas${compact ? ' search-tree-canvas--overview' : ''}`}
            style={{ left: camera.offsetX, width: layout.width, height: layout.height, transform: `scale(${camera.scale})` }}>
            <svg className="search-tree-edges" aria-hidden="true" focusable="false">
              {branches.map(({ from, to, path, onPath }) => (
                <path key={`${from}-${to}`} d={path} className={`search-tree-edge${onPath ? ' search-tree-edge--path' : ''}`} />
              ))}
              {continuations.map(({ node, x, y }) => (
                <path key={`stub-${node.id}`} d={`M ${x + CARD_WIDTH / 2} ${y - 16} V ${y}`}
                  className="search-tree-edge search-tree-edge--stub" />
              ))}
            </svg>
            {continuations.map(({ node, x, y }) => (
              <span className="search-tree-stub" id={`${algorithm}-tree-parent-${node.id}`} key={`label-${node.id}`} aria-hidden="true"
                style={{ left: x + CARD_WIDTH / 2, top: y - 37 }}>From #{node.parentId} outside sample</span>
            ))}
            {layout.nodes.map((position) => (
              <PositionCard key={position.node.id} position={position} label={moveLabel(position.node.move, axes)}
                pinned={pinnedId === position.node.id} compact={compact}
                keyboardTabStop={inspected?.node.id === position.node.id}
                stubId={position.missingParent ? `${algorithm}-tree-parent-${position.node.id}` : undefined}
                onSelect={() => inspect(position)} />
            ))}
          </div>
        </div>
      </div>

      <div className="search-tree-legend" aria-label="Position statuses">
        {(Object.keys(statusNames) as TreeNode['status'][]).map((status) => (
          <span className={`search-tree-key search-tree-key--${status}`} key={status}>{statusNames[status]}</span>
        ))}
      </div>
      <p className="search-tree-count">
        {trace.discovered > sampled
          ? `Showing the first ${count.format(sampled)} of ${count.format(trace.discovered)} discovered positions.`
          : `${count.format(trace.discovered)} ${trace.discovered === 1 ? 'position' : 'positions'} discovered.`}
        {extra > 0 ? ` Includes ${extra} more from the current path.` : ''}
      </p>
      {active && (
        <div className="search-tree-path">
          <p><strong>{active.status === 'goal' ? 'Path to the goal' : 'Path to the current position'}</strong> <span>#{trace.activeId} · {moveCount(active.depth)}</span></p>
          <ol role="list" className="search-tree-crumbs" aria-label="Moves from the starting position">
            {trace.omittedAncestors > 0 && <li className="search-tree-omitted">{trace.omittedAncestors} earlier steps</li>}
            {trace.activePath.map((node) => (
              <li key={node.id} aria-current={node.id === trace.activeId ? 'step' : undefined}>{moveLabel(node.move, axes)}</li>
            ))}
          </ol>
        </div>
      )}

      {inspectedNode && <section className="search-tree-inspector" aria-label={`${name} position preview`}>
        <h4>Position preview</h4>
        <label className="search-tree-select">
          Inspect a position
          <select value={inspectedNode.id} onChange={(event) => {
            const position = layout.nodes.find(({ node }) => node.id === Number(event.target.value));
            if (position) inspect(position, true);
          }}>
            {nodesById.map(({ node }) => <option key={node.id} value={node.id}>
              #{node.id} · {moveLabel(node.move, axes)} · {statusNames[node.status]}
            </option>)}
          </select>
        </label>
        <p className="search-tree-notice" role="status">{notice}</p>
        <div className="search-tree-inspector-main">
          {preview && <div className="search-tree-preview">
            <Board board={preview} label={`${name} position #${inspectedNode.id}`} mode="read"
              highlight={inspectedNode.move?.id} animate={false} />
          </div>}
          <div className="search-tree-details">
            <p><strong>#{inspectedNode.id} · {moveLabel(inspectedNode.move, axes)}</strong></p>
            <p>{statusNames[inspectedNode.status]}{pinnedCard ? ' · Pinned' : ''}</p>
            {!preview && <p>Position preview is unavailable.</p>}
            <dl>
              {inspectedNode.parentId !== null && <>
                <dt>Parent</dt><dd>#{inspectedNode.parentId}{inspected?.missingParent ? ' outside the sample' : ''}</dd>
              </>}
              {inspectedNode.h === null ? <><dt>Depth</dt><dd>{moveCount(inspectedNode.depth)}</dd></> : <>
                <dt>g</dt><dd>{moveCount(inspectedNode.depth)} from Start</dd>
                <dt>h</dt><dd>{moveCount(inspectedNode.h)} estimated left</dd>
                <dt>f</dt><dd>{inspectedNode.depth} + {inspectedNode.h} = {inspectedNode.depth + inspectedNode.h}</dd>
              </>}
            </dl>
          </div>
        </div>
      </section>}
    </section>
  );
}
