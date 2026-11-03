/** Own every native canvas listener so remounts and HMR cannot duplicate gestures. */
export function listenScope() {
  const controller = new AbortController();
  return {
    signal: controller.signal,
    listen(target, event, handler, options = {}) {
      target.addEventListener(event, handler, {
        ...(typeof options === 'boolean'
          ? {
              capture: options,
            }
          : options),
        signal: controller.signal,
      });
    },
    dispose: () => controller.abort(),
  };
}
