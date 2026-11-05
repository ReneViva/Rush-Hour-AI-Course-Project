import type { Board } from './model';
import type { FramePair, Preset } from './protocol';

export type WorkerRequest =
  | { type: 'init'; baseUrl: string }
  | { type: 'start'; id: number; board: Board }
  | { type: 'advance'; id: number; rounds: number }
  | { type: 'reset' }
  | { type: 'random'; id: number; seed: number };

export type WorkerReply =
  | { type: 'ready' }
  | { type: 'frames'; id: number; frames: FramePair }
  | { type: 'preset'; id: number; preset: Preset | null }
  | { type: 'error'; id?: number; message: string };
