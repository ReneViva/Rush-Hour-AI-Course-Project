import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { applyMove, isSolved, validateBoard, type Board, type Move } from '../src/model.ts';

const fixtures = JSON.parse(readFileSync(new URL('./fixtures/boards.json', import.meta.url), 'utf8')) as {
  boards: { name: string; board: Board; valid: boolean; solved?: boolean }[];
  moves: { name: string; board: Board; move: Move; legal: boolean }[];
};

for (const { name, board, valid, solved } of fixtures.boards) {
  test(name, () => {
    assert.equal(validateBoard(board) === null, valid);
    if (valid) assert.equal(isSolved(board), solved);
  });
}
for (const { name, board, move, legal } of fixtures.moves) {
  test(name, () => {
    const before = structuredClone(board);
    const after = applyMove(board, move);
    assert.equal(after !== null, legal);
    assert.deepEqual(board, before);
    if (after) assert.equal(validateBoard(after), null);
  });
}
