import { Diagram } from './Diagram.jsx';
import { WorkFork } from './WorkFork.jsx';
import {
  components,
  partition,
  skeleton,
  branches,
  placement,
  treePlacement,
  groups,
  compaction,
  routing,
  exteriorSwing,
  directionalFlow,
  cycleBalance,
} from './examples.js';

function Lesson({ title, state, problem, method, example, why, independent }) {
  return (
    <section className="lesson">
      <h2>{title}</h2>
      <p>{state}</p>
      <p>{problem}</p>
      <p>{method}</p>
      {independent && <WorkFork groups={independent === 'groups'} />}
      <Diagram title={title} example={example} />
      <div className="lesson-reason">
        <span>Why it works</span>
        <p>{why}</p>
      </div>
    </section>
  );
}

export function Preparation() {
  return (
    <Lesson
      title="Component separation"
      independent="components"
      example={partition}
      state="The input is a machine with states, transitions, and possibly several disconnected pieces. Its old coordinates and bends are set aside."
      problem="An unrelated island should not change the main component’s radius, candidate budget, or grouping decision."
      method="Build undirected adjacency from the transitions and link members of existing groups. A graph traversal marks each connected component. Solve these components independently, starting with the one containing the start state."
      why="No transition crosses between different components. Their internal geometry can be solved independently and combined later using translation. Existing group membership stays together because it contributes connectivity to this partition."
    />
  );
}

export function Planarity() {
  return (
    <Lesson
      title="Planar skeleton"
      example={skeleton}
      state="We have one visible component to place, either individual states or an overview containing group nodes."
      problem="A crossing in the input drawing does not tell us whether the graph actually needs crossings. We need the topology of a clear drawing before choosing its shape."
      method="Ignore directions, loops, and portal links, and merge parallel links. Test this simple skeleton for planarity. If it passes, use the circular neighbor order to trace faces, triangulate with temporary diagonals, and build an integer grid with the de Fraysseix–Pach–Pollack shift method."
      why="The embedding records which links sit next to each other without crossing. The grid construction inserts vertices while shifting existing ones to preserve that embedding. Temporary diagonals disappear afterward. If the skeleton is nonplanar, the solver continues with scored placement candidates instead."
    />
  );
}

export function RadialCandidates() {
  return (
    <>
      <Lesson
        title="Root-cut wedges"
        example={branches}
        state="The planar analysis is available, but we still need coordinates that make branches readable around the start."
        problem="Treating all branches as one drawing can waste space and interleave pieces that connect only at the hub."
        method="Remove the start and find the remaining components. Draw each branch locally with the start on its boundary. Sort its points by angle and cut at the largest empty angular gap. If the occupied span is below 180°, rotate and squeeze it into an assigned wedge. Allocate angles proportional to √branchSize and leave hub fan-out space."
        why="A nonsingular affine squeeze preserves lines and their intersections inside a branch. Separate wedges reserve different angular regions, while square-root allocation gives larger branches more room without starving small ones. The assembled drawing still has to pass clearance checks before it can compete with the other seeds."
      />
      <Lesson
        title="Breadth-first rings"
        example={placement}
        state="Wedge assembly has offered a candidate, or failed to find one. The search now tries radial-tree candidates as well."
        problem="A graph with shared destinations or cycles has no unique tree, and a ring with too many close angles can crowd its states."
        method="Breadth-first search assigns a parent on first visit and a depth to each state. Leaves have weight 1; parents sum child weights. Divide each parent’s sector in those proportions. Put a state at its sector midpoint and depth radius. For minimum angular gap θ, increase radius r until 2r sin(θ/2) supplies enough separation."
        why="Breadth-first depth keeps direct successors close to the start. Leaf weights reserve angular room for descendants, and the chord formula controls the closest pair on each ring. Non-tree links still participate in clearance checks. Four neighbor-order offsets, a block candidate for at most 35 nodes, and the planar grid broaden the seed family."
      />
    </>
  );
}

export function TreePlacement() {
  return (
    <Lesson
      title="Subtree contours"
      example={treePlacement}
      state="The component’s connectivity is known. A simple directed branch can be read from left to right."
      problem="Reserving a rectangle for each subtree wastes space where the subtree has no states. Shared destinations and cycles also make a pure tree interpretation unreliable."
      method="For a reachable simple branch of at most 12 states, assign columns by depth. Merge subtrees bottom-up, storing minimum and maximum y at every depth. Shift each sibling only until overlapping contours have the required gap, then center the parent between its first and last child. Otherwise use Dagre’s layered layout with its network-simplex ranker."
      why="Contours compare occupied space at matching depths, so empty space in one column does not inflate all columns. Layered layout handles the whole directed graph when a tree is unsuitable. Lexica can compare planar-order variants by crossings, clearance, and footprint; transition length can increase column spacing."
    />
  );
}

export function Grouping({ early, conditional = false }) {
  return (
    <Lesson
      title={early ? 'Early branch grouping' : 'Quality-driven grouping'}
      independent="groups"
      example={groups}
      state={
        early
          ? 'We are about to arrange a large connected part of the machine. Its nodes are individual states, with no branches grouped yet.'
          : conditional
            ? 'For radial components that skipped early grouping, an initial placement is now available. Components that took the early path skip this later test.'
            : 'The initial tree placement is available, with every state still visible.'
      }
      problem="A large or tangled overview may be easier to read if a connected branch becomes one node with its own interior drawing."
      method={
        early
          ? 'Lexica enables this early pass when that connected part contains more than 32 nodes. This is an implementation cutoff for trying grouping before placement. Remove the start and find connected pieces among ungrouped states. Keep pieces of 3–30 nodes, sort largest first, and group up to eight. Place each interior before placing the overview.'
          : 'Keep the initial layout when visible nodes ≤32, crossings ≤max(4, 0.12 × edgeCount), and extent ≤6500. Otherwise try the same 3–30-state branch candidates on copies. Place each trial interior and overview, keeping it only if visibleNodes + 4 × crossings + extent/500 decreases.'
      }
      why="The interior and overview become separate placement problems. Simple chains can remain rows; other interiors compare tidy, layered, block, and compact planar candidates. Boundary clearance and crossings dominate their scores. Translating a group in the overview moves its members and stored outside context together, preserving the interior geometry."
    />
  );
}

export function Compaction() {
  return (
    <Lesson
      title="Constrained compaction"
      example={compaction}
      state="Several candidate drawings now exist, including radial trees and any successful planar or wedge seeds."
      problem="Zero crossings alone permits both cramped states and needlessly long links. Choosing only the smallest footprint can make the graph unreadable."
      method="Require zero straight-line crossings, state-center distance ≥200, and unrelated-state-to-link distance ≥110. Uniformly expand eligible seeds to meet those limits. Minimize totalWire + 2 × longestLink + √(width × height) + 0.3 × (width + height). Pull branches or individual states inward, trying fractions 1/2, 1/4, and 1/8 of each move."
      why="Feasibility is checked separately from the aesthetic score. Every accepted move improves the score and preserves the required clearance. Up to eight sweeps also close large empty strips, while exact star and wheel shapes can keep their symmetry. If no feasible seed exists, the broader scored search penalizes crossings and inadequate clearance rather than stopping."
    />
  );
}

export function Routing({ radial }) {
  return (
    <Lesson
      title="Transition corridors"
      example={routing}
      state={
        radial
          ? 'States have positions. Existing group interiors can first refine angles, branch lengths, and gaps without adding routed crossings.'
          : 'The directed placement is ready. Tree skips radial angle regularization; group interiors can still refine boundary context and large gaps.'
      }
      problem="Skeleton links omit opposing arrows and loops. Restoring the actual transitions can introduce conflicts even when the straight-line skeleton is clear."
      method={
        radial
          ? 'For eligible crossing-free views, try scales 1, 1.25, 1.6, 2, and 3 until placement routing succeeds. Bundle transitions by endpoints, assign opposing directions separate sides, and spread ports around each node. For loops, rank 32 directions by angular distance from incident spokes. Retry lane widths when needed.'
          : 'Route bundles with separate lanes and spread attachment points. Opposing directions use different sides; loops try the emptiest of 32 angular sectors first. Tree’s cycle compaction and final alignment use route-separation checks, rather than the radial scale-certification pass.'
      }
      why="A cubic Bézier lies within its control-point box. Boxes separated by the required clearance prove the curves are separate. Overlap triggers subdivision of the larger curve and another check. Exhausting the work budget leaves a pair unverified, so it cannot certify that proposal. Rendering has a fallback router when corridor routing fails."
    />
  );
}

export function Aesthetics() {
  return (
    <>
      <Lesson
        title="Exterior swing"
        example={exteriorSwing}
        state="A candidate drawing is clear enough to consider aesthetic improvements, but a dangling piece may sit inside a cycle."
        problem="The cycle visually encloses a state that is only attached at one cycle vertex. Crossings alone do not penalize this misleading enclosure."
        method="Detect simple and short chordless cycles. A ray-crossing point-in-polygon test finds enclosed neighbors; the cycle score adds 1200 for a singly attached enclosed neighbor. Let c be the cycle’s mean position and a its attachment. Subtract the branch’s current angle from atan2(a.y − c.y, a.x − c.x). Rotate every point using p′ = a + R(θ)(p − a), also trying offsets of ±45°."
        why="Rotating the whole dangling piece preserves its internal lengths and angles. The outward direction points away from the cycle center. This is a proposal, not an unconditional move: the score, state clearance, and complete route checks must still pass. Small-subgroup search also penalizes enclosed states and can try separator flips."
      />
      <Lesson
        title="Flow separation"
        example={directionalFlow}
        state="The current drawing has a state with both incoming-only and outgoing-only neighbors."
        problem="If arrivals and departures occupy the same side, following the direction of travel takes extra effort even without crossings."
        method="Sum and normalize unit vectors toward incoming neighbors to get u; do the same for outgoing neighbors to get v. Add 8 × max(0, 0.5 + u·v) to the score. The proposal routine uses summed neighbor displacements to choose an incoming direction, then translates an eligible outgoing piece to the opposite side at the same head distance."
        why="The dot product equals cos(angle), so directions at least 120° apart pay no penalty. Bidirectional bundles are excluded from these directional sets. Pieces containing incoming neighbors or the attachment are protected. Translating a whole piece preserves its shape, and clearance plus route checks decide whether the soft flow preference is safe to realize."
      />
      <Lesson
        title="Cycle regularization"
        example={cycleBalance}
        state="A cycle remains recognizable in the current drawing, but its sides can have very different lengths."
        problem="One stretched edge can dominate the shape and leave the cycle looking like an accidental detour."
        method="Penalize side-length variation with 4 × Σ(length − mean)² / max(160, mean). Propose regular n-gons with r = side / (2 sin(π/n)), anchored at a cycle vertex and tried in both orientations. Pieces attached at just one cycle vertex follow that vertex by translation."
        why="The radius formula gives the requested polygon side length. Moving attachments with their vertex preserves each attached piece’s internal geometry. A lower cycle penalty alone cannot justify a crossing: proposals still face clearance and complete routing checks. Small subgroups can also try whole-column alternatives that local one-node moves cannot reach."
      />
    </>
  );
}

export function Packing() {
  return (
    <Lesson
      title="Component packing"
      example={components}
      state="Every component now has a local drawing. Radial polish can pull outer branches and compact spokes; groups can be oriented upward. Tree and subgroup paths can finish with route-checked horizontal alignment."
      problem="Independent local coordinate systems may overlap when combined on one canvas."
      method="Finish placing comments, compute each component’s bounds including its routed edges, and translate the next component to the right of the previous one with a 320-unit gap. Apply the combined drawing back to the machine."
      why="A translation p′ = p + (dx, dy) preserves all internal distances, angles, and intersections. Including routed edges in the bounds keeps packing sensitive to the drawing’s actual extent. An unrelated island therefore affects its own packed location without changing the main component’s local solution."
    />
  );
}
