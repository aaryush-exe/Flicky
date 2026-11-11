import { Icon } from './Icons';
import { dismissNote, runNoteAction, useNotes } from '../lib/notify';

export function Notifications() {
  const notes = useNotes();
  return (
    <div className="pointer-events-none fixed bottom-14 left-1/2 z-50 flex w-[min(380px,92vw)] -translate-x-1/2 flex-col gap-2">
      {notes.map((n) => (
        <div
          key={n.id}
          role="status"
          onClick={() => dismissNote(n.id)}
          className="anim-note-in glass pointer-events-auto cursor-default rounded-xl px-3.5 py-3 text-white shadow-2xl"
        >
          <div className="flex items-start gap-3">
            <span className="mt-0.5 text-white/80">
              <Icon name={n.tone === 'success' ? 'check' : n.tone === 'error' ? 'alert' : 'info'} size={16} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-medium">{n.title}</div>
              {n.body && <div className="mt-0.5 whitespace-pre-line break-words text-[12px] leading-snug text-white/60">{n.body}</div>}
              {n.actions && n.actions.length > 0 && (
                <div className="mt-2.5 flex flex-row gap-2">
                  {n.actions.map((a) => (
                    <button
                      key={a.label}
                      onClick={(e) => {
                        e.stopPropagation();
                        runNoteAction(n.id, a);
                      }}
                      className="rounded-lg border border-white/25 px-3 py-1 text-[12px] hover:border-white/70 hover:bg-white/10"
                    >
                      {a.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
