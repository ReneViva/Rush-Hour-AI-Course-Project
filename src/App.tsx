import { useRef, useState, type FormEvent } from 'react';
import { Board as PuzzleBoard } from './components/Board';
import { Editor } from './components/Editor';
import { Icon } from './components/Icons';
import { Replay } from './components/Replay';
import { Search } from './components/Search';
import allPresets from './data/presets.json';
import { applyMove, describeMove, isSolved, legalMoves, type Board, type Move } from './model';
import type { Algorithm, Difficulty, Preset } from './protocol';
import { usePuzzleEditor } from './usePuzzleEditor';
import { useSolverWorker } from './useSolverWorker';

const presets = allPresets as Preset[];
const firstPuzzle = presets[0];
const levels: Difficulty[] = ['Beginner', 'Intermediate', 'Advanced', 'Expert'];
type Mode = 'play' | 'edit' | 'search' | 'replay';
type Turn = { board: Board; text: string };
type ReplayRun = { moves: Move[]; algorithm: Algorithm };

export function App() {
  const [mode, setMode] = useState<Mode>('play');
  const [board, setBoard] = useState<Board>(firstPuzzle.board);
  const [initial, setInitial] = useState<Board>(firstPuzzle.board);
  const [preset, setPreset] = useState<Preset | null>(firstPuzzle);
  const [history, setHistory] = useState<Turn[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [lastMove, setLastMove] = useState('');
  const [seed, setSeed] = useState('');
  const [randomPending, setRandomPending] = useState(false);
  const [randomError, setRandomError] = useState<string | null>(null);
  const [replay, setReplay] = useState<ReplayRun | null>(null);
  const [snapshot, setSnapshot] = useState<Board>(board);
  const randomRequest = useRef(0);
  const main = useRef<HTMLElement>(null);
  const solver = useSolverWorker();
  const editor = usePuzzleEditor();

  const solved = isSolved(board);
  const piece = board.vehicles.find(({ id }) => id === selected);
  const moves = selected && !solved ? legalMoves(board, selected) : [];

  function goTo(next: Mode) {
    if (mode === next) return;
    setMode(next);
    requestAnimationFrame(() => {
      const heading = main.current?.querySelector('h1');
      if (heading) {
        heading.setAttribute('tabindex', '-1');
        heading.focus({ preventScroll: true });
      }
      window.scrollTo(0, 0);
    });
  }

  function invalidateRandom() {
    randomRequest.current++;
    setRandomPending(false);
    setRandomError(null);
  }

  function load(next: Board, source: Preset | null) {
    invalidateRandom();
    solver.reset();
    setInitial(next);
    setBoard(next);
    setPreset(source);
    setHistory([]);
    setSelected(null);
    setLastMove('');
  }

  function selectPreset(id: string) {
    const next = presets.find((entry) => entry.id === id);
    if (next) load(next.board, next);
  }

  function move(action: Move) {
    if (solved) return;
    const next = applyMove(board, action);
    if (!next) return;
    setHistory((previous) => [...previous, { board, text: lastMove }]);
    setBoard(next);
    setLastMove(describeMove(board, action));
  }

  function undo() {
    const turn = history.at(-1);
    if (!turn) return;
    setBoard(turn.board);
    setLastMove(turn.text);
    setHistory((previous) => previous.slice(0, -1));
  }

  function reset() {
    invalidateRandom();
    solver.reset();
    setBoard(initial);
    setHistory([]);
    setSelected(null);
    setLastMove('');
  }

  function beginEdit() {
    invalidateRandom();
    solver.reset();
    editor.start(board);
    goTo('edit');
  }

  function saveEdit() {
    if (!editor.draft) return;
    load(editor.draft, null);
    goTo('play');
  }

  function compare() {
    invalidateRandom();
    setSnapshot(board);
    setReplay(null);
    solver.start(board);
    goTo('search');
  }

  function returnToPlay() {
    solver.reset();
    setReplay(null);
    goTo('play');
  }

  async function randomize(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (randomPending || solver.status !== 'ready') return;
    const request = ++randomRequest.current;
    const chosen = seed === '' ? crypto.getRandomValues(new Uint32Array(1))[0] : Number(seed);
    if (!Number.isInteger(chosen) || chosen < 0 || chosen > 4294967295) {
      setRandomError('Enter a whole seed from 0 to 4,294,967,295.');
      return;
    }
    setRandomPending(true);
    setRandomError(null);
    try {
      const entry = await solver.random(chosen);
      if (request !== randomRequest.current) return;
      if (entry) load(entry.board, entry);
      else setRandomError('No board found for that seed within the search limit. Try another seed.');
    } catch {
      if (request === randomRequest.current) setRandomError('Could not generate a puzzle. Try again.');
    } finally {
      if (request === randomRequest.current) setRandomPending(false);
    }
  }

  const editorBoard = editor.draft;
  const boardError = editor.error?.location === 'board' ? editor.error.message : null;
  const boardName = preset?.name ?? 'Custom board';

  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">Skip to puzzle</a>
      <header className="site-header">
        <button className="brand" onClick={returnToPlay} aria-label="Rush Hour Lab home">
          <span className="brand-mark"><Icon name="car" size={23} /></span>
          <span className="brand-copy">Rush Hour<span> Lab</span></span>
        </button>
        <div className="header-actions"><span className="course-label">CS246/346 <span aria-hidden="true">/</span> Symbolic AI</span></div>
      </header>

      <main ref={main} className="site-main" id="main-content">
        {mode === 'search' ? (
          <Search solver={solver} onBack={returnToPlay} onReplay={(path, algorithm) => {
            setReplay({ moves: path, algorithm });
            goTo('replay');
          }} />
        ) : mode === 'replay' && replay ? (
          <Replay board={snapshot} moves={replay.moves} algorithm={replay.algorithm} onBack={() => goTo('search')} />
        ) : (
          <>
            <div className="intro-row">
              <div className="intro-copy">
                <h1>{mode === 'edit' ? 'Edit the board' : 'Rush Hour'}</h1>
                <p>{mode === 'edit' ? 'Build a new traffic jam, then try to get out.' : 'Slide the red car to the exit.'}</p>
              </div>
              {mode === 'play' && <div className="intro-note">Play the puzzle. See how search solves it.</div>}
            </div>

            {mode === 'edit' && editorBoard ? (
              <div className="workbench">
                <section className="board-column" aria-label="Board editor">
                  <div className="board-meta"><span>Custom layout</span><span className="chip">{editorBoard.rows} × {editorBoard.cols}</span></div>
                  <PuzzleBoard board={editorBoard} label="Editable puzzle board" mode="edit"
                    selected={editor.selected} onSelect={editor.select} onCell={editor.placement ? editor.place : undefined}
                    onRelocate={editor.relocate} />
                  <div className="board-footer">
                    <p role="status" className={boardError ? 'status status--error' : 'help-note'}>
                      {boardError ?? (editor.placement ? 'Select an empty grid cell to place the vehicle.' : 'Drag a piece or select it to adjust its position and direction.')}
                    </p>
                  </div>
                </section>
                <aside className="side-column panel">
                  <Editor board={editorBoard} selected={editor.selected} onSelect={editor.select} onChange={editor.change} error={editor.error}
                    onUndo={editor.undo} canUndo={editor.canUndo} onDone={saveEdit}
                    onCancel={() => goTo('play')} onChooseCell={() => main.current?.querySelector<HTMLButtonElement>('[data-cell][tabindex="0"]')?.focus()}
                    onPlacementChange={editor.setPlacement} placement={editor.placement} />
                </aside>
              </div>
            ) : (
              <div className="workbench">
                <section className="board-column" aria-label="Play the puzzle">
                  <div className="board-meta">
                    <span>{boardName}</span>
                    <span className="chip">{board.rows} × {board.cols}</span>
                  </div>
                  <PuzzleBoard board={board} label="Playable puzzle board" mode="play" selected={selected} onSelect={setSelected}
                    onMove={solved ? undefined : move} animate />
                  <div className="board-footer">
                    <div className="control-row">
                      <span className="move-counter"><strong>{history.length}</strong> {history.length === 1 ? 'move' : 'moves'}</span>
                      <button type="button" className="button button--quiet" onClick={undo} disabled={history.length === 0}>
                        <Icon name="undo" size={16} /> Undo
                      </button>
                      <button type="button" className="button button--quiet" onClick={reset} disabled={history.length === 0}>
                        <Icon name="reset" size={16} /> Reset
                      </button>
                    </div>
                    <p className={solved ? 'status status--success' : 'help-note'} role="status">
                      {solved ? `You made it out in ${history.length} ${history.length === 1 ? 'move' : 'moves'}.` : (lastMove || 'Drag a car along its lane, or select it and use the arrow keys.')}
                    </p>
                  </div>
                </section>

                <aside className="side-column panel" aria-label="Puzzle controls">
                  <div className="panel-header">
                    <h2 className="panel-title">Your puzzle</h2>
                    <p className="panel-copy">Pick a board or build one of your own.</p>
                  </div>
                  <div className="stack">
                    <div className="action-stack">
                      <button type="button" className="button button--primary" onClick={compare}>
                        <Icon name="compare" size={19} /> Compare BFS &amp; A*
                      </button>
                      <button type="button" className="button button--secondary" onClick={beginEdit}>
                        <Icon name="edit" size={18} /> Edit board
                      </button>
                    </div>
                    <div className="preset-picker">
                      <label htmlFor="preset">Puzzle library</label>
                      <select id="preset" value={preset && presets.some(({ id }) => id === preset.id) ? preset.id : ''} onChange={(event) => selectPreset(event.target.value)}>
                        <option value="" disabled>{boardName}</option>
                        {levels.map((level) => <optgroup label={level} key={level}>
                          {presets.filter(({ difficulty }) => difficulty === level).map((entry) =>
                            <option value={entry.id} key={entry.id}>{entry.name} · {entry.optimalMoves} moves</option>)}
                        </optgroup>)}
                      </select>
                    </div>
                    {preset && <div className="preset-caption">
                      <span className="chip">{preset.difficulty}</span>
                      <span>{preset.optimalMoves} moves minimum{preset.seed !== undefined ? ` · Seed ${preset.seed}` : ''}</span>
                    </div>}
                    <form className="random-form" onSubmit={randomize}>
                      <button type="submit" className="button button--quiet" disabled={randomPending || solver.status !== 'ready'}>
                        <Icon name="shuffle" size={16} /> {randomPending ? 'Finding a puzzle…' : 'Random 6×6'}
                      </button>
                      <label className="seed-field">
                        <span>Seed <span>(optional)</span></span>
                        <input type="number" inputMode="numeric" min="0" max="4294967295" step="1" placeholder="Any" value={seed}
                          onChange={(event) => setSeed(event.target.value)} />
                      </label>
                    </form>
                    {randomError && <p className="status status--error" role="status">{randomError}</p>}
                    {solver.status === 'error' && <button type="button" className="button button--quiet" onClick={solver.retry}>Retry puzzle engine</button>}
                    {piece && !solved && (
                      <div className="selection-tools">
                        <h3>{piece.id === 'X' ? 'Target car X selected' : `Vehicle ${piece.id} selected`}</h3>
                        {moves.length === 0 ? <p className="help-note">This vehicle has no free cells in its lane.</p> : (
                          <div className="control-row">
                            {moves.map(({ delta }) => {
                              const direction = piece.axis === 'V' ? (delta < 0 ? 'Up' : 'Down') : (delta < 0 ? 'Left' : 'Right');
                              return <button type="button" className="button button--quiet" key={delta}
                                onClick={() => move({ id: piece.id, delta })}>{direction} {Math.abs(delta)}</button>;
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </aside>
              </div>
            )}
          </>
        )}
      </main>

      <footer className="site-footer">
        <span>Rush Hour Lab</span>
        <span>American University of Armenia · Artificial Intelligence</span>
      </footer>
    </div>
  );
}
