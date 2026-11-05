"""Rush Hour rules, incremental search, and the browser's JSON bridge."""

import heapq
import json
import random
from collections import deque
from dataclasses import dataclass
from time import perf_counter


STATE_LIMIT = 100_000
TIME_LIMIT_SECONDS = 8.0
TRACE_SAMPLE_LIMIT = 48
TRACE_PATH_LIMIT = 16
TERMINAL = frozenset({"solved", "unsolvable", "limited"})
ANCHOR_BYTES = tuple(bytes((index,)) for index in range(10))


def position_mask(cols, axis, lane, length, anchor):
    """Encode a vehicle's occupied cells in one integer."""
    if axis == "H":
        return ((1 << length) - 1) << (lane * cols + anchor)
    return sum(1 << ((anchor + offset) * cols + lane) for offset in range(length))


@dataclass(frozen=True, slots=True)
class Vehicle:
    id: str
    axis: str
    length: int
    lane: int


@dataclass(frozen=True, slots=True)
class Board:
    rows: int
    cols: int
    vehicles: tuple
    initial: bytes
    masks: tuple
    order: tuple
    target_index: int

    @classmethod
    def from_wire(cls, data):
        if not isinstance(data, dict):
            raise ValueError("Board must be an object.")
        rows, cols = data.get("rows"), data.get("cols")
        if any(type(size) is not int or not 4 <= size <= 10 for size in (rows, cols)):
            raise ValueError("Board rows and columns must each be between 4 and 10.")
        entries = data.get("vehicles")
        if not isinstance(entries, list):
            raise ValueError("Board vehicles must be a list.")

        vehicles, anchors, masks = [], [], []
        ids = set()
        occupied = 0
        for entry in entries:
            if not isinstance(entry, dict):
                raise ValueError("Each vehicle must be an object.")
            identifier = entry.get("id")
            axis, length = entry.get("axis"), entry.get("length")
            row, col = entry.get("row"), entry.get("col")
            if not isinstance(identifier, str) or not identifier or identifier in ids:
                raise ValueError("Vehicle IDs must be nonempty and unique.")
            if axis not in ("H", "V"):
                raise ValueError(f"Vehicle {identifier} must have a horizontal or vertical axis.")
            if type(length) is not int or not 2 <= length <= 4:
                raise ValueError(f"Vehicle {identifier} must have length 2, 3, or 4.")
            if identifier == "X" and axis != "H":
                raise ValueError("The target vehicle X must be horizontal.")
            if type(row) is not int or type(col) is not int:
                raise ValueError(f"Vehicle {identifier} must use integer coordinates.")

            lane, anchor = (row, col) if axis == "H" else (col, row)
            along, across = (cols, rows) if axis == "H" else (rows, cols)
            if not (0 <= lane < across and 0 <= anchor <= along - length):
                raise ValueError(f"Vehicle {identifier} extends beyond the board.")
            vehicle_masks = tuple(position_mask(cols, axis, lane, length, cell)
                                  for cell in range(along - length + 1))
            if occupied & vehicle_masks[anchor]:
                raise ValueError(f"Vehicle {identifier} overlaps another vehicle.")
            occupied |= vehicle_masks[anchor]
            ids.add(identifier)
            vehicles.append(Vehicle(identifier, axis, length, lane))
            anchors.append(anchor)
            masks.append(vehicle_masks)

        if "X" not in ids:
            raise ValueError("Place a horizontal target vehicle X before searching.")
        order = tuple(sorted(range(len(vehicles)), key=lambda index: vehicles[index].id))
        target_index = next(index for index in order if vehicles[index].id == "X")
        return cls(rows, cols, tuple(vehicles), bytes(anchors), tuple(masks), order, target_index)

    def to_wire(self, anchors):
        vehicles = []
        for vehicle, anchor in zip(self.vehicles, anchors):
            row, col = (vehicle.lane, anchor) if vehicle.axis == "H" else (anchor, vehicle.lane)
            vehicles.append({"id": vehicle.id, "row": row, "col": col,
                             "axis": vehicle.axis, "length": vehicle.length})
        return {"rows": self.rows, "cols": self.cols, "vehicles": vehicles}

    def at_goal(self, anchors):
        target = self.vehicles[self.target_index]
        return anchors[self.target_index] + target.length == self.cols

    def _corridor(self, anchors):
        target = self.vehicles[self.target_index]
        start = anchors[self.target_index] + target.length
        return ((1 << (self.cols - start)) - 1) << (target.lane * self.cols + start)

    def blockers(self, anchors):
        corridor = self._corridor(anchors)
        return [self.vehicles[index].id for index in self.order
                if self.masks[index][anchors[index]] & corridor]

    def heuristic(self, anchors):
        corridor = self._corridor(anchors)
        if not corridor:
            return 0
        return 1 + sum(bool(mask[anchor] & corridor)
                       for mask, anchor in zip(self.masks, anchors))

    def successors(self, anchors):
        occupied = 0
        for mask, anchor in zip(self.masks, anchors):
            occupied |= mask[anchor]

        for index in self.order:
            mask = self.masks[index]
            anchor = anchors[index]
            other_vehicles = occupied ^ mask[anchor]
            for direction in (-1, 1):
                destination = anchor + direction
                while 0 <= destination < len(mask) and not mask[destination] & other_vehicles:
                    successor = anchors[:index] + ANCHOR_BYTES[destination] + anchors[index + 1:]
                    yield successor, index, destination - anchor
                    destination += direction


@dataclass(frozen=True, slots=True)
class _Node:
    id: int
    cost: int
    heuristic: int | None
    parent: bytes | None = None
    vehicle: int = 0
    delta: int = 0


class SearchEngine:
    """A deterministic incremental BFS or A* lane with bounded working memory."""

    def __init__(self, board, algorithm, state_limit=STATE_LIMIT, time_limit=TIME_LIMIT_SECONDS):
        if algorithm not in ("bfs", "astar"):
            raise ValueError("Choose BFS or A*.")
        self.board = board
        self.is_astar = algorithm == "astar"
        self.state_limit = state_limit
        self.time_limit = time_limit
        self.status = "ready"
        self.current = board.initial
        self.current_cost = 0
        self.expanded = 0
        self.peak = 1
        self.elapsed = 0.0
        self.moves = None
        self.final_frontier = 0
        root = _Node(0, 0, board.heuristic(board.initial) if self.is_astar else None)
        self.nodes = {board.initial: root}
        self.trace_states = [board.initial]
        self.trace_expanded = set()
        self.final_tree = None
        self.queue = deque()
        self.heap = []
        self.open_cost = {}
        self.sequence = 0
        self._push(board.initial, root)
        if board.at_goal(board.initial):
            self._pop()
            self._finish("solved", [])

    def _frontier_size(self):
        return len(self.open_cost) if self.is_astar else len(self.queue)

    def _push(self, state, node):
        if self.is_astar:
            self.sequence += 1
            self.open_cost[state] = node.cost
            heapq.heappush(self.heap, (node.cost + node.heuristic, node.heuristic,
                                       self.sequence, state, node.cost))
        else:
            self.queue.append(state)

    def _pop(self):
        if not self.is_astar:
            return self.queue.popleft()
        while self.heap:
            _, _, _, state, cost = heapq.heappop(self.heap)
            if self.open_cost.get(state) == cost:
                del self.open_cost[state]
                return state
        raise RuntimeError("A* frontier lost its next state.")

    def _move(self, node):
        return {"id": self.board.vehicles[node.vehicle].id, "delta": node.delta}

    def _reconstruct_moves(self, state):
        moves = []
        node = self.nodes[state]
        while node.parent is not None:
            moves.append(self._move(node))
            node = self.nodes[node.parent]
        return list(reversed(moves))

    def _trace_node(self, state):
        node = self.nodes[state]
        if state == self.current:
            status = "goal" if self.status == "solved" else "active"
        elif node.id < TRACE_SAMPLE_LIMIT and node.id not in self.trace_expanded:
            status = "frontier"
        else:
            # Nodes outside the sample only appear as ancestors of the current node.
            status = "expanded"
        return {"id": node.id, "parentId": self.nodes[node.parent].id if node.parent is not None else None,
                "move": self._move(node) if node.parent is not None else None,
                "depth": node.cost, "h": node.heuristic, "status": status}

    def _tree(self):
        path = []
        state = self.current
        while state is not None and len(path) < TRACE_PATH_LIMIT:
            path.append(self._trace_node(state))
            state = self.nodes[state].parent
        path.reverse()
        return {"nodes": [self._trace_node(state) for state in self.trace_states],
                "activeId": path[-1]["id"], "activePath": path,
                "omittedAncestors": path[0]["depth"], "discovered": len(self.nodes)}

    def _finish(self, status, moves=None):
        self.final_frontier = self._frontier_size()
        self.peak = max(self.peak, self.final_frontier)
        self.status = status
        self.moves = moves
        self.final_tree = self._tree()
        self.nodes.clear()
        self.queue.clear()
        self.heap.clear()
        self.open_cost.clear()
        self.trace_states.clear()
        self.trace_expanded.clear()

    def _step(self):
        if self.elapsed >= self.time_limit:
            self._finish("limited")
            return

        state = self._pop()
        self.current = state
        current = self.nodes[state]
        self.current_cost = current.cost
        if self.board.at_goal(state):
            self._finish("solved", self._reconstruct_moves(state))
            return

        self.status = "running"
        self.expanded += 1
        if current.id < TRACE_SAMPLE_LIMIT:
            self.trace_expanded.add(current.id)
        cost = self.current_cost + 1
        for successor, vehicle, delta in self.board.successors(state):
            known = self.nodes.get(successor)
            if known is not None and (not self.is_astar or known.cost <= cost):
                continue
            if known is None:
                identifier = len(self.nodes)
                if identifier >= self.state_limit:
                    self._finish("limited")
                    return
                if identifier < TRACE_SAMPLE_LIMIT:
                    self.trace_states.append(successor)
                heuristic = self.board.heuristic(successor) if self.is_astar else None
            else:
                identifier, heuristic = known.id, known.heuristic
                self.trace_expanded.discard(identifier)
            node = _Node(identifier, cost, heuristic, state, vehicle, delta)
            self.nodes[successor] = node
            self._push(successor, node)

        frontier = self._frontier_size()
        self.peak = max(self.peak, frontier)
        if not frontier:
            self._finish("unsolvable")
        elif self.is_astar and len(self.heap) > max(64, 2 * frontier):
            # Drop stale entries from cost decreases without changing tie order.
            self.heap = [entry for entry in self.heap if self.open_cost.get(entry[3]) == entry[4]]
            heapq.heapify(self.heap)

    def advance_one(self):
        if self.status not in TERMINAL:
            started = perf_counter()
            self._step()
            self.elapsed += perf_counter() - started

    def frame(self):
        blockers = self.board.blockers(self.current) if self.is_astar else []
        heuristic = (0 if self.board.at_goal(self.current) else 1 + len(blockers)) if self.is_astar else None
        return {
            "status": self.status,
            "board": self.board.to_wire(self.current),
            "frontier": self.final_frontier if self.status in TERMINAL else self._frontier_size(),
            "expanded": self.expanded,
            "peakFrontier": self.peak,
            "runtimeMs": self.elapsed * 1000,
            "g": self.current_cost,
            "h": heuristic,
            "f": self.current_cost + heuristic if heuristic is not None else None,
            "blockers": blockers,
            "moves": self.moves,
            "tree": self.final_tree if self.final_tree is not None else self._tree(),
        }


def solve(board, algorithm, state_limit=STATE_LIMIT, time_limit=TIME_LIMIT_SECONDS):
    engine = SearchEngine(board, algorithm, state_limit, time_limit)
    while engine.status not in TERMINAL:
        engine.advance_one()
    return engine.frame()


class SearchSession:
    def __init__(self, board):
        self.lanes = {name: SearchEngine(board, name) for name in ("bfs", "astar")}

    def advance(self, rounds):
        for _ in range(rounds):
            if all(lane.status in TERMINAL for lane in self.lanes.values()):
                break
            for lane in self.lanes.values():
                lane.advance_one()
        return self.frames()

    def frames(self):
        return {name: lane.frame() for name, lane in self.lanes.items()}


def difficulty_for(optimal_moves):
    if optimal_moves < 5:
        return "Beginner"
    if optimal_moves < 10:
        return "Intermediate"
    if optimal_moves < 20:
        return "Advanced"
    return "Expert"


def random_preset(seed):
    """Reverse legal slides from solved layouts, then certify the move count."""
    rng = random.Random(seed)
    deadline = perf_counter() + 2.0
    target = {"id": "X", "row": 2, "col": 4, "axis": "H", "length": 2}
    options = []
    for axis in ("H", "V"):
        for lane in range(6):
            if axis == "H" and lane == 2:
                continue
            for length in (2, 3):
                for anchor in range(7 - length):
                    row, col = (lane, anchor) if axis == "H" else (anchor, lane)
                    options.append((row, col, axis, length, position_mask(6, axis, lane, length, anchor)))

    for _ in range(24):
        if perf_counter() >= deadline:
            break
        occupied = position_mask(6, "H", 2, 2, 4)
        vehicles = [target]
        for index in range(rng.randint(6, 11)):
            free = [option for option in options if not option[4] & occupied]
            if not free:
                break
            row, col, axis, length, mask = rng.choice(free)
            vehicles.append({"id": chr(65 + index), "row": row, "col": col,
                             "axis": axis, "length": length})
            occupied |= mask

        board = Board.from_wire({"rows": 6, "cols": 6, "vehicles": vehicles})
        state = board.initial
        seen, candidates = {state}, []
        for _ in range(rng.randint(24, 56)):
            successors = [entry[0] for entry in board.successors(state) if entry[0] not in seen]
            if not successors:
                break
            state = rng.choice(successors)
            seen.add(state)
            if board.heuristic(state) > 1:
                candidates.append(state)
        if not candidates:
            continue

        candidate = Board.from_wire(board.to_wire(rng.choice(candidates)))
        remaining = deadline - perf_counter()
        if remaining <= 0:
            break
        result = solve(candidate, "bfs", state_limit=6_500, time_limit=remaining)
        if perf_counter() >= deadline:
            break
        if result["status"] == "solved":
            moves = len(result["moves"])
            return {"id": f"random-{seed}", "name": f"Random {seed}",
                    "difficulty": difficulty_for(moves), "optimalMoves": moves,
                    "board": candidate.to_wire(candidate.initial), "seed": seed}
    return None


_session = None


def start(board_json):
    global _session
    if not isinstance(board_json, str):
        raise ValueError("Send the board as a JSON string.")
    try:
        data = json.loads(board_json)
    except json.JSONDecodeError as error:
        raise ValueError("Board JSON could not be read.") from error
    _session = SearchSession(Board.from_wire(data))
    return json.dumps(_session.frames())


def advance(rounds):
    if type(rounds) is not int or not 1 <= rounds <= 1000:
        raise ValueError("Advance by 1 to 1000 search rounds.")
    if _session is None:
        raise ValueError("Start a search before advancing it.")
    return json.dumps(_session.advance(rounds))


def reset():
    global _session
    _session = None


def random_board(seed):
    if type(seed) is not int:
        raise ValueError("Random seed must be an integer.")
    return json.dumps(random_preset(seed))
