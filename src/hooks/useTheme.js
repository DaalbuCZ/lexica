import { useEffect } from 'react';
import { readStorage, writeStorage } from '../state/studio.js';
export function useTheme() {
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const preference = readStorage('lexica-theme', null, false);
      document.documentElement.dataset.theme = preference !== 'light' ? 'dark' : 'light';
    };
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, []);
}
export function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  writeStorage('lexica-theme', theme, false);
}
