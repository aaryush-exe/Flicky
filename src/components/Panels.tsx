import type { ReactNode } from 'react';
import { cn } from '../utils/cn';
import { Icon } from './Icons';
import { ORBIT_SIZE } from './Orbit';
import type { Job } from '../lib/queue';
import type { Engine, Format } from '../lib/formats';

const W = 300;

export function SidePanel({
  x,
  y,
  scale,
  title,
  onClose,
  children,
  tour,
  halfSize,
}: {
  x: number;
  y: number;
  scale: number;
  title: string;
  onClose: () => void;
  children: ReactNode;
  tour?: boolean;
  halfSize?: number;
}) {
  const half = (halfSize ?? ORBIT_SIZE / 2) * scale;
  const right = x + half + 8 + W <= window.innerWidth - 8;
  const left = right ? x + half + 8 : Math.max(8, x - half - 8 - W);
  const maxH = Math.min(520, window.innerHeight - 70);
  const top = Math.max(8, Math.min(window.innerHeight - 60 - maxH, y - maxH / 2));
  return (
    <div
      className={cn('anim-fade-in glass fixed z-30 flex flex-col rounded-2xl text-white shadow-2xl', tour && 'tour-hi')}
      style={{ left, top, width: W, maxHeight: maxH }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between px-4 pb-2 pt-3">
        <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-white/55">{title}</span>
        <button onClick={onClose} className="rounded-full p-1 text-white/50 hover:bg-white/10 hover:text-white" aria-label="Close panel">
          <Icon name="x" size={14} />
        </button>
      </div>
      <div className="overflow-y-auto px-4 pb-4">{children}</div>
    </div>
  );
}

export interface CatalogueItem {
  format: Format;
  engine: Engine;
  available: boolean;
}

export function MoreContent({
  catalogue,
  imageCount,
  hasArchive,
  onFormat,
  onCombine,
  onExtract,
  onCompressOptions,
  onSettings,
}: {
  catalogue: CatalogueItem[];
  imageCount: number;
  hasArchive: boolean;
  onFormat: (f: Format) => void;
  onCombine: () => void;
  onExtract: () => void;
  onCompressOptions: () => void;
  onSettings: () => void;
}) {
  const missing = Array.from(new Set(catalogue.filter((c) => !c.available).map((c) => c.engine.name)));
  const Action = ({ icon, label, onClick, hint }: { icon: string; label: string; onClick: () => void; hint?: string }) => (
    <button onClick={onClick} className="group flex w-full items-center gap-3 rounded-lg border border-transparent px-2 py-2 text-left hover:border-white/20 hover:bg-white/[0.06]">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/20 text-white/80">
        <Icon name={icon} size={15} />
      </span>
      <span className="min-w-0">
        <span className="block text-[13px]">{label}</span>
        {hint && <span className="block text-[11px] text-white/40">{hint}</span>}
      </span>
    </button>
  );
  return (
    <div>
      <div className="mb-1.5 text-[11px] text-white/45">Convert to</div>
      {catalogue.length === 0 ? (
        <p className="mb-3 text-[12px] text-white/50">No registered engine recognises this file type.</p>
      ) : (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {catalogue.map(({ format, engine, available }) => (
            <button
              key={format.id}
              disabled={!available}
              onClick={() => onFormat(format)}
              title={available ? `Convert to ${format.label}` : `Needs the ${engine.name}`}
              className="flex items-center gap-1 rounded-full border border-white/25 px-3 py-1 text-[12px] tracking-wide transition-colors hover:border-white/70 hover:bg-white/10 disabled:cursor-not-allowed disabled:border-white/10 disabled:text-white/30 disabled:hover:bg-transparent"
            >
              {!available && <Icon name="lock" size={11} />}
              {format.label}
            </button>
          ))}
        </div>
      )}
      {missing.length > 0 && (
        <p className="mb-3 text-[11px] leading-snug text-white/40">
          Locked formats need: {missing.join(', ')}. Engines are downloaded and verified by the Windows host (Settings → Conversion engines).
        </p>
      )}
      <div className="mb-1 mt-3 text-[11px] text-white/45">Actions</div>
      <div className="-mx-2">
        {imageCount >= 2 && <Action icon="layers" label={`Combine ${imageCount} images into one PDF`} onClick={onCombine} hint="Uses your page size and margin preferences" />}
        {hasArchive && <Action icon="extract" label="Extract archive" onClick={onExtract} hint="Into a folder named after the archive · WinRAR" />}
        <Action icon="archive" label="Compress with options…" onClick={onCompressOptions} hint="ZIP, RAR or 7Z · optional password · WinRAR" />
        <Action icon="settings" label="Conversion preferences" onClick={onSettings} hint="Quality, resolution, page layout…" />
      </div>
    </div>
  );
}

const statusText = (j: Job) => {
  switch (j.status) {
    case 'queued':
      return 'Queued';
    case 'waiting':
      return 'Waiting for your answer';
    case 'processing':
      return j.progress == null ? 'Processing' : `Processing ${Math.round(j.progress * 100)}%`;
    case 'completed':
      return 'Completed';
    case 'failed':
      return j.error || 'Failed';
    case 'cancelled':
      return j.note || 'Cancelled';
  }
};

export function QueueContent({
  jobs,
  onCancel,
  onCancelAll,
  onRetry,
  onDismiss,
}: {
  jobs: Job[];
  onCancel: (id: string) => void;
  onCancelAll: () => void;
  onRetry: (id: string) => void;
  onDismiss: (id: string) => void;
}) {
  const active = jobs.filter((j) => ['queued', 'waiting', 'processing'].includes(j.status));
  if (jobs.length === 0) return <p className="text-[12px] text-white/50">Nothing is queued.</p>;
  return (
    <div>
      <ul className="space-y-3">
        {jobs.map((j) => (
          <li key={j.id}>
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12.5px]" title={j.name}>
                  {j.name}
                </div>
                <div className={cn('truncate text-[11px]', j.status === 'failed' ? 'text-white' : 'text-white/45')}>
                  {j.label} · {statusText(j)}
                </div>
              </div>
              {(j.status === 'queued' || j.status === 'processing' || j.status === 'waiting') && (
                <button onClick={() => onCancel(j.id)} className="rounded-full border border-white/20 p-1 text-white/60 hover:border-white/60 hover:text-white" title="Cancel">
                  <Icon name="x" size={12} />
                </button>
              )}
              {j.status === 'failed' && (
                <>
                  <button onClick={() => onRetry(j.id)} className="rounded-full border border-white/20 p-1 text-white/60 hover:border-white/60 hover:text-white" title="Retry">
                    <Icon name="refresh" size={12} />
                  </button>
                  <button onClick={() => onDismiss(j.id)} className="rounded-full border border-white/20 p-1 text-white/60 hover:border-white/60 hover:text-white" title="Dismiss">
                    <Icon name="x" size={12} />
                  </button>
                </>
              )}
              {j.status === 'completed' && <Icon name="check" size={14} className="text-white/80" />}
            </div>
            {(j.status === 'processing' || j.status === 'completed') && (
              <div className="relative mt-1.5 h-[2px] overflow-hidden rounded-full bg-white/15">
                {j.progress == null ? (
                  <div className="absolute inset-y-0 w-1/3 bg-white/80" style={{ animation: 'sweep 1.4s ease-in-out infinite' }} />
                ) : (
                  <div className="h-full bg-white transition-all duration-300" style={{ width: `${Math.round(j.progress * 100)}%` }} />
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
      <div className="mt-4 flex items-center justify-between">
        <span className="text-[10.5px] leading-snug text-white/35">Jobs start in order; parallel jobs may finish in a different order.</span>
        {active.length > 1 && (
          <button onClick={onCancelAll} className="ml-2 shrink-0 text-[11px] text-white/60 underline-offset-2 hover:text-white hover:underline">
            Cancel all
          </button>
        )}
      </div>
    </div>
  );
}
