import { curveClearance } from './curve-clearance.js';

/** Validate the exact rendered curves. This deliberately makes no claim about
 * node/label clearance; those constraints need separate shape checks. */
export function validateRouteSeparation(routes, options = {}) {
  const witnesses = [];
  let checks = 0;
  for (let i = 0; i < routes.length; i++)
    for (let j = i + 1; j < routes.length; j++) {
      const result = curveClearance(routes[i], routes[j], options);
      checks += result.checks;
      if (result.status !== 'clear') witnesses.push({ first: i, second: j, reason: result.reason });
    }
  return { status: witnesses.length ? 'unverified' : 'clear', witnesses, checks };
}
