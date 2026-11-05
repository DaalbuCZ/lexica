import { createRoot } from 'react-dom/client';
import './explainer.css';
import './implementation.css';

function Code({ children }) {
  return (
    <pre>
      <code>{children}</code>
    </pre>
  );
}

function Guide() {
  return (
    <>
      <header className="masthead">
        <a href="./index.html">
          <span aria-hidden="true">λ</span> Lexica
        </a>
        <span>Implementation notes</span>
      </header>
      <main className="implementation-guide">
        <header className="intro">
          <h1>Implementing the layout</h1>
          <p>
            Keep the graph’s meaning stable while searching for better geometry. Here is how to
            structure that search, where to spend computation, and what to check before accepting a
            move.
          </p>
        </header>
        <nav className="guide-contents" aria-label="Implementation guide contents">
          <a href="#records">1 · Data shapes</a>
          <a href="#pipeline">2 · The pipeline</a>
          <a href="#placement">3 · Placement</a>
          <a href="#groups">4 · Groups</a>
          <a href="#proposals">5 · Local search</a>
          <a href="#routes">6 · Routing</a>
          <a href="#performance">7 · Optimization</a>
          <a href="#integration">8 · Integration</a>
        </nav>
        <p className="guide-note">
          The snippets below are simplified pseudocode. Field subsets and helper names illustrate
          the design; the source map at the end points to the implementation.
        </p>
        <section id="records">
          <h2>1. Separate records from geometry</h2>
          <p>
            A state ID identifies a state through every layout. An edge’s array index identifies its
            transition through grouping, bundling, and route generation. Keep the full machine
            records as the authority for lexer behavior, and derive analysis structures from them.
          </p>
          <Code>{`Topology {
  start: StateId | null
  states: [{ id, name?, token?, accepting?, ... }]
  edges: [{ from: StateId, to: StateId, label, portal?, ... }]
  groups: [{ id, name, stateIds: StateId[], ... }]
  comments: [{ id, nodeIds?, ... }]
}`}</Code>
          <p>
            This subset follows <code>layoutTopology</code>. It strips old positions, route bends,
            and group context positions while retaining the semantic fields. The solver works on
            copies. Geometry is added to those records as the solve progresses.
          </p>
          <Code>{`Drawing {
  states: [{ ...state, x, y }]
  groups: [{ ...group, x, y, contextPositions? }]
  edges: [{ ...transition, bend? }]
}

Route {
  p0: { x, y }, c1: { x, y },
  c2: { x, y }, p3: { x, y }
}`}</Code>
          <p>
            A route’s four points define a cubic Bézier. Node placement and transition routing
            remain separate representations, because several distinct transitions can share one
            placement link.
          </p>
          <p>
            For analysis, build <code>Map&lt;StateId, State&gt;</code>, adjacency sets, and endpoint
            bundles. A bundle stores canonical endpoints plus <code>indices</code>,{' '}
            <code>forward</code>, and <code>reverse</code> lists. Sorting a bundle’s analysis list
            leaves FSM rule priority intact.
          </p>
        </section>
        <section id="pipeline">
          <h2>2. Make dependencies explicit</h2>
          <p>
            Disconnected components are independent. Interior group drawings must exist before the
            overview moves their group nodes. Routes need coordinates, and final packing needs the
            bounds of those routes.
          </p>
          <Code>{`solve(topology, options):
  components = connectedComponents(topology)
  for each component:
    drawing = placeWithGroupingPolicy(component, options)
    drawing = refineApplicableViews(drawing, options)
    drawing = verifyAndPolishRoutes(drawing, options)
    drawing = alignApplicableViews(drawing, options)
    placeComments(drawing)
  return packUsingRoutedBounds(components)`}</Code>
          <p>
            The current solver visits components sequentially. They are candidates for parallel
            execution, but parallelizing them would also require deterministic result ordering,
            isolated caches, progress aggregation, and cancellation. Preserve the distinction
            between independent problems and concurrent execution.
          </p>
          <p>
            Radial performs scale certification and radial polishing. Tree skips that radial
            certification pass and uses route checks around cycle compaction and alignment. Some
            placement paths already verify routes before this later phase. Treat the outline as
            dependency order rather than a promise that routing runs only once.
          </p>
        </section>
        <section id="placement">
          <h2>3. Offer candidates to one evaluator</h2>
          <p>
            Generate a small family of structurally different seeds. A good score cannot rescue a
            seed that violates a hard geometric condition.
          </p>
          <Code>{`offer(seed):
  gaps = measureStraightLinks(seed)
  if gaps.crossings == 0 and positiveClearance(gaps):
    nodeGap, linkGap = gaps.node, gaps.wire
    scale = max(1, 201 / nodeGap, 111 / linkGap)
    seed = uniformlyScale(seed, scale)
  gaps = measureStraightLinks(seed)
  if gaps.crossings == 0 and gaps.node >= 200 and gaps.wire >= 110:
    candidates.append(seed)`}</Code>
          <p>
            Here <code>nodeGap</code> is the minimum center-to-center distance, and{' '}
            <code>linkGap</code> is the minimum distance between a straight link and an unrelated
            state. Recompute measurements after scaling. Handle empty link sets and isolated states
            explicitly; a missing pair has unbounded clearance, rather than zero clearance.
          </p>
          <p>
            Radial first tries root-cut wedge assembly, then four radial neighbor-order variants, a
            block candidate for at most 35 states, and a planar-grid candidate when available. The
            planar test uses a simple undirected skeleton. Loops and parallel transitions remain in
            the machine for routing.
          </p>
          <p>
            For rings, breadth-first search costs <code>O(V + E)</code> with adjacency lists. A
            reverse traversal computes subtree leaf weights. Angular shares follow child weight
            divided by parent weight. The ring-radius constraint uses{' '}
            <code>r ≥ gap / (2 sin(θ/2))</code> for the smallest adjacent angular gap θ.
          </p>
          <p>
            For wedges, remove the root, find connected pieces, and sort each piece’s point angles.
            The complement of the largest empty gap is its occupied span. A span below π can be
            mapped into a wedge by rotation and a nonsingular transverse squeeze. Allocate wedge
            angles in proportion to <code>√pieceSize</code>, then recheck the assembled drawing.
          </p>
          <p>
            Tree uses contour merging for reachable simple branches of at most 12 states. Other
            directed structures use Dagre’s layered layout. Keep planar ordering useful as another
            seed, even when the requested final style is Tree or Radial.
          </p>
        </section>
        <section id="groups">
          <h2>4. Give groups two coordinate contexts</h2>
          <p>
            The overview sees a group as one node. Its interior sees member states plus outside
            context. Store the context positions for the focused view separately, so moving an
            outside proxy inside a group does not move that real state in the overview.
          </p>
          <Code>{`moveGroup(group, nextPosition):
  delta = nextPosition - group.position
  group.position = nextPosition
  for member in group.stateIds:
    member.position += delta
  for point in group.contextPositions:
    point += delta`}</Code>
          <p>
            The same translation preserves the interior arrangement. A group’s incoming and outgoing
            boundary links still need validation in the projected view.
          </p>
          <p>
            For automatic groups, remove the start and already-grouped states, then find connected
            pieces of 3–30 states. Radial’s early path applies above 32 states with no existing
            groups and takes up to eight candidates. Other eligible cases first place the graph,
            then test trial groups against <code>visibleNodes + 4 × crossings + extent/500</code>.
            Keep a trial only if that score decreases.
          </p>
        </section>
        <section id="proposals">
          <h2>5. Treat local moves as transactions</h2>
          <p>
            A proposal is a small map of target coordinates. It can move one state, a dangling
            chunk, or a cycle and its attachments. Keep enough previous coordinates to restore every
            changed state when a trial fails.
          </p>
          <Code>{`tryProposal(targets):
  before = savePositions(targets.keys)
  apply(targets)
  if scoreImproved() and clearancePasses():
    if completeRoutesAreClear():
      return ACCEPTED
  restore(before)
  return REJECTED`}</Code>
          <p>
            This is the route-checked aesthetic stage. The earlier feasible radial seed compaction
            uses straight-link feasibility and its own score. Mixing the two acceptance rules would
            claim route safety before routes have been certified.
          </p>
          <p>
            The feasible radial score is{' '}
            <code>totalWire + 2 × longestLink + √(width × height) + 0.3 × (width + height)</code>.
            Neighbor-average pulls and whole-branch pulls try fractions 1/2, 1/4, and 1/8. Bounded
            sweeps also attempt to close empty strips.
          </p>
          <p>
            For exterior swings, use a point-in-polygon test to find a singly attached neighbor
            inside a cycle. Rotate the whole attached piece around its anchor with{' '}
            <code>p′ = a + R(θ)(p − a)</code>. The target direction points away from the cycle’s
            mean position; alternatives offset it by ±45°.
          </p>
          <p>
            For flow separation, normalize summed incoming and outgoing unit vectors to u and v.
            Penalize <code>8 max(0, 0.5 + u·v)</code>. The proposal direction uses summed
            displacements and moves an eligible outgoing piece to the opposite side. Keep these
            scoring and proposal calculations distinct.
          </p>
          <p>
            For cycle regularization, penalize squared deviations of side lengths from their mean
            and propose regular polygons with <code>r = side / (2 sin(π/n))</code>. Move singly
            attached pieces with their anchor. When local motion cannot change an enclosing
            embedding safely, small-subgroup search can offer whole-column alternatives and
            separator flips.
          </p>
        </section>
        <section id="routes">
          <h2>6. Prove separation conservatively</h2>
          <p>
            Bundle endpoint pairs, allocate lanes by direction, and spread ports around each state.
            Try candidate cubic curves against unrelated node boxes and routes already accepted.
            Labels and captions add further geometry constraints.
          </p>
          <Code>{`clear(firstCurve, secondCurve, budget):
  pending = [(firstCurve, secondCurve)]
  while pending is not empty:
    if budget exhausted: return UNVERIFIED
    a, b = pending.pop()
    if separated(controlBox(a), controlBox(b), margin):
      continue
    if subdivision depth exhausted: return UNVERIFIED
    split the curve with the larger box
    push both halves paired with the other curve
  return CLEAR`}</Code>
          <p>
            A Bézier stays inside its control-point hull and therefore inside its control-point box.
            Subdivision tightens those bounds without replacing the curve with sampled straight
            segments. Overlapping boxes do not prove a crossing. Exhausted work budgets must remain{' '}
            <code>UNVERIFIED</code>, and such a pair cannot certify an accepted corridor
            arrangement.
          </p>
          <p>
            The corridor path uses bounded pair and depth checks, retries different lane scales, and
            ranks 32 self-loop angles by their separation from incident spokes. Rendering can use a
            fallback route set if the corridor search fails. A displayed drawing and a certified
            corridor drawing are different outcomes to track.
          </p>
        </section>
        <section id="performance">
          <h2>7. Optimize the expensive checks</h2>
          <p>
            Measure the stages before widening any search. Lexica reports placement, refinement,
            routing verification, comment placement, and total durations. Candidate count, route
            attempts, subdivision checks, and acceptance rate help explain where those milliseconds
            go.
          </p>
          <div className="guide-table">
            <table>
              <thead>
                <tr>
                  <th>Cost center</th>
                  <th>Optimization</th>
                  <th>Condition to preserve</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Graph traversals</td>
                  <td>Build ID maps and adjacency once per topology.</td>
                  <td>Retain transition indices and direction lists.</td>
                </tr>
                <tr>
                  <td>Planar analysis</td>
                  <td>Cache by sorted state IDs, skeleton pairs, and start.</td>
                  <td>Coordinate edits must not masquerade as topology edits.</td>
                </tr>
                <tr>
                  <td>Clearance</td>
                  <td>
                    Reject cheaply before routing. The direct all-pairs checks can cost O(V² + VE +
                    E²).
                  </td>
                  <td>
                    A cheaper broad phase may reject candidates, but cannot certify ambiguous ones.
                  </td>
                </tr>
                <tr>
                  <td>Route collisions</td>
                  <td>Query a spatial hash before detailed curve tests.</td>
                  <td>Every overlapping obstacle must remain a candidate.</td>
                </tr>
                <tr>
                  <td>Local search</td>
                  <td>Bound sweeps, route attempts, and proposal families.</td>
                  <td>Every accepted move still passes the same checks.</td>
                </tr>
                <tr>
                  <td>Repeated rendering</td>
                  <td>Cache routes using the complete geometry and label key.</td>
                  <td>
                    Invalidate after changes to positions, bends, labels, or relevant routing
                    geometry.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p>
            Lexica’s spatial hash uses 256-unit cells. Geometry spanning more than 256 cells goes
            into a separate large-item set, avoiding an enormous cell enumeration. Queries include
            that set and then filter by actual bounding-box overlap. When the query itself is too
            large, scanning all indexed items is the bounded fallback.
          </p>
          <p>
            If profiling justifies incremental checks, invalidate routes touching changed endpoints
            and routes near swept obstacle bounds. A node can obstruct a transition it is not
            connected to. Also re-evaluate global score terms such as longest edge and footprint
            when a local move changes their extrema.
          </p>
        </section>
        <section id="integration">
          <h2>8. Integrate without freezing the editor</h2>
          <p>
            Send a topology copy, focus ID, and serializable options to a worker. Send small
            progress messages back. Apply the resulting layout through the existing state and group
            mapping, preserving machine semantics. Lexica terminates the previous layout worker when
            a new task starts and on editor unmount.
          </p>
          <Code>{`requestLayout(machine, focus, options):
  cancelPreviousWorker()
  input = snapshotTopology(machine)
  worker.solve(input, focus, options)
  onProgress: updateProgressIndicator()
  onSuccess: applyLayoutToMatchingRecords(result)
  onFailure: keep the original machine`}</Code>
          <p>
            For an editor that permits edits while a solve is running, attach an input revision and
            discard a result whose revision no longer matches. Cancellation and revision checks
            solve different problems: a completed but stale result can still arrive after the
            document has changed.
          </p>
          <p>
            Useful regression cases include a chain, star, wheel, shared destination, nonplanar
            block, duplicate transitions, return arrows, self-loops, a branch inside a cycle, groups
            with outside context, disconnected islands, and long labels. Check finite coordinates,
            unchanged transition identity and order, rollback after rejected proposals, and correct
            handling of unverified route checks.
          </p>
          <details>
            <summary>Source map</summary>
            <ul>
              <li>
                <code>layout-topology.js</code> extracts and applies layout data.
              </li>
              <li>
                <code>smart-layout.js</code> orchestrates placement, grouping, refinement, and
                verification.
              </li>
              <li>
                <code>layout-components.js</code> solves and packs disconnected pieces.
              </li>
              <li>
                <code>feasible-layout.js</code>, <code>tidy-tree.js</code>, and{' '}
                <code>planar-grid.js</code> construct and compact seeds.
              </li>
              <li>
                <code>cycle-aesthetics.js</code> and <code>subgroup-aesthetics.js</code> score and
                propose geometric improvements.
              </li>
              <li>
                <code>corridor-routing.js</code>, <code>curve-clearance.js</code>, and{' '}
                <code>spatial-index.js</code> implement route checks.
              </li>
              <li>
                <code>src/editor/layout-task.js</code> manages the worker lifecycle.
              </li>
            </ul>
            <p>
              Unless a directory is shown, these modules live in <code>src/core/</code>.
            </p>
          </details>
        </section>
      </main>
    </>
  );
}

createRoot(document.getElementById('root')).render(<Guide />);
