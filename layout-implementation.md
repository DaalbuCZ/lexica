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

## Remaining design items

The complete research design is not fully implemented. Nonplanar inputs still use the existing heuristic fallback rather than the proposed planar-subgraph/dual-face routing algorithm. Routes remain single cubics; general navigation meshes and multisegment route rendering/editing are not implemented. Optional constrained dragging and automatic neighbor relaxation are not exposed. Group placement still uses existing local candidate algorithms before final route validation. Compaction uses final geometric feasibility checks rather than a retained auxiliary triangulation's feasible-region solver.

The verifier is conservative for pairwise curves and node obstacle boxes. Full arrowhead-polygon, port-capacity, self-intersection, label-feasibility diagnostics, and continuous swept-motion certificates remain work. Free dragging may create overlaps or unverified previews. Dense sectors can still need more space than desired, and the ungrouped fixture remains larger than its manually compacted reference. Further aesthetic tuning and the 500/1000-node scaling matrix are still required before treating every design acceptance criterion as satisfied.
