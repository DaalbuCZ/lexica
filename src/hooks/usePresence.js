import { useEffect, useState } from 'react';

/** Retain a closing window until its shared exit animation has finished. */
export function usePresence(open) {
  const [retained, setRetained] = useState(open);
  useEffect(() => {
    if (open) {
      setRetained(true);
      return;
    }
    const timer = setTimeout(() => setRetained(false), 140);
    return () => clearTimeout(timer);
  }, [open]);
  return open || retained;
}
