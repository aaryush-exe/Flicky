import { useEffect, useState, type ReactNode } from 'react';
import { cn } from '../utils/cn';
import { Icon } from './Icons';
import { Star } from './Logo';
import { Btn, Row, Select, Slider, Toggle } from './controls';
import { ShortcutRecorder } from './ShortcutRecorder';
import { clearErrors, resetSettings, updateSettings, useSettings } from '../lib/settings';
import { ENGINES } from '../lib/formats';
import { WINRAR_URL, detectWinRar } from '../lib/archive';
import { getHost, hasHost, type WinRarInfo } from '../lib/host';
import { autoConcurrency } from '../lib/queue';
import { chooseFolder, clearFolder, folderName, folderSupported } from '../lib/sink';
import { DEVELOPER, GITHUB_URL, THIRD_PARTY, UPDATE_FEED_URL, VERSION, WEBSITE_URL } from '../config';
import { notify } from '../lib/notify';

export const SECTIONS = [
  { id: 'general', label: 'General', icon: 'settings' },
  { id: 'startup', label: 'Startup', icon: 'power' },
  { id: 'launcher', label: 'Floating launcher', icon: 'open' },
  { id: 'shortcuts', label: 'Keyboard shortcuts', icon: 'chevron' },
  { id: 'conversion', label: 'Conversion preferences', icon: 'image' },
  { id: 'archive', label: 'Archive preferences', icon: 'archive' },
  { id: 'engines', label: 'Conversion engines', icon: 'layers' },
  { id: 'queue', label: 'Queue and processing', icon: 'activity' },
  { id: 'appearance', label: 'Appearance', icon: 'image' },
  { id: 'access', label: 'Accessibility and scaling', icon: 'info' },
  { id: 'updates', label: 'Updates', icon: 'refresh' },
  { id: 'about', label: 'About', icon: 'info' },
] as const;
export type SectionId = (typeof SECTIONS)[number]['id'];

const H = ({ children }: { children: ReactNode }) => <h3 className="mb-1 mt-6 text-[11px] font-medium uppercase tracking-[0.16em] text-white/45 first:mt-0">{children}</h3>;
const Note = ({ children }: { children: ReactNode }) => <p className="mt-3 text-[12px] leading-relaxed text-white/40">{children}</p>;

function General() {
  const [folder, setFolder] = useState(folderName());
  return (
    <>
      <H>Output</H>
      <Row
        title="Converted files"
        hint={
          hasHost()
            ? 'Saved next to the source file with the same name and a new extension.'
            : folder
              ? `Written to “${folder}”. Existing files are detected and never overwritten silently.`
              : 'In a browser, files cannot be saved beside the source. Choose a folder for real conflict checks, or files go to your downloads.'
        }
      >
        {!hasHost() && (
          <div className="flex gap-2">
            {folderSupported ? (
              <Btn small onClick={async () => setFolder(await chooseFolder())}>
                {folder ? 'Change folder' : 'Choose folder'}
              </Btn>
            ) : (
              <span className="text-[12px] text-white/40">Downloads only</span>
            )}
            {folder && (
              <Btn small onClick={() => { clearFolder(); setFolder(null); }}>
                Clear
              </Btn>
            )}
          </div>
        )}
      </Row>
      <Row title="Original files" hint="Never deleted or modified. Only replaced when you explicitly pick Replace." />
      <Row title="Name conflicts" hint="Always asks: Replace, Rename or Skip." />
      <H>Data</H>
      <Row title="Error log" hint="Flicky stores errors only. No telemetry, no analytics, no permanent history of successful operations.">
        <Btn small onClick={() => { clearErrors(); notify({ title: 'Error log cleared' }); }}>
          Clear log
        </Btn>
      </Row>
      <Row title="Reset all settings" hint="Restores every preference to its default.">
        <Btn small onClick={() => { resetSettings(); notify({ title: 'Settings reset', tone: 'success' }); }}>
          Reset
        </Btn>
      </Row>
      <Note>Settings are stored locally in your user profile.</Note>
    </>
  );
}

function Startup() {
  const s = useSettings();
  return (
    <>
      <Row badge title="Start with Windows" hint="Flicky starts silently in the system tray and never opens a window at startup.">
        <Toggle on={s.startWithWindows} onChange={(v) => updateSettings({ startWithWindows: v })} label="Start with Windows" />
      </Row>
      <Row badge title="Start minimized to tray">
        <Toggle on={s.startMinimized} onChange={(v) => updateSettings({ startMinimized: v })} label="Start minimized" />
      </Row>
      <Row badge title="Explorer context menu" hint="Adds Flicky Orbit to right-click → Open with, and “Open with Flicky Orbit” under Show more options. Per-user, no administrator rights.">
        <Toggle on={s.explorerMenu} onChange={(v) => updateSettings({ explorerMenu: v })} label="Explorer context menu" />
      </Row>
      <Row badge title="Show full right-click menu" hint="Windows 11: skips “Show more options” so Open with Flicky Orbit appears directly. Changes Explorer's menu for your account only; restart Explorer or sign out to apply.">
        <Toggle on={s.classicMenu} onChange={(v) => updateSettings({ classicMenu: v })} label="Show full right-click menu" />
      </Row>
      <Note>Start with Windows and Start minimized are applied immediately (a per-user startup entry, no administrator rights; it is skipped in development builds). The Explorer context menu entry is added or removed immediately too.</Note>
    </>
  );
}

function Launcher() {
  const s = useSettings();
  return (
    <>
      <Row title="Show floating launcher" hint="A 52 × 52 translucent glass logo on the desktop. Off by default.">
        <Toggle on={s.launcherEnabled} onChange={(v) => updateSettings({ launcherEnabled: v })} label="Floating launcher" />
      </Row>
      <Row title="Click" hint="Opens Orbit for the selected files, or for the clipboard when nothing is selected." />
      <Row title="Drag and drop" hint="Drop files on the launcher to open Orbit for them." />
      <Row title="Right-click" hint="Open Flicky, Settings, Recent Activity, Pause / Resume, Exit." />
      <Row badge title="Hide during fullscreen apps and games" hint="Hides automatically and returns on the normal desktop. Detecting other apps’ fullscreen state is done by the Windows host." />
    </>
  );
}

function Shortcuts() {
  return (
    <>
      <Row title="Open Orbit" hint="Default Ctrl + Shift + Space. The shortcut is disabled while Flicky is paused.">
        <ShortcutRecorder />
      </Row>
      <Note>
        Conflicts with Windows and common application shortcuts are rejected with an explanation. {hasHost() ? 'The host registers it globally and reports conflicts with other apps.' : 'In this web preview the shortcut works while this page is focused; the Windows host registers it globally.'}
      </Note>
    </>
  );
}

function Conversion() {
  const s = useSettings();
  const set = updateSettings;
  return (
    <>
      <Note>Conversions start immediately with smart defaults. These are optional controls.</Note>
      <H>Image</H>
      <Row title="Quality" hint="JPG, JPEG, WEBP and PDF pages."><Slider value={s.imageQuality} min={30} max={100} onChange={(v) => set({ imageQuality: v })} format={(v) => `${v}%`} /></Row>
      <Row title="Maximum resolution" hint="Longest side. Smaller images are never enlarged.">
        <Select value={s.imageMaxDim} onChange={(v) => set({ imageMaxDim: v })} options={[{ value: 0, label: 'Original' }, { value: 4096, label: '4096 px' }, { value: 2560, label: '2560 px' }, { value: 1920, label: '1920 px' }, { value: 1280, label: '1280 px' }, { value: 800, label: '800 px' }]} />
      </Row>
      <H>Audio</H>
      <Row title="Sample rate"><Select value={s.audioSampleRate} onChange={(v) => set({ audioSampleRate: v })} options={[{ value: 0, label: 'Same as source' }, { value: 48000, label: '48 kHz' }, { value: 44100, label: '44.1 kHz' }, { value: 22050, label: '22.05 kHz' }]} /></Row>
      <Row title="Channels"><Select value={s.audioChannels} onChange={(v) => set({ audioChannels: v })} options={[{ value: 0, label: 'Same as source' }, { value: 1, label: 'Mono' }, { value: 2, label: 'Stereo' }]} /></Row>
      <Row title="Bitrate" hint="Used by compressed formats (MP3, AAC, OGG) once the FFmpeg engine is installed. WAV is lossless."><Select value={s.audioBitrate} onChange={(v) => set({ audioBitrate: v })} options={[{ value: 128, label: '128 kbps' }, { value: 192, label: '192 kbps' }, { value: 256, label: '256 kbps' }, { value: 320, label: '320 kbps' }]} /></Row>
      <H>Video (FFmpeg engine)</H>
      <Row title="Resolution"><Select value={s.videoResolution} onChange={(v) => set({ videoResolution: v })} options={[{ value: 'source', label: 'Same as source' }, { value: '1080p', label: '1080p' }, { value: '720p', label: '720p' }, { value: '480p', label: '480p' }]} /></Row>
      <Row title="Codec"><Select value={s.videoCodec} onChange={(v) => set({ videoCodec: v })} options={[{ value: 'h264', label: 'H.264' }, { value: 'h265', label: 'H.265' }, { value: 'vp9', label: 'VP9' }, { value: 'av1', label: 'AV1' }]} /></Row>
      <Row title="Bitrate"><Select value={s.videoBitrate} onChange={(v) => set({ videoBitrate: v })} options={[{ value: 0, label: 'Automatic' }, { value: 2000, label: '2 Mbps' }, { value: 5000, label: '5 Mbps' }, { value: 10000, label: '10 Mbps' }]} /></Row>
      <Row title="Quality"><Select value={s.videoQuality} onChange={(v) => set({ videoQuality: v })} options={[{ value: 'small', label: 'Smaller file' }, { value: 'balanced', label: 'Balanced' }, { value: 'high', label: 'High quality' }]} /></Row>
      <H>Documents and PDF</H>
      <Row title="Page size" hint="“Fit to image” makes each PDF page match its picture."><Select value={s.docPageSize} onChange={(v) => set({ docPageSize: v })} options={[{ value: 'fit', label: 'Fit to image' }, { value: 'a4', label: 'A4' }, { value: 'letter', label: 'Letter' }]} /></Row>
      <Row title="Orientation"><Select value={s.docOrientation} onChange={(v) => set({ docOrientation: v })} options={[{ value: 'auto', label: 'Automatic' }, { value: 'portrait', label: 'Portrait' }, { value: 'landscape', label: 'Landscape' }]} /></Row>
      <Row title="Margins"><Slider value={s.docMarginMm} min={0} max={30} onChange={(v) => set({ docMarginMm: v })} format={(v) => `${v} mm`} /></Row>
    </>
  );
}

function Archive() {
  const s = useSettings();
  const [info, setInfo] = useState<WinRarInfo | null>(null);
  const check = () => { setInfo(null); detectWinRar().then(setInfo); };
  useEffect(check, []);
  return (
    <>
      <Row title="Backend" hint={info === null ? 'Looking for WinRAR…' : info.found ? `WinRAR detected${info.version ? ` (${info.version})` : ''}${info.path ? ` at ${info.path}` : ''}` : 'WinRAR not found. Archive operations are unavailable until it is installed.'}>
        <div className="flex gap-2">
          <Btn small onClick={check}>Check again</Btn>
          {info && !info.found && <a href={WINRAR_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-white/25 px-2.5 py-1 text-[12px] hover:border-white/70 hover:bg-white/10">Get WinRAR <Icon name="external" size={11} /></a>}
        </div>
      </Row>
      <Row title="Default format" hint="ZIP, RAR and 7Z can be extracted. WinRAR creates ZIP and RAR."><Select value={s.archiveFormat === '7z' ? 'zip' : s.archiveFormat} onChange={(v) => updateSettings({ archiveFormat: v })} options={[{ value: 'zip', label: 'ZIP' }, { value: 'rar', label: 'RAR' }]} /></Row>
      <Row title="Compression level"><Select value={s.archiveLevel} onChange={(v) => updateSettings({ archiveLevel: v })} options={[{ value: 'store', label: 'Store' }, { value: 'fast', label: 'Fast' }, { value: 'normal', label: 'Normal' }, { value: 'good', label: 'Good' }, { value: 'best', label: 'Best' }]} /></Row>
      <Row title="Extraction" hint="Creates a folder named after the archive. If it exists you are always asked: Merge, New folder or Cancel." />
      <Row title="Encryption" hint="Never enabled silently. Passwords need confirmation, and are never stored or logged." />
      <Note>Install uses Windows Package Manager (winget) and the publisher’s configured package source. You must review and accept the publisher/source agreements. WinRAR is proprietary; Flicky does not bundle or redistribute it. If winget is missing, install/update Microsoft App Installer and retry.</Note>
    </>
  );
}

function Engines() {
  const s = useSettings();
  const [, refresh] = useState(0);
  useEffect(() => { const fn = () => refresh((v) => v + 1); window.addEventListener('flicky-engines-updated', fn); return () => window.removeEventListener('flicky-engines-updated', fn); }, []);
  const [busy, setBusy] = useState<string | null>(null);
  const install = getHost()?.engines?.install;
  return (
    <>
      <Row title="Update engines automatically" hint="Engine updates run in the background, separate from Flicky app updates.">
        <Toggle on={s.engineAutoUpdate} onChange={(v) => updateSettings({ engineAutoUpdate: v })} label="Engine auto-update" />
      </Row>
      <div className="mt-4 space-y-2.5">
        {ENGINES.map((e) => {
          const ok = e.available();
          return (
            <div key={e.id} className="rounded-xl border border-white/12 p-3.5">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[13px]">{e.name}</div>
                  <div className="text-[11px] text-white/40">{e.origin} · {e.license}</div>
                </div>
                {ok ? (
                  <span className="flex items-center gap-1 rounded-full border border-white/25 px-2.5 py-0.5 text-[11px]"><Icon name="check" size={11} /> Ready</span>
                ) : (
                  <Btn small disabled={!install || busy === e.id} title={install ? 'Download, verify and install' : 'Engine downloads are performed and verified by the Windows host'} onClick={async () => { setBusy(e.id); try { await install!(e.id); } catch (err: any) { notify({ title: `Could not install ${e.name}`, body: String(err?.message || err), tone: 'error' }); } setBusy(null); }}>
                    <Icon name="download" size={12} /> {busy === e.id ? 'Installing…' : 'Install'}
                  </Btn>
                )}
              </div>
              <p className="mt-2 text-[12px] leading-snug text-white/45">{e.description}</p>
              <div className="mt-2 flex flex-wrap gap-1">
                {e.formats.map((f) => <span key={f.id} className="rounded-full border border-white/12 px-2 py-px text-[10px] text-white/50">{f.label}</span>)}
              </div>
            </div>
          );
        })}
      </div>
      <H>Download security</H>
      <ul className="space-y-1.5 text-[12px] text-white/50">
        {['Packages are requested by exact package ID from the configured winget source', 'winget handles publisher package metadata and installer execution', 'Installation starts only after the user clicks Install', 'Installer and publisher agreements are surfaced by winget where available', 'Some packages install system-wide and may request Windows elevation'].map((t) => (
          <li key={t} className="flex gap-2"><Icon name="shield" size={13} className="mt-0.5 shrink-0" />{t}</li>
        ))}
      </ul>
    </>
  );
}

function Queue() {
  const s = useSettings();
  const auto = autoConcurrency();
  const mem = (navigator as any).deviceMemory;
  return (
    <>
      <Row title="Parallel operations" hint={`Automatic adapts to this device (${navigator.hardwareConcurrency || '?'} logical cores${mem ? `, ~${mem} GB RAM` : ''}) and currently allows ${auto}.`}>
        <Select value={s.concurrency} onChange={(v) => updateSettings({ concurrency: v })} options={[{ value: 0, label: `Automatic (${auto})` }, { value: 1, label: '1' }, { value: 2, label: '2' }, { value: 3, label: '3' }, { value: 4, label: '4' }]} />
      </Row>
      <Row title="Order" hint="First in, first out: older operations start first. Because jobs run in parallel, they may not finish in the same order." />
      <Row title="Failures" hint="A failed file shows an error card; the rest of the batch continues. Unsupported files are skipped and listed in the summary." />
      <Row title="Crash recovery" hint="The queue is checkpointed locally. After an unexpected exit, interrupted operations resume. Passwords are never saved." />
    </>
  );
}

function Appearance() {
  const s = useSettings();
  return (
    <>
      <Row title="Theme" hint="Dark monochrome only."><span className="rounded-full border border-white/25 px-2.5 py-0.5 text-[11px]">Dark monochrome</span></Row>
      <Row title="Logo glow" hint="Intensity of the glow around the Flicky star."><Slider value={s.glow} min={0} max={100} onChange={(v) => updateSettings({ glow: v })} format={(v) => `${v}%`} /></Row>
    </>
  );
}

function Access() {
  const s = useSettings();
  return (
    <>
      <Row title="Flicky UI scale" hint="Scales Orbit, cards and settings independently of Windows display scaling."><Slider value={Math.round(s.uiScale * 100)} min={80} max={150} step={5} onChange={(v) => updateSettings({ uiScale: v / 100 })} format={(v) => `${v}%`} /></Row>
      <Row title="Windows display scaling" hint={`Followed automatically (currently ${Math.round(window.devicePixelRatio * 100)}%).`} />
      <Row title="Reduce motion" hint="Turns off animations and transitions."><Toggle on={s.reduceMotion} onChange={(v) => updateSettings({ reduceMotion: v })} label="Reduce motion" /></Row>
      <Row title="Keyboard" hint="Orbit supports the arrow keys to rotate formats and Esc to close." />
    </>
  );
}

function Updates() {
  const [state, setState] = useState<'idle' | 'checking' | 'none' | 'unconfigured' | 'error' | { version: string; notes?: string; url?: string }>('idle');
  const check = async () => {
    if (!UPDATE_FEED_URL) return setState('unconfigured');
    setState('checking');
    try {
      const j = await (await fetch(UPDATE_FEED_URL, { cache: 'no-store' })).json();
      setState(j.version && j.version !== VERSION ? j : 'none');
    } catch {
      setState('error');
    }
  };
  return (
    <>
      <Row title="Current version"><span className="text-[13px] tabular-nums text-white/80">{VERSION}</span></Row>
      <Row title="Flicky updates" hint="You are always notified first. Flicky never restarts silently to update.">
        <Btn small onClick={check} disabled={state === 'checking'}>{state === 'checking' ? 'Checking…' : 'Check for updates'}</Btn>
      </Row>
      {state === 'unconfigured' && <Note>No update channel is configured in this build.</Note>}
      {state === 'none' && <Note>You’re on the latest version.</Note>}
      {state === 'error' && <Note>Couldn’t reach the update server.</Note>}
      {typeof state === 'object' && (
        <div className="mt-4 rounded-xl border border-white/20 p-4">
          <div className="text-[13px]">Version {state.version} is available</div>
          <div className="text-[12px] text-white/45">You have {VERSION}</div>
          {state.notes && <p className="mt-2 text-[12px] text-white/60">{state.notes}</p>}
          <div className="mt-3 flex gap-2">
            {state.url && <a href={state.url} target="_blank" rel="noreferrer" className="rounded-lg border border-white bg-white px-3 py-1 text-[12px] text-black hover:bg-white/85">Update Now</a>}
            <Btn small onClick={() => setState('idle')}>Later</Btn>
          </div>
        </div>
      )}
      <Row title="Conversion engines" hint="Updated automatically in the background, independently of the app." />
    </>
  );
}

function About() {
  const [open, setOpen] = useState(false);
  const link = (label: string, url: string) => (
    <Row title={label}>{url ? <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[12px] text-white/80 underline-offset-2 hover:underline">{url.replace(/^https?:\/\//, '')} <Icon name="external" size={11} /></a> : <span className="text-[12px] text-white/35">Not configured in this build</span>}</Row>
  );
  return (
    <>
      <div className="flex flex-col items-center pb-5 pt-3">
        <Star size={64} />
        <div className="mt-3 text-lg tracking-[0.3em]">FLICKY</div>
        <div className="text-[12px] text-white/45">Your files. One orbit.</div>
        <div className="mt-3 text-[12px] tabular-nums text-white/60">Version {VERSION}</div>
      </div>
      <Row title="Update status" hint="Open Updates to check." />
      <Row title="Developer"><span className="text-[12px] text-white/70">{DEVELOPER}</span></Row>
      {link('Website', WEBSITE_URL)}
      {link('GitHub', GITHUB_URL)}
      <Row title="Third-party licenses"><Btn small onClick={() => setOpen((o) => !o)}>{open ? 'Hide' : 'Show'}</Btn></Row>
      {open && (
        <ul className="mt-2 space-y-2">
          {THIRD_PARTY.map((t) => (
            <li key={t.name} className="rounded-lg border border-white/10 px-3 py-2">
              <div className="flex justify-between text-[12.5px]"><span>{t.name}</span><span className="text-white/45">{t.license}</span></div>
              <div className="text-[11px] text-white/40">{t.note}</div>
            </li>
          ))}
        </ul>
      )}
      <Note>Local-first. No telemetry, no analytics, no cloud processing.</Note>
    </>
  );
}

const VIEWS: Record<SectionId, () => ReactNode> = {
  general: General,
  startup: Startup,
  launcher: Launcher,
  shortcuts: Shortcuts,
  conversion: Conversion,
  archive: Archive,
  engines: Engines,
  queue: Queue,
  appearance: Appearance,
  access: Access,
  updates: Updates,
  about: About,
};

export function SettingsWindow({ section, onSection, onClose }: { section: SectionId; onSection: (s: SectionId) => void; onClose: () => void }) {
  const View = VIEWS[section];
  const cur = SECTIONS.find((s) => s.id === section)!;
  return (
    <div className="anim-fade-in fixed inset-0 z-[44] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm" onPointerDown={(e) => e.stopPropagation()}>
      <div className="glass flex h-[min(620px,92vh)] w-[min(860px,96vw)] overflow-hidden rounded-2xl text-white shadow-2xl" role="dialog" aria-label="Flicky settings">
        <nav className="flex w-[220px] shrink-0 flex-col border-r border-white/10 bg-black/30 p-3">
          <div className="mb-3 flex items-center gap-2 px-2 pt-1">
            <Star size={18} glow={false} />
            <span className="text-[12px] tracking-[0.28em]">SETTINGS</span>
          </div>
          <div className="flex-1 space-y-0.5 overflow-y-auto">
            {SECTIONS.map((s) => (
              <button key={s.id} onClick={() => onSection(s.id)} className={cn('flex w-full items-center rounded-lg px-3 py-2 text-left text-[12.5px] transition-colors', s.id === section ? 'bg-white/12 text-white' : 'text-white/55 hover:bg-white/[0.06] hover:text-white')}>
                {s.label}
              </button>
            ))}
          </div>
        </nav>
        <section className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center justify-between border-b border-white/10 px-6 py-4">
            <h2 className="text-[15px]">{cur.label}</h2>
            <button onClick={onClose} className="rounded-full p-1.5 text-white/55 hover:bg-white/10 hover:text-white" aria-label="Close settings"><Icon name="x" size={16} /></button>
          </header>
          <div className="flex-1 overflow-y-auto px-6 py-4"><View /></div>
        </section>
      </div>
    </div>
  );
}
