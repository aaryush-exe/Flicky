import { useEffect, useRef, useState } from 'react';
import { cn } from '../utils/cn';
import { Icon } from './Icons';
import { Star } from './Logo';
import { formatShortcut } from '../lib/shortcuts';
import type { Format } from '../lib/formats';

const LAYOUT = 440;

export const ORBIT_SHRINK = 0.78;

export const ORBIT_SIZE = Math.round(LAYOUT * ORBIT_SHRINK);
const C = LAYOUT / 2;
const R = 150;
const BTN = 76;
const VISIBLE = 3;

export interface TrackItem { id: string; label: string; icon: string; title: string; run: () => void; }

interface Props {
  files: File[];

  actions?: TrackItem[];
  x: number;
  y: number;
  scale: number;
  formats: Format[];
  clipboard?: boolean;
  shortcut: string;
  activeJobs: number;
  moreOpen: boolean;
  tourHi?: string | null;
  onMove: (x: number, y: number) => void;
  onFormat: (f: Format) => void;
  onCompress: () => void;
  onCopy: () => void;
  onMore: () => void;
  onCenter: () => void;
  onScrolled?: () => void;
}

function arcPath(r: number, a1: number, a2: number) {
  const p = (a: number) => [C + r * Math.cos((a * Math.PI) / 180), C + r * Math.sin((a * Math.PI) / 180)];
  const [x1, y1] = p(a1);
  const [x2, y2] = p(a2);
  return `M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`;
}

function RBtn({
  label,
  icon,
  onClick,
  tour,
  active,
  title,
  disabled,
  size = BTN,
  delay = 0,
}: {
  label: string;
  icon: string;
  onClick: () => void;
  tour?: boolean;
  active?: boolean;
  title?: string;
  disabled?: boolean;
  size?: number;
  delay?: number;
}) {
  const big = size > BTN;
  return (
    <button
      onClick={onClick}
      title={title ?? label}
      disabled={disabled}
      style={{ width: size, height: size, left: -size / 2, top: -size / 2, animationDelay: `${delay}ms` }}
      className={cn(
        'anim-btn-in absolute flex flex-col items-center justify-center gap-1 rounded-full border bg-white/[0.05] text-white backdrop-blur-md transition-[background-color,border-color,transform] duration-200',
        'hover:border-white/70 hover:bg-white/[0.14] active:scale-95 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white',
        active ? 'border-white/80 bg-white/[0.16]' : big ? 'border-white/55 bg-white/[0.12] shadow-[0_0_28px_rgba(255,255,255,0.14)]' : 'border-white/20',
        tour && 'tour-hi',
      )}
    >
      <Icon name={icon} size={big ? 26 : 19} />
      <span className={cn('font-medium leading-none tracking-[0.08em]', big ? 'text-[13px]' : 'text-[10.5px]')}>{label}</span>
    </button>
  );
}

export function Orbit(p: Props) {
  const [offset, setOffset] = useState(0);
  const items: TrackItem[] =
    p.actions ??
    p.formats.map((f) => ({ id: f.id, label: f.label, icon: f.category === 'image' ? 'image' : f.category, title: `Convert to ${f.label}`, run: () => p.onFormat(f) }));
  const max = Math.max(0, items.length - VISIBLE);
  const wheelAt = useRef(0);
  const drag = useRef<{ sx: number; sy: number; ox: number; oy: number; moved: boolean } | null>(null);

  const step = (d: number) => {
    setOffset((o) => {
      const n = Math.max(0, Math.min(max, o + d));
      if (n !== o) p.onScrolled?.();
      return n;
    });
  };

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') step(1);
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') step(-1);
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  });

  const onWheel = (e: React.WheelEvent) => {
    const now = performance.now();
    if (now - wheelAt.current < 150 || Math.abs(e.deltaY) + Math.abs(e.deltaX) < 4) return;
    wheelAt.current = now;
    step(e.deltaY + e.deltaX > 0 ? 1 : -1);
  };

  const down = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { sx: e.clientX, sy: e.clientY, ox: p.x, oy: p.y, moved: false };
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true;
    if (d.moved) p.onMove(d.ox + dx, d.oy + dy);
  };
  const up = (center: boolean) => () => {
    const d = drag.current;
    drag.current = null;
    if (center && d && !d.moved) p.onCenter();
  };

  const name = p.files[0]?.name ?? '';
  const extra = p.files.length - 1;
  const thumbLen = items.length > VISIBLE ? (VISIBLE / items.length) * 100 : 100;
  const thumbStart = items.length > VISIBLE ? (offset / items.length) * 100 : 0;

  return (
    <div
      className="fixed z-30"
      style={{
        left: p.x - C,
        top: p.y - C,
        width: LAYOUT,
        height: LAYOUT,
        transform: `scale(${p.scale * ORBIT_SHRINK})`,
        transformOrigin: '50% 50%',
      }}
      onWheel={onWheel}
      onPointerDown={(e) => e.stopPropagation()}
      role="dialog"
      aria-label="Flicky Orbit"
    >
      <div className="anim-orbit-in absolute inset-0">

        <div className="pointer-events-none absolute left-0 right-0 -top-7 flex items-center justify-center gap-2 text-[11px] text-white/45">
          <span className="rounded-md border border-white/20 px-1.5 py-0.5 text-white/70">{formatShortcut(p.shortcut)}</span>
          {p.clipboard && <span>Clipboard</span>}
        </div>

        <div
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up(false)}
          className="absolute cursor-grab rounded-full active:cursor-grabbing"
          style={{
            left: C - 214,
            top: C - 214,
            width: 428,
            height: 428,
            background: 'radial-gradient(circle at 50% 50%, rgba(28,28,28,0.9) 0%, rgba(10,10,10,0.88) 62%, rgba(4,4,4,0.82) 100%)',
            backdropFilter: 'blur(14px)',
            boxShadow: '0 0 0 1px rgba(255,255,255,0.1), 0 30px 80px rgba(0,0,0,0.65)',
          }}
        />

        <div className="anim-burst pointer-events-none absolute rounded-full" style={{ left: C - 214, top: C - 214, width: 428, height: 428 }} />

        <svg width={LAYOUT} height={LAYOUT} className="pointer-events-none absolute inset-0">
          <circle className="anim-ring" pathLength={1} cx={C} cy={C} r={R} fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
          <circle className="anim-ring" pathLength={1} style={{ animationDelay: '60ms' }} cx={C} cy={C} r={98} fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="1" />
          <circle className="anim-ring" pathLength={1} style={{ animationDelay: '120ms' }} cx={C} cy={C} r={190} fill="none" stroke="rgba(255,255,255,0.09)" strokeWidth="1" />
          <path d={arcPath(196, -165, -15)} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="2" strokeLinecap="round" pathLength={100} />
          {items.length > VISIBLE && (
            <path
              d={arcPath(196, -165, -15)}
              fill="none"
              stroke="rgba(255,255,255,0.85)"
              strokeWidth="2"
              strokeLinecap="round"
              pathLength={100}
              strokeDasharray={`${thumbLen} 200`}
              strokeDashoffset={-thumbStart}
              style={{ transition: 'stroke-dashoffset 400ms cubic-bezier(0.3,0.8,0.2,1)' }}
            />
          )}
        </svg>

        <div
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up(true)}
          data-tour="center"
          className={cn(
            'absolute flex cursor-grab flex-col items-center justify-center rounded-full border border-white/20 active:cursor-grabbing',
            p.tourHi === 'center' && 'tour-hi',
          )}
          style={{
            left: C - 84,
            top: C - 84,
            width: 168,
            height: 168,
            background:
              'radial-gradient(circle at 50% 38%, rgba(255,255,255,calc(0.14 * var(--glow) + 0.04)) 0%, rgba(255,255,255,0.03) 45%, rgba(0,0,0,0.5) 100%)',
            backdropFilter: 'blur(10px)',
          }}
          title={p.activeJobs ? 'Show queue' : undefined}
        >
          <Star size={46} className="mb-2.5" />
          <div className="pointer-events-none flex max-w-[132px] flex-col items-center text-center">
            <span className="w-full truncate text-[11.5px] font-medium text-white" title={name}>
              {name}
            </span>
            <span className="mt-0.5 text-[10px] text-white/45">
              {extra > 0 ? `+ ${extra} more` : items.length === 0 ? 'Needs an engine · see More' : p.activeJobs ? `${p.activeJobs} in queue` : ' '}
            </span>
          </div>
          {p.activeJobs > 0 && (
            <span className="pointer-events-none absolute bottom-3 h-[3px] w-6 rounded-full bg-white/70" />
          )}
        </div>

        <div data-tour="formats" className="pointer-events-none absolute inset-0">
          {items.map((f, i) => {
            const n = items.length;
            const pos = i - offset;
            const vis = n < VISIBLE || (pos >= 0 && pos < VISIBLE);

            const cp = n >= VISIBLE ? Math.max(-1, Math.min(VISIBLE, pos)) : n === 1 ? 1 : i * 2;
            const rot = -150 + 60 * cp + 90;
            return (
              <div
                key={f.id}
                className="absolute"
                style={{
                  left: C,
                  top: C,
                  width: 0,
                  height: 0,
                  transform: `rotate(${rot}deg) translateY(${-R}px)`,
                  transition: 'transform 480ms cubic-bezier(0.3,0.8,0.2,1), opacity 300ms ease',
                  opacity: vis ? 1 : 0,
                  pointerEvents: vis ? 'auto' : 'none',
                }}
              >
                <div style={{ transform: `rotate(${-rot}deg)`, transition: 'transform 480ms cubic-bezier(0.3,0.8,0.2,1)' }}>
                  <RBtn
                    label={f.label}
                    icon={f.icon}
                    onClick={f.run}
                    tour={p.tourHi === 'formats'}
                    size={n < VISIBLE ? 92 : BTN}
                    delay={90 + i * 55}
                    disabled={!vis}
                    title={f.title}
                  />
                </div>
              </div>
            );
          })}
        </div>

        <div className="absolute" style={{ left: C + R * Math.cos(Math.PI / 6) * -1, top: C + R * 0.5 }}>
          <RBtn label="Compress" icon="archive" onClick={p.onCompress} tour={p.tourHi === 'compress'} title="Compress" delay={260} />
        </div>
        <div className="absolute" style={{ left: C + R * Math.cos(Math.PI / 6), top: C + R * 0.5 }}>
          <RBtn label="Copy Path" icon="link" onClick={p.onCopy} tour={p.tourHi === 'copy'} title="Copy path" delay={310} />
        </div>
        <div className="absolute" style={{ left: C, top: C + R }}>
          <RBtn label="More" icon="dots" onClick={p.onMore} active={p.moreOpen} tour={p.tourHi === 'more'} title="More formats and actions" delay={360} />
        </div>
      </div>
    </div>
  );
}
