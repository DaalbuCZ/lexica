import { solveLayout } from './smart-layout.js';
self.onmessage = ({ data }) => {
  try {
    const { machine, groups } = solveLayout(data.topology, data.focus, data.options);
    self.postMessage({ machine, groups });
  } catch (error) {
    self.postMessage({ error: error.message });
  }
};
