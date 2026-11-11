import { cn } from '../utils/cn';
import { Icon } from './Icons';
import { Star } from './Logo';

interface Props {
  x: number;
  y: number;
  scale: number;

  progress?: number | null;
  processing: boolean;
  dropActive: boolean;
  paused: boolean;
  success: string | null;
  tour?: boolean;
  onClick: () => void;
  onCancel: () => void;
  onContext: (x: number, y: number) => void;
}

const SIZE = 52;
const RING = 64;

export function FloatingLogo(p: Props) {
  const r = 29;
  const circ = 2 * Math.PI * r;
  const pct = p.progress == null ? null : Math.round(p.progress * 100);
  return (
    <div
      className="fixed z-20 flex flex-col items-center"
      style={{
        left: p.x - RING / 2,
        top: p.y - RING / 2,
        width: RING,
        transform: `scale(${p.scale})`,
        transformOrigin: '50% 32px',
        transition: 'left 500ms cubic-bezier(0.3,0.8,0.2,1), top 500ms cubic-bezier(0.3,0.8,0.2,1)',
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="relative" style={{ width: RING, height: RING }}>
        <svg width={RING} height={RING} className="pointer-events-none absolute inset-0 -rotate-90">
          {p.processing && (
            <>
              <circle cx={RING / 2} cy={RING / 2} r={r} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="2" />
              <circle
                cx={RING / 2}
                cy={RING / 2}
                r={r}
                fill="none"
                stroke="#fff"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeDasharray={p.progress == null ? `${circ * 0.25} ${circ}` : `${circ * p.progress} ${circ}`}
                style={{
                  transition: 'stroke-dasharray 300ms ease',
                  transformOrigin: '50% 50%',
                  animation: p.progress == null ? 'spin 1.1s linear infinite' : undefined,
                }}
              />
            </>
          )}
        </svg>
        <button
          onClick={p.onClick}
          onContextMenu={(e) => {
            e.preventDefault();
            p.onContext(e.clientX, e.clientY);
          }}
          aria-label="Flicky launcher"
          style={{ width: SIZE, height: SIZE, left: (RING - SIZE) / 2, top: (RING - SIZE) / 2 }}
          className={cn(
            'glass absolute flex items-center justify-center rounded-full transition-all duration-200 hover:border-white/50',
            p.dropActive && 'scale-110 border-white',
            p.paused && 'opacity-50',
            p.tour && 'tour-hi',
          )}
        >
          <Star size={26} className={p.paused ? 'opacity-60' : ''} />
        </button>
      </div>
      {p.processing && (
        <div className="anim-fade-in mt-1 flex items-center gap-1.5 text-[11px] text-white/80">
          <span className="tabular-nums">{pct == null ? '…' : `${pct}%`}</span>
          <button onClick={p.onCancel} title="Cancel" className="rounded-full border border-white/25 p-0.5 text-white/70 hover:border-white hover:text-white">
            <Icon name="x" size={10} />
          </button>
        </div>
      )}
      {!p.processing && p.success && (
        <div className="anim-note-in glass mt-1.5 flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[11.5px]">
          <Icon name="check" size={13} />
          {p.success}
        </div>
      )}
    </div>
  );
}
