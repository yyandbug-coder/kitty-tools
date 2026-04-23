import { useEffect } from 'react';

export function useTheme(theme: string) {
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else if (theme === 'light') {
      root.classList.remove('dark');
    } else {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = (e: MediaQueryListEvent) => {
        if (e.matches) root.classList.add('dark');
        else root.classList.remove('dark');
      };
      if (mq.matches) root.classList.add('dark');
      else root.classList.remove('dark');
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler);
    }
  }, [theme]);
}