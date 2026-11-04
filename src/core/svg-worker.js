import { svgDocuments } from './svg-export.js';
import { zipSync, strToU8 } from 'fflate';
self.onmessage = ({ data }) => {
  try {
    const files = svgDocuments(data.machine, data.options);
    const archive =
      files.length > 1
        ? zipSync(Object.fromEntries(files.map((file) => [file.filename, strToU8(file.text)])))
        : null;
    self.postMessage({ files, archive }, archive ? [archive.buffer] : []);
  } catch (error) {
    self.postMessage({ error: error.message });
  }
};
