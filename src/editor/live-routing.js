/** Coalesce pointer updates: one calculation in flight, one newest position queued. */
export function createLiveRouting(context) {
  let worker,
    busy = false,
    queued,
    result,
    requested;
  const send = (request) => {
    busy = true;
    worker.postMessage(request);
  };
  return {
    get started() {
      return !!worker;
    },
    snapshot(shown, simple) {
      if (!worker) {
        worker = new Worker(new URL('../core/routing-worker.js', import.meta.url), {
          type: 'module',
        });
        worker.onmessage = ({ data }) => {
          busy = false;
          if (!data.error) result = { ...data, nodes: new Map(data.nodes) };
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
        machine.edges.map((e) => [e.from, e.to, e.portal]),
      ]);
      const key = JSON.stringify([machine, simple]);
      if (requested !== key) {
        requested = key;
        // Snapshot now, rather than retaining references that the next pointer event mutates.
        const request = { machine: structuredClone(machine), simple, topology, key };
        if (busy) queued = request;
        else send(request);
      }
      return result?.topology === topology ? result : null;
    },
    dispose() {
      worker?.terminate();
    },
  };
}
