import { useEffect, useState } from 'react';
import { Theme } from '@radix-ui/themes';

export function DesignSystem({ children }) {
  const [appearance, setAppearance] = useState(
    () => document.documentElement.dataset.theme || 'light',
  );
  useEffect(() => {
    const observer = new MutationObserver(() =>
      setAppearance(document.documentElement.dataset.theme || 'light'),
    );
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    return () => observer.disconnect();
  }, []);
  return (
    <Theme
      appearance={appearance}
      accentColor={appearance === 'dark' ? 'blue' : 'green'}
      grayColor={appearance === 'dark' ? 'slate' : 'sage'}
      radius="medium"
      scaling="90%"
    >
      {children}
    </Theme>
  );
}
