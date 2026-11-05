# Rush Hour AI Course Project

Rush Hour Lab is a browser game and search visualizer built for CS246/346 Artificial Intelligence at the American University of Armenia. Play a preset, build your own traffic jam, and compare how breadth-first search (BFS) and A* find the exit. Expand either algorithm to give its board and search tree more room.

[Play Rush Hour Lab](https://reneviva.github.io/Rush-Hour-AI-Course-Project/)

## Run locally

You need Node.js 22.18 or later, npm, and Python 3.10 or later for the native tests and benchmark.

```powershell
npm.cmd ci
npm.cmd run dev
```

Open the address printed by Vite. The board is playable while Python loads in the background.

## Build and share

```powershell
npm.cmd run build
npm.cmd run preview
```

Share or upload the contents of `dist/` to any static host that serves JavaScript modules and WebAssembly. Keep the files in their original relative locations. Use HTTP(S), since opening the HTML file directly from disk prevents module and worker loading. The build can live at the root of a host or in a subdirectory. It contains Python and its runtime, fonts, and puzzle data; it needs no API key, Python server, or external request.

## What the comparison measures

A slide of any legal distance is **one move**. Pieces stay in their own lane and cannot cross other pieces. The goal is reached when the target car's rightmost cell reaches the marked exit.

- **BFS** visits boards in order of distance from the start.
- **A\*** prioritizes `g + h`: the moves already made plus an estimate of the moves still needed. The estimate is one for the target's final slide plus one for each distinct blocker in its exit lane; it is zero at the goal.
- An **expansion** is a position whose legal successors were generated. The frontier contains discovered positions waiting to be considered. Live runtime excludes pauses, animation, and runtime startup. A time or state limit means the search stopped without deciding whether a solution exists.
- **Search** shows positions the algorithms consider. **Replay** shows the actual solution moves.
- In **Search trees**, follow the active path or use **Overview** to see the recorded branches. Select a position to preview its board without changing the search. Each diagram shows up to the first 48 discoveries and the latest 16 positions on the active path.

## Verify and reproduce

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run test:browser
npm.cmd run benchmark --silent > reports/benchmark.csv
```

Browser checks use the installed Chrome or Edge on Windows. On other systems, use an existing Chromium executable via `RUSH_BROWSER_PATH`, or install Playwright Chromium under the project cache:

```powershell
$env:PLAYWRIGHT_BROWSERS_PATH = Join-Path (Get-Location) '.cache/browsers'
npx.cmd playwright install chromium
npm.cmd run test:browser
```

The benchmark writes one row per board and algorithm, with the median of three timed runs after a warm-up. Create the reports directory first if you run the benchmark without the browser checks.

The Python generator uses a fixed seed to recreate the 32 preset boards, with eight boards in each difficulty band. See `tools/generate_presets.py --help` and `tools/benchmark.py --help` for options.
