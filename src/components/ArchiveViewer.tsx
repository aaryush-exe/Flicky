import { Modal } from './Modal';
import { Btn } from './controls';

export interface ViewerState {
  name: string;
  path: string;
  status: 'loading' | 'ready' | 'error';
  entries?: string[];
  truncated?: boolean;
  message?: string;
}

export function ArchiveViewer({
  state,
  onClose,
  onExtract,
  onOpenWinRar,
}: {
  state: ViewerState;
  onClose: () => void;
  onExtract: () => void;
  onOpenWinRar: () => void;
}) {
  const count = state.entries?.length ?? 0;
  return (
    <Modal title={`Archive · ${state.name}`} onClose={onClose} width={520}>
      {state.status === 'loading' && <p className="py-6 text-center text-[12px] text-white/55">Reading archive…</p>}
      {state.status === 'error' && <p className="py-4 text-[12px] text-white/70">{state.message || 'The archive could not be read.'}</p>}
      {state.status === 'ready' && (
        <>
          <p className="mb-2 text-[11px] text-white/45">
            {count === 0 ? 'This archive is empty.' : `${count}${state.truncated ? '+' : ''} item${count === 1 ? '' : 's'}${state.truncated ? ' (showing the first 2000)' : ''}`}
          </p>
          <div className="max-h-[320px] overflow-y-auto rounded-lg border border-white/10 bg-black/30 p-2">
            {state.entries!.map((e, i) => (
              <div key={i} className="truncate py-[3px] font-mono text-[11.5px] text-white/80" title={e}>
                {e}
              </div>
            ))}
          </div>
        </>
      )}
      <div className="mt-4 flex justify-end gap-2">
        <Btn small onClick={onOpenWinRar}>Open in WinRAR</Btn>
        <Btn small onClick={onExtract}>Extract</Btn>
        <Btn small onClick={onClose}>Close</Btn>
      </div>
    </Modal>
  );
}
