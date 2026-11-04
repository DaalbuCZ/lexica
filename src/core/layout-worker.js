import { smartArrange } from './smart-layout.js';
self.onmessage = ({ data }) => {
  try {
    const machine = data.machine;
    if (data.options.disregardGroups) machine.groups = [];
    const groups = smartArrange(
      machine,
      data.options.disregardGroups ? null : data.focus,
      data.options,
    );
    self.postMessage({ machine, groups });
  } catch (error) {
    self.postMessage({ error: error.message });
  }
};
