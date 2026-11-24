// Animated icons with sound (Jiggicons, free set — https://jiggicons.com/terms).
// Sound is kept for direct actions (pressing a button, a payment arriving), and each person
// can turn it off; the choice is kept on their device. Motion follows the system's
// "reduce motion" setting (handled by the library).
import React, { useEffect, useRef, useState } from 'react';
import { setVolume } from 'jiggicons';
import { Confetti } from 'jiggicons-react';

const KEY = 'py-sound';

export function soundOn() {
  try { return localStorage.getItem(KEY) !== 'off'; } catch { return true; }
}
export function setSoundOn(on) {
  try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch { /* private mode */ }
  setVolume(on ? 0.8 : 0);
  window.dispatchEvent(new Event('py-sound'));
}
setVolume(soundOn() ? 0.8 : 0);

/** Current sound setting, kept in sync across components. */
export function useSound() {
  const [on, setOn] = useState(soundOn);
  useEffect(() => {
    const f = () => setOn(soundOn());
    window.addEventListener('py-sound', f);
    return () => window.removeEventListener('py-sound', f);
  }, []);
  return [on, setSoundOn];
}

/** Confetti (with its sound) over the page: a payment arrived. */
export function celebrate() {
  window.dispatchEvent(new Event('py-celebrate'));
}

/** Mount once per page; shows the confetti when celebrate() is called. */
export function CelebrateHost() {
  const [n, setN] = useState(0);
  const timer = useRef(null);
  useEffect(() => {
    const f = () => {
      setN((x) => x + 1);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setN(0), 1800);
    };
    window.addEventListener('py-celebrate', f);
    return () => { window.removeEventListener('py-celebrate', f); clearTimeout(timer.current); };
  }, []);
  if (!n) return null;
  return (
    <div className="celebrate" aria-hidden="true">
      <Confetti key={n} variant="duotone" size={120} animate="mount" sound />
    </div>
  );
}

/** A small on/off switch for the sound effects. */
export function SoundToggle({ label, className = '' }) {
  const [on, set] = useSound();
  return (
    <label className={'sound-toggle ' + className}>
      <input type="checkbox" checked={on} onChange={(e) => set(e.target.checked)} />
      <span>{on ? '🔊' : '🔇'} {label}</span>
    </label>
  );
}
