import { useEffect, useState } from 'react';
import { Btn, Keycaps } from './controls';
import { DEFAULT_SHORTCUT, updateSettings, useSettings } from '../lib/settings';
import { eventToShortcut, formatShortcut, shortcutState, validateShortcut } from '../lib/shortcuts';
import { getHost } from '../lib/host';

export function ShortcutRecorder() {
  const s = useSettings();
  const [rec, setRec] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const apply = async (combo: string) => {
    const v = validateShortcut(combo);
    if (!v.ok) {
      setMsg({ ok: false, text: v.reason! });
      return false;
    }
    const host = getHost()?.shortcut;
    if (host) {
      const r = await host.register(combo);
      if (!r.ok) {
        setMsg({ ok: false, text: r.reason || `${formatShortcut(combo)} is already registered by another application.` });
        return false;
      }
    }
    updateSettings({ shortcut: combo });
    setMsg({ ok: true, text: `Shortcut set to ${formatShortcut(combo)}.` });
    return true;
  };

  useEffect(() => {
    if (!rec) return;
    shortcutState.recording = true;
    const k = async (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') {
        setRec(false);
        setMsg(null);
        return;
      }
      const { combo, complete } = eventToShortcut(e);
      if (!complete) {
        setMsg({ ok: true, text: combo ? `${formatShortcut(combo)} + …` : 'Press the keys…' });
        return;
      }
      if (await apply(combo)) setRec(false);
    };
    window.addEventListener('keydown', k, true);
    return () => {
      shortcutState.recording = false;
      window.removeEventListener('keydown', k, true);
    };

  }, [rec]);

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex items-center gap-2">
        <Keycaps combo={s.shortcut} />
        <Btn small onClick={() => { setMsg(null); setRec((r) => !r); }}>
          {rec ? 'Press keys… (Esc to cancel)' : 'Change'}
        </Btn>
        <Btn small disabled={s.shortcut === DEFAULT_SHORTCUT} onClick={() => { setRec(false); apply(DEFAULT_SHORTCUT); }}>
          Restore default
        </Btn>
      </div>
      {msg && <p className={`max-w-[360px] text-right text-[11.5px] ${msg.ok ? 'text-white/60' : 'text-white'}`}>{msg.ok ? '✓ ' : '✕ '}{msg.text}</p>}
    </div>
  );
}
