import React, { useEffect, useState } from 'react';
import { Sun, Moon, Monitor } from 'lucide-react';

const KEY = 'py-theme';
const read = () => { try { return localStorage.getItem(KEY) || 'system'; } catch { return 'system'; } };
const prefersDark = () => window.matchMedia?.('(prefers-color-scheme: dark)').matches;

export function applyTheme(mode = read()) {
  const root = document.documentElement;
  if (mode === 'system') delete root.dataset.theme; else root.dataset.theme = mode;
  const dark = mode === 'dark' || (mode === 'system' && prefersDark());
  root.style.colorScheme = dark ? 'dark' : 'light';
  const meta = document.querySelector('meta[name=theme-color]');
  if (meta && !meta.dataset.locked) meta.content = dark ? '#0b0e14' : '#eceef1';
}

export function useTheme() {
  const [mode, setMode] = useState(read);
  useEffect(() => {
    applyTheme(mode);
    try { localStorage.setItem(KEY, mode); } catch { /* ignore */ }
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    const onChange = () => mode === 'system' && applyTheme('system');
    mq?.addEventListener?.('change', onChange);
    return () => mq?.removeEventListener?.('change', onChange);
  }, [mode]);
  return [mode, setMode];
}

const NEXT = { system: 'light', light: 'dark', dark: 'system' };
const ICON = { system: Monitor, light: Sun, dark: Moon };
const LABEL = { system: 'តាមប្រព័ន្ធ', light: 'ពន្លឺ', dark: 'ងងឹត' };

/** Cycles system → light → dark. */
export function ThemeToggle({ withLabel = false, className = 'icon-btn' }) {
  const [mode, setMode] = useTheme();
  const Icon = ICON[mode];
  return (
    <button type="button" className={className} onClick={() => setMode(NEXT[mode])} title={`រូបរាង: ${LABEL[mode]}`} aria-label={`រូបរាង: ${LABEL[mode]}`}>
      <Icon size={17} />{withLabel && <span>រូបរាង: {LABEL[mode]}</span>}
    </button>
  );
}

export function ThemePicker() {
  const [mode, setMode] = useTheme();
  return (
    <div className="seg three">
      {Object.keys(LABEL).map((k) => {
        const I = ICON[k];
        return <button key={k} type="button" className={mode === k ? 'on' : ''} onClick={() => setMode(k)}><I size={15} /> {LABEL[k]}</button>;
      })}
    </div>
  );
}
