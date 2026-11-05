export type Axis = 'H' | 'V';

export type Vehicle = {
  id: string;
  row: number;
  col: number;
  axis: Axis;
  length: number;
};

export type Board = { rows: number; cols: number; vehicles: Vehicle[] };
export type Move = { id: string; delta: number };

export const MIN_SIZE = 4;
export const MAX_SIZE = 10;
export const MIN_LENGTH = 2;
export const MAX_LENGTH = 4;
export const TARGET_ID = 'X';

export function cellOf(piece: Vehicle, offset: number): [number, number] {
  return [piece.row + (piece.axis === 'V' ? offset : 0), piece.col + (piece.axis === 'H' ? offset : 0)];
}

export function vehicleAt(board: Board, row: number, col: number): Vehicle | undefined {
  return board.vehicles.find((piece) =>
    piece.axis === 'H'
      ? piece.row === row && piece.col <= col && col < piece.col + piece.length
      : piece.col === col && piece.row <= row && row < piece.row + piece.length,
  );
}

export function validateBoard(board: Board): string | null {
  if (![board.rows, board.cols].every((size) => Number.isInteger(size) && size >= MIN_SIZE && size <= MAX_SIZE)) {
    return 'Rows and columns must each be between 4 and 10.';
  }
  if (!Array.isArray(board.vehicles) || board.vehicles.filter((piece) => piece.id === TARGET_ID).length !== 1) {
    return 'The board needs exactly one target car X.';
  }
  const ids = new Set<string>();
  const occupied = new Map<number, string>();
  for (const piece of board.vehicles) {
    if (typeof piece.id !== 'string' || !piece.id || ids.has(piece.id)) return 'Each vehicle needs a unique ID.';
    ids.add(piece.id);
    if (piece.axis !== 'H' && piece.axis !== 'V') return `Vehicle ${piece.id} needs a horizontal or vertical direction.`;
    if (piece.id === TARGET_ID && piece.axis !== 'H') return 'The target car must be horizontal.';
    if (!Number.isInteger(piece.length) || piece.length < MIN_LENGTH || piece.length > MAX_LENGTH) {
      return `Vehicle ${piece.id} must be 2 to 4 cells long.`;
    }
    if (!Number.isInteger(piece.row) || !Number.isInteger(piece.col)) return `Vehicle ${piece.id} must align to the grid.`;
    for (let i = 0; i < piece.length; i++) {
      const [row, col] = cellOf(piece, i);
      if (row < 0 || col < 0 || row >= board.rows || col >= board.cols) {
        return `Vehicle ${piece.id} would extend outside the board.`;
      }
      const key = row * board.cols + col;
      const other = occupied.get(key);
      if (other) return `Vehicle ${piece.id} would overlap vehicle ${other}.`;
      occupied.set(key, piece.id);
    }
  }
  return null;
}

export function isSolved(board: Board): boolean {
  const target = board.vehicles.find((piece) => piece.id === TARGET_ID);
  return target !== undefined && target.axis === 'H' && target.col + target.length === board.cols;
}

export function legalMoves(board: Board, id: string): Move[] {
  const piece = board.vehicles.find((vehicle) => vehicle.id === id);
  if (!piece) return [];
  const moves: Move[] = [];
  for (const direction of [-1, 1]) {
    for (let distance = 1; ; distance++) {
      const leading = direction < 0 ? -distance : piece.length - 1 + distance;
      const [row, col] = cellOf(piece, leading);
      if (row < 0 || col < 0 || row >= board.rows || col >= board.cols || vehicleAt(board, row, col)) break;
      moves.push({ id, delta: distance * direction });
    }
  }
  return moves;
}

export function applyMove(board: Board, move: Move): Board | null {
  if (!Number.isInteger(move.delta) || !legalMoves(board, move.id).some(({ delta }) => delta === move.delta)) return null;
  return {
    ...board,
    vehicles: board.vehicles.map((piece) => {
      if (piece.id !== move.id) return piece;
      const [row, col] = cellOf(piece, move.delta);
      return { ...piece, row, col };
    }),
  };
}

export function nextVehicleId(board: Board): string {
  const ids = new Set(board.vehicles.map(({ id }) => id));
  for (let index = 0; ; index++) {
    const id = String.fromCharCode(65 + (index % 26)) + (index >= 26 ? String(Math.floor(index / 26)) : '');
    if (id !== TARGET_ID && !ids.has(id)) return id;
  }
}

export function describeMove(board: Board, move: Move): string {
  const piece = board.vehicles.find(({ id }) => id === move.id);
  const direction = piece?.axis === 'V' ? (move.delta > 0 ? 'down' : 'up') : (move.delta > 0 ? 'right' : 'left');
  const distance = Math.abs(move.delta);
  const name = piece?.id === TARGET_ID ? 'Target car X' : `${(piece?.length ?? 2) > 2 ? 'Truck' : 'Car'} ${move.id}`;
  return `${name} moved ${direction} ${distance} ${distance === 1 ? 'cell' : 'cells'}.`;
}
