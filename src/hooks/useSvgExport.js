import { useEffect, useState } from 'react';

export function useSvgExport(machine, simplified, enabled) {
  const [result, setResult] = useState({ files: [], pending: true, error: '' });
  useEffect(() => {
    if (!enabled) return;
    const worker = new Worker(new URL('../core/svg-worker.js', import.meta.url), {
      type: 'module',
    });
    setResult({ files: [], pending: true, error: '' });
    worker.onmessage = ({ data }) =>
      setResult({
        files: data.files ?? [],
        archive: data.archive,
        pending: false,
        error: data.error ?? '',
      });
    worker.onerror = () =>
      setResult({ files: [], pending: false, error: 'Could not generate SVG files.' });
    worker.postMessage({ machine, options: { simplified } });
    return () => worker.terminate();
  }, [machine, simplified, enabled]);
  return result;
}
