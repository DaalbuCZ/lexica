import { applyLayout, layoutTopology } from '../core/layout-topology.js';

/** Run layout outside the input/render thread and cancel it when the editor unmounts. */
export function createLayoutTask(context) {
  let active;
  const cancel = () => {
    if (!active) return;
    active.worker.terminate();
    active.reject(new DOMException('Layout cancelled', 'AbortError'));
    active = null;
  };
  context.scope.signal.addEventListener('abort', cancel, { once: true });
  return (machine, focus, options) =>
    new Promise((resolve, reject) => {
      cancel();
      const original = structuredClone(machine);
      if (options.disregardGroups) focus = null;
      const worker = new Worker(new URL('../core/layout-worker.js', import.meta.url), {
        type: 'module',
      });
      active = { worker, reject };
      const finish = (data) => {
        worker.terminate();
        if (active?.worker === worker) active = null;
        if (data.error) reject(Error(data.error));
        else {
          try {
            applyLayout(original, data.machine, focus);
            resolve({ machine: original, groups: data.groups, metrics: data.metrics });
          } catch (error) {
            reject(error);
          }
        }
      };
      worker.onmessage = ({ data }) => finish(data);
      worker.onerror = () => finish({ error: 'Could not calculate the layout.' });
      worker.postMessage({
        topology: layoutTopology(original, options.disregardGroups),
        focus,
        options,
      });
    });
}
