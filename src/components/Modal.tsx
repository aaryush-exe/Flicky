import type { ReactNode } from 'react';
import { Icon } from './Icons';

export function Modal({
  title,
  onClose,
  children,
  width = 440,
}: {
  title: string;
  onClose?: () => void;
  children: ReactNode;
  width?: number;
}) {
  return (
    <div className="anim-fade-in fixed inset-0 z-[45] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm" onPointerDown={(e) => e.stopPropagation()}>
      <div className="glass max-h-[90vh] overflow-y-auto rounded-2xl text-white shadow-2xl" style={{ width }}>
        <div className="flex items-center justify-between px-5 pb-1 pt-4">
          <h2 className="text-[11px] font-medium uppercase tracking-[0.18em] text-white/55">{title}</h2>
          {onClose && (
            <button onClick={onClose} className="rounded-full p-1 text-white/50 hover:bg-white/10 hover:text-white" aria-label="Close">
              <Icon name="x" size={15} />
            </button>
          )}
        </div>
        <div className="px-5 pb-5 pt-2">{children}</div>
      </div>
    </div>
  );
}
