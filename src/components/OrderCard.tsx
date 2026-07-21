import { useState } from 'react';
import { Clock, User, Hash, Table2, Tag, XCircle, CheckCircle2, Printer, ChevronDown } from 'lucide-react';
import type { Order } from '../lib/types';
import { fmtEUR, fmtTime, waitMinutesFrozen } from '../lib/utils';

export interface TimerThresholds {
  yellow: number;
  orange: number;
  red: number;
  critical: number;
}

interface Props {
  order: Order;
  onDone?: (o: Order) => void;
  onComplete?: (o: Order) => void;
  onEdit?: (o: Order) => void;
  onCancel?: (o: Order) => void;
  onPrint?: (o: Order) => void;
  compact?: boolean;
  timers?: TimerThresholds;
  defaultExpanded?: boolean;
}

export function OrderCard({ order, onDone, onComplete, onEdit, onCancel, onPrint, compact, timers, defaultExpanded }: Props) {
  const t = timers ?? { yellow: 5, orange: 8, red: 10, critical: 15 };
  const [expanded, setExpanded] = useState(!!defaultExpanded);
  const frozen = order.status !== 'pending' && order.completed_at;
  const min = waitMinutesFrozen(order);

  const statusBadge =
    order.status === 'pending'
      ? <span className="badge bg-emerald-500/15 text-emerald-400">Keuken ontvangen</span>
      : order.status === 'done'
      ? <span className="badge bg-sky-500/15 text-sky-400">Keuken afgewerkt</span>
      : order.status === 'completed'
      ? <span className="badge bg-white/10 text-white/50">Volledig afgewerkt</span>
      : <span className="badge bg-red-500/15 text-red-400">Geannuleerd</span>;

  const colorClass =
    min >= t.critical ? 'text-red-500 border-red-500/50'
    : min >= t.red ? 'text-red-400 border-red-500/40'
    : min >= t.orange ? 'text-amber-400 border-amber-500/40'
    : min >= t.yellow ? 'text-yellow-400 border-yellow-500/30'
    : 'text-white/50 border-transparent';

  const [textClass, borderClass] = [colorClass.split(' ')[0], colorClass.split(' ').slice(1).join(' ')];
  const isActive = order.status === 'pending' || order.status === 'done';

  return (
    <div className={`card animate-pop ${isActive ? borderClass : ''}`}>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full p-4 flex items-start justify-between gap-3 text-left"
      >
        <div className="flex items-center gap-2 flex-wrap">
          <span className="badge bg-white/10 text-white"><Hash size={12} />{order.num}</span>
          <span className="badge bg-white/10 text-white"><Table2 size={12} />{order.table_name}</span>
          <span className="badge bg-white/10 text-white"><User size={12} />{order.waiter}</span>
          {statusBadge}
        </div>
        <div className={`text-sm flex items-center gap-1 ${textClass}`}>
          <Clock size={14} /> {fmtTime(order.created_at)} · {min}m{frozen ? ' ⏸' : ''}
          <ChevronDown size={16} className={`transition-transform ${expanded ? 'rotate-180' : ''} text-white/40`} />
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-3 flex flex-col gap-1">
          {order.items.map((it, i) => (
            <div key={i} className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                <span className="bg-white/10 rounded px-1.5 py-0.5 text-xs font-mono">{it.qty}×</span>
                <span>{it.emoji} {it.name}</span>
                {it.note && <span className="text-white/40 text-xs italic">— {it.note}</span>}
              </span>
              <span className="text-white/60">{fmtEUR(it.price * it.qty)}</span>
            </div>
          ))}
          {order.note && <p className="text-white/40 text-xs italic mt-1">Opmerking: {order.note}</p>}
        </div>
      )}

      {expanded && (
        <div className="px-4 pb-4 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3 text-sm">
            <span className="text-white/70 font-semibold">{fmtEUR(order.total)}</span>
            <span className="badge bg-violet-500/15 text-violet-300"><Tag size={12} />{order.vakjes} vakjes</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {onPrint && <button onClick={() => onPrint(order)} className="btn-ghost px-3 py-1.5 text-sm"><Printer size={14} /></button>}
            {onEdit && order.status === 'pending' && <button onClick={() => onEdit(order)} className="btn-ghost px-3 py-1.5 text-sm">Aanpassen</button>}
            {onCancel && (order.status === 'pending' || order.status === 'done') && <button onClick={() => onCancel(order)} className="btn-warn px-3 py-1.5 text-sm"><XCircle size={14} /> Annuleren</button>}
            {onDone && order.status === 'pending' && <button onClick={() => onDone(order)} className="btn-primary px-3 py-1.5 text-sm"><CheckCircle2 size={14} /> Keuken afgewerkt</button>}
            {onComplete && order.status === 'done' && <button onClick={() => onComplete(order)} className="btn-primary px-3 py-1.5 text-sm"><CheckCircle2 size={14} /> Volledig afgewerkt</button>}
          </div>
        </div>
      )}
    </div>
  );
}
