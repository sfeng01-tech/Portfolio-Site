import React, { useState } from 'react';
import { Moon, Sun } from 'lucide-react';

export default function ThemeToggle() {
  const [dark, setDark] = useState(() => document.documentElement.dataset.theme === 'dark');

  const toggleTheme = () => {
    const next = dark ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', next === 'dark' ? '#1b1e19' : '#f7f6f2');
    try { localStorage.setItem('portfolio-theme', next); } catch { /* The toggle still works when storage is unavailable. */ }
    setDark(!dark);
  };

  return (
    <button type="button" className="theme-toggle" onClick={toggleTheme}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-pressed={dark} title={dark ? 'Switch to light mode' : 'Switch to dark mode'}>
      {dark ? <Sun size={18} strokeWidth={1.6} /> : <Moon size={18} strokeWidth={1.6} />}
    </button>
  );
}
