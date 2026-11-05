---
name: Rush Hour Lab
description: A tactile tabletop interface for playing and comparing Rush Hour searches.
colors:
  forest: "#244c39"
  forest-hover: "#173c2a"
  sage-tint: "#e2eadc"
  target-red: "#b8312a"
  warm-paper: "#f2efe6"
  panel: "#faf8f0"
  ink: "#20352c"
  muted: "#586459"
  divider: "#d7d5c7"
  action-text: "#fffdf5"
  blocker: "#233628"
typography:
  display:
    fontFamily: "Manrope Variable, Manrope, system-ui, sans-serif"
    fontSize: "clamp(2.15rem, 1.42rem + 3.2vw, 3.8rem)"
    fontWeight: 800
    lineHeight: 1.04
    letterSpacing: "-0.04em"
  body:
    fontFamily: "Manrope Variable, Manrope, system-ui, sans-serif"
    fontSize: "0.89rem"
    lineHeight: 1.52
  notation:
    fontFamily: "IBM Plex Mono, Consolas, Liberation Mono, monospace"
rounded:
  control: "8px"
  panel: "14px"
components:
  button-primary:
    backgroundColor: "{colors.forest}"
    textColor: "{colors.action-text}"
    rounded: "{rounded.control}"
    height: "42px"
    padding: "7px 13px"
  button-secondary:
    backgroundColor: "{colors.sage-tint}"
    textColor: "{colors.forest}"
    rounded: "{rounded.control}"
  button-quiet:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
  controls-panel:
    backgroundColor: "{colors.panel}"
    rounded: "{rounded.panel}"
    padding: "clamp(15px, 2.3vw, 24px)"
---

# Design System for Rush Hour Lab

## Overview

**Creative North Star: "Tactile tabletop"**

The interface takes its cues from a tabletop sliding puzzle. Warm paper surrounds a forest green tray, with bright vehicle bodies and a red target. The controls sit quietly beside the board so the grid, the exit, and each slide carry the experience.

**Key Characteristics:**

- Board-first layouts at desktop and phone widths.
- Legible piece IDs and status markers that work without color.
- Reserved motion for legal slides and short control transitions.

## Colors

Forest green anchors the tray and primary controls. Warm paper, ivory, and a subdued divider organize the surrounding interface. Soft sage, ochre, blue, orchid, clay, and petrol distinguish the ordinary pieces. Signal red belongs to the target and carries an X. A dark dashed inset and a named list identify current blockers.

## Typography

Manrope provides the headings, instructions, and controls. Grid coordinates, vehicle IDs, and numeric board annotations use a monospace stack. Comparison metrics use tabular figures to hold their alignment as counts change.

## Layout

The workbench is capped at 1,008px. Desktop play pairs a large board with a compact controls panel. Below 760px the board stacks above its controls. Search pairs two equal lanes on larger screens and switches to a single visible lane at 740px and below.

## Elevation & Depth

The tray has a shallow molded edge and a soft shadow. Vehicle highlights and inset shadows suggest raised pieces. Panels use a thin divider with an ivory fill.

## Shapes

Rounded rectangles define the tray, pieces, panels, and controls. Cells stay square and meet edge to edge. The exit sits outside the right edge at the target row.

## Components

- Primary and secondary buttons use forest and pale sage. Quiet buttons use ivory and a fine border.
- Fields use a light fill, dark labels, and a clear focus outline. Invalid edits report the problem beside the controls or board.
- Board pieces keep their IDs in every view. Selection and replay add a solid outline. A* uses a dark dashed outline and names the blockers.
- A replay slide moves one piece along its lane. Reduced motion removes the transition.

## Do's and Don'ts

- Do use short action labels and show the board state they affect.
- Do pair the target color and the blocker outline with visible IDs.
- Do show validation close to the affected control or board.
- Don't animate jumps between unrelated search states.
- Don't rely on color alone to identify a piece or communicate its state.
