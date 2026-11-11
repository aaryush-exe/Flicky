import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { Orbit, ORBIT_SIZE, type TrackItem } from './components/Orbit';
import { MoreContent, SidePanel } from './components/Panels';
import { Icon } from './components/Icons';
import { catalogueFor, categoryOf, engineForFormat, extOf, orbitFormats, selectionCategory, type Format } from './lib/formats';
import { getHost } from './lib/host';
import { useSettings } from './lib/settings';
import {
  OVERLAY_OPEN_EVENT,
  OVERLAY_STATUS_EVENT,
  lightFile,
  overlayDispatch,
  overlayHide,
  overlayTakePending,
  type OrbitOpen,
  type OverlayStatus,
  type RunRequest,
} from './lib/overlay';

interface Shown {
  files: File[];
  paths: string[];
  x: number;
  y: number;
  key: number;
}

let orbitKey = 0;

export default function Overlay() {
  const s = useSettings();
  const scale = s.uiScale;

  const [shown, setShown] = useState<Shown | null>(null);
  const [more, setMore] = useState(false);
  const [hint, setHint] = useState<{ x: number; y: number; text: string } | null>(null);
  const [status, setStatus] = useState<(OverlayStatus & { x: number; y: number }) | null>(null);
  const [engTick, setEngTick] = useState(0);
  const [vp, setVp] = useState({ w: window.innerWidth, h: window.innerHeight });

  const awaiting = useRef(false);

  useEffect(() => {
    document.documentElement.style.fontSize = `${16 * s.uiScale}px`;
    document.documentElement.style.setProperty('--glow', String(s.glow / 100));
    document.documentElement.classList.toggle('reduce-motion', s.reduceMotion);
  }, [s.uiScale, s.glow, s.reduceMotion]);

  useEffect(() => {
    const r = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', r);
    return () => window.removeEventListener('resize', r);
  }, []);

  const clampPos = useCallback(
    (x: number, y: number) => {
      const half = (ORBIT_SIZE / 2) * scale;
      const cx = vp.w < half * 2 + 16 ? vp.w / 2 : Math.max(half + 8, Math.min(vp.w - half - 8, x));
      const cy = vp.h < half * 2 + 60 ? vp.h / 2 : Math.max(half + 36, Math.min(vp.h - half - 52, y));
      return { x: cx, y: cy };
    },
    [scale, vp],
  );

  const close = useCallback(() => {
    awaiting.current = false;
    setShown(null);
    setMore(false);
    setHint(null);
    setStatus(null);
    void overlayHide();
  }, []);

  const onOpen = useRef<(p: OrbitOpen) => void>(() => {});
  onOpen.current = (p) => {
    awaiting.current = false;
    setStatus(null);
    setMore(false);

    void getHost()?.engines?.refresh?.().then(() => setEngTick((n) => n + 1));
    if (!p.paths.length) {
      setShown(null);
      setHint({ x: p.x, y: p.y, text: p.hint || 'Nothing is selected' });
      return;
    }
    setHint(null);
    setShown({ files: p.paths.map(lightFile), paths: p.paths, x: p.x, y: p.y, key: ++orbitKey });
  };
  const onStatus = useRef<(st: OverlayStatus) => void>(() => {});
  onStatus.current = (st) => {
    if (!awaiting.current) return;
    setStatus((cur) => ({ ...st, x: cur?.x ?? vp.w / 2, y: cur?.y ?? vp.h / 2 }));
  };

  useEffect(() => {
    const win = getCurrentWebviewWindow();
    let dead = false;
    let offs: Array<() => void> = [];
    (async () => {
      const a = await win.listen<OrbitOpen>(OVERLAY_OPEN_EVENT, (e) => {
        onOpen.current(e.payload);
        void overlayTakePending();
      });
      const b = await win.listen<OverlayStatus>(OVERLAY_STATUS_EVENT, (e) => onStatus.current(e.payload));
      if (dead) {
        a();
        b();
        return;
      }
      offs = [a, b];

      const pending = await overlayTakePending();
      if (pending && !dead) onOpen.current(pending);
    })();
    return () => {
      dead = true;
      offs.forEach((f) => f());
    };
  }, []);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [close]);

  useEffect(() => {
    if (!hint) return;
    const t = window.setTimeout(close, 2400);
    return () => window.clearTimeout(t);
  }, [hint, close]);

  useEffect(() => {
    if (!status || status.phase === 'working') return;
    const t = window.setTimeout(close, status.phase === 'done' ? 1600 : 4500);
    return () => window.clearTimeout(t);
  }, [status, close]);

  const pos = shown ? clampPos(shown.x, shown.y) : null;

  const send = (req: RunRequest, working: string | null) => {
    void overlayDispatch(req);
    if (working && pos) {
      awaiting.current = true;
      setStatus({ phase: 'working', text: working, x: pos.x, y: pos.y });
      setShown(null);
      setMore(false);
    } else {
      close();
    }
  };

  const onFormat = (f: Format) => {
    if (!shown) return;
    const eng = engineForFormat(f.id);

    send({ action: 'convert', paths: shown.paths, format: f.id }, eng && !eng.available() ? null : `Converting to ${f.label}…`);
  };

  const onCopy = async () => {
    if (!shown || !pos) return;
    const text = shown.paths.join('\n');
    const plural = shown.paths.length > 1;
    setShown(null);
    setMore(false);
    try {
      await navigator.clipboard.writeText(text);
      setStatus({ phase: 'done', text: plural ? 'Paths copied' : 'Path copied', x: pos.x, y: pos.y });
    } catch {
      setStatus({ phase: 'error', text: 'Could not copy — clipboard access was denied', x: pos.x, y: pos.y });
    }
  };

  const formats = useMemo(() => (shown ? orbitFormats(shown.files) : []), [shown?.key]);
  const catalogue = useMemo(() => (shown ? catalogueFor(shown.files) : []), [shown?.key, engTick]);
  const imageCount = shown ? shown.files.filter((f) => categoryOf(f) === 'image').length : 0;
  const hasArchive = shown ? shown.files.some((f) => categoryOf(f) === 'archive') : false;

  const archiveActions: TrackItem[] | undefined = useMemo(() => {
    if (!shown || selectionCategory(shown.files) !== 'archive') return undefined;
    const paths = shown.paths;
    const archives = shown.files.filter((f) => categoryOf(f) === 'archive');
    const allZip = archives.every((f) => extOf(f.name) === 'zip');
    const items: TrackItem[] = [
      { id: 'unzip', label: allZip ? 'Unzip' : 'Extract', icon: 'extract', title: 'Extract here', run: () => send({ action: 'extract', paths }, 'Extracting…') },
      { id: 'extract-to', label: 'Extract to…', icon: 'open', title: 'Choose where to extract', run: () => send({ action: 'extract-to', paths }, null) },
      { id: 'test', label: 'Test', icon: 'refresh', title: 'Check the archive for errors', run: () => send({ action: 'test', paths }, null) },
    ];
    if (paths.length === 1) {
      items.splice(1, 0, { id: 'view', label: 'View', icon: 'document', title: 'See what’s inside', run: () => send({ action: 'view', paths }, null) });
      items.push({ id: 'winrar', label: 'WinRAR', icon: 'archive', title: 'Open in WinRAR', run: () => send({ action: 'winrar', paths }, null) });
    }
    return items;
  }, [shown?.key, pos?.x, pos?.y]);

  return (
    <div className="fixed inset-0 overflow-hidden" onContextMenu={(e) => e.preventDefault()}>

      {(shown || hint || status) && <div className="fixed inset-0 z-20" onPointerDown={close} />}

      {shown && pos && (
        <Orbit
          key={shown.key}
          files={shown.files}
          x={pos.x}
          y={pos.y}
          scale={scale}
          formats={formats}
          actions={archiveActions}
          shortcut={s.shortcut}
          activeJobs={0}
          moreOpen={more}
          tourHi={null}
          onMove={(x, y) => setShown((o) => (o ? { ...o, x, y } : o))}
          onFormat={onFormat}
          onCompress={() => send({ action: 'compress', paths: shown.paths }, 'Compressing…')}
          onCopy={() => void onCopy()}
          onMore={() => setMore((m) => !m)}
          onCenter={() => {}}
        />
      )}

      {shown && pos && more && (
        <SidePanel x={pos.x} y={pos.y} scale={scale} title="More" onClose={() => setMore(false)}>
          <MoreContent
            catalogue={catalogue}
            imageCount={imageCount}
            hasArchive={hasArchive}
            onFormat={onFormat}
            onCombine={() => send({ action: 'combine', paths: shown.paths }, 'Combining…')}
            onExtract={() => send({ action: 'extract', paths: shown.paths }, 'Extracting…')}
            onCompressOptions={() => send({ action: 'compress-options', paths: shown.paths }, null)}
            onSettings={() => send({ action: 'settings' }, null)}
          />
        </SidePanel>
      )}

      {hint && <Pill x={hint.x} y={hint.y} vw={vp.w} icon="info" text={hint.text} />}
      {status && <Pill x={status.x} y={status.y} vw={vp.w} icon={status.phase === 'done' ? 'check' : status.phase === 'error' ? 'alert' : 'refresh'} spin={status.phase === 'working'} text={status.text} progress={status.phase === 'working' ? status.progress : undefined} />}
    </div>
  );
}

function Pill({ x, y, vw, icon, text, spin, progress }: { x: number; y: number; vw: number; icon: string; text: string; spin?: boolean; progress?: number | null }) {
  const w = 300;
  const left = Math.max(8 + w / 2, Math.min(vw - 8 - w / 2, x));
  const pct = progress == null ? null : Math.round(progress * 100);
  return (
    <div
      className="anim-note-in glass fixed z-30 rounded-2xl px-4 py-3 text-white shadow-2xl"
      style={{ left, top: y, width: w, transform: 'translate(-50%, -50%)' }}
      onPointerDown={(e) => e.stopPropagation()}
      role="status"
    >
      <div className="flex items-center gap-3">
        <span className={spin ? 'animate-spin text-white/80' : 'text-white/80'}>
          <Icon name={icon} size={16} />
        </span>
        <span className="min-w-0 flex-1 break-words text-[13px] leading-snug">{text}</span>
        {pct != null && <span className="tabular-nums text-[12px] text-white/60">{pct}%</span>}
      </div>
      {pct != null && (
        <div className="mt-2.5 h-[3px] w-full overflow-hidden rounded-full bg-white/15">
          <div className="h-full rounded-full bg-white transition-[width] duration-300" style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
}
