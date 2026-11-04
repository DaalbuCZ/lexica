/** Coalesce pointer updates: one calculation in flight, one newest position queued. */
export function createLiveRouting(context) {
  let worker,
    busy = false,
    queued,
    result,
    requested,
    sentTopology,
    sentNodes = new Map();
  const send = (request) => {
    busy = true;
    const nodes = new Map(request.machine.states.map((s) => [s.id, { x: s.x, y: s.y }]));
    if (sentTopology === request.topology) {
      const states = request.machine.states
        .filter((s) => {
          const old = sentNodes.get(s.id);
          return !old || old.x !== s.x || old.y !== s.y;
        })
        .map(({ id, x, y }) => ({ id, x, y }));
      worker.postMessage({
        simple: request.simple,
        topology: request.topology,
        key: request.key,
        patch: {
          states,
          comments: request.machine.comments,
          startViews: request.machine.startViews,
        },
      });
    } else worker.postMessage(request);
    sentTopology = request.topology;
    sentNodes = nodes;
  };
  return {
    get started() {
      return !!worker;
    },
    snapshot(shown, simple, base) {
      if (!worker) {
        worker = new Worker(new URL('../core/routing-worker.js', import.meta.url), {
          type: 'module',
        });
        worker.onmessage = ({ data }) => {
          busy = false;
          if (!data.error && data.key === requested)
            result = { ...data, nodes: new Map(data.nodes) };
          if (queued) {
            const next = queued;
            queued = null;
            send(next);
          }
          if (!context.disposed) context.queueDraw();
        };
        worker.onerror = () => {
          busy = false;
          requested = null;
          sentTopology = null;
          sentNodes.clear();
        };
      }
      const machine = {
        states: shown.states,
        edges: shown.edges,
        comments: shown.comments,
        start: shown.start,
        startViews: shown.startViews,
      };
      const topology = JSON.stringify([
        simple,
        machine.start,
        machine.startViews?.map((view) => view.targets),
        machine.states.map((s) => s.id),
        machine.edges,
        context.openGroup,
      ]);
      const key = JSON.stringify([machine, simple]);
      if (requested !== key) {
        requested = key;
        // Snapshot now, rather than retaining references that the next pointer event mutates.
        const request = {
          machine: structuredClone(machine),
          simple,
          topology,
          key,
          snapshot: base
            ? { routes: base.routes, nodes: [...base.nodes], comments: base.comments }
            : null,
        };
        if (busy) queued = request;
        else send(request);
      }
      return result?.topology === topology && result.key === key ? result : null;
    },
    dispose() {
      worker?.terminate();
    },
  };
}
