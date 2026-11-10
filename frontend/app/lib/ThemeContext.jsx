'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext({
  theme: 'dark',
  toggleTheme: () => {},
  setTheme: () => {},
  mounted: false
});

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState('dark');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    let activeTheme = 'dark';
    try {
      const stored = localStorage.getItem('shewings-theme');
      if (stored === 'light' || stored === 'dark') {
        activeTheme = stored;
      } else if (
        typeof window !== 'undefined' &&
        document.documentElement.classList.contains('light')
      ) {
        activeTheme = 'light';
      }
    } catch (_) {}

    setThemeState(activeTheme);
    setMounted(true);
    applyThemeDOM(activeTheme);

    // Cross-tab synchronization
    const handleStorage = (e) => {
      if (e.key === 'shewings-theme' && (e.newValue === 'light' || e.newValue === 'dark')) {
        setThemeState(e.newValue);
        applyThemeDOM(e.newValue);
      }
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const applyThemeDOM = (newTheme) => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(newTheme);
    root.setAttribute('data-theme', newTheme);
    root.style.colorScheme = newTheme;

    // Synchronize meta theme-color for mobile address bars
    let themeMeta = document.querySelector('meta[name="theme-color"]');
    if (themeMeta) {
      themeMeta.content = newTheme === 'light' ? '#f8fafc' : '#0b1120';
    }

    // Synchronize meta color-scheme
    let schemeMeta = document.querySelector('meta[name="color-scheme"]');
    if (schemeMeta) {
      schemeMeta.content = newTheme;
    }
  };

  const setTheme = (newTheme) => {
    if (newTheme !== 'light' && newTheme !== 'dark') return;
    setThemeState(newTheme);
    applyThemeDOM(newTheme);
    try {
      localStorage.setItem('shewings-theme', newTheme);
    } catch (_) {}
  };

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme, mounted }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    return {
      theme: 'dark',
      toggleTheme: () => {},
      setTheme: () => {},
      mounted: false
    };
  }
  return context;
}
