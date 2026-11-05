import { useState } from 'react';
import { nextVehicleId, validateBoard, type Axis, type Board } from './model';

export type Placement = { axis: Axis; length: number };
export type EditError = { message: string; location: 'size' | 'vehicle' | 'board' };

export function usePuzzleEditor() {
  const [draft, setDraft] = useState<Board | null>(null);
  const [history, setHistory] = useState<Board[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [placement, setPlacement] = useState<Placement | null>(null);
  const [error, setError] = useState<EditError | null>(null);

  function start(board: Board) {
    setDraft(board);
    setSelected(null);
    setPlacement(null);
    setError(null);
    setHistory([]);
  }

  function change(next: Board, location: EditError['location'] = 'vehicle'): boolean {
    if (!draft) return false;
    const message = validateBoard(next);
    if (message) {
      setError({ message, location });
      return false;
    }
    if (JSON.stringify(draft) !== JSON.stringify(next)) {
      setHistory((snapshots) => [...snapshots, draft]);
      setDraft(next);
    }
    setError(null);
    if (selected && !next.vehicles.some(({ id }) => id === selected)) setSelected(null);
    return true;
  }

  function place(row: number, col: number) {
    if (!draft || !placement) return;
    const id = nextVehicleId(draft);
    if (change({ ...draft, vehicles: [...draft.vehicles, { id, row, col, ...placement }] }, 'board')) {
      setSelected(id);
      setPlacement(null);
    }
  }

  function relocate(id: string, row: number, col: number) {
    if (!draft) return;
    change({ ...draft, vehicles: draft.vehicles.map((piece) => piece.id === id ? { ...piece, row, col } : piece) }, 'board');
  }

  function undo() {
    const previous = history.at(-1);
    if (!previous) return;
    setDraft(previous);
    setHistory((snapshots) => snapshots.slice(0, -1));
    setError(null);
    if (selected && !previous.vehicles.some(({ id }) => id === selected)) setSelected(null);
  }

  function select(id: string) {
    setSelected(id);
    setPlacement(null);
    setError(null);
  }

  return { draft, selected, placement, error, canUndo: history.length > 0, start, change, place, relocate, undo, select, setPlacement };
}
