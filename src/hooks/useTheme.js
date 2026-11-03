import { useEffect } from 'react';
import { readStorage, writeStorage } from '../state/studio.js';
export function useTheme() {
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const preference = readStorage('lexica-theme', null, false);
      document.documentElement.dataset.theme =
        preference === 'dark' || (preference !== 'light' && media.matches) ? 'dark' : 'light';
    };
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, []);
}
export function toggleTheme() {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  writeStorage('lexica-theme', next, false);
}
