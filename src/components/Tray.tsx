import { useEffect, useState } from 'react';
import { cn } from '../utils/cn';
import { Icon } from './Icons';
import { Star } from './Logo';

export interface MenuHandlers {
  paused: boolean;
  onOpen: () => void;
  onSettings: () => void;
  onActivity: () => void;
  onTogglePause: () => void;
  onExit: () => void;
}

export function FlickyMenu({ x, y, anchor, h, tourSettings, onClose }: { x: number; y: number; anchor: 'tray' | 'point'; h: MenuHandlers; tourSettings?: boolean; onClose: () => void }) {
  const items = [
    { icon: 'open', label: 'Open Flicky', run: h.onOpen, tour: false },
    { icon: 'settings', label: 'Settings', run: h.onSettings, tour: !!tourSettings },
    { icon: 'activity', label: 'Recent Activity', run: h.onActivity, tour: false },
    { icon: h.paused ? 'play' : 'pause', label: h.paused ? 'Resume' : 'Pause', run: h.onTogglePause, tour: false },
    { icon: 'power', label: 'Exit', run: h.onExit, tour: false },
  ];
  const W = 208;
  const left = Math.max(8, Math.min(window.innerWidth - W - 8, anchor === 'tray' ? x - W + 20 : x));
  const top = anchor === 'tray' ? undefined : Math.max(8, Math.min(window.innerHeight - 230, y));
  return (
    <>
      <div className="fixed inset-0 z-40" onPointerDown={onClose} onContextMenu={(e) => { e.preventDefault(); onClose(); }} />
      <div
        className="anim-fade-in glass fixed z-40 rounded-xl p-1.5 text-white shadow-2xl"
        style={anchor === 'tray' ? { left, bottom: 52, width: W } : { left, top, width: W }}
      >
        {items.map((it, i) => (
          <div key={it.label}>
            {i === 4 && <div className="mx-2 my-1 h-px bg-white/10" />}
            <button
              onClick={() => {
                onClose();
                it.run();
              }}
              className={cn('flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-[13px] hover:bg-white/10', it.tour && 'tour-hi')}
            >
              <Icon name={it.icon} size={15} className="text-white/70" />
              {it.label}
            </button>
          </div>
        ))}
      </div>
    </>
  );
}

export function Taskbar({ paused, busy, onTray, tour }: { paused: boolean; busy: boolean; onTray: () => void; tour?: boolean }) {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="fixed bottom-0 left-0 right-0 z-10 flex h-11 items-center justify-end gap-2 border-t border-white/[0.08] bg-black/70 px-3 backdrop-blur-xl">
      <button
        onClick={onTray}
        title={paused ? 'Flicky (paused)' : 'Flicky'}
        aria-label="Flicky tray icon"
        className={cn('relative flex h-8 w-8 items-center justify-center rounded-md hover:bg-white/10', tour && 'tour-hi')}
      >
        <Star size={15} glow={false} className={paused ? 'opacity-35' : ''} />
        {busy && <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-white" />}
        {paused && <span className="absolute h-px w-5 rotate-45 bg-white/70" />}
      </button>
      <div className="px-2 text-right text-[11px] leading-tight text-white/70">
        <div>{now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
        <div className="text-white/40">{now.toLocaleDateString()}</div>
      </div>
    </div>
  );
}
