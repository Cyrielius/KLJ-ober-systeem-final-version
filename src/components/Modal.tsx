import { type ReactNode, useEffect } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

export function Modal({ open, onClose, title, children, size = 'md' }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  const w = size === 'sm' ? 'max-w-sm' : size === 'lg' ? 'max-w-3xl' : 'max-w-md';
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative card w-full ${w} max-h-[92vh] overflow-y-auto animate-slideup`}>
        {title && (
          <div className="flex items-center justify-between p-3 border-b border-white/[0.06] sticky top-0 bg-[#131820] z-10">
            <h3 className="text-base font-bold text-white">{title}</h3>
            <button onClick={onClose} className="btn-ghost p-1.5"><X size={16} /></button>
          </div>
        )}
        <div className="p-3">{children}</div>
      </div>
    </div>
  );
}
