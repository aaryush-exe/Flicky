import type { ReactNode } from 'react';
import { cn } from '../utils/cn';
import { hasHost } from '../lib/host';

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={cn(
        'relative h-5 w-9 shrink-0 rounded-full border transition-colors',
        on ? 'border-white bg-white' : 'border-white/30 bg-transparent',
      )}
    >
      <span className={cn('absolute top-[2px] h-3.5 w-3.5 rounded-full transition-all', on ? 'left-[18px] bg-black' : 'left-[2px] bg-white/70')} />
    </button>
  );
}

export function Row({ title, hint, children, badge }: { title: string; hint?: ReactNode; children?: ReactNode; badge?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-6 border-b border-white/[0.08] py-3.5">
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-[13px] text-white">
          {title}
          {badge && !hasHost() && (
            <span className="rounded-full border border-white/20 px-1.5 py-px text-[9px] uppercase tracking-wider text-white/50" title="Saved now, applied by the Windows host">
              Host
            </span>
          )}
        </div>
        {hint && <div className="mt-0.5 text-[12px] leading-snug text-white/45">{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export function Slider({
  value,
  min,
  max,
  step = 1,
  onChange,
  format,
  width = 160,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
  width?: number;
}) {
  return (
    <div className="flex items-center gap-3" style={{ width: width + 52 }}>
      <input
        type="range"
        className="fl-range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width }}
      />
      <span className="w-10 text-right text-[12px] tabular-nums text-white/70">{format ? format(value) : value}</span>
    </div>
  );
}

export function Select<T extends string | number>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <select
      className="fl-select"
      value={String(value)}
      onChange={(e) => {
        const o = options.find((x) => String(x.value) === e.target.value);
        if (o) onChange(o.value);
      }}
    >
      {options.map((o) => (
        <option key={String(o.value)} value={String(o.value)}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Btn({
  children,
  onClick,
  disabled,
  primary,
  small,
  title,
  className,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  primary?: boolean;
  small?: boolean;
  title?: string;
  className?: string;
}) {
  return (
    <button
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-lg border transition-colors disabled:cursor-not-allowed disabled:opacity-35',
        small ? 'px-2.5 py-1 text-[12px]' : 'px-3.5 py-1.5 text-[13px]',
        primary
          ? 'border-white bg-white text-black hover:bg-white/85'
          : 'border-white/25 bg-white/[0.04] text-white hover:border-white/60 hover:bg-white/10',
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Keycaps({ combo }: { combo: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      {combo.split('+').map((k, i) => (
        <kbd key={i} className="rounded-md border border-white/25 bg-white/[0.06] px-1.5 py-0.5 text-[11px] font-medium text-white/85">
          {k}
        </kbd>
      ))}
    </span>
  );
}
