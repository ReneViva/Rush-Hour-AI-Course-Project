import { useState } from 'react';
import type { Move } from '../model';
import type { Algorithm, Frame, FramePair } from '../protocol';
import type { Solver } from '../useSolverWorker';
import { Board } from './Board';
import { Icon } from './Icons';
import { SearchTree } from './SearchTree';
import '../search.css';

export type SearchAlgorithm = Algorithm;
type ComparisonView = 'boards' | 'trees';

const algorithms = {
  bfs: { name: 'Breadth-first search', short: 'BFS', rule: 'Explores the shallowest states first.' },
  astar: { name: 'A* search', short: 'A*', rule: 'Picks the lowest estimated total cost.' },
};

const statuses: Record<Frame['status'], string> = {
  ready: 'Ready', running: 'In progress', solved: 'Solved', unsolvable: 'No solution', limited: 'Search limit reached',
};

const count = new Intl.NumberFormat();

type SearchProps = {
  solver: Solver;
  onBack(): void;
  onReplay(moves: Move[], algorithm: SearchAlgorithm): void;
};

function Lane({ algorithm, frame, onReplay, replayEnabled, visibleOnPhone, view }: {
  algorithm: SearchAlgorithm;
  frame: Frame;
  onReplay(moves: Move[], algorithm: SearchAlgorithm): void;
  replayEnabled: boolean;
  visibleOnPhone: boolean;
  view: ComparisonView;
}) {
  const { name, short, rule } = algorithms[algorithm];
  const { moves } = frame;
  const metrics = [
    ['Expanded', count.format(frame.expanded)],
    ['Frontier', count.format(frame.frontier)],
    ['Peak frontier', count.format(frame.peakFrontier)],
    ['Search time', `${frame.runtimeMs.toFixed(1)} ms`],
  ];

  return (
    <article className={`panel search-lane${visibleOnPhone ? ' search-lane--mobile-active' : ''}`} id={`search-lane-${algorithm}`} aria-label={name}>
      <div className="search-lane-head">
        <div>
          <h2 className="panel-title">{name}</h2>
          <p className="panel-copy">{rule}</p>
        </div>
        <span className={`search-lane-state search-lane-state--${frame.status}`} data-testid={`${algorithm}-status`}>{statuses[frame.status]}</span>
      </div>
      {view === 'boards' ? (
        <div className="search-board-wrap">
          <Board board={frame.board} label={`${short} current search state`} mode="read" blockers={frame.blockers} animate={false} />
        </div>
      ) : <SearchTree algorithm={algorithm} board={frame.board} trace={frame.tree} />}
      <dl className="search-metrics">
        {metrics.map(([label, value]) => (
          <div key={label}><dt>{label}</dt><dd data-testid={label === 'Expanded' ? `${algorithm}-expanded` : undefined}>{value}</dd></div>
        ))}
      </dl>
      <div className="search-costs" aria-label={`${short} current state costs`}>
        <span><b>g</b> {frame.g ?? '—'} <span>moves so far</span></span>
        {algorithm === 'astar' && <>
          <span><b>h</b> {frame.h ?? '—'} <span>estimated moves left</span></span>
          <span><b>f</b> {frame.f ?? '—'} <span>estimated total</span></span>
        </>}
      </div>
      {algorithm === 'astar' && <p className="search-blockers">{frame.blockers.length > 0
        ? <>Exit blockers: <strong>{frame.blockers.join(', ')}</strong></>
        : 'No exit blockers'}</p>}
      <div className="search-lane-foot">
        {moves ? <>
          <p><strong>{moves.length}</strong> {moves.length === 1 ? 'move' : 'moves'} to the exit</p>
          <button className="button button--secondary" type="button" disabled={!replayEnabled} onClick={() => onReplay(moves, algorithm)}>
            <Icon name="play" size={16} /> Replay {short} solution
          </button>
        </> : <p>{frame.status === 'unsolvable' ? 'All reachable states were checked.' : frame.status === 'limited'
          ? 'The search stopped before checking every reachable state.' : view === 'trees'
            ? 'Each branch shows the move from its parent position.' : 'The board shows the current search state.'}</p>}
      </div>
    </article>
  );
}

function Results({ bfs, astar }: FramePair) {
  if (bfs.status !== 'solved' || astar.status !== 'solved' || !bfs.moves || !astar.moves) return null;
  const difference = Math.abs(bfs.expanded - astar.expanded);
  const smallerSearch = bfs.expanded < astar.expanded ? 'BFS' : 'A*';
  const pathSummary = bfs.moves.length === astar.moves.length
    ? `Both found a ${bfs.moves.length}-move solution.`
    : `BFS found a ${bfs.moves.length}-move solution. A* found a ${astar.moves.length}-move solution.`;
  return (
    <p className="search-result">
      <Icon name="check" size={17} />
      <span>{pathSummary} {difference === 0
        ? 'They expanded the same number of states.'
        : `${smallerSearch} expanded ${count.format(difference)} fewer ${difference === 1 ? 'state' : 'states'}.`}</span>
    </p>
  );
}

export function Search({ solver, onBack, onReplay }: SearchProps) {
  const [visibleOnPhone, setVisibleOnPhone] = useState<SearchAlgorithm>('bfs');
  const [view, setView] = useState<ComparisonView>('boards');
  const { searchState, frames, status } = solver;
  const paused = searchState === 'paused';
  const playing = searchState === 'playing';
  const finishing = searchState === 'finishing';
  const active = paused || playing || finishing || searchState === 'starting';
  const replayEnabled = status === 'ready' && (paused || searchState === 'complete');
  const summary = searchState === 'complete' ? 'Comparison complete'
    : finishing ? 'Finding both results…'
      : playing ? 'Playing search steps'
        : paused ? 'Search paused'
          : searchState === 'starting' ? 'Preparing search…' : 'Search canceled';

  return (
    <section className="search-screen" aria-labelledby="search-title">
      <button className="button button--quiet search-back" type="button" onClick={onBack}>
        <Icon name="back" size={17} /> Back to puzzle
      </button>
      <header className="search-heading">
        <h1 id="search-title">Compare the searches</h1>
        <p>Start both algorithms from the same board. Each step expands one state per active search.</p>
      </header>
      <div className="search-control-bar">
        <div className="search-action-group" aria-label="Search playback controls">
          <button className="button button--primary" type="button" disabled={!paused && !playing}
            onClick={playing ? solver.pause : solver.play}>
            <Icon name={playing ? 'pause' : 'play'} size={17} /> {playing ? 'Pause' : 'Play'}
          </button>
          <button className="button button--secondary" type="button" disabled={!paused || solver.busy} onClick={solver.next}>
            <Icon name="next" size={17} /> Next step
          </button>
          <button className="button button--secondary" type="button" disabled={!paused && !playing} onClick={solver.finish}>
            <Icon name="finish" size={17} /> Finish search
          </button>
          {active && <button className="button button--quiet" type="button" onClick={solver.cancel}>
            <Icon name="stop" size={16} /> Cancel
          </button>}
          {!active && status === 'ready' && solver.canRestart && <button className="button button--quiet" type="button" onClick={solver.restart}>
            <Icon name="reset" size={17} /> Restart search
          </button>}
        </div>
        <label className="search-speed">Step speed
          <select value={solver.speed} onChange={(event) => solver.setSpeed(Number(event.target.value))}>
            <option value={950}>Slow</option><option value={550}>Normal</option><option value={200}>Fast</option>
          </select>
        </label>
      </div>
      {status === 'error' ? (
        <div className="search-notice search-notice--error" role="alert">
          <p><strong>The solver could not run.</strong> {solver.error}</p>
          <button type="button" className="button button--secondary" onClick={solver.retry}>Retry solver</button>
        </div>
      ) : <div className="search-view-bar">
        <p className="search-summary" role="status">{status === 'loading' ? 'Loading the Python solver…' : summary}</p>
        {frames && <div className="search-view-picker" role="group" aria-label="Comparison view">
          <button className="button button--quiet" type="button" aria-pressed={view === 'boards'} onClick={() => setView('boards')}>Boards</button>
          <button className="button button--quiet" type="button" aria-pressed={view === 'trees'} onClick={() => setView('trees')}>Search trees</button>
        </div>}
      </div>}
      {frames && <>
        <div className="search-lane-picker" role="group" aria-label="Visible search">
          {(['bfs', 'astar'] as const).map((algorithm) => <button className="button button--secondary" key={algorithm}
            type="button" aria-pressed={visibleOnPhone === algorithm} aria-controls={`search-lane-${algorithm}`}
            onClick={() => setVisibleOnPhone(algorithm)}>{algorithms[algorithm].short}</button>)}
        </div>
        <div className="search-lanes">
          <Lane algorithm="bfs" frame={frames.bfs} onReplay={onReplay} replayEnabled={replayEnabled} visibleOnPhone={visibleOnPhone === 'bfs'} view={view} />
          <Lane algorithm="astar" frame={frames.astar} onReplay={onReplay} replayEnabled={replayEnabled} visibleOnPhone={visibleOnPhone === 'astar'} view={view} />
        </div>
        {searchState === 'complete' && <Results {...frames} />}
        <details className="search-guide">
          <summary>How to read the comparison</summary>
          <p><strong>Expanded</strong> counts states whose legal moves were examined. The <strong>frontier</strong> is the set of discovered states still waiting to be explored. Peak frontier is the largest it got during this run.</p>
          <p>BFS explores in order of moves taken. A* ranks by <strong>f = g + h</strong>. Here, <strong>h</strong> is the number of distinct vehicles blocking the exit lane, plus one move for the red car if it has yet to reach the exit. Marked cars are current blockers.</p>
          <p>Every slide counts as one move, regardless of distance. Both searches can find a shortest solution. Search time measures solver work and can vary by device. The board may jump between unrelated search states. Replay follows the legal moves of the solution found.</p>
        </details>
      </>}
    </section>
  );
}
