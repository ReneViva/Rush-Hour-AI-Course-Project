"""Generate 32 reproducible 6×6 Rush Hour puzzles and certify them with BFS."""

import argparse
import json
import random
import sys
from collections import deque
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "python"))
from rushhour import Board, difficulty_for, position_mask, solve


DESTINATION = ROOT / "src" / "data" / "presets.json"
SEED = 246346
COMPONENT_LIMIT = 6_500
TIER_SIZE = 8
TIERS = ("Beginner", "Intermediate", "Advanced", "Expert")
TARGET = ("H", 2, 2, 4, position_mask(6, "H", 2, 2, 4))
PLACEMENTS = tuple(
    (axis, lane, length, anchor, position_mask(6, axis, lane, length, anchor))
    for axis in ("H", "V")
    for lane in range(6)
    if (axis, lane) != ("H", 2)
    for length in (2, 3)
    for anchor in range(7 - length)
)


def make_layout(rng, count, parent=()):
    layout = [TARGET, *parent[1:]]
    occupied = sum(entry[4] for entry in layout)
    while len(layout) < count:
        free = [entry for entry in PLACEMENTS if not entry[4] & occupied]
        if not free:
            break
        entry = rng.choice(free)
        layout.append(entry)
        occupied |= entry[4]
    return (TARGET, *sorted(layout[1:], key=lambda entry: (entry[0], entry[1], entry[3], entry[2])))


def mutate_layout(rng, layout):
    remainder = list(layout)
    removed = min(rng.choice((1, 1, 1, 2, 2, 3)), len(remainder) - 2)
    for _ in range(removed):
        remainder.pop(rng.randrange(1, len(remainder)))
    return make_layout(rng, len(layout) + rng.choice((-1, 0, 0, 0, 1)), remainder)


def layout_board(layout):
    vehicles = []
    for index, (axis, lane, length, anchor, _) in enumerate(layout):
        row, col = (lane, anchor) if axis == "H" else (anchor, lane)
        vehicles.append({"id": "X" if index == 0 else chr(64 + index),
                         "row": row, "col": col, "axis": axis, "length": length})
    return Board.from_wire({"rows": 6, "cols": 6, "vehicles": vehicles})


def rank_component(board, components):
    """Find a hardest state by starting reverse BFS at every reachable goal."""
    queue = deque([board.initial])
    reachable = {board.initial}
    goals = [board.initial]
    while queue:
        for state, _, _ in board.successors(queue.popleft()):
            if state in reachable:
                continue
            if len(reachable) >= COMPONENT_LIMIT:
                return None
            reachable.add(state)
            queue.append(state)
            if board.at_goal(state):
                goals.append(state)

    topology = tuple((piece.axis, piece.lane, piece.length) for piece in board.vehicles)
    signature = (topology, min(reachable))
    if signature in components:
        return None
    components.add(signature)

    queue = deque((state, 0) for state in goals)
    seen = set(goals)
    while queue:
        state, depth = queue.popleft()
        for successor, _, _ in board.successors(state):
            if successor not in seen:
                seen.add(successor)
                queue.append((successor, depth + 1))
    return state, depth


def generate():
    rng = random.Random(SEED)
    tiers = {tier: [] for tier in TIERS}
    elite, tried, components = [], set(), set()
    for _ in range(7_200):
        if not elite or rng.random() < 0.42:
            layout = make_layout(rng, rng.randint(7, 14))
        else:
            layout = mutate_layout(rng, rng.choice(elite)[1])
        if layout in tried:
            continue
        tried.add(layout)

        board = layout_board(layout)
        ranked = rank_component(board, components)
        if ranked is None:
            continue
        state, depth = ranked
        tier = difficulty_for(depth)
        if depth and (tier == "Beginner" or len(tiers[tier]) < TIER_SIZE):
            candidate = board.to_wire(state)
            solution = solve(Board.from_wire(candidate), "bfs", state_limit=COMPONENT_LIMIT,
                             time_limit=float("inf"))
            if solution["status"] != "solved" or len(solution["moves"]) != depth:
                raise RuntimeError("Forward BFS did not certify the selected puzzle.")
            tiers[tier].append((depth, candidate, len(board.blockers(state))))

        if depth >= 8:
            elite.append((depth, layout))
            elite.sort(key=lambda entry: -entry[0])
            del elite[24:]
        if all(len(entries) >= TIER_SIZE for entries in tiers.values()):
            break
    else:
        raise RuntimeError("Preset generation did not find eight puzzles per tier.")

    beginners = tiers["Beginner"]
    demo = max(beginners, key=lambda entry: (entry[2] > 0, entry[0], entry[2]))
    beginners.remove(demo)
    tiers["Beginner"] = [demo, *sorted(beginners[:TIER_SIZE - 1], key=lambda entry: entry[0])]
    presets = []
    for tier, entries in tiers.items():
        if tier != "Beginner":
            entries.sort(key=lambda entry: entry[0])
        for index, (depth, board, _) in enumerate(entries, 1):
            name = "First Escape" if tier == "Beginner" and index == 1 else f"{tier} {index:02d}"
            presets.append({"id": f"{tier.lower()}-{index:02d}", "name": name,
                            "difficulty": tier, "optimalMoves": depth, "board": board})
    return presets


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="compare to the existing file without writing")
    args = parser.parse_args()
    presets = generate()
    serialized = json.dumps(presets, indent=2) + "\n"
    if args.check:
        if not DESTINATION.exists() or DESTINATION.read_text(encoding="utf-8") != serialized:
            raise SystemExit("Generated presets differ from src/data/presets.json.")
        print(f"Verified {len(presets)} reproducible presets.")
    else:
        DESTINATION.parent.mkdir(parents=True, exist_ok=True)
        DESTINATION.write_text(serialized, encoding="utf-8", newline="\n")
        print(f"Wrote {len(presets)} BFS-certified presets.")


if __name__ == "__main__":
    main()
