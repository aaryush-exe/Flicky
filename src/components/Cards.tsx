import { useEffect, useState } from 'react';
import { Modal } from './Modal';
import { Btn, Select, Toggle } from './controls';
import { Icon } from './Icons';
import { WINRAR_URL, detectWinRar, usePasswordRequest } from '../lib/archive';
import { clearErrors, useErrors, useSettings } from '../lib/settings';
import type { WinRarInfo } from '../lib/host';

export interface CompressOptions {
  format: 'zip' | 'rar';
  level: string;
  password?: string;
}

export function ArchiveCard({
  mode,
  count,
  onClose,
  onStart,
}: {
  mode: 'compress' | 'extract';
  count: number;
  onClose: () => void;
  onStart: (o: CompressOptions) => void;
}) {
  const s = useSettings();
  const [info, setInfo] = useState<WinRarInfo | null>(null);
  const [format, setFormat] = useState<'zip' | 'rar'>(s.archiveFormat === 'rar' ? 'rar' : 'zip');
  const [level, setLevel] = useState<string>(s.archiveLevel);
  const [encrypt, setEncrypt] = useState(false);
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');

  const check = () => {
    setInfo(null);
    detectWinRar().then(setInfo);
  };
  useEffect(check, []);

  const pwOk = !encrypt || (pw.length > 0 && pw === pw2);
  const found = !!info?.found;

  return (
    <Modal title={mode === 'compress' ? `Compress ${count > 1 ? `${count} items` : 'item'}` : 'Extract archive'} onClose={onClose}>
      <div className="mb-4 flex items-start gap-3 rounded-xl border border-white/15 p-3">
        <Icon name={found ? 'check' : 'alert'} size={17} className="mt-0.5 text-white/80" />
        <div className="min-w-0 text-[12.5px] leading-snug">
          {info === null ? (
            <span className="text-white/60">Looking for WinRAR…</span>
          ) : found ? (
            <>
              <div>WinRAR detected{info.version ? ` · ${info.version}` : ''}</div>
              {info.path && <div className="truncate text-white/45">{info.path}</div>}
            </>
          ) : (
            <>
              <div className="font-medium">WinRAR was not found</div>
              <p className="mt-1 text-white/55">
                Flicky uses WinRAR for every archive operation and does not bundle it. Install WinRAR (a licence from RARLAB is required for continued use), then choose “Check again”.
                {' '}This web preview cannot reach a Windows installation at all, so archive operations are unavailable here.
              </p>
              <div className="mt-2.5 flex gap-2">
                <a href={WINRAR_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-white/25 px-3 py-1 text-[12px] hover:border-white/70 hover:bg-white/10">
                  Get WinRAR <Icon name="external" size={12} />
                </a>
                <Btn small onClick={check}>
                  Check again
                </Btn>
              </div>
            </>
          )}
        </div>
      </div>

      {mode === 'compress' && (
        <div className={found ? '' : 'pointer-events-none opacity-40'}>
          <div className="flex items-center justify-between py-2 text-[13px]">
            Format
            <div className="flex gap-1.5">
              {(['zip', 'rar'] as const).map((f) => (
                <button key={f} onClick={() => setFormat(f)} className={`rounded-full border px-3 py-1 text-[12px] uppercase ${format === f ? 'border-white bg-white text-black' : 'border-white/25 hover:border-white/60'}`}>
                  {f}
                </button>
              ))}
              <button disabled title="WinRAR can extract 7Z but cannot create it" className="cursor-not-allowed rounded-full border border-white/10 px-3 py-1 text-[12px] uppercase text-white/30">
                7z
              </button>
            </div>
          </div>
          <p className="-mt-1 mb-1 text-[11px] text-white/35">7Z can be extracted with WinRAR, but WinRAR cannot create 7Z archives.</p>
          <div className="flex items-center justify-between py-2 text-[13px]">
            Compression
            <Select
              value={level}
              onChange={setLevel}
              options={[
                { value: 'store', label: 'Store' },
                { value: 'fast', label: 'Fast' },
                { value: 'normal', label: 'Normal' },
                { value: 'good', label: 'Good' },
                { value: 'best', label: 'Best' },
              ]}
            />
          </div>
          <div className="flex items-center justify-between py-2 text-[13px]">
            <span className="flex items-center gap-2">
              <Icon name="lock" size={14} /> Password-protect
            </span>
            <Toggle on={encrypt} onChange={setEncrypt} label="Password-protect" />
          </div>
          {encrypt && (
            <div className="space-y-2 pb-2">
              <input type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Password" className="w-full rounded-lg border border-white/20 bg-black/40 px-3 py-2 text-[13px] outline-none focus:border-white/60" />
              <input type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} placeholder="Confirm password" className="w-full rounded-lg border border-white/20 bg-black/40 px-3 py-2 text-[13px] outline-none focus:border-white/60" />
              {pw2 && pw !== pw2 && <p className="text-[11.5px] text-white/60">Passwords don’t match.</p>}
              <p className="text-[11px] text-white/35">The password is used once and is never saved, logged or written to a temporary file.</p>
            </div>
          )}
        </div>
      )}

      <div className="mt-3 flex justify-end gap-2">
        <Btn onClick={onClose}>{mode === 'extract' || !found ? 'Close' : 'Cancel'}</Btn>
        {mode === 'compress' && (
          <Btn primary disabled={!found || !pwOk} onClick={() => onStart({ format, level, password: encrypt ? pw : undefined })}>
            Compress
          </Btn>
        )}
      </div>
    </Modal>
  );
}

export function PasswordCard() {
  const req = usePasswordRequest();
  const [pw, setPw] = useState('');
  useEffect(() => setPw(''), [req]);
  if (!req) return null;
  const submit = () => {
    const v = pw;
    setPw('');
    req.resolve(v);
  };
  return (
    <Modal title="Password required" onClose={() => req.resolve(null)}>
      <div className="mb-3 flex items-center gap-2 text-[13px]">
        <Icon name="lock" size={15} />
        <span className="truncate">{req.fileName}</span>
      </div>
      {req.retry && <p className="mb-2 text-[12px] text-white/60">That password didn’t work. Try again.</p>}
      <input
        autoFocus
        type="password"
        autoComplete="off"
        value={pw}
        onChange={(e) => setPw(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && pw && submit()}
        placeholder="Archive password"
        className="w-full rounded-lg border border-white/20 bg-black/40 px-3 py-2 text-[13px] outline-none focus:border-white/60"
      />
      <p className="mt-2 text-[11px] text-white/35">Used only for this extraction. Never stored or logged.</p>
      <div className="mt-4 flex justify-end gap-2">
        <Btn onClick={() => req.resolve(null)}>Cancel</Btn>
        <Btn primary disabled={!pw} onClick={submit}>
          Extract
        </Btn>
      </div>
    </Modal>
  );
}

export function ActivityCard({ onClose }: { onClose: () => void }) {
  const errors = useErrors();
  return (
    <Modal title="Recent activity" onClose={onClose}>
      <p className="mb-3 text-[12px] text-white/45">Flicky keeps errors only. Successful operations are never recorded.</p>
      {errors.length === 0 ? (
        <div className="rounded-xl border border-white/10 px-4 py-8 text-center text-[13px] text-white/50">No errors. Nothing to show.</div>
      ) : (
        <ul className="max-h-72 space-y-2 overflow-y-auto">
          {errors.map((e, i) => (
            <li key={i} className="rounded-lg border border-white/10 px-3 py-2">
              <div className="truncate text-[12.5px]">{e.file}</div>
              <div className="text-[11.5px] text-white/50">{e.reason}</div>
              <div className="mt-0.5 text-[10.5px] text-white/30">{new Date(e.t).toLocaleString()}</div>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-4 flex justify-end gap-2">
        {errors.length > 0 && <Btn onClick={clearErrors}>Clear</Btn>}
        <Btn primary onClick={onClose}>
          Done
        </Btn>
      </div>
    </Modal>
  );
}
