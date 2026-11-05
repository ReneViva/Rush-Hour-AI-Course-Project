import { describeMove, isSolved, type Board as PuzzleBoard, type Move } from '../model';
import type { Algorithm } from '../protocol';
import { useSolutionPlayback } from '../useSolutionPlayback';
import { Board } from './Board';
import { Icon } from './Icons';
import '../search.css';

type ReplayProps = {
  board: PuzzleBoard;
  moves: Move[];
  algorithm: Algorithm;
  onBack(): void;
};

export function Replay({ board, moves, algorithm, onBack }: ReplayProps) {
  const playback = useSolutionPlayback(board, moves);
  const { index, total, atEnd, playing, seek, speed, setSpeed, toggle } = playback;
  const lastMove = index > 0 ? moves[index - 1] : null;
  const solved = atEnd && playback.validPath && isSolved(playback.board);
  const name = algorithm === 'bfs' ? 'BFS' : 'A*';

  return (
    <section className="replay-screen" aria-labelledby="replay-title">
      <button className="button button--quiet search-back" type="button" onClick={onBack}>
        <Icon name="back" size={17} /> Back to comparison
      </button>
      <header className="search-heading">
        <h1 id="replay-title">Replay the {name} solution</h1>
        <p>Follow the cars from the starting board to the exit, one slide at a time.</p>
      </header>
      <div className="replay-layout">
        <section className="panel replay-board" aria-label="Solution board">
          <Board board={playback.board} label={`Solution board at move ${index} of ${total}`} mode="read"
            highlight={lastMove?.id} animate />
        </section>
        <section className="panel replay-side" aria-labelledby="replay-move-title">
          <div className="replay-position">
            <h2 id="replay-move-title">Move <strong>{index}</strong> of {total}</h2>
            {solved && <span className="search-lane-state search-lane-state--solved"><Icon name="check" size={14} /> At the exit</span>}
          </div>
          <p className="replay-description" aria-live={playing ? 'off' : 'polite'}>
            {lastMove ? describeMove(playback.board, lastMove) : solved ? 'Target car X starts at the exit.' : 'Starting position.'}
          </p>
          <label className="replay-timeline">Solution timeline
            <input type="range" min={0} max={total} step={1} value={index} disabled={total === 0}
              aria-valuetext={`Move ${index} of ${total}`} onChange={(event) => seek(Number(event.target.value))} />
          </label>
          <div className="replay-actions" aria-label="Solution playback controls">
            <button className="button button--secondary" type="button" onClick={() => seek(index - 1)} disabled={index === 0}>
              <Icon name="previous" size={17} /> Previous
            </button>
            <button className="button button--primary" type="button" onClick={toggle} disabled={total === 0}>
              <Icon name={playing ? 'pause' : 'play'} size={17} /> {playing ? 'Pause' : atEnd ? 'Replay' : 'Play'}
            </button>
            <button className="button button--secondary" type="button" onClick={() => seek(index + 1)} disabled={atEnd}>
              <Icon name="next" size={17} /> Next step
            </button>
          </div>
          <div className="replay-settings">
            <button className="button button--quiet" type="button" onClick={() => seek(0)} disabled={index === 0 && !playing}>
              <Icon name="reset" size={17} /> Start over
            </button>
            <label className="search-speed">Playback speed
              <select value={speed} onChange={(event) => setSpeed(Number(event.target.value))}>
                <option value={0.5}>0.5×</option><option value={1}>1×</option><option value={1.5}>1.5×</option><option value={2}>2×</option>
              </select>
            </label>
          </div>
          {!playback.validPath && <p className="search-notice search-notice--error" role="alert">The returned solution contains an illegal move. Return to the comparison to run the search again.</p>}
        </section>
      </div>
    </section>
  );
}
