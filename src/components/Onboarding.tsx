import { useState } from 'react';
import { Modal } from './Modal';
import { Btn, Row, Select, Toggle } from './controls';
import { ShortcutRecorder } from './ShortcutRecorder';
import { Star } from './Logo';
import { updateSettings, useSettings } from '../lib/settings';

export function QuickSetup({ onDone }: { onDone: (tutorial: boolean) => void }) {
  const s = useSettings();
  const [step, setStep] = useState(0);
  const finish = (t: boolean) => {
    updateSettings({ setupDone: true });
    onDone(t);
  };
  return (
    <Modal title={`Quick setup · ${step + 1} of 4`} width={520}>
      {step === 0 && (
        <div className="flex flex-col items-center px-4 pb-2 pt-6 text-center">
          <Star size={72} />
          <h1 className="mt-5 text-xl tracking-[0.3em]">FLICKY</h1>
          <p className="mt-1 text-[13px] text-white/50">Your files. One orbit.</p>
          <p className="mt-5 max-w-[360px] text-[13px] leading-relaxed text-white/60">
            Flicky lives quietly in your tray and opens a radial menu at your cursor to convert, compress and copy paths — locally, without a window.
          </p>
        </div>
      )}
      {step === 1 && (
        <div className="py-2">
          <p className="mb-2 text-[13px] text-white/60">Choose the shortcut that opens Orbit. You can change it any time in Settings.</p>
          <Row title="Open Orbit">
            <ShortcutRecorder />
          </Row>
        </div>
      )}
      {step === 2 && (
        <div className="py-1">
          <Row title="Show floating launcher" hint="A small glass logo on your desktop. You can turn this on later.">
            <Toggle on={s.launcherEnabled} onChange={(v) => updateSettings({ launcherEnabled: v })} label="Floating launcher" />
          </Row>
          <Row title="Start with Windows" hint="Starts silently in the tray.">
            <Toggle on={s.startWithWindows} onChange={(v) => updateSettings({ startWithWindows: v })} label="Start with Windows" />
          </Row>
          <Row title="Default archive format" hint="Archives use WinRAR.">
            <Select value={s.archiveFormat === '7z' ? 'zip' : s.archiveFormat} onChange={(v) => updateSettings({ archiveFormat: v })} options={[{ value: 'zip', label: 'ZIP' }, { value: 'rar', label: 'RAR' }]} />
          </Row>
        </div>
      )}
      {step === 3 && (
        <div className="px-2 py-4 text-center">
          <h2 className="text-[16px]">You’re set</h2>
          <p className="mx-auto mt-2 max-w-[380px] text-[13px] leading-relaxed text-white/55">A short interactive tutorial shows Orbit, formats, More, Compress, Copy Path, drag-and-drop, the queue and Settings. It’s optional.</p>
        </div>
      )}
      <div className="mt-4 flex items-center justify-between">
        <div>{step > 0 && step < 3 && <Btn onClick={() => setStep(step - 1)}>Back</Btn>}</div>
        <div className="flex gap-2">
          {step < 3 ? (
            <Btn primary onClick={() => setStep(step + 1)}>
              {step === 0 ? 'Get started' : 'Continue'}
            </Btn>
          ) : (
            <>
              <Btn onClick={() => finish(false)}>Skip tutorial</Btn>
              <Btn primary onClick={() => finish(true)}>
                Take the tutorial
              </Btn>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}

export interface TourStep {
  title: string;
  text: string;
  hi: 'formats' | 'more' | 'compress' | 'copy' | 'center' | 'launcher' | 'tray' | null;
}

export const tourSteps = (shortcut: string): TourStep[] => [
  { title: 'Open Orbit', hi: null, text: `Press ${shortcut.split('+').join(' + ')}, or select files and click the launcher. Orbit opens at your cursor — drag the glass to move it.` },
  { title: 'Select a format', hi: 'formats', text: 'Scroll the mouse wheel over Orbit (or press the arrow keys) to rotate through more formats: BMP, then TIFF… Click one and conversion starts immediately with smart defaults.' },
  { title: 'More', hi: 'more', text: 'More always sits at the bottom. It holds every catalogue format, combining images into one PDF, archive extraction and advanced options.' },
  { title: 'Compress', hi: 'compress', text: 'Compress is permanent. It uses WinRAR with your default format (ZIP) and Normal level, and asks before enabling any password.' },
  { title: 'Copy Path', hi: 'copy', text: 'Copy Path puts the file path on your clipboard — handy for chat, terminals and forms.' },
  { title: 'Drag and drop', hi: 'launcher', text: 'Enable the floating launcher in Settings, then drop files onto it. In this preview you can also drop files anywhere on the desktop.' },
  { title: 'The queue', hi: 'center', text: 'While work runs, Orbit shrinks to a logo with a progress ring. Click the central logo to see the queue, cancel items or retry failures.' },
  { title: 'Settings', hi: 'tray', text: 'Open the tray icon (or right-click the launcher) for Settings, Recent Activity, Pause / Resume and Exit.' },
];

export function TourCard({ step, steps, onBack, onNext, onSkip }: { step: number; steps: TourStep[]; onBack: () => void; onNext: () => void; onSkip: () => void }) {
  const t = steps[step];
  const last = step === steps.length - 1;
  return (
    <div className="anim-fade-in glass fixed left-1/2 top-5 z-[48] w-[min(440px,92vw)] -translate-x-1/2 rounded-2xl p-4 text-white shadow-2xl" onPointerDown={(e) => e.stopPropagation()}>
      <div className="mb-1 flex items-center justify-between text-[11px] text-white/45">
        <span className="uppercase tracking-[0.16em]">Tutorial · {step + 1} / {steps.length}</span>
        <button onClick={onSkip} className="hover:text-white">Skip tutorial</button>
      </div>
      <div className="text-[14px]">{t.title}</div>
      <p className="mt-1 text-[12.5px] leading-relaxed text-white/60">{t.text}</p>
      <div className="mt-3 flex items-center justify-between">
        <div className="flex gap-1">
          {steps.map((_, i) => (
            <span key={i} className={`h-1 rounded-full transition-all ${i === step ? 'w-4 bg-white' : 'w-1 bg-white/25'}`} />
          ))}
        </div>
        <div className="flex gap-2">
          {step > 0 && <Btn small onClick={onBack}>Back</Btn>}
          <Btn small primary onClick={onNext}>{last ? 'Finish' : 'Next'}</Btn>
        </div>
      </div>
    </div>
  );
}
