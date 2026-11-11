import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { Orbit, ORBIT_SIZE, type TrackItem } from './components/Orbit';
import { ArchiveViewer, type ViewerState } from './components/ArchiveViewer';
import { FloatingLogo } from './components/FloatingLogo';
import { MoreContent, QueueContent, SidePanel } from './components/Panels';
import { Notifications } from './components/Notifications';
import { FlickyMenu, Taskbar } from './components/Tray';
import { ActivityCard, ArchiveCard, PasswordCard, type CompressOptions } from './components/Cards';
import { SettingsWindow, type SectionId } from './components/SettingsWindow';
import { QuickSetup, TourCard, tourSteps } from './components/Onboarding';
import { Star } from './components/Logo';
import { Btn, Keycaps } from './components/controls';
import { askChoice, notify } from './lib/notify';
import { queue, useJobs, type Entry, type Skip, type Summary } from './lib/queue';
import { canConvert, catalogueFor, categoryOf, engineForFormat, extOf, getFormat, normExt, orbitFormats, selectionCategory, type Format } from './lib/formats';
import { getHost } from './lib/host';
import { updateSettings, useSettings } from './lib/settings';
import { matchesShortcut, shortcutState } from './lib/shortcuts';
import { clipboardFiles, hasUserActivation, pickFiles, pickFolder } from './lib/input';
import { askPassword, detectWinRar, setJobSecret } from './lib/archive';
import { makeSampleFile } from './lib/sample';
import { filesFromNativePaths } from './lib/desktop';
import { RUN_EVENT, lightFile, overlayStatus, setHotkeyPaused, showMainWindow, type RunRequest } from './lib/overlay';

interface OrbitState {
  files: File[];
  x: number;
  y: number;
  clipboard?: boolean;
  key: number;
}

let recovered = false;
let orbitKey = 0;

export default function App() {
  const s = useSettings();
  const jobs = useJobs();

  const [orbit, setOrbit] = useState<OrbitState | null>(null);
  const [panel, setPanel] = useState<'none' | 'more' | 'queue'>('none');
  const [settingsSection, setSettingsSection] = useState<SectionId | null>(null);
  const [activity, setActivity] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number; anchor: 'tray' | 'point' } | null>(null);
  const [archive, setArchive] = useState<{ mode: 'compress' | 'extract'; files: File[] } | null>(null);
  const [paused, setPaused] = useState(false);
  const [exited, setExited] = useState(false);
  const [tour, setTour] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [engTick, setEngTick] = useState(0);
  const [viewer, setViewer] = useState<ViewerState | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [lastPos, setLastPos] = useState({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
  const [vp, setVp] = useState({ w: window.innerWidth, h: window.innerHeight });
  const mouse = useRef({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
  const successTimer = useRef<number | undefined>(undefined);
  const sampleRef = useRef<File | null>(null);

  const scale = s.uiScale;
  const steps = useMemo(() => tourSteps(s.shortcut), [s.shortcut]);
  const tourHi = tour !== null ? steps[tour].hi : null;

  useEffect(() => {
    document.documentElement.style.fontSize = `${16 * s.uiScale}px`;
    document.documentElement.style.setProperty('--glow', String(s.glow / 100));
    document.documentElement.classList.toggle('reduce-motion', s.reduceMotion);
  }, [s.uiScale, s.glow, s.reduceMotion]);

  useEffect(() => {
    const h = () => setEngTick((n) => n + 1);
    window.addEventListener('flicky-engines-updated', h);
    return () => window.removeEventListener('flicky-engines-updated', h);
  }, []);

  useEffect(() => {
    const r = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', r);
    return () => window.removeEventListener('resize', r);
  }, []);

  useEffect(() => {
    queue.onFailure = (job) => {

      void overlayStatus({ phase: 'error', text: `${job.name} — ${job.error}` }).then((shown) => {
        if (!shown) void showMainWindow();
      });
      notify({
        title: job.name,
        body: job.error,
        tone: 'error',
        persistent: true,
        actions: [
          { label: 'Retry', run: () => queue.retry(job.id) },
          { label: 'Dismiss', run: () => queue.dismiss(job.id) },
        ],
      });
    };
    queue.onBatchFinished = (sum: Summary) => {
      if (sum.failed.length === 0) {
        if (sum.completed > 0) void overlayStatus({ phase: 'done', text: sum.completed === 1 ? 'Done' : `Done · ${sum.completed} files` });
        else void overlayStatus({ phase: 'error', text: sum.skipped[0] ? `${sum.skipped[0].name} — ${sum.skipped[0].reason}` : sum.cancelled ? 'Cancelled' : 'Nothing to do' });
      }
      if (sum.completed > 0) {
        setSuccess(sum.completed === 1 ? 'Done' : `Done · ${sum.completed} files`);
        window.clearTimeout(successTimer.current);
        successTimer.current = window.setTimeout(() => setSuccess(null), 5000);
      }
      if (sum.skipped.length || sum.failed.length) {
        const lines = [`${sum.completed} completed${sum.failed.length ? ` · ${sum.failed.length} failed` : ''}${sum.skipped.length ? ` · ${sum.skipped.length} skipped` : ''}`];
        sum.skipped.slice(0, 4).forEach((k) => lines.push(`${k.name} — ${k.reason}`));
        if (sum.skipped.length > 4) lines.push(`…and ${sum.skipped.length - 4} more skipped`);
        sum.failed.slice(0, 3).forEach((f) => lines.push(`${f.name} — failed: ${f.reason}`));
        notify({ title: 'Finished with issues', body: lines.join('\n'), persistent: true, actions: [{ label: 'Dismiss' }] });
      }
      window.setTimeout(() => {
        if (queue.activeCount() === 0) queue.pruneFinished();
      }, 5200);
    };
    if (!recovered) {
      recovered = true;
      queue.recover().then((names) => {
        if (names.length) {
          notify({
            title: 'Recovered interrupted operations',
            body: `Resuming ${names.length} operation${names.length > 1 ? 's' : ''}: ${names.slice(0, 3).join(', ')}${names.length > 3 ? '…' : ''}`,
            tone: 'info',
          });
        }
      });
    }
  }, []);

  const active = jobs.filter((j) => ['queued', 'waiting', 'processing'].includes(j.status));
  const processing = active.length > 0;

  useEffect(() => {
    if (!processing) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [processing]);

  const overall = useMemo(() => {
    if (!jobs.length) return null;
    let sum = 0;
    let known = false;
    for (const j of jobs) {
      if (j.status === 'completed' || j.status === 'failed' || j.status === 'cancelled') {
        sum += 1;
        known = true;
      } else if (j.status === 'processing' && j.progress != null) {
        sum += j.progress;
        known = true;
      }
    }
    return known ? sum / jobs.length : null;
  }, [jobs]);

  useEffect(() => {
    if (!processing || !isTauri()) return;
    const progress = overall == null ? null : Math.round(overall * 100) / 100;
    void overlayStatus({ phase: 'working', text: active.length > 1 ? `${active.length} operations…` : active[0]?.label ?? 'Working…', progress });

  }, [processing, overall, active.length]);

  const waitingKey = jobs.filter((j) => j.status === 'waiting').map((j) => j.id).join(',');
  useEffect(() => {
    if (waitingKey) void showMainWindow();
  }, [waitingKey]);

  useEffect(() => {
    const startup = getHost()?.startup;
    if (!startup) return;
    startup.set(s.startWithWindows, s.startMinimized).catch((err) => {
      notify({ title: 'Couldn’t change Windows startup', body: String(err?.message || err), tone: 'error' });
    });
  }, [s.startWithWindows, s.startMinimized]);

  useEffect(() => {
    void setHotkeyPaused(paused || exited);
  }, [paused, exited]);

  const classicFirst = useRef(true);
  useEffect(() => {
    const m = getHost()?.classicMenu;
    if (!m) return;
    const first = classicFirst.current;
    classicFirst.current = false;
    if (first && !s.classicMenu) return;
    m.set(s.classicMenu).then(
      () => { if (!first) notify({ title: s.classicMenu ? 'Classic right-click menu on' : 'Windows 11 right-click menu restored', body: 'Restart Windows Explorer (or sign out and in) to apply.', tone: 'success' }); },
      (err) => notify({ title: 'Couldn’t change the right-click menu', body: String(err?.message || err), tone: 'error' }),
    );
  }, [s.classicMenu]);

  useEffect(() => {
    const menu = getHost()?.explorerMenu;
    if (!menu) return;
    menu.set(s.explorerMenu).catch((err) => {
      notify({ title: 'Couldn’t change the right-click menu', body: String(err?.message || err), tone: 'error' });
    });
  }, [s.explorerMenu]);

  const clampPos = useCallback(
    (x: number, y: number) => {
      const half = (ORBIT_SIZE / 2) * scale;
      const cx = vp.w < half * 2 + 16 ? vp.w / 2 : Math.max(half + 8, Math.min(vp.w - half - 8, x));
      const cy = vp.h < half * 2 + 60 ? vp.h / 2 : Math.max(half + 36, Math.min(vp.h - half - 52, y));
      return { x: cx, y: cy };
    },
    [scale, vp],
  );

  const openOrbit = useCallback(
    (files: File[], x: number, y: number, clipboard = false) => {
      if (exited) return;
      if (paused) {
        notify({ title: 'Flicky is paused', body: 'Resume Flicky from the tray menu to use Orbit.' });
        return;
      }
      if (!files.length) return;
      const p = clampPos(x, y);
      setOrbit({ files, ...p, clipboard, key: ++orbitKey });
      setPanel('none');
      setMenu(null);
    },
    [clampPos, exited, paused],
  );

  const closeOrbit = useCallback(() => {
    setOrbit((o) => {
      if (o) setLastPos({ x: o.x, y: o.y });
      return null;
    });
    setPanel((p) => (p === 'more' ? 'none' : p));
  }, []);

  const centerPoint = () => ({ x: vp.w / 2, y: vp.h / 2 - 20 });

  const acquire = useCallback(
    async (kind: 'launcher' | 'shortcut', at?: { x: number; y: number }) => {
      if (paused || exited) return;
      const pos = at ?? mouse.current;
      if (kind === 'launcher') {
        const c = await clipboardFiles();
        if (c.length) return openOrbit(c, pos.x, pos.y, true);
      }
      if (!hasUserActivation()) {
        notify({ title: 'Choose files to continue', actions: [{ label: 'Choose files', run: async () => openOrbit(await pickFiles(), pos.x, pos.y) }] });
        return;
      }
      const f = await pickFiles();
      if (f.length) openOrbit(f, pos.x, pos.y);
    },
    [exited, openOrbit, paused],
  );

  const stateRef = useRef({ orbit, menu, archive, activity, settingsSection, tour });
  stateRef.current = { orbit, menu, archive, activity, settingsSection, tour };

  useEffect(() => {
    const mm = (e: MouseEvent) => (mouse.current = { x: e.clientX, y: e.clientY });
    const kd = (e: KeyboardEvent) => {
      if (shortcutState.recording) return;
      const st = stateRef.current;
      if (e.key === 'Escape') {
        if (st.menu) setMenu(null);
        else if (st.settingsSection) setSettingsSection(null);
        else if (st.activity) setActivity(false);
        else if (st.archive) setArchive(null);
        else if (st.tour !== null) setTour(null);
        else if (st.orbit) closeOrbit();
        return;
      }
      if (paused || exited) return;
      if (matchesShortcut(e, s.shortcut)) {
        e.preventDefault();
        if (st.orbit) closeOrbit();
        else if (!st.settingsSection && !st.archive && st.tour === null) acquire('shortcut');
      }
    };
    const paste = (e: ClipboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      const files = Array.from(e.clipboardData?.files || []);
      if (files.length) {
        e.preventDefault();
        openOrbit(files, mouse.current.x, mouse.current.y, true);
      }
    };
    const dover = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes('Files')) {
        e.preventDefault();
        setDragOver(true);
      }
    };
    const dleave = (e: DragEvent) => {
      if (!e.relatedTarget) setDragOver(false);
    };
    const drop = (e: DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const files = Array.from(e.dataTransfer?.files || []);
      if (files.length) openOrbit(files, e.clientX, e.clientY);
    };
    window.addEventListener('mousemove', mm);
    window.addEventListener('keydown', kd);
    window.addEventListener('paste', paste);
    window.addEventListener('dragover', dover);
    window.addEventListener('dragleave', dleave);
    window.addEventListener('drop', drop);
    const nativeFiles = (e: Event) => {
      const files = (e as CustomEvent<File[]>).detail || [];
      if (files.length) openOrbit(files, mouse.current.x, mouse.current.y);
    };

    const nativeShortcut = () => {
      if (paused || exited) return;
      void acquire('shortcut');
    };
    window.addEventListener('flicky-native-files', nativeFiles);
    window.addEventListener('flicky-native-shortcut', nativeShortcut);
    return () => {
      window.removeEventListener('flicky-native-files', nativeFiles);
      window.removeEventListener('flicky-native-shortcut', nativeShortcut);
      window.removeEventListener('mousemove', mm);
      window.removeEventListener('keydown', kd);
      window.removeEventListener('paste', paste);
      window.removeEventListener('dragover', dover);
      window.removeEventListener('dragleave', dleave);
      window.removeEventListener('drop', drop);
    };
  }, [acquire, closeOrbit, exited, openOrbit, paused, s.shortcut]);

  const labelFor = (f: File) => extOf(f.name).toUpperCase();
  const groupName = (files: File[]) => (files.length > 1 ? `${files[0].name} +${files.length - 1}` : files[0].name);

  const startConvert = (files: File[], fmt: Format) => {
    if (tour !== null) return;
    const eng = engineForFormat(fmt.id);
    if (eng && !eng.available()) {
      const install = getHost()?.engines?.install;
      notify({
        title: `${eng.name} needed`,
        body: `Converting to ${fmt.label} needs the ${eng.name}.${install ? '' : ' Install it from Settings → Conversion engines.'}`,
        tone: 'info',
        actions: install
          ? [
              {
                label: 'Install',
                run: async () => {
                  notify({ title: `Installing ${eng.name}…`, body: 'Windows may ask for permission. This can take a minute.' });
                  try {
                    await install(eng.id);
                    notify({ title: `${eng.name} installed`, body: 'Choose the conversion again.', tone: 'success' });
                  } catch (err: any) {
                    notify({ title: `Could not install ${eng.name}`, body: String(err?.message || err), tone: 'error' });
                  }
                },
              },
              { label: 'Not now' },
            ]
          : [{ label: 'OK' }],
      });
      return;
    }
    const entries: Entry[] = [];
    const skipped: Skip[] = [];
    for (const f of files) {
      const cat = categoryOf(f);
      if (!cat) skipped.push({ name: f.name, reason: 'Unsupported file type' });
      else if (normExt(extOf(f.name)) === normExt(fmt.ext)) skipped.push({ name: f.name, reason: `Already ${fmt.label}` });
      else if (!canConvert(f, fmt)) skipped.push({ name: f.name, reason: `${extOf(f.name).toUpperCase()} files can’t be converted to ${fmt.label}` });
      else entries.push({ kind: 'convert', files: [f], target: fmt.id, label: `${labelFor(f)} → ${fmt.label}`, name: f.name });
    }
    closeOrbit();
    queue.addBatch(entries, skipped);
  };

  const startCombine = (files: File[]) => {
    if (tour !== null) return;
    const imgs = files.filter((f) => categoryOf(f) === 'image');
    const skipped = files.filter((f) => categoryOf(f) !== 'image').map((f) => ({ name: f.name, reason: 'Not an image' }));
    closeOrbit();
    queue.addBatch([{ kind: 'combine', files: imgs, target: 'pdf', label: `${imgs.length} images → PDF`, name: groupName(imgs) }], skipped);
  };

  const startCompress = (files: File[], o: CompressOptions) => {
    const batch = queue.addBatch([{ kind: 'compress', files, target: `${o.format}|${o.level}`, label: `Compress → ${o.format.toUpperCase()}`, name: groupName(files) }], [], false);
    queue.jobs.filter((j) => j.batchId === batch).forEach((j) => setJobSecret(j.id, o.password));
    setArchive(null);
  };

  const doCompress = async (files: File[]) => {
    if (tour !== null) return;
    const info = await detectWinRar();
    closeOrbit();
    if (info.found) startCompress(files, { format: s.archiveFormat === 'rar' ? 'rar' : 'zip', level: s.archiveLevel });
    else {
      void showMainWindow();
      setArchive({ mode: 'compress', files });
    }
  };
  const onCompress = async () => {
    if (orbit) await doCompress(orbit.files);
  };

  const doExtract = async (files: File[]) => {
    if (tour !== null) return;
    const archives = files.filter((f) => categoryOf(f) === 'archive');
    const skipped = files.filter((f) => categoryOf(f) !== 'archive').map((f) => ({ name: f.name, reason: 'Not an archive' }));
    const info = await detectWinRar();
    closeOrbit();
    if (!info.found) {
      void showMainWindow();
      return setArchive({ mode: 'extract', files: archives });
    }
    queue.addBatch(archives.map((f) => ({ kind: 'extract' as const, files: [f], target: 'extract', label: 'Extract', name: f.name })), skipped, false);
  };
  const onExtract = async () => {
    if (orbit) await doExtract(orbit.files);
  };

  const archivesOf = (files: File[]) => files.filter((f) => categoryOf(f) === 'archive');

  const needWinRar = async (files: File[]) => {
    const info = await detectWinRar();
    if (info.found) return true;
    closeOrbit();
    void showMainWindow();
    setArchive({ mode: 'extract', files: archivesOf(files) });
    return false;
  };

  const withPassword = async (name: string, run: (pw?: string) => Promise<{ ok: boolean; error?: string; message?: string; entries?: string[]; truncated?: boolean }>) => {
    let pw: string | undefined;
    let retry = false;
    for (let i = 0; i < 6; i++) {
      const r = await run(pw);
      if (r.ok || r.error !== 'password') return r;
      const x = await askPassword(name, retry);
      if (x === null) return null;
      pw = x;
      retry = true;
    }
    return { ok: false, message: 'Too many incorrect passwords' };
  };

  const viewArchive = async (f: File) => {
    const path = (f as any).path as string | undefined;
    const w = getHost()?.winrar;
    if (!path || !w?.list) {
      notify({ title: 'Can’t view this archive', body: 'The Windows app is needed to read archive contents.', tone: 'error' });
      return;
    }
    if (!(await needWinRar([f]))) return;
    closeOrbit();
    setViewer({ name: f.name, path, status: 'loading' });
    try {
      const r = await withPassword(f.name, (pw) => w.list!(path, pw));
      if (!r) return setViewer(null);
      if (r.ok) setViewer({ name: f.name, path, status: 'ready', entries: r.entries, truncated: r.truncated });
      else setViewer({ name: f.name, path, status: 'error', message: r.message });
    } catch (e: any) {
      setViewer({ name: f.name, path, status: 'error', message: String(e?.message || e) });
    }
  };

  const testArchives = async (files: File[]) => {
    const w = getHost()?.winrar;
    const list = archivesOf(files);
    if (!w?.test) return notify({ title: 'Can’t test archives here', tone: 'error' });
    if (!(await needWinRar(files))) return;
    closeOrbit();
    for (const f of list) {
      const path = (f as any).path as string | undefined;
      if (!path) continue;
      notify({ title: `Testing ${f.name}…` });
      try {
        const r = await withPassword(f.name, (pw) => w.test!(path, pw));
        if (!r) continue;
        notify(r.ok ? { title: `${f.name} is OK`, body: 'No errors found.', tone: 'success' } : { title: `${f.name} has problems`, body: r.message, tone: 'error' });
      } catch (e: any) {
        notify({ title: `Could not test ${f.name}`, body: String(e?.message || e), tone: 'error' });
      }
    }
  };

  const extractTo = async (files: File[]) => {
    if (!(await needWinRar(files))) return;
    const dir = await pickFolder();
    if (!dir) return;
    const archives = archivesOf(files);
    closeOrbit();
    queue.addBatch(archives.map((f) => ({ kind: 'extract' as const, files: [f], target: `extract|${dir}`, label: 'Extract', name: f.name })), [], false);
  };

  const openInWinRar = async (f: File) => {
    const path = (f as any).path as string | undefined;
    try {
      if (!path) throw new Error('File path is unavailable');
      await getHost()!.winrar!.open!(path);
      closeOrbit();
    } catch (e: any) {
      notify({ title: 'Could not open WinRAR', body: String(e?.message || e), tone: 'error' });
    }
  };

  const onCopy = async () => {
    if (!orbit || tour !== null) return;
    const files = orbit.files;
    const hasPath = files.some((f) => (f as any).path);
    const text = files.map((f) => (f as any).path || f.name).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      notify({
        title: hasPath ? (files.length > 1 ? 'Paths copied' : 'Path copied') : files.length > 1 ? 'Names copied' : 'Name copied',
        body: hasPath ? text : `${text}\nA browser can’t see full paths; the Windows host copies the full path.`,
        tone: 'success',
      });
    } catch {
      notify({ title: 'Couldn’t copy', body: 'Clipboard access was denied.', tone: 'error' });
    }
    closeOrbit();
  };

  const handleRun = async (req: RunRequest) => {
    if (req.action === 'settings') {
      await showMainWindow();
      setSettingsSection('conversion');
      return;
    }
    if (!req.paths.length) return;

    let files: File[];
    if (req.action === 'convert') {
      const fmt = getFormat(req.format);
      const eng = fmt && engineForFormat(fmt.id);
      files = eng && !eng.convert ? req.paths.map(lightFile) : await filesFromNativePaths(req.paths);
    } else if (req.action === 'combine') {
      files = await filesFromNativePaths(req.paths);
    } else {
      files = req.paths.map(lightFile);
    }
    if (!files.length) return;
    switch (req.action) {
      case 'convert': {
        const fmt = getFormat(req.format);
        if (!fmt) return;
        const eng = engineForFormat(fmt.id);
        if (eng && !eng.available()) void showMainWindow();
        startConvert(files, fmt);
        break;
      }
      case 'combine':
        startCombine(files);
        break;
      case 'compress':
        await doCompress(files);
        break;
      case 'compress-options':
        await showMainWindow();
        setArchive({ mode: 'compress', files });
        break;
      case 'extract':
        await doExtract(files);
        break;
      case 'extract-to':
        await showMainWindow();
        await extractTo(files);
        break;
      case 'test':
        await showMainWindow();
        await testArchives(files);
        break;
      case 'view':
        await showMainWindow();
        await viewArchive(files[0]);
        break;
      case 'winrar':
        await openInWinRar(files[0]);
        break;
    }
  };
  const runRef = useRef<(r: RunRequest) => void>(() => {});
  runRef.current = (r) => {
    void handleRun(r);
  };
  useEffect(() => {
    if (!isTauri()) return;
    let dead = false;
    let off: (() => void) | undefined;
    getCurrentWebviewWindow()
      .listen<RunRequest>(RUN_EVENT, (e) => runRef.current(e.payload))
      .then((u) => {
        if (dead) u();
        else off = u;
      });
    return () => {
      dead = true;
      off?.();
    };
  }, []);

  const togglePause = () => {
    const p = !paused;
    setPaused(p);
    queue.setPaused(p);
    if (p) {
      closeOrbit();
      notify({ title: 'Flicky paused', body: 'Shortcut, launcher and Orbit are off. Running operations will finish.' });
    } else notify({ title: 'Flicky resumed', tone: 'success' });
  };

  const doExit = () => {
    closeOrbit();
    setSettingsSection(null);
    setActivity(false);
    setPanel('none');
    setExited(true);
  };

  const requestExit = async () => {
    const n = queue.activeCount();
    if (n === 0) return doExit();
    const c = await askChoice({
      title: 'Operations are still running',
      body: `${n} operation${n > 1 ? 's are' : ' is'} in progress.`,
      choices: [
        { id: 'finish', label: 'Finish operations' },
        { id: 'cancel', label: 'Cancel safely' },
        { id: 'stay', label: 'Stay in Flicky' },
      ],
      fallback: 'stay',
    });
    if (c === 'finish') {
      queue.setPaused(false);
      notify({ title: 'Flicky will exit when operations finish' });
      await queue.whenIdle();
      doExit();
    } else if (c === 'cancel') {
      queue.cancelAll();
      await queue.whenIdle();
      doExit();
    }
  };

  useEffect(() => {
    if (tour === null) return;
    let cancelled = false;
    (async () => {
      if (!sampleRef.current) sampleRef.current = await makeSampleFile();
      if (cancelled) return;
      const f = sampleRef.current;
      const c = { x: window.innerWidth / 2, y: window.innerHeight / 2 - 10 };
      const showOrbit = () => setOrbit((o) => o ?? { files: [f], ...clampPos(c.x, c.y), key: ++orbitKey });
      setMenu(null);
      if (tour <= 4) {
        showOrbit();
        setPanel(tour === 2 ? 'more' : 'none');
      } else if (tour === 5) {
        setOrbit(null);
        setPanel('none');
      } else if (tour === 6) {
        showOrbit();
        setPanel('queue');
      } else {
        setOrbit(null);
        setPanel('none');
        setMenu({ x: window.innerWidth - 40, y: 0, anchor: 'tray' });
      }
    })();
    return () => {
      cancelled = true;
    };

  }, [tour]);

  const endTour = () => {
    setTour(null);
    setOrbit(null);
    setPanel('none');
    setMenu(null);
  };

  const launcherPos = { x: vp.w - 46, y: vp.h - 44 - 54 };
  const launcherShown = s.launcherEnabled && !paused;
  const forceLauncher = tourHi === 'launcher';
  const logoVisible = !exited && (launcherShown || forceLauncher || processing || !!success) && !(orbit && !launcherShown && !forceLauncher);
  const logoPos = launcherShown || forceLauncher ? launcherPos : lastPos;

  const formats = useMemo(() => (orbit ? orbitFormats(orbit.files) : []), [orbit?.key]);
  const catalogue = useMemo(() => (orbit ? catalogueFor(orbit.files) : []), [orbit?.key, jobs.length, engTick]);

  const archiveActions: TrackItem[] | undefined = useMemo(() => {
    if (!orbit || selectionCategory(orbit.files) !== 'archive') return undefined;
    const files = orbit.files;
    const first = archivesOf(files)[0];
    const allZip = archivesOf(files).every((f) => extOf(f.name) === 'zip');
    const items: TrackItem[] = [
      { id: 'unzip', label: allZip ? 'Unzip' : 'Extract', icon: 'extract', title: 'Extract here', run: () => void onExtract() },
      { id: 'extract-to', label: 'Extract to…', icon: 'open', title: 'Choose where to extract', run: () => void extractTo(files) },
      { id: 'test', label: 'Test', icon: 'refresh', title: 'Check the archive for errors', run: () => void testArchives(files) },
    ];
    if (files.length === 1 && first) {
      items.splice(1, 0, { id: 'view', label: 'View', icon: 'document', title: 'See what’s inside', run: () => void viewArchive(first) });
      items.push({ id: 'winrar', label: 'WinRAR', icon: 'archive', title: 'Open in WinRAR', run: () => void openInWinRar(first) });
    }
    return items;
  }, [orbit?.key]);
  const imageCount = orbit ? orbit.files.filter((f) => categoryOf(f) === 'image').length : 0;
  const hasArchive = orbit ? orbit.files.some((f) => categoryOf(f) === 'archive') : false;

  const menuHandlers = {
    paused,
    onOpen: () => acquire('launcher', menu?.anchor === 'point' ? { x: menu.x, y: menu.y } : centerPoint()),
    onSettings: () => setSettingsSection('general'),
    onActivity: () => setActivity(true),
    onTogglePause: togglePause,
    onExit: requestExit,
  };

  const onLogoClick = () => {
    if (tour !== null) return;
    if (processing) {
      setPanel((p) => (p === 'queue' ? 'none' : 'queue'));
      return;
    }
    acquire('launcher', { x: logoPos.x, y: logoPos.y - 190 * scale });
  };

  const showQueuePanel = panel === 'queue' && (orbit || processing || jobs.length > 0 || tour !== null);
  const panelAnchor = orbit ? { x: orbit.x, y: orbit.y, half: undefined } : { x: logoPos.x, y: logoPos.y, half: 34 };

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#050505]" onContextMenu={(e) => e.preventDefault()}>

      <div
        className="absolute inset-0"
        style={{ background: 'radial-gradient(ellipse at 50% 45%, #161616 0%, #0a0a0a 55%, #040404 100%)' }}
      />
      <div className="absolute inset-0 flex flex-col items-center justify-center px-6 pb-14 text-center">
        <Star size={46} className="opacity-90" />
        <h1 className="mt-5 text-[22px] font-light tracking-[0.42em] text-white/90">FLICKY</h1>
        <p className="mt-1.5 text-[13px] tracking-wide text-white/45">Your files. One orbit.</p>
        <div className="mt-8 flex gap-2.5">
          <Btn
            onClick={async () => {
              const f = await pickFiles();
              if (f.length) openOrbit(f, centerPoint().x, centerPoint().y);
            }}
          >
            Choose files
          </Btn>
          <Btn
            onClick={async () => {
              if (!sampleRef.current) sampleRef.current = await makeSampleFile();
              openOrbit([sampleRef.current], centerPoint().x, centerPoint().y);
            }}
          >
            Try a sample image
          </Btn>
        </div>
        <div className="mt-7 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[12px] text-white/40">
          <span className="flex items-center gap-2">
            Open Orbit <Keycaps combo={s.shortcut} />
          </span>
          <span>Drop files anywhere</span>
          <span className="flex items-center gap-2">
            Clipboard <Keycaps combo="Ctrl+V" />
          </span>
        </div>
        {paused && <p className="mt-6 rounded-full border border-white/20 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-white/60">Paused</p>}
      </div>

      {dragOver && !exited && <div className="pointer-events-none absolute inset-3 z-[15] rounded-3xl border border-dashed border-white/40 anim-fade-in" />}

      {orbit && tour === null && <div className="fixed inset-0 z-20" onPointerDown={closeOrbit} />}

      {orbit && (
        <Orbit
          key={orbit.key}
          files={orbit.files}
          x={orbit.x}
          y={orbit.y}
          scale={scale}
          formats={formats}
          actions={archiveActions}
          clipboard={orbit.clipboard}
          shortcut={s.shortcut}
          activeJobs={active.length}
          moreOpen={panel === 'more'}
          tourHi={tourHi}
          onMove={(x, y) => setOrbit((o) => (o ? { ...o, ...clampPos(x, y) } : o))}
          onFormat={(f) => startConvert(orbit.files, f)}
          onCompress={onCompress}
          onCopy={onCopy}
          onMore={() => tour === null && setPanel((p) => (p === 'more' ? 'none' : 'more'))}
          onCenter={() => jobs.length > 0 && setPanel((p) => (p === 'queue' ? 'none' : 'queue'))}
        />
      )}

      {orbit && panel === 'more' && (
        <SidePanel x={orbit.x} y={orbit.y} scale={scale} title="More" onClose={() => setPanel('none')} tour={tourHi === 'more'}>
          <MoreContent
            catalogue={catalogue}
            imageCount={imageCount}
            hasArchive={hasArchive}
            onFormat={(f) => startConvert(orbit.files, f)}
            onCombine={() => startCombine(orbit.files)}
            onExtract={onExtract}
            onCompressOptions={() => {
              const files = orbit.files;
              closeOrbit();
              setArchive({ mode: 'compress', files });
            }}
            onSettings={() => setSettingsSection('conversion')}
          />
        </SidePanel>
      )}

      {showQueuePanel && (
        <SidePanel x={panelAnchor.x} y={panelAnchor.y} halfSize={panelAnchor.half} scale={scale} title={`Queue${active.length ? ` · ${active.length}` : ''}`} onClose={() => setPanel('none')}>
          <QueueContent
            jobs={jobs}
            onCancel={(id) => queue.cancel(id)}
            onCancelAll={() => queue.cancelAll()}
            onRetry={(id) => queue.retry(id)}
            onDismiss={(id) => queue.dismiss(id)}
          />
        </SidePanel>
      )}

      {logoVisible && (
        <FloatingLogo
          x={logoPos.x}
          y={logoPos.y}
          scale={scale}
          processing={processing}
          progress={processing ? overall : undefined}
          dropActive={dragOver}
          paused={paused}
          success={success}
          tour={forceLauncher}
          onClick={onLogoClick}
          onCancel={() => queue.cancelAll()}
          onContext={(x, y) => setMenu({ x, y, anchor: 'point' })}
        />
      )}

      <Taskbar
        paused={paused}
        busy={processing}
        tour={tourHi === 'tray'}
        onTray={() => setMenu((m) => (m ? null : { x: vp.w - 40, y: 0, anchor: 'tray' }))}
      />

      {menu && <FlickyMenu x={menu.x} y={menu.y} anchor={menu.anchor} h={menuHandlers} tourSettings={tourHi === 'tray'} onClose={() => tour === null && setMenu(null)} />}

      {archive && (
        <ArchiveCard
          mode={archive.mode}
          count={archive.files.length}
          onClose={() => setArchive(null)}
          onStart={(o) => startCompress(archive.files, o)}
        />
      )}
      {viewer && (
        <ArchiveViewer
          state={viewer}
          onClose={() => setViewer(null)}
          onExtract={() => {
            const path = viewer.path;
            const name = viewer.name;
            setViewer(null);
            queue.addBatch([{ kind: 'extract' as const, files: [Object.assign(new File([], name), { path }) as File], target: 'extract', label: 'Extract', name }], [], false);
          }}
          onOpenWinRar={() => void getHost()?.winrar?.open?.(viewer.path)}
        />
      )}
      <PasswordCard />
      {activity && <ActivityCard onClose={() => setActivity(false)} />}
      {settingsSection && <SettingsWindow section={settingsSection} onSection={setSettingsSection} onClose={() => setSettingsSection(null)} />}

      {!s.setupDone && (
        <QuickSetup
          onDone={(t) => {
            if (t) setTour(0);
          }}
        />
      )}
      {tour !== null && (
        <TourCard
          step={tour}
          steps={steps}
          onBack={() => setTour(Math.max(0, tour - 1))}
          onNext={() => (tour >= steps.length - 1 ? endTour() : setTour(tour + 1))}
          onSkip={endTour}
        />
      )}

      <Notifications />

      {exited && (
        <div className="anim-fade-in fixed inset-0 z-[60] flex flex-col items-center justify-center bg-black">
          <Star size={40} glow={false} className="opacity-30" />
          <p className="mt-4 text-[13px] text-white/50">Flicky has exited.</p>
          <div className="mt-5">
            <Btn
              onClick={() => {
                setExited(false);
                setPaused(false);
                queue.setPaused(false);
                updateSettings({});
              }}
            >
              Launch Flicky
            </Btn>
          </div>
        </div>
      )}
    </div>
  );
}
