"""Compare BFS and A* on the preset bank and write solver-only metrics as CSV."""

import argparse
import csv
import json
import statistics
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "python"))
from rushhour import Board, solve


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repeats", type=int, default=3, help="timed runs per puzzle and algorithm")
    args = parser.parse_args()
    if args.repeats < 1:
        parser.error("--repeats must be positive")
    presets = json.loads((ROOT / "src" / "data" / "presets.json").read_text(encoding="utf-8"))
    writer = csv.writer(sys.stdout, lineterminator="\n")
    writer.writerow(("puzzle", "difficulty", "algorithm", "status", "known_optimal_moves",
                     "solution_moves", "expanded_states", "peak_frontier", "median_runtime_ms"))
    for preset in presets:
        board = Board.from_wire(preset["board"])
        for algorithm in ("bfs", "astar"):
            solve(board, algorithm)  # Warm up on the same board before collecting times.
            runs = [solve(board, algorithm) for _ in range(args.repeats)]
            results = {(run["status"], len(run["moves"]) if run["moves"] is not None else None,
                        run["expanded"], run["peakFrontier"]) for run in runs}
            if len(results) != 1:
                raise SystemExit(f"Inconsistent results for {preset['id']} and {algorithm}.")
            status, moves, expanded, peak = results.pop()
            if status != "solved" or moves != preset["optimalMoves"]:
                raise SystemExit(f"{algorithm} did not certify {preset['id']} ({status}, {moves} moves).")
            median = statistics.median(run["runtimeMs"] for run in runs)
            writer.writerow((preset["id"], preset["difficulty"], algorithm, status,
                             preset["optimalMoves"], moves, expanded, peak, f"{median:.3f}"))


if __name__ == "__main__":
    main()
