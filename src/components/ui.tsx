import { type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

export function Spinner({ className = '' }: { className?: string }) {
  return <Loader2 className={`animate-spin ${className}`} />;
}

export function EmptyState({ icon, title, hint }: { icon?: ReactNode; title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      {icon && <div className="text-white/20 mb-3">{icon}</div>}
      <p className="text-white/50 font-medium">{title}</p>
      {hint && <p className="text-white/30 text-sm mt-1">{hint}</p>}
    </div>
  );
}

export function StatusDot({ status }: { status: 'online' | 'sync' | 'offline' }) {
  const map = {
    online: { c: 'bg-emerald-400', t: 'Online' },
    sync: { c: 'bg-amber-400', t: 'Synchroniseren' },
    offline: { c: 'bg-red-400', t: 'Offline' },
  } as const;
  const s = map[status];
  return (
    <span className="inline-flex items-center gap-2 text-sm">
      <span className={`w-2.5 h-2.5 rounded-full ${s.c} ${status !== 'offline' ? 'animate-pulse' : ''}`} />
      {s.t}
    </span>
  );
}
