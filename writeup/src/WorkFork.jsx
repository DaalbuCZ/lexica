function Part({ color, x = 0 }) {
  return (
    <g className={color} transform={`translate(${x} 0)`}>
      <path d="M18 34 H48 L76 18" />
      <circle cx="18" cy="34" r="7" />
      <circle cx="48" cy="34" r="7" />
      <circle cx="76" cy="18" r="7" />
    </g>
  );
}

export function WorkFork({ groups = false }) {
  return (
    <aside
      className="work-sequence"
      aria-label={groups ? 'Group layout order' : 'Component layout order'}
    >
      <ol>
        <li>
          <svg viewBox="0 0 180 64" aria-hidden="true">
            <Part color="amber" x={40} />
          </svg>
          <span>{groups ? 'Lay out group A’s interior' : 'Lay out the start component'}</span>
        </li>
        <li>
          <svg viewBox="0 0 180 64" aria-hidden="true">
            <Part color="green" x={40} />
          </svg>
          <span>{groups ? 'Lay out group B’s interior' : 'Lay out the separate island'}</span>
        </li>
        <li>
          <svg viewBox="0 0 180 64" aria-hidden="true">
            {groups ? (
              <g className="overview">
                <path d="M90 12 40 43 M90 12 140 43" />
                <circle cx="90" cy="12" r="7" />
                <rect className="amber" x="24" y="35" width="32" height="20" rx="5" />
                <rect className="green" x="124" y="35" width="32" height="20" rx="5" />
              </g>
            ) : (
              <>
                <Part color="amber" />
                <Part color="green" x={90} />
              </>
            )}
          </svg>
          <span>
            {groups ? 'Place the overview using both groups' : 'Pack both completed layouts'}
          </span>
        </li>
      </ol>
      <p>
        {groups
          ? 'Each interior is laid out separately. The overview uses their results, moving each group’s members together.'
          : 'Each component is laid out separately, one after another. Packing then positions their completed drawings together.'}
      </p>
    </aside>
  );
}
