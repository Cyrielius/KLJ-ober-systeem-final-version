import { type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

export function Spinner({ className = '' }: { className?: string }) {
  return <Loader2 className={`animate-spin ${className}`} />;
}

export function EmptyState({ icon, title, hint }: { icon?: ReactNode; title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      {icon && <div className="text-white/20 mb-2">{icon}</div>}
      <p className="text-white/40 font-medium text-sm">{title}</p>
      {hint && <p className="text-white/25 text-xs mt-1">{hint}</p>}
    </div>
  );
}

export function StatusDot({ status }: { status: 'online' | 'sync' | 'offline' }) {
  const map = {
    online: { c: 'bg-emerald-400', t: 'Online' },
    sync: { c: 'bg-amber-400', t: 'Sync' },
    offline: { c: 'bg-red-400', t: 'Offline' },
  } as const;
  const s = map[status];
  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      <span className={`w-2 h-2 rounded-full ${s.c} ${status !== 'offline' ? 'animate-pulse' : ''}`} />
      {s.t}
    </span>
  );
}
