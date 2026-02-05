# CROSS-DEVICE

## Intent
Deliver a mobile experience that feels deliberately designed, not a cramped desktop. The core promise is a "Jobs‑era" flow: minimal choices per moment, strong hierarchy, immediate feedback, and no visual noise. The user should always know where to tap next.

## Principles (Mobile)
- **Single focus per band**: Canvas = work surface, Dock = actions, Timeline = sequence.
- **No clutter**: hide anything that does not directly advance the step.
- **Touch-first**: large hit targets, no tiny controls, no multi‑purpose ambiguity.
- **Immediate feedback**: selection, add, reorder must feel instant.
- **Spatial memory**: Canvas always top, actions always middle, assets always bottom.

## Mobile Layout (<= 900px)

### Structure
Top‑down flow:
1. **Canvas** (top, primary surface)
2. **Commit Dock** (fixed row)
3. **Assets Timeline** (bottom drawer)

### Canvas
- **Fixed aspect ratio: 4:3**.
- Fit strategy: **choose width or height that allows full photo to be visible** (auto fit).
- Supports **pinch‑to‑zoom** and **single‑finger pan**.
- **Zoom limits**: min 1x, max 2x.
- Tap on canvas adds points.
- **Gesture conflict rule**:
  - Short press = tap
  - Move beyond threshold = pan
  - Threshold uses a small movement tolerance (see Touch Rules).
- When drawer is Full: canvas interactions disabled.

### Commit Dock (Mobile)
- Horizontal row, compact but touch‑safe.
- Buttons in this order: **ADD / DEL / PLAY / LOOP / STYLE / BGM**.
- 44px minimum tap height.
- Reduce label weight and padding, but keep ALL CAPS.
- Keep dock visible at all times in editing/previewing.

### Assets Drawer (Mobile)
- Docked bottom sheet with **2 snap points**:
  - **Peek** (default): partial height (focus on canvas)
  - **Full**: near full screen for sequence work
- Snap transitions use `--ease-out-expo`.

### Assets Timeline (Mobile)
- **Orientation: horizontal** (time axis left‑to‑right).
- Cards are horizontal, scrollable with momentum.
- Reorder: **long‑press drag** (0.18–0.25s press threshold).
- Drag placeholder shows solid border + slight scale.
- The current playing index is highlighted with a strong outline.

### Footer
- Hidden on mobile entirely.

## Desktop Layout (> 900px)
- Keep existing 3‑column layout: Canvas | Dock | Timeline.
- No change to desktop interactions or density.

## States & Transitions
- Upload → Editing: dock + timeline animate in.
- Encoding: overlay on canvas; dock disabled; drawer fixed to Peek.
- Previewing: dock buttons disabled except play/loop; timeline highlights active subject.

## Touch & Gesture Rules
- **Tap vs Pan** (best practice):
  - Start tracking on pointer down.
  - If movement distance > 8–10px, treat as pan and cancel tap.
  - If pointer up without exceeding threshold, treat as tap.
- **Pinch** takes priority over pan/tap when two touches are detected.
- Drawer drag uses vertical axis only; ignore horizontal movement.
- Timeline scroll uses horizontal axis only; vertical movement ignored.
- Long‑press drag should not block simple horizontal scrolling.

## Accessibility & Ergonomics
- Hit target minimum: 44px.
- Preserve contrast ratio for labels and outlines on black background.
- Avoid mixed gesture conflict zones (no drag handles overlapping canvas).

## Implementation Notes
- **Primary device detection**: UA‑based detection (treat **iPhone + Android** as mobile; **iPad as desktop**).
  - Rationale: user explicitly prefers UA as the switcher.
  - Note: iOS "Request Desktop Website" changes UA and viewport, so it will intentionally receive desktop layout.
- Use media queries as a **secondary guardrail** (e.g., fine pointer + large width).
- Drawer height managed by state (`snapIndex`) and CSS var `--drawer-height`.
- Timeline uses `horizontalListSortingStrategy` on mobile; vertical on desktop.
- Add props:
  - `AssetsTimeline` -> `orientation?: 'vertical' | 'horizontal'`
  - `AssetsTimeline` -> `dragActivation?: 'long-press' | 'immediate'`
  - `CommitDock` -> `layout?: 'vertical' | 'horizontal'`

## Visual Guidelines
- All caps labels only.
- Use Space Grotesk / Space Mono.
- Black background + white text.
- Functional color only for subject markers.
- No emoji.
- Transitions use `--ease-out-expo`.

## Open Questions (If needed later)
- Exact pixel heights for Peek/Full (tune by device testing).
- Whether to auto‑expand drawer to Full after first subject is added.
