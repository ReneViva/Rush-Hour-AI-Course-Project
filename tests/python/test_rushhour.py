import json
import sys
import unittest
from collections import Counter, deque
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "python"))
import rushhour


FIXTURES = json.loads((ROOT / "tests" / "fixtures" / "boards.json").read_text(encoding="utf-8"))
CLASSIC = FIXTURES["boards"][0]["board"]


def load_presets():
    return json.loads((ROOT / "src" / "data" / "presets.json").read_text(encoding="utf-8"))


def replay(board, moves):
    state = board.initial
    for move in moves:
        choices = [successor for successor, index, delta in board.successors(state)
                   if board.vehicles[index].id == move["id"] and delta == move["delta"]]
        if len(choices) != 1:
            raise AssertionError(f"Illegal move {move} on {board.to_wire(state)}")
        state = choices[0]
    return state


class BoardTests(unittest.TestCase):
    def test_shared_validation_fixtures(self):
        for fixture in FIXTURES["boards"]:
            with self.subTest(fixture["name"]):
                if fixture["valid"]:
                    board = rushhour.Board.from_wire(fixture["board"])
                    self.assertEqual(board.to_wire(board.initial), fixture["board"])
                    self.assertEqual(board.at_goal(board.initial), fixture["solved"])
                else:
                    with self.assertRaises(ValueError):
                        rushhour.Board.from_wire(fixture["board"])

    def test_shared_move_fixtures(self):
        for fixture in FIXTURES["moves"]:
            with self.subTest(fixture["name"]):
                board = rushhour.Board.from_wire(fixture["board"])
                moves = [{"id": board.vehicles[index].id, "delta": delta}
                         for _, index, delta in board.successors(board.initial)]
                self.assertEqual(fixture["move"] in moves, fixture["legal"])

    def test_heuristic_counts_a_multi_cell_blocker_once(self):
        board = rushhour.Board.from_wire({"rows": 4, "cols": 8, "vehicles": [
            {"id": "X", "row": 1, "col": 1, "axis": "H", "length": 3},
            {"id": "A", "row": 1, "col": 4, "axis": "H", "length": 3},
        ]})
        self.assertEqual(board.blockers(board.initial), ["A"])
        self.assertEqual(board.heuristic(board.initial), 2)

    def test_heuristic_is_consistent_in_a_reachable_component(self):
        board = rushhour.Board.from_wire(CLASSIC)
        queue = deque([board.initial])
        visited = {board.initial}
        while queue:
            state = queue.popleft()
            h = board.heuristic(state)
            if board.at_goal(state):
                self.assertEqual(h, 0)
            for successor, _, _ in board.successors(state):
                self.assertLessEqual(h, 1 + board.heuristic(successor))
                if successor not in visited:
                    visited.add(successor)
                    queue.append(successor)


class SolverTests(unittest.TestCase):
    def test_clear_corridor_is_one_move_even_for_multiple_cells(self):
        board = rushhour.Board.from_wire({"rows": 5, "cols": 9, "vehicles": [
            {"id": "X", "row": 4, "col": 1, "axis": "H", "length": 4},
        ]})
        for algorithm in ("bfs", "astar"):
            with self.subTest(algorithm):
                result = rushhour.solve(board, algorithm)
                self.assertEqual(result["status"], "solved")
                self.assertEqual(result["moves"], [{"id": "X", "delta": 4}])

    def test_resource_limit_is_not_proof_of_no_solution(self):
        classic = rushhour.Board.from_wire(CLASSIC)
        jammed = rushhour.Board.from_wire({"rows": 4, "cols": 4, "vehicles": [
            {"id": "X", "row": 1, "col": 0, "axis": "H", "length": 2},
            {"id": "A", "row": 1, "col": 2, "axis": "H", "length": 2},
        ]})
        for algorithm in ("bfs", "astar"):
            with self.subTest(algorithm):
                limited = rushhour.solve(classic, algorithm, state_limit=1)
                self.assertEqual(limited["status"], "limited")
                self.assertIsNone(limited["moves"])
                limited_by_time = rushhour.solve(classic, algorithm, time_limit=0)
                self.assertEqual(limited_by_time["status"], "limited")
                self.assertEqual(limited_by_time["expanded"], 0)
                impossible = rushhour.solve(jammed, algorithm)
                self.assertEqual(impossible["status"], "unsolvable")
                self.assertEqual(impossible["expanded"], 1)
                self.assertEqual(impossible["frontier"], 0)

    def test_presets_have_certified_optimal_and_replayable_paths(self):
        presets = load_presets()
        self.assertEqual(Counter(preset["difficulty"] for preset in presets),
                         {tier: 8 for tier in ("Beginner", "Intermediate", "Advanced", "Expert")})
        self.assertEqual(len({preset["id"] for preset in presets}), 32)
        demo = rushhour.Board.from_wire(presets[0]["board"])
        self.assertTrue(demo.blockers(demo.initial))
        self.assertEqual(presets[0]["optimalMoves"], 4)
        for preset in presets:
            board = rushhour.Board.from_wire(preset["board"])
            self.assertEqual((board.rows, board.cols), (6, 6))
            self.assertTrue(all(vehicle.length in (2, 3) for vehicle in board.vehicles))
            self.assertEqual(rushhour.difficulty_for(preset["optimalMoves"]), preset["difficulty"])
            for algorithm in ("bfs", "astar"):
                with self.subTest(preset=preset["id"], algorithm=algorithm):
                    result = rushhour.solve(board, algorithm)
                    self.assertEqual(result["status"], "solved")
                    self.assertEqual(len(result["moves"]), preset["optimalMoves"])
                    self.assertEqual(result["g"], preset["optimalMoves"])
                    final = replay(board, result["moves"])
                    self.assertTrue(board.at_goal(final))
                    self.assertEqual(result["board"], board.to_wire(final))


class BridgeTests(unittest.TestCase):
    def tearDown(self):
        rushhour.reset()

    def test_start_step_finish_and_reset(self):
        initial = json.loads(rushhour.start(json.dumps(CLASSIC)))
        self.assertEqual(set(initial), {"bfs", "astar"})
        self.assertEqual(initial["astar"]["blockers"], ["A"])
        self.assertEqual((initial["astar"]["g"], initial["astar"]["h"], initial["astar"]["f"]), (0, 2, 2))
        for frame in initial.values():
            self.assertEqual(frame["status"], "ready")
            self.assertEqual(frame["expanded"], 0)
            self.assertEqual(frame["frontier"], 1)

        pair = json.loads(rushhour.advance(1))
        for frame in pair.values():
            self.assertEqual(frame["status"], "running")
            self.assertEqual(frame["expanded"], 1)
            self.assertEqual(frame["board"], CLASSIC)

        pair = json.loads(rushhour.advance(2))
        self.assertEqual(pair["astar"]["status"], "solved")
        self.assertEqual(pair["bfs"]["status"], "running")
        finished = json.loads(rushhour.advance(1000))
        self.assertEqual(finished["astar"], pair["astar"])
        for frame in finished.values():
            self.assertEqual(frame["status"], "solved")
            self.assertEqual(len(frame["moves"]), 2)
            self.assertGreaterEqual(frame["peakFrontier"], frame["frontier"])

        rushhour.reset()
        with self.assertRaises(ValueError):
            rushhour.advance(1)

    def test_already_solved_root(self):
        board = next(item["board"] for item in FIXTURES["boards"] if item.get("solved"))
        pair = json.loads(rushhour.start(json.dumps(board)))
        for frame in pair.values():
            self.assertEqual(frame["status"], "solved")
            self.assertEqual(frame["moves"], [])
            self.assertEqual(frame["expanded"], 0)
        self.assertEqual(pair["astar"]["h"], 0)

    def test_seeded_random_board_is_reproducible_and_certified(self):
        first = json.loads(rushhour.random_board(246346))
        self.assertIsNotNone(first)
        self.assertEqual(first, json.loads(rushhour.random_board(246346)))
        self.assertNotEqual(first["board"], json.loads(rushhour.random_board(12))["board"])
        self.assertEqual(first["seed"], 246346)
        board = rushhour.Board.from_wire(first["board"])
        self.assertGreater(first["optimalMoves"], 0)
        result = rushhour.solve(board, "bfs")
        self.assertEqual(len(result["moves"]), first["optimalMoves"])

    def test_bad_bridge_input(self):
        with self.assertRaises(ValueError):
            rushhour.start("invalid JSON")
        with self.assertRaises(ValueError):
            rushhour.advance(0)
        with self.assertRaises(ValueError):
            rushhour.random_board(1.5)

    def test_tree_reports_actual_discoveries_and_active_node(self):
        ready = json.loads(rushhour.start(json.dumps(CLASSIC)))
        stepped = json.loads(rushhour.advance(1))
        board = rushhour.Board.from_wire(CLASSIC)
        expected_moves = [{"id": board.vehicles[index].id, "delta": delta}
                          for _, index, delta in board.successors(board.initial)]

        for algorithm in ("bfs", "astar"):
            with self.subTest(algorithm):
                initial = ready[algorithm]["tree"]
                root = {"id": 0, "parentId": None, "move": None, "depth": 0,
                        "h": 2 if algorithm == "astar" else None, "status": "active"}
                self.assertEqual(initial, {"nodes": [root], "activeId": 0, "activePath": [root],
                                           "omittedAncestors": 0, "discovered": 1})

                tree = stepped[algorithm]["tree"]
                self.assertEqual(tree["activePath"], [root])
                self.assertEqual(tree["discovered"], len(expected_moves) + 1)
                self.assertEqual([node["move"] for node in tree["nodes"][1:]], expected_moves)
                for index, node in enumerate(tree["nodes"][1:], 1):
                    self.assertEqual((node["id"], node["parentId"], node["depth"], node["status"]),
                                     (index, 0, 1, "frontier"))
                    state = replay(board, [node["move"]])
                    self.assertEqual(node["h"], board.heuristic(state) if algorithm == "astar" else None)

        next_frames = json.loads(rushhour.advance(1))
        for frame in next_frames.values():
            tree = frame["tree"]
            self.assertNotEqual(tree["activeId"], 0)
            self.assertEqual(tree["nodes"][0]["status"], "expanded")
            self.assertEqual(tree["activePath"][-1]["status"], "active")

    def test_tree_caps_keep_goal_ancestry_after_releasing_search_memory(self):
        expert = next(item for item in load_presets() if item["difficulty"] == "Expert")
        board = rushhour.Board.from_wire(expert["board"])
        for algorithm in ("bfs", "astar"):
            with self.subTest(algorithm):
                engine = rushhour.SearchEngine(board, algorithm)
                while engine.status not in rushhour.TERMINAL:
                    engine.advance_one()
                frame = engine.frame()
                self.assertEqual(frame["status"], "solved")
                self.assertFalse(engine.nodes)
                tree = frame["tree"]
                path = tree["activePath"]
                self.assertEqual(len(tree["nodes"]), rushhour.TRACE_SAMPLE_LIMIT)
                self.assertGreater(tree["discovered"], len(tree["nodes"]))
                self.assertNotIn(tree["activeId"], {node["id"] for node in tree["nodes"]})
                self.assertEqual(len(path), rushhour.TRACE_PATH_LIMIT)
                self.assertEqual(tree["omittedAncestors"], frame["g"] + 1 - len(path))
                self.assertEqual(path[-1]["id"], tree["activeId"])
                self.assertEqual(path[-1]["status"], "goal")
                self.assertEqual([node["move"] for node in path], frame["moves"][-len(path):])
                for parent, child in zip(path, path[1:]):
                    self.assertEqual(child["parentId"], parent["id"])
                    self.assertEqual(child["depth"], parent["depth"] + 1)

    def test_astar_keeps_discovery_id_when_it_finds_a_better_parent(self):
        preset = next(item for item in load_presets() if item["id"] == "intermediate-01")
        board = rushhour.Board.from_wire(preset["board"])
        engine = rushhour.SearchEngine(board, "astar")

        def sample_state(nodes, node):
            moves = []
            while node["parentId"] is not None:
                moves.append(node["move"])
                node = nodes[node["parentId"]]
            return replay(board, reversed(moves))

        previous = {}
        for _ in range(40):
            sampled = {node["id"]: node for node in engine.frame()["tree"]["nodes"]}
            for identifier, node in sampled.items():
                original = previous.get(identifier)
                if original and original["parentId"] != node["parentId"]:
                    self.assertLess(node["depth"], original["depth"])
                    self.assertEqual(sample_state(previous, original), sample_state(sampled, node))
                    return
            previous = sampled
            engine.advance_one()
        self.fail("Expected A* to find a shorter route to a previously discovered state.")


if __name__ == "__main__":
    unittest.main()
