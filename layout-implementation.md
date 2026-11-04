# Layout implementation status

2026-11-04, feature branch `codex/graph-groups-layout`. The design is in `layout-design.md`; this records the actual implementation and its limits.

## Implemented

- Planar grid augmentation inserts diagonals into the existing face corners and preserves the rotation system instead of rerunning planarity after every insertion. Topology analysis returns canonical ID ordering and cyclic neighbor orders.
- Radial placement compares a bounded set of radial, block, root-branch wedge, and planar seeds. Root branches use affine wedge transforms and reserved fan-out space. Compaction shortens local connections, translates whole branches inward, and closes large empty strips; every accepted move passes skeleton intersection and clearance checks. Stars/wheels retain symmetry. No imported coordinates seed this path.
- Global radial views are checked with their rendered lane and loop routes before acceptance. Deterministic bounded expansion retries replace repeated global crossing repair. A planar view that cannot be routed within the budget leaves the editor document unchanged.
- The corridor router gives parallel/reciprocal transitions stable physical lanes, reserves separated attachment ports, chooses loops from clear sectors, and moves labels independently. Adaptive control-hull checks include incident curves and loops. Spatial hashing limits obstacle candidates. The canvas and SVG/TikZ exports use the shared router.
- Smart Groups on large radial graphs selects up to eight connected topology branches before layout, avoiding repeated whole-graph trial layouts. Retained groups and outside-image positions keep their existing semantics.
- Dragging transports routes immediately, finds conflicts from swept geometry, repairs only a bounded dirty region, and retains untouched route objects exactly. Default repair moves no surrounding nodes. Failure preserves the user's requested position and returns unverified geometry.
- Routing workers retain a baseline and receive changed-position patches, coalesce pending requests, and reject stale results by the complete requested geometry key and view. Release performs local settlement even when live rerouting is disabled. Optional `drawingRoutes` metadata preserves settled curves through reload/export/undo; exact drawing signatures invalidate stale records. Arrange ignores and replaces this metadata. Older readers can ignore it.
- Solver diagnostics report placement, refinement, routing verification, comment placement, and total time without affecting candidate selection. Tests cover determinism, clearance, local stability, work limits, persisted routes, and stale worker replies.

## Verification

All 138 domain tests pass, as do lint and the production build. The new Playwright workflow exercises Arrange, a node drag, unchanged surrounding nodes, route persistence, and reload in the running Vite app.

Both private 82-state/134-transition fixtures were arranged through the app with Radial / Compact / Disregard current groups on, with Smart Groups off/on respectively. There were no page errors. Adaptive pairwise verification returned clear for the ungrouped drawing, the grouped overview, and all eight group views, including loops and incident pairs. This certifies pairwise curve separation at the requested tolerance, not every aesthetic or arrowhead constraint in the design.

Representative CLI runs were about 3.5 seconds ungrouped and 1.1 seconds grouped before the last instrumentation changes. Browser end-to-end runs were about 9.0 seconds and 4.2 seconds respectively; these include UI, worker startup and persistence overhead and are not interchangeable with CLI solver timing. The handoff's earlier ungrouped CLI result was about 38 seconds. The design's subsecond performance targets have not been achieved. Screenshots and all fixture-derived files remain ignored under `.migration/`.

The two older browser workflows fail on both the unchanged `cb86977` baseline and this implementation: the SVG preview test expects a textarea that the UI replaced with an image, and the group workflow cannot click an offscreen Close group button. These failures are separate from the new passing layout workflow.

## Aesthetic refinement

The subsequent aesthetic pass operates on the certified drawing. It considers rigid chunks on either side of articulation vertices as well as individual nodes, uses per-edge transition-label length targets, and accepts a move only after clearance and complete curve routing pass. Long configured edges retain their required length while short neighboring edges can contract. Candidate and route-check budgets keep the additional search bounded.

Comment placement searches a full compass of directions and checks both the comment box and its leader against rendered curves. Reciprocal bundles prefer wider ports and lanes, with narrower certified alternatives when surrounding geometry requires them. These preferences never bypass the crossing checks.

In the private CLI comparison, the ungrouped drawing's bounds decreased from about 5,164 × 5,041 to 3,939 × 4,120 (about 38% less bounding area). The comparison-operator subgroup decreased from about 594 × 686 to 430 × 335. Additional search increased representative CLI times to about six seconds ungrouped and 2.4 seconds grouped. These are local measurements, not performance guarantees.

The regression suite now contains 141 passing domain tests, including label-dependent branch shortening, reciprocal separation and clear-side comment placement.

## Radial progression and centering

Radial cleanup now also scores first-ring regularity and outward progression by undirected distance from the start. Same-depth connections and cycles have no forced arrow orientation. Circular first-ring candidates use polar warping, local radial translation, or harmonic displacement; complete clearance and route checks decide whether they are usable. Accepted rings are pinned during later chunk compaction. Candidate size is bounded to avoid enlarging a drawing merely to obtain a circle. A compact certified circle is not guaranteed for every graph; the solver falls back to soft preferences while keeping the non-crossing requirement.

Fit now shares the visible-viewport calculation with navigation, ignores collapsed tester panels, and uses symmetric padding. Browser regressions check centering on both initial load and Arrange with a collapsed right-side tester, and continue to check local drag/reload.

## Component independence and horizontal alignment

Disconnected components now solve independently and are packed afterward using visible drawing bounds. Retained group membership keeps disconnected members in the same solve. Adding isolated states no longer changes the connected component's automatic groups, candidate selection, or node coordinates. Transition-caption placement uses the actual rendered box and prioritizes node clearance; a fallback label-only move also handles long captions from the legacy router. Intentional manual bends retain their existing label behavior.

Tree and subgroup cleanup tries exact horizontal alignment for edges within a small angle/offset tolerance. The start and outside images stay pinned; proposed alignment must pass node/edge clearance and adaptive rendered-route separation checks. Radial overview alignment is left to its separate outward-flow preference.

## Constructive first ring and live connections

The first-ring search now includes a constructive branch candidate: direct neighbors receive circle attachments, and each independently attached branch is rotated/translated with its attachment. This avoids relying exclusively on whole-drawing warps. This constructive candidate is judged by clearance and routed feasibility rather than the old relative-area cutoff; the smallest feasible circle candidate wins. The real auto-grouped fixture now has direct-neighbor radii from 757.9793267781499 to 757.9793267781503, with adaptive curve checks clear in the overview and all eight groups.

Interactive automatic connections rotate their attachment frame with moved endpoints, and their captions search around the current curve immediately, including when live worker routing is disabled. Worker repair can freeze individual manual/portal routes rather than letting one such edge disable repair for the entire view. Unaffected route objects remain unchanged. These changes have dedicated preview and mixed-manual/automatic regression tests.

## Cycle and directional refinements

Analysis bundles parallel/reciprocal rules into a simple skeleton while retaining original transition indices and execution order. Simple biconnected cycles have no length cutoff; overlapping short chordless cycles use a bounded search (length eight, 64 retained cycles, 20,000 visits). Cycle costs prefer similar edge lengths and penalize dangling branches inside the polygon. Regular-polygon candidates respect label length requirements, and rigid branch rotations try the exterior. A weak directional score separates incoming and outgoing neighbor sectors, with a tolerance band for already opposed directions. Every accepted change still requires clearance and full route feasibility. Tree views additionally validate their actual rendered router before applying a cycle candidate; horizontal cleanup may not materially worsen the motif score.

Reciprocal bundles allocate an independent lane band to each direction, including unequal rule counts. Attachment fans preserve each bundle's contiguous order around the node. The convention is clockwise in screen coordinates: for a horizontal pair, left-to-right lanes run above the centerline and right-to-left lanes below it. Small drawings and the legacy/interactive fallback follow the same convention. Same-direction bundles remain adjacent; FSM rule arrays are never reordered or merged semantically.

The regression suite contains 155 passing domain tests, including cycle balance, a dangling state leaving a cycle, long-cycle detection, multiplicity-independent analysis, weak flow scoring, and unequal clockwise bundles. Seven targeted browser workflows pass. Both private fixture overviews and all eight group views remain clear under adaptive curve separation checks, including incident wires and loops.

## Stable routing across view navigation

The editor retains bounded per-view route snapshots keyed by group, caption mode, and full drawing signature. An open overlay's background uses the main canvas's exact displayed routes and labels; closing restores that snapshot. Subgroup routing and worker replies no longer replace the overview's state simply because the active view changed. Geometry or caption changes still invalidate the relevant snapshot. Committed manual edge/portal geometry is also stored using the existing optional drawing metadata.

Two browser regressions record painted curve paths and text coordinates across three open/close cycles, with live routing enabled and disabled and a mix of automatic, reciprocal, and saved manual curves. Together with the existing gesture/layout checks, nine targeted browser workflows pass.

## Whole-subgroup aesthetic candidates

Small subgroups (up to 24 visible states) receive a separate bounded candidate pass after their ordinary layout. This compares complete drawings instead of changing the global radial objective: entry-distance columns expose diamond and staircase alternatives, small entry fans try alternate orders with staggered vertices, articulation tails can rotate together, and two-vertex separators can flip an entire component across their chord. Horizontal entry spacing includes the formatted caption; short terminal forks retain a shorter, symmetric advance.

The objective counts enclosed states across cycles, encourages progress from the subgroup entry, and prefers horizontal chains. At most 24 promising candidates reach the complete corridor router. Every accepted drawing also preserves the baseline node/wire clearance thresholds and passes the straight skeleton crossing check. Outside context positions are applied together with the inner drawing so the accepted geometry is the geometry actually displayed. Main radial placement, incremental dragging, manual bends, and portal views are unchanged by this pass.

Regression motifs cover caption room with a balanced fork, the string diamond with a horizontal exit, and an entry fan that releases its complete tail from enclosing cycles. The actual comparison, small string, identifier, and large string subgroups were rendered and inspected as well as checked for certified route separation.

## Remaining design items

The complete research design is not fully implemented. Nonplanar inputs still use the existing heuristic fallback rather than the proposed planar-subgraph/dual-face routing algorithm. Routes remain single cubics; general navigation meshes and multisegment route rendering/editing are not implemented. Optional constrained dragging and automatic neighbor relaxation are not exposed. Group placement still uses existing local candidate algorithms before final route validation. Compaction uses final geometric feasibility checks rather than a retained auxiliary triangulation's feasible-region solver.

The verifier is conservative for pairwise curves and node obstacle boxes. Full arrowhead-polygon, port-capacity, self-intersection, label-feasibility diagnostics, and continuous swept-motion certificates remain work. Free dragging may create overlaps or unverified previews. Dense sectors can still need more space than desired, and the ungrouped fixture remains larger than its manually compacted reference. Further aesthetic tuning and the 500/1000-node scaling matrix are still required before treating every design acceptance criterion as satisfied.
