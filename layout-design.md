# Autolayout algorithm design

Status: proposed architecture, 2026-11-04. This document designs the implementation; it does not claim new solver behavior or measured speedups. Based on the `layout.md` handoff and code at `d7b9408` on `codex/graph-groups-layout`; code observations refer to that working branch, not necessarily the current `main`.

Implementation progress: see [layout-implementation.md](layout-implementation.md) for the shipped paths, measured checks, and remaining design items. The acceptance targets below remain targets rather than measured guarantees.

Reproduction: import `C:/Users/wwwho/Downloads/no-groups-fixed-topology.json` into the local Vite app; select Radial / Compact / Smart Groups off / Disregard previous groups on. Repeat with `groups-fixed-topology.json` in the same directory and Smart Groups on. Each reference has 82 states and 134 transitions; the grouped reference has eight groups. The fixtures are private local inputs and are not part of this document commit.

## Decision

Use a family of algorithms sharing an explicit embedding, geometric constraints, and a route cache. Arrange constructs a new drawing from topology. Dragging edits the current drawing with everything outside a small affected region fixed. Neither path should invoke a global crossing-repair search as its normal operation.

The central rule is **construct a feasible drawing first, then improve its appearance without losing feasibility**. Radial means a compact arrangement of branches around a root, not mandatory concentric breadth-first rings. Rings remain useful for isolated stars and wheels; arbitrary cyclic graphs need more freedom.

| Algorithm               | Responsibility                                             | Allowed changes                                    |
| ----------------------- | ---------------------------------------------------------- | -------------------------------------------------- |
| Topology analysis       | Components, blocks, embedding, visible-view mapping        | No drawing changes                                 |
| Planar seed             | A valid straight-line realization with reserved space      | All positions during Arrange                       |
| Radial block packing    | Compact tree branches and cyclic blocks around the root    | Whole branches and blocks during Arrange           |
| Constrained compaction  | Shorten edges, improve shape and spacing                   | Only feasible coordinate changes                   |
| Corridor routing        | Straight edges, parallel lanes, loops and obstacle detours | Routes within their allocated space                |
| Incremental repair      | Keep a drag responsive and spatially local                 | Selected objects and invalidated routes by default |
| Label/comment placement | Readability after geometry settles                         | Labels and attached comments                       |

## What the current implementation implies

- `layout-topology.js` already separates Arrange input from saved positions and bends. Preserve that boundary and strengthen canonical ordering.
- `planar-layout.js` returns positions and a planarity flag, but drops the rotation system and faces needed by later stages.
- `planar-grid.js` augments by repeatedly testing planarity. That can choose a new embedding on each augmentation. Retain a particular embedding and insert auxiliary edges into its faces instead. Its current array scans and explicit shift sets must not be described as a linear-time implementation merely because a linear-time algorithm exists.
- `smart-layout.js` often replaces planar coordinates with `radialTree`, then calls crossing repair, local shortening, and compaction. These stages do not share an invariant describing the allowed geometric region.
- `layout.js` routes globally and caches by serialization of the drawing. `crossingPairs` is not an acceptance oracle for rendered geometry.
- `interactive-routes.js` provides a useful endpoint-transport preview. `live-routing.js` coalesces requests, but sends complete drawings; `routing-worker.js` routes the entire view. Preserve the coalescing, replace the unit of work.
- Groups are different views of the same machine in `groups.js`. Solve and validate each visible view, including outside-state images and start-view decorations. Do not mutate the lexer graph to make the drawing easier.

## 1. Contracts and priorities

### Arrange

Input is canonical topology, retained group membership, labels and measured sizes, layout settings, and solver version. Coordinates, bends, saved view offsets, and prior solver caches must not affect the answer. Disregard-groups removes membership before analysis; automatic grouping then depends on topology alone.

Canonicalize a solver copy by stable state IDs and transition descriptors. Keep an explicit mapping back to original transition indices; never reorder the FSM's transition array, which may carry execution priority. Identical parallel transitions receive deterministic occurrence indices. Visual ordering can be deterministic without changing lexer ordering. Do not use locale-dependent comparison, random IDs, hash iteration order, or elapsed time as candidate tie breaks.

Guarantees apply to the complete visible drawing, not only to a simple skeleton. A successful planar result has no unintended wire intersections, node/edge penetration, or overlapping arrowheads outside designated endpoint attachment regions. Clearance is measured using actual node shapes, stroke widths, arrowheads and portal boxes. Long labels and comments are placed afterward; inability to fit them must be reported separately rather than silently invalidating the graph.

### Drag

Default: follow the pointer; keep all unselected node positions fixed. Preserve valid routes exactly, preserve manual bends, preserve lane sides and loop sectors while feasible, and do not regroup, repack, or choose a new global embedding on release. A deliberate edge-bend drag edits that edge only. Moving an outside-state image changes that view's image, not the original state.

An arbitrary pointer motion can move a vertex through a cycle or onto another vertex. Pointer fidelity, fixed surrounding nodes, bounded routing work, and persistent planarity cannot all be guaranteed. Default free dragging prioritizes pointer fidelity and local stability; temporarily or finally infeasible geometry is allowed and identified. Never claim a planar certificate for that state.

An optional constrained-drag mode projects movement onto the reachable feasible region, with a visible constrained position. An optional local-relax mode can move nearby unpinned nodes after release. Neither is implicit in ordinary dragging. These are proposed policies, not existing UI controls.

### Objective ordering

Use hard feasibility gates before aesthetic scores. For Arrange, compare feasible candidates using a normalized cost:

`E = 4 * excessEdgeLength + 2 * longestEdgePenalty + 2 * occupiedArea + radialDeviation + flowPenalty + 0.5 * angularPenalty`.

These are initial tuning weights, not established constants. Normalize lengths by desired clearance-aware edge length, area by total object area, and sums by the number of terms. Penalize excess length quadratically, especially the longest local connections. Do not count reciprocal transitions twice when scoring skeleton length. Routing compares bend count before small length improvements, and uses curvature/length ratio to penalize wiggles.

For drag repair, use lexicographic priorities: respect the user's edit and pins; avoid new violations where feasible; minimize the affected region; minimize changed routes and optional moved nodes; minimize displacement; then improve appearance. Do not trade a distant route change for a tiny local length improvement. Add hysteresis: retain a feasible existing lane or label placement unless the improvement exceeds a fixed threshold.

## 2. Shared analysis and representation

Build a simple undirected skeleton per visible view, with a bundle mapping from each skeleton edge to all directed transitions. Remove loops only from the skeleton; retain them as decorations with space demands. Resolve semantic destinations before building the view; a rendered portal is a local decorated endpoint, not a fictitious visible wire to a distant state.

Compute connected components, articulation vertices, and biconnected blocks with DFS. Use the block-cut tree to distinguish independent branches from cyclic structure. SCCs help describe directional flow and suggest groups, but are not a replacement for undirected blocks when preserving planarity.

Maintain these derived records outside the saved FSM:

```text
Topology: canonical IDs, original-index mapping, bundles, components, blocks
Embedding: half-edges, twin/next/face links, cyclic port order, outer face per component
Geometry: node footprints, positions, routing corridors, reserved junction sectors
Routes: per-transition segments, ports, lane, loop sector, bounds, labels, provenance
Index: spatial index of inflated obstacles, corridor pieces, route pieces and labels
Versions: document, visible view, topology, geometry, metrics, settings, gesture, request
Certificate: feasible / conflicting / unverified, witnesses and geometry version
```

An embedding describes edge order, not sufficient geometric clearance. A certificate belongs to particular positions and rendered routes, and expires when those change. Imported drawings start unverified; inspect their actual geometry before treating them as feasible. Preserve existing conflicts as a baseline during free drag rather than attempting an unexpected global repair.

## 3. Global placement family

### 3.1 Establish the planar seed

Test planarity once per canonical view skeleton. Handle isolated nodes and bridges directly. For cyclic blocks, retain the returned rotation system. Augment within faces to obtain a triangulated plane graph, compute a canonical ordering, and use a grid drawing. Auxiliary vertices/edges are solver-only and must never become FSM transitions.

A first implementation can use a whole-component grid seed. A later blockwise implementation draws blocks separately and assembles their block-cut tree. Both must produce and validate the same kind of certificate before optimization. Never fall back to the imported coordinates.

Outer-face choice is aesthetic, not arbitrary: rank faces by compatibility with the root and branch attachments, useful boundary length, and compactness estimates; use stable face signatures for ties. Try at most four candidates. A radial hub need not be on the outer face: retain candidates that surround the hub. Choose rotation/reflection deterministically, preferring rightward subgroup flow when feasible.

Scale the seed to give positive space for real node footprints, bundle lanes, and junction wedges. Separate unrelated connected components before decorations. If a high-degree vertex cannot accommodate all ports at the requested clearance on its fixed boundary, use a reserved fan-out region and report any remaining port congestion; scaling distances alone does not enlarge a node's circumference.

### 3.2 Radial block packing

Root the block-cut tree at the start state's block; without a start, choose a deterministic central block. Compute each branch's demand bottom-up from its laid-out footprint, lane widths, and descendants. Allocate contiguous angular sectors by demand rather than descendant count alone.

For a tree branch, use tidy-tree contours in local coordinates, then seek a wedge placement. Mapping a tree into polar coordinates is only a candidate generator: validate the resulting straight spokes and footprints. For cyclic blocks, keep their valid drawing and apply rigid rotations/translations and positive uniform scales. Attach child blocks in free wedges at the articulation vertex, with disjoint envelopes except at that vertex. Enlarge a sector or radius when a child does not fit; do not simply squeeze it across another branch.

Changing branch order is permitted only at valid articulation attachments or other explicitly supported embedding transformations. Do not sort the neighbors of a cyclic block by BFS depth or angle and call that a planar embedding. General separation-pair/SPQR optimization is a possible later extension, not a first-release dependency.

Special candidates: exact centered wheel placement for a wheel; evenly spaced spokes for an isolated star; short tidy branches for acyclic subgroups. Validate every candidate with the same full constraints. A motif classifier must verify the entire block topology before applying a template.

### 3.3 Feasible compaction

Improve the seed with bounded deterministic coordinate descent. Proposal types are vertex movement toward a weighted neighbor barycenter, shortening a degree-two chain, rigid branch rotation/translation, and closing unused space between branch envelopes. Recompute the objective only for affected terms.

For a single vertex in a triangulated straight-line drawing, signed-area inequalities for incident auxiliary triangles define a conservative region in which it can move without reversing those triangles. Intersect that region with the local trust region; require positive area margins. This is an acceleration and embedding guard, not a replacement for footprint/corridor clearance checks. Fix a surrounding scaffold during local optimization; outer-boundary changes need separate full validation. Triangle-wise linear constraints do not extend unchanged to simultaneous multi-vertex moves.

For every proposal, query changed node footprints and swept edge/corridor bounds against the spatial index. Check port order, face containment, clearance, and segment intersections. Perform fixed-count backtracking (initially eight halvings) and accept only an improvement with a valid geometry certificate. For multi-object moves, check the swept path in constrained-drag mode; checking endpoints alone permits tunneling. Global Arrange may accept a separately certified final drawing without animating an unsafe interpolation.

Suggested initial work bound: four seed candidates, twelve compaction sweeps, and a fixed number of proposals per vertex/branch. A failed proposal leaves the last feasible drawing untouched. No proposal invokes whole-graph curve routing. If local optimization stalls, return the feasible seed/improvement; do not enter an unbounded repair loop.

## 4. Routing family

### 4.1 Reserve corridors before beautifying curves

Around each skeleton segment reserve a tube sized for its bundle, stroke widths, and required gaps. At vertices reserve disjoint attachment wedges in embedding order. Nonincident tubes must be disjoint and avoid node footprints; incident tubes may meet only inside their explicitly allocated junction regions. If tubes do not fit, expand placement or reject the candidate before routing.

The basic planar route stays in its tube. An unobstructed single transition is straight. For obstacles introduced by a visible view, construct a small local free-space navigation mesh within the permitted face/corridor, find a shortest polyline with a bend penalty, then simplify it. Preserve route homotopy during drag: do not unexpectedly switch from one side of an obstacle to the other. Changing homotopy is a bounded explicit repair only when the existing corridor is infeasible.

Fit curves only where they remain certified inside the corridor. A cubic's control polygon contained in a convex corridor cell is a sufficient containment test; endpoints inside a nonconvex corridor are not. Split a route into several segments when necessary. The current single-cubic representation cannot express every constrained route. Extend the internal route representation, canvas drawing, hit testing, bounds and exports together; retain a single-cubic adapter for existing bends. Until that is complete, reject a candidate that needs unsupported geometry instead of drawing an unchecked cubic.

### 4.2 Parallel, reciprocal and loop routes

Choose one canonical direction per bundle (ordered endpoint IDs), define its physical normal once, and assign stable lane offsets. Opposite directed transitions occupy opposite physical sides relative to that canonical normal. Keep lane order compatible at both endpoint port fans. Multiple same-direction transitions get distinct stable lanes, reserving space for arrowheads near the endpoints.

Loops occupy a wedge between consecutive incident bundles. Rank wedges by usable clearance and separation from labels, then prefer shorter loops. Reserve the entire loop hull, not just its apex. Keep multiple loops in separate or nested lanes with independent arrow/label space. During dragging, keep the selected wedge until infeasible; switch with hysteresis. This addresses the exponent loop without prescribing a fixture-specific compass direction.

### 4.3 Labels and comments

Place labels from a finite candidate set along their own routes, checking real measured boxes against the spatial index. Order difficult labels first (fewest feasible candidates), with stable ID ties; allow a bounded local swap pass. Include leaders in validation when used. Do not bend an otherwise clear edge merely to move its caption a few pixels.

Place attached comments last in nearby free regions. Preserve detached comments according to existing editor behavior; identify unavoidable conflicts rather than using saved comment geometry as an Arrange seed. If labels cannot fit, try bounded local spacing expansion and revalidation, then return a readability diagnostic. Comments never alter embedding or angular order.

## 5. Incremental algorithms for dragging

### 5.1 Discover the affected set geometrically

On pointer-down capture a versioned drawing snapshot, incident-edge lists, and the spatial index. Include selected nodes, incident bundles, their loops, and attached comments. Query the swept bounds of moved footprints and transported routes to add any nonincident routes, labels, portal boxes, or nodes that may now conflict. A graph-distance neighborhood alone misses an unrelated wire directly beneath the pointer.

The first repair region contains those conflicts and their local corridor/junction dependencies. Freeze all geometry outside it. If a changed route intersects another route, add that dependency before committing. Set an initial cap of 64 route bundles and two dependency-expansion rounds; tune from measurements. Exceeding the cap leaves a flagged preview for asynchronous bounded repair, never a hidden global Arrange.

### 5.2 Pointer-frame algorithm

1. Apply the user's latest position to the selected objects.
2. Transport incident route endpoints/control handles from the gesture snapshot, preserving rigid translation when both endpoints moved together. Keep unaffected route objects identical.
3. Reuse valid lane and loop assignments; query local conflicts. Draw the preview immediately, even while a repair is pending. Preview geometry is unverified until checked.
4. Send the latest affected-region patch to a persistent worker. Maintain at most one in-flight request and one newest pending request. Send topology/metrics once per version, not a serialized machine every frame.

The worker first tries endpoint transport, then local corridor deformation, then rerouting only invalid routes in their face. Moving other nodes is prohibited by default. Keep valid old route geometry even if a newly computed alternative is slightly shorter.

Apply a worker patch only when document, view, topology, metrics/settings, gesture and geometry/request versions match. Discard stale results; using matching topology alone is insufficient. A future optimization may rebase a patch after independently validating its unchanged dependencies, but exact version matching is the initial safe implementation. Sequence cancellation checks between bounded batches; terminate on document replacement/unmount.

### 5.3 Release and optional local relaxation

On release, validate/repair the affected region against the frozen exterior, then commit one undo transaction containing the drag and accepted route changes. No full reroute should follow automatically. If the newest worker request is pending, associate its result with that transaction and reject it after any later edit or undo.

If local relaxation is enabled, pin the dragged objects at their requested positions. Begin with conflicting unpinned neighbors; expand by one dependency ring only after failure. Optimize displacement from the pointer-down snapshot before edge length, with a movement radius and affected-node cap (initially 24 nodes). At the cap, keep the user's edit and show unresolved conflicts. Do not move an entire connected component to solve a local problem.

For constrained dragging, advance only to the last certified point along the pointer path, using continuous collision detection or conservative subdivision with bounded motion. Clamp when the checking budget is exhausted. This supplies a strict guarantee from an initially feasible drawing without pretending an arbitrary target position is feasible.

## 6. Groups and nonplanar graphs

Retained groups are fixed semantic membership. Layout the overview and each group view separately; external-state images get view-specific keys and positions. Prefer images on the left and internal flow rightward, but relax this preference before violating planarity. A retained disconnected group can produce a nonplanar quotient even when the original graph is planar, so test the actual overview too.

Automatic groups should come from connected block branches or connected SCC-based regions with few boundary attachments. Rank a bounded set by topology-only size/boundary criteria, then evaluate at most a small fixed number geometrically. Avoid repeatedly laying out the whole graph once per arbitrary subset. Removing old groups must not leave their coordinates or IDs as hidden inputs.

For a nonplanar skeleton, build a deterministic maximal planar subgraph by ordered edge insertion (not a claim of maximum size). Prefer structurally important edges, using topology-derived priorities. Route omitted edges through faces using a dual-graph search that penalizes crossings, bends, and length. Represent planned crossings as solver-only dummy vertices while laying out the planarized graph; remove dummies from output topology and render clean crossings with no arrowhead at them. Revalidate clearance after routing.

Crossing minimization is heuristic. Distinguish `nonplanar topology`, `fixed-position/embedding conflict`, and `solver budget exhausted`; a failed placement is not evidence that the input graph is nonplanar. Never create portals or delete transitions merely to make a crossing count smaller.

## 7. Verification and performance

### Geometry oracle

Use broad-phase bounding boxes followed by robust segment orientation/intersection and distance predicates. For rendered cubics, recursively subdivide using control-hull bounds and a conservative flatness error. Inflate distance tests by that error; continue subdividing ambiguous pairs. At the depth/precision cap return `unverified`, never a false clear result. A conservative rejection is preferable to certifying a tangle.

Test incident edges outside their allowed endpoint/junction masks, loops against all other geometry and themselves, parallel lanes, portal boxes, arrowhead polygons, and label boxes. Count tangencies and overlapping segments as clearance failures even when they are not proper crossings. Validate the exact route segments used by canvas/export. Do not validate one set of curves and silently recompute another in the renderer.

### Work and latency

Let `n` be visible nodes, `m` skeleton edges, `r` rendered route pieces, `q` spatial-index candidate pairs, and `k` the affected local geometry. Component/block analysis is O(n+m). A suitable planarity implementation and canonical-grid algorithm can be linear; the current implementations need profiling before making that claim. Four candidate seeds and fixed optimization sweeps bound search, but collision checking can still be quadratic in dense geometry.

With an index, local queries typically cost O(k log(n+r) + q); `q` may be quadratic in a crowded region. Adaptive curve checking also depends on geometric precision. Bound subdivisions, route candidates and dependency growth explicitly. Avoid promising O(degree) work when a dragged object intersects many unrelated routes.

Initial acceptance targets on a recorded reference machine, not measured results:

| Operation                                          | Target                                              |
| -------------------------------------------------- | --------------------------------------------------- |
| Arrange, supplied 82-state/134-transition fixtures | Warm p95 under 1 second, cold p95 under 2 seconds   |
| Pointer-frame geometry work                        | p95 under 4 ms; total frame within 16.7 ms at 60 Hz |
| Ordinary local drag repair                         | p95 under 50 ms                                     |
| Release settlement                                 | p95 under 150 ms                                    |

Measure analysis, augmentation, seed placement, compaction, routing, verification, labels, serialization and patch application separately. Count global route calls, candidate evaluations, changed objects, spatial queries and rejected stale replies. Test grouped/ungrouped fixtures and synthetic 100/500/1000-node sparse graphs; publish scaling rather than assuming the small fixture is representative.

Use operation-count budgets for deterministic Arrange output. Wall-clock timers may schedule/yield work and cancel a request, but must not silently choose a different final drawing. An explicit canceled solve leaves the document unchanged. Cache keys include canonical topology, dimensions, settings and solver version; a warm cache must produce the same result as a cold run.

### Regression matrix

- Geometry: trees, stars, wheels, nested cycles, articulation chains, disconnected components, near-collinear edges, high-degree hubs, large bundles, loops and tiny incident-edge crossings. Use K3,3 and K5 for nonplanar behavior.
- Determinism: scramble coordinates, bends, context positions and old groups; compare canonical drawing output for identical inputs. Check cold/warm cache parity and stable behavior after irrelevant array reordering without changing transition execution order.
- Interaction: drag a leaf, hub, group, image and manual bend; drag across a distant wire and through a cycle; rapid pointer motion, release, undo, view changes, worker errors and unmount. Assert exact equality of geometry outside the affected set.
- Semantics: unchanged states, transition order/destinations, lexer results, retained group membership and save/import/export behavior. Save/reload must reproduce certified geometry or run and validate the same deterministic routing policy.
- Visual acceptance: compare readable-zoom screenshots of the supplied fixtures, especially the identifier intermediate, reciprocal underscore/integer pair, exponent loop and slash/comment branch. Record total/maximum local edge length, detour ratio, bends, minimum clearance, area and changed-object counts; zero crossings alone is insufficient.

The fixture files remain outside the repository. Their hand-edited coordinates are comparison references only. The reported 38-second baseline comes from `layout.md`; this design pass did not rerun that benchmark.

## 8. Implementation sequence and compatibility gates

1. Add the geometry oracle and stage instrumentation without changing placement. Capture actual first-failure stages on the two fixtures.
2. Return embeddings and original-edge mappings from analysis. Implement a certified grid seed with face-preserving augmentation and reserved decoration space. Add full rendered-geometry tests.
3. Introduce corridor routing and a shared route result consumed by rendering, hit testing and export. Preserve old FSM schemas; any richer derived paths must be reproducible on reload, or require an explicitly backward-compatible optional format extension before shipping. Do not squeeze arbitrary multi-segment routes into `edge.bend`.
4. Add radial block candidates and bounded feasible compaction. Compare against the seed, retaining the best certified candidate. Replace mandatory radial-ring assumptions only for general graphs; keep the existing wheel test as a valid special case.
5. Add versioned route patches and spatial invalidation to the live worker. Implement default route-only drag repair first; constrained drag and node relaxation are separate later policies.
6. Validate groups and nonplanar fallback. Remove `repairRadialCrossings`, `untangle`, and unrestricted cleanup from the certified Radial Compact path after the replacement passes the matrix. Leave other layout modes on their existing path until separately migrated.

Proposed core interfaces (names illustrative): `analyzeView(topology, metrics)`, `arrangeView(analysis, options)`, `routeRegion(drawing, dirtySet, policy)`, `validateDrawing(drawing, changedSet)`. Core owns pure geometry; editor owns snapshots, workers, transactions and canvas lifecycle; React owns settings and diagnostics. `applyLayout` must apply the certified positions and route representation together, not trigger an unrelated route solve afterward.

The first deliverable should be a correct, possibly less compact planar drawing with a trustworthy verifier. The second makes it attractive. The third makes interactive edits local. This ordering gives each optimization a valid baseline and makes regressions attributable.

## References

These explain established primitives; the budgets, objectives and Lexica integration above are design proposals, not guarantees supplied by a library.

- [Boost Graph: planar graphs](https://www.boost.org/doc/libs/develop/libs/graph/doc/html/graph/algorithms/planar/planar_graphs.html) describes rotation-system embeddings and the augmentation/canonical-ordering/straight-line-drawing pipeline.
- [Boost Graph: canonical ordering](https://www.boost.org/doc/libs/latest/libs/graph/doc/html/graph/algorithms/planar/planar_canonical_ordering.html) gives the maximal-planar precondition and the theoretical linear-time ordering result.
- [yFiles: incremental layout](https://docs.yworks.com/yfiles-html/dguide/layout-incremental_layout/) explains preserving a user's mental map by retaining the placement of unchanged elements. This is conceptual precedent, not a proposal to add a commercial dependency.
