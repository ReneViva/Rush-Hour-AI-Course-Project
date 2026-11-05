import { useEffect, useMemo, useState } from 'react';
import { applyMove, type Board, type Move } from './model';

const stepDuration = 700;

function buildHistory(board: Board, moves: Move[]) {
  const history = [board];
  for (const move of moves) {
    const previous = history[history.length - 1];
    const next = applyMove(previous, move);
    if (!next) break;
    history.push(next);
  }
  return history;
}

export function useSolutionPlayback(board: Board, moves: Move[]) {
  const history = useMemo(() => buildHistory(board, moves), [board, moves]);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const total = history.length - 1;
  const currentIndex = Math.min(index, total);
  const atEnd = currentIndex === total;
  const isPlaying = playing && !atEnd;

  useEffect(() => {
    if (!isPlaying) return;
    const timer = window.setTimeout(() => {
      setIndex(currentIndex + 1);
      if (currentIndex + 1 === total) setPlaying(false);
    }, stepDuration / speed);
    return () => window.clearTimeout(timer);
  }, [currentIndex, isPlaying, speed, total]);

  function seek(next: number) {
    setPlaying(false);
    setIndex(Math.max(0, Math.min(total, next)));
  }

  function toggle() {
    if (total === 0) return;
    if (atEnd) setIndex(0);
    setPlaying(!isPlaying);
  }

  return {
    board: history[currentIndex], index: currentIndex, total, atEnd, playing: isPlaying,
    validPath: total === moves.length,
    speed, setSpeed, seek, toggle,
  };
}
