import { useRef, useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';

export default function RegionSelect() {
  const [selecting, setSelecting] = useState(false);
  const [start, setStart] = useState({ x: 0, y: 0 });
  const [end, setEnd] = useState({ x: 0, y: 0 });
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        invoke('region_overlay_cancel');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    setSelecting(true);
    setStart({ x: e.clientX, y: e.clientY });
    setEnd({ x: e.clientX, y: e.clientY });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!selecting) return;
    setEnd({ x: e.clientX, y: e.clientY });
  };

  const handleMouseUp = () => {
    if (!selecting) return;
    setSelecting(false);
    const x = Math.min(start.x, end.x);
    const y = Math.min(start.y, end.y);
    const width = Math.abs(end.x - start.x);
    const height = Math.abs(end.y - start.y);
    if (width < 8 || height < 8) return;
    invoke('region_overlay_complete', {
      x, y, width, height,
      viewportW: window.innerWidth,
      viewportH: window.innerHeight,
    });
  };

  const left = Math.min(start.x, end.x);
  const top_ = Math.min(start.y, end.y);
  const w = Math.abs(end.x - start.x);
  const h = Math.abs(end.y - start.y);

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 cursor-crosshair"
      style={{ boxShadow: selecting ? `0 0 0 9999px rgba(0,0,0,0.45)` : 'none' }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      {selecting && w > 2 && h > 2 && (
        <div
          className="absolute border-2 border-dashed border-white"
          style={{ left, top: top_, width: w, height: h }}
        />
      )}
    </div>
  );
}
