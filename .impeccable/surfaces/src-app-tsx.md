---
version: 1
slug: "src-app-tsx"
primary_target: "src/App.tsx"
related_targets: ["src/components/Board.tsx","src/components/Search.tsx","src/components/Replay.tsx"]
---

# Rush Hour Lab · puzzle workbench

- Mode: Operate. First-time players and AI students need to move a vehicle before reading about search.
- Keep Play, Compare, and Replay as separate views of the same puzzle. The board is always the first work area.
- Target and blocker markers must work without color. Desktop and phone are both required.

## Direction contract

THESIS: Put a tactile puzzle on the desk immediately; show how two search strategies reason about that same board.

OWN-WORLD: Warm paper, forest green tray and controls, contrasting candy-colored vehicle bodies, and a signal-red X. Manrope for interface copy and fixed-width type for grid coordinates and numbers.

STORY: Slide a piece, compare searches from that position, then follow the solution. Dashed outlines and named blockers explain the A* estimate.

FIRST VIEWPORT: One large board on the left, compare and edit actions first in the right column. On phones the board comes first, followed by the same actions below it. Search uses two matching boards on desktop and a shared step with switchable boards on phones.

FORM: User-selected tactile tabletop. Signature motion is one piece sliding along the cell grid during replay. seed: none (unavailable)

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
