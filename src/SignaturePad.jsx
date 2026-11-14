import React, { useEffect, useRef, useState } from 'react';
import { Eraser } from 'lucide-react';

/** Draw a signature with a finger or mouse. onChange(dataUrl | '') */
export default function SignaturePad({ onChange, height = 180 }) {
  const ref = useRef();
  const [empty, setEmpty] = useState(true);
  useEffect(() => {
    const c = ref.current;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    c.width = c.offsetWidth * ratio; c.height = height * ratio;
    const g = c.getContext('2d');
    g.scale(ratio, ratio); g.lineWidth = 2.6; g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = '#0d2a8a';
    let drawing = false; let last = null; let strokes = 0;
    const pos = (e) => { const r = c.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    const down = (e) => { e.preventDefault(); c.setPointerCapture?.(e.pointerId); drawing = true; last = pos(e); };
    const move = (e) => {
      if (!drawing) return;
      e.preventDefault();
      const p = pos(e);
      g.beginPath(); g.moveTo(last.x, last.y);
      g.quadraticCurveTo(last.x, last.y, (last.x + p.x) / 2, (last.y + p.y) / 2); g.lineTo(p.x, p.y); g.stroke();
      last = p; strokes += 1;
    };
    const up = () => {
      if (!drawing) return;
      drawing = false;
      if (strokes > 8) { setEmpty(false); onChange(c.toDataURL('image/png')); }
    };
    c.addEventListener('pointerdown', down); c.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => { c.removeEventListener('pointerdown', down); c.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const clear = () => {
    const c = ref.current;
    c.getContext('2d').clearRect(0, 0, c.width, c.height);
    setEmpty(true); onChange('');
  };
  return (
    <div className="sig-pad">
      <canvas ref={ref} style={{ height }} aria-label="កន្លែងចុះហត្ថលេខា" />
      {empty && <span className="sig-hint">ចុះហត្ថលេខានៅទីនេះ ✍️</span>}
      <button type="button" className="sig-clear" onClick={clear}><Eraser size={14} /> លុប</button>
    </div>
  );
}
