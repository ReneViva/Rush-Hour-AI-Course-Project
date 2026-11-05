import { useEffect, useMemo, useRef, useState } from 'react';
import type { Board } from './model';
import type { FramePair, Preset } from './protocol';
import type { WorkerReply, WorkerRequest } from './workerMessages';

type SearchState = 'idle' | 'starting' | 'paused' | 'playing' | 'finishing' | 'complete';
type SolverView = {
  status: 'loading' | 'ready' | 'error';
  error: string | null;
  frames: FramePair | null;
  searchState: SearchState;
  speed: number;
  busy: boolean;
  canRestart: boolean;
};

const initialView: SolverView = {
  status: 'loading', error: null, frames: null, searchState: 'idle', speed: 550,
  busy: false, canRestart: false,
};

function isTerminal(pair: FramePair) {
  return [pair.bfs.status, pair.astar.status].every(
    (status) => status === 'solved' || status === 'unsolvable' || status === 'limited',
  );
}

class SolverController {
  private worker: Worker | null = null;
  private view = initialView;
  private id = 0;
  private timer: number | undefined;
  private startupTimer: number | undefined;
  private request: { id: number; intent: 'start' | 'next' | 'play' | 'finish' } | null = null;
  private buffered: FramePair | null = null;
  private randomRequests = new Map<number, (preset: Preset | null) => void>();
  private board: Board | null = null;

  constructor(private readonly publish: (view: SolverView) => void) {
    this.boot();
  }

  private update(patch: Partial<SolverView>) {
    this.view = { ...this.view, ...patch };
    this.publish(this.view);
  }

  private send(request: WorkerRequest) {
    this.worker?.postMessage(request);
  }

  private boot() {
    this.dispose();
    this.update({ status: 'loading', error: null, frames: null, busy: false,
      searchState: this.board ? 'starting' : 'idle' });
    try {
      const worker = new Worker(new URL('./solver.worker.ts', import.meta.url), { type: 'module' });
      this.worker = worker;
      worker.onmessage = ({ data }: MessageEvent<WorkerReply>) => {
        if (this.worker === worker) this.receive(data);
      };
      worker.onerror = (event) => {
        if (this.worker === worker) this.fail(event.message || 'The solver worker stopped unexpectedly.');
      };
      worker.onmessageerror = () => {
        if (this.worker === worker) this.fail('The solver returned a message that could not be read.');
      };
      this.startupTimer = window.setTimeout(() => this.fail('The solver took too long to start.'), 45_000);
      this.send({ type: 'init', baseUrl: new URL(import.meta.env.BASE_URL, document.baseURI).href });
    } catch (error) {
      this.fail(error instanceof Error ? error.message : String(error));
    }
  }

  private fail(error: string) {
    this.dispose();
    this.update({ status: 'error', error, busy: false, searchState: 'idle' });
  }

  private receive(reply: WorkerReply) {
    if (reply.type === 'ready') {
      window.clearTimeout(this.startupTimer);
      this.update({ status: 'ready' });
      if (this.board && this.view.searchState === 'starting') this.begin(this.board);
      return;
    }
    if (reply.type === 'preset' || reply.type === 'error') {
      const resolve = reply.id === undefined ? undefined : this.randomRequests.get(reply.id);
      if (resolve && reply.id !== undefined) {
        this.randomRequests.delete(reply.id);
        resolve(reply.type === 'preset' ? reply.preset : null);
        return;
      }
      if (reply.type === 'error' && (reply.id === undefined || reply.id === this.request?.id)) {
        this.fail(reply.message);
      }
      return;
    }
    if (this.request?.id !== reply.id) return;

    const { intent } = this.request;
    this.request = null;
    if (intent === 'play' && this.view.searchState === 'paused') {
      this.buffered = reply.frames;
      this.update({ busy: false });
      return;
    }
    this.show(reply.frames);
    this.schedule();
  }

  private show(frames: FramePair) {
    const mode = this.view.searchState;
    this.update({
      frames, busy: false,
      searchState: isTerminal(frames) ? 'complete' : mode === 'starting' ? 'paused' : mode,
    });
  }

  private schedule() {
    window.clearTimeout(this.timer);
    const mode = this.view.searchState;
    if (mode === 'playing') this.timer = window.setTimeout(() => this.advance('play', 1), this.view.speed);
    if (mode === 'finishing') this.timer = window.setTimeout(() => this.advance('finish', 96), 0);
  }

  private begin(board: Board) {
    const id = ++this.id;
    this.request = { id, intent: 'start' };
    this.update({ busy: true });
    this.send({ type: 'start', id, board });
  }

  private advance(intent: 'next' | 'play' | 'finish', rounds: number) {
    if (this.request || this.view.status !== 'ready') return;
    if (this.buffered) {
      const frames = this.buffered;
      this.buffered = null;
      this.show(frames);
      if (intent !== 'next') this.schedule();
      return;
    }
    const id = ++this.id;
    this.request = { id, intent };
    this.update({ busy: true });
    this.send({ type: 'advance', id, rounds });
  }

  start(board: Board) {
    this.stopSearch();
    this.board = structuredClone(board);
    this.update({ frames: null, busy: false, searchState: 'starting', canRestart: true });
    if (this.view.status === 'ready') this.begin(this.board);
  }

  play() {
    if (this.view.searchState !== 'paused') return;
    this.update({ searchState: 'playing' });
    this.advance('play', 1);
  }

  pause() {
    if (this.view.searchState !== 'playing') return;
    window.clearTimeout(this.timer);
    this.update({ searchState: 'paused' });
  }

  next() {
    if (this.view.searchState === 'paused') this.advance('next', 1);
  }

  finish() {
    if (this.view.searchState !== 'paused' && this.view.searchState !== 'playing') return;
    window.clearTimeout(this.timer);
    this.update({ searchState: 'finishing' });
    this.advance('finish', 96);
  }

  setSpeed(speed: number) {
    this.update({ speed });
    if (this.view.searchState === 'playing' && !this.request) this.schedule();
  }

  private stopSearch() {
    window.clearTimeout(this.timer);
    this.request = null;
    this.buffered = null;
    if (this.view.status === 'ready') this.send({ type: 'reset' });
  }

  cancel() {
    this.stopSearch();
    this.update({ busy: false, searchState: 'idle' });
  }

  reset() {
    this.stopSearch();
    this.board = null;
    this.update({ frames: null, busy: false, searchState: 'idle', canRestart: false });
  }

  restart() {
    if (this.board) this.start(this.board);
  }

  retry() {
    this.boot();
  }

  random(seed: number) {
    if (this.view.status !== 'ready') return Promise.resolve(null);
    const id = ++this.id;
    return new Promise<Preset | null>((resolve) => {
      this.randomRequests.set(id, resolve);
      this.send({ type: 'random', id, seed });
    });
  }

  dispose() {
    window.clearTimeout(this.startupTimer);
    window.clearTimeout(this.timer);
    this.worker?.terminate();
    this.worker = null;
    this.request = null;
    this.buffered = null;
    this.randomRequests.forEach((resolve) => resolve(null));
    this.randomRequests.clear();
  }
}

export function useSolverWorker() {
  const [view, setView] = useState(initialView);
  const controller = useRef<SolverController | null>(null);
  useEffect(() => {
    const current = new SolverController(setView);
    controller.current = current;
    return () => {
      controller.current = null;
      current.dispose();
    };
  }, []);

  const controls = useMemo(() => ({
    start: (board: Board) => controller.current?.start(board),
    play: () => controller.current?.play(),
    pause: () => controller.current?.pause(),
    next: () => controller.current?.next(),
    finish: () => controller.current?.finish(),
    cancel: () => controller.current?.cancel(),
    reset: () => controller.current?.reset(),
    restart: () => controller.current?.restart(),
    retry: () => controller.current?.retry(),
    setSpeed: (speed: number) => controller.current?.setSpeed(speed),
    random: (seed: number) => controller.current?.random(seed) ?? Promise.resolve(null),
  }), []);

  return { ...view, ...controls };
}

export type Solver = ReturnType<typeof useSolverWorker>;
