# Venice · Rome Renaissance Sphere — Architecture Overview

## Mental model

The whole visualization rests on one idea: **decouple the two axes that carry meaning from each other, then let each be produced by the mechanism best suited to it.**

- **x/z (the "network" plane)** — where a node sits horizontally is produced by a real 2D force simulation (`d3-force`), exactly like the original flat network diagram. It answers "who's connected to whom."
- **y (the "time" axis)** — where a node sits vertically is a pure deterministic function of a calendar year (`yScale`). It answers "when." Nothing physical or simulated touches it; a year always maps to the same height.

Everything else in the codebase exists to *build geometry along those two axes*, *react to selection*, or *keep the HTML/3D worlds in sync*. That three-way split — layout, geometry, interaction — is the actual architecture.

---

## Component hierarchy

```
DATA                    NODES_DATA, LINKS_DATA        — plain JSON, the only source of truth
   │
CONFIG                  one object, ~15 named sections — every tunable number lives here, nowhere else
   │
LAYOUT PASS              computeXZLayout()             — runs once, synchronously, before any rendering
   │                     (freezes n.posX / n.posZ onto each node in NODES_DATA)
   │
SCENE CONSTRUCTION       buildTimeGrid()                — static: rings, meridians, historical events
   │                     buildNodes()
   │                       ├─ buildCities()              — one THREE.Group per city
   │                       └─ buildArtists()              — one THREE.Group per artist (S-curve lifeline)
   │                     buildLinks()                    — one THREE.Line per city↔artist edge
   │
STATE LAYER              currentSelection (single var)
   │                     getConnected() / directLinks()  — read LINKS_DATA, answer "who's linked to X"
   │                     applyOpacityState()             — the ONE function that sets every material's opacity
   │                     applyPulls() / resetPullTargets()— sets animation *targets*, never positions directly
   │
RENDER LOOP               requestAnimationFrame loop in initThree()
   │                     — eases positions toward targets, re-derives link curves, renders the frame
   │
HTML OVERLAY LAYER        #infoImage / #infoText / #infoConnector / #legendPanel / (#cityPosPanel)
                          — plain DOM, positioned every frame from a 3D→2D projection of the scene
```

Two parallel "worlds" run side by side: the **THREE.Scene** (everything WebGL-rendered) and the **DOM overlay** (info card, legend, dev sliders). They only talk to each other through `camera.project()` — the DOM elements don't know about geometry, they just get told "put yourself at this pixel."

---

## The five components, and their single job each

### 1. Data (`NODES_DATA`, `LINKS_DATA`)
Deliberately dumb: plain objects and a `{source, target}` edge list, nothing precomputed. This is what makes the rest of the code testable/predictable — anything derived (`posX`, `midY`, `midLocal`, `restX`…) is a field *added onto* these objects later by a specific build step, never invented ad hoc somewhere in the middle of rendering.

### 2. `CONFIG`
A single object is the *only* place magic numbers live — sphere radius, colors, force strengths, opacity levels, pull factors, easing speeds, camera limits, even the city coordinate overrides. Every section is comment-annotated with what turning the knob does. This is a **single-source-of-configuration** pattern: nothing in the geometry/animation code hardcodes a number that isn't read from here, so the whole visual language can be retuned without touching logic.

### 3. `computeXZLayout()` — the layout pass
This is the piece most worth calling out architecturally: it's a **one-shot batch simulation**, not a live physics loop. It spins up a `d3.forceSimulation`, manually ticks it ~400 times synchronously (`sim.tick()` in a `for` loop, never `.on('tick', …)`), applies a circular containment clamp each iteration, then **freezes** the result onto `n.posX`/`n.posZ` and throws the simulation away. Three.js never sees d3's simulation objects — by the time the scene is built, x/z are just static numbers. This is why the "3d-force-graph" experiment was a genuinely different architecture (continuous live physics) rather than a tweak: this file's physics is a *preprocessing step*, not a runtime system.

The other structurally important thing here: **the d3-mutation fix**. `d3.forceLink(...).id(...)` rewrites `LINKS_DATA`'s `source`/`target` from id strings into node object references the moment it's registered — a well-known d3 gotcha. The fix restores plain strings immediately after the simulation, so every later piece of code (`getConnected`, `directLinks`, the guard in `buildLinks`) can keep doing simple `l.source === name` string comparisons without ever knowing the mutation happened. That's a **normalize-at-the-boundary** pattern: fix a foreign library's side effect at the one point it's introduced, rather than defending against it everywhere it might be read.

### 4. Scene construction (`buildTimeGrid`, `buildCities`, `buildArtists`, `buildLinks`)
Each `build*` function has one job: turn config + data into `THREE.Object3D`s and push them into shared registries. The registries are the connective tissue of the whole file:

- `pickables[]` — anything clickable (fed to `THREE.Raycaster`)
- `persistentDimmables[]` / `detailDimmables[]` — the two-tier opacity system (see below)
- `cityAnim[]` / `artistAnim[]` — animation state (target values, phase offsets, current eased position)
- `linkEntries[]` / `cityGroups{}` / `artistGroups{}` / `nodeIndex{}` — lookup tables keyed by name

Notice the **group-per-node** pattern: every city/artist is one `THREE.Group` positioned at a single (x, y, z), with all its child meshes (tube, birth/death markers, junction sphere, labels) at *local* offsets inside that group. This is what makes the animation system simple — pulling or floating a node only ever means moving `group.position`, never touching individual child meshes.

Artist lifelines specifically use a `CubicBezierCurve3` → `TubeGeometry` pipeline: two control points bowed outward in opposite directions produce the "S" shape, and the exact same curve object is queried (`curve.getPoint(0.5)`) to place the junction sphere — geometry and "meaning" (the link-attachment point) come from the same source instead of being independently guessed.

### 5. State layer — the real heart of the interactivity
Three ideas, kept strictly separate:

- **`getConnected(name)` / `directLinks(name)`** — pure functions, no side effects, answer graph-connectivity questions by scanning `LINKS_DATA`. Nothing else in the file duplicates this logic.
- **`applyOpacityState()`** — the *only* function allowed to write `material.opacity`. It's called after every selection change and reads nothing but `currentSelection` + the registries. Centralizing this in one function is what makes the two-tier "persistent vs. detail" opacity system (circles always at least dimly visible; lifelines/years hidden until relevant) consistent everywhere instead of being reimplemented per click handler.
- **`applyPulls()` / `resetPullTargets()`** — never move anything directly. They only set `.target` fields on the animation registries. The actual motion happens once, in the render loop's easing step. This separation (decide *where things should go* vs. *how they get there*) is why the floating idle animation and the selection-driven pull can run simultaneously without fighting each other — they're layered additively on the same `target`/`current` pair.

### 6. Render loop
One `requestAnimationFrame` recursion inside `initThree()`. Per frame it: eases every animated group toward its current target, re-derives the link Bézier curves from the (now-moved) endpoints, updates the DOM overlay's screen position, and renders. Because link geometry is *recomputed every frame from live positions* rather than built once, links never need special-casing when their endpoints are mid-animation.

### 7. HTML overlay layer
`#infoImage`/`#infoText`/`#infoConnector` are ordinary positioned `<div>`s, not part of the WebGL scene. Each frame, `updateInfoOverlayPosition()` takes a 3D anchor point, runs it through `camera.project()`, converts NDC → pixels, and sets `style.left/top` directly. This is the standard **3D-to-2D billboard overlay** pattern — it lets the info card use real DOM/CSS (images, links, text wrapping) instead of fighting WebGL text rendering, at the cost of needing to keep re-projecting every frame.

The legend panel and the (optional, code-visible) city-position slider panel are fully independent of the 3D scene — generic draggable/collapsible panel helpers (`makePanelDraggable`, `makeCollapsible`) that only touch the DOM.

---

## Coding patterns used throughout

- **Single source of truth per concern** — one `CONFIG` for numbers, one `NODES_DATA`/`LINKS_DATA` for content, one `applyOpacityState()` for all opacity, one `yScale()` for all time→position math. Nothing is computed two different ways in two different places.
- **Freeze-then-forget simulation** — d3 is used as a batch layout solver, not a live dependency; its output is copied into plain numbers and the simulation object is discarded.
- **Registries over queries** — rather than walking the THREE.Scene graph to find "all artist year labels" when opacity needs updating, every relevant object is pushed into a flat array (`detailDimmables`, etc.) at creation time, tagged with the node name it belongs to. Updates become a single `.forEach`.
- **Group-local geometry** — a node's *identity position* is one `THREE.Group.position`; everything about its visual complexity lives as local-space child offsets, so animating the node is always a one-line position change.
- **Target/current separation for animation** — nothing is ever animated by mutating a position toward a hardcoded destination inline; code sets a `target`, and a single shared easing step in the render loop is what actually moves things. This is what let two independent animations (idle float + selection pull) coexist without collision.
- **Normalize foreign side effects at the boundary** — the d3-mutation fix is the clearest example: fix a library's surprising behavior exactly where it happens, so every consumer downstream can stay simple.
- **Config-documented tunables** — every numeric knob in `CONFIG` has an inline comment saying what increasing/decreasing it does, so behavior can be retuned without re-reading the logic that consumes it.
