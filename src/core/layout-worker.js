import { solveLayout } from './smart-layout.js';
self.onmessage = ({ data }) => {
  try {
    const { machine, groups, metrics } = solveLayout(
      data.topology,
      data.focus,
      data.options,
      (fraction, phase) => self.postMessage({ progress: { fraction, phase } }),
    );
    self.postMessage({ machine, groups, metrics });
  } catch (error) {
    self.postMessage({ error: error.message });
  }
};
