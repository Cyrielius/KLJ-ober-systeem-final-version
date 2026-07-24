import { useState } from 'react';
import { Clock, ChevronDown, AlertTriangle, RotateCcw } from 'lucide-react';
import type { Order, OrderStatus, WorkflowMode } from '../lib/types';
import { fmtEUR, fmtTime, waitMinutesFrozen, statusLabel, advanceLabel, revertLabel, nextStatus, prevStatus } from '../lib/utils';

export interface TimerThresholds {
  yellow: number;
  orange: number;
  red: number;
  critical: number;
}

interface Props {
  order: Order;
  workflowMode: WorkflowMode;
  onAdvance?: (o: Order) => void;
  onRevert?: (o: Order) => void;
  onEdit?: (o: Order) => void;
  onCancel?: (o: Order) => void;
  onPrint?: (o: Order) => void;
  onDetails?: (o: Order) => void;
  compact?: boolean;
  timers?: TimerThresholds;
  defaultExpanded?: boolean;
  showRevert?: boolean;
}

export function OrderCard({ order, workflowMode, onAdvance, onRevert, onEdit, onCancel, onPrint, onDetails, compact, timers, defaultExpanded, showRevert }: Props) {
  const t = timers ?? { yellow: 5, orange: 8, red: 10, critical: 15 };
  const [expanded, setExpanded] = useState(!!defaultExpanded);
  const [confirmAction, setConfirmAction] = useState<'advance' | 'cancel' | null>(null);
  const frozen = (order.status === 'done' || order.status === 'completed') && order.completed_at;
  const min = waitMinutesFrozen(order);

  const statusBadge =
    order.status === 'pending'
      ? <span className="badge bg-emerald-500/15 text-emerald-400">{statusLabel('pending', workflowMode)}</span>
      : order.status === 'done'
      ? <span className="badge bg-sky-500/15 text-sky-400">{statusLabel('done', workflowMode)}</span>
      : order.status === 'completed'
      ? <span className="badge bg-white/[0.06] text-white/50">{statusLabel('completed', workflowMode)}</span>
      : <span className="badge bg-red-500/15 text-red-400">{statusLabel('cancelled', workflowMode)}</span>;

  const isUrgent = order.status === 'pending' && min >= t.critical;
  const isRed = order.status === 'pending' && min >= t.red;
  const isOrange = order.status === 'pending' && min >= t.orange;
  const isYellow = order.status === 'pending' && min >= t.yellow;

  const borderClass = isUrgent ? 'border-red-500/60 animate-urgent'
    : isRed ? 'border-red-500/40'
    : isOrange ? 'border-amber-500/40'
    : isYellow ? 'border-yellow-500/30'
    : 'border-white/[0.06]';

  const minColor = isUrgent ? 'text-red-400'
    : isRed ? 'text-red-400'
    : isOrange ? 'text-amber-400'
    : isYellow ? 'text-yellow-400'
    : 'text-white/50';

  const isActive = order.status === 'pending' || order.status === 'done';
  const canAdvance = onAdvance && nextStatus(order.status, workflowMode) !== null;
  const canRevert = showRevert && onRevert && prevStatus(order.status, workflowMode) !== null;

  function handleAdvance() {
    if (!onAdvance) return;
    // In 2-step mode, advancing from done→completed (ober klaar) requires confirmation
    if (order.status === 'done' && workflowMode === '2-step') {
      setConfirmAction('advance');
    } else {
      onAdvance(order);
    }
  }

  function handleCancel() {
    if (!onCancel) return;
    setConfirmAction('cancel');
  }

  return (
    <div className={`card border ${borderClass} overflow-hidden`}>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full p-3 flex items-start justify-between gap-3 text-left"
      >
        <div className="flex flex-col gap-1.5 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-bold text-white font-mono">#{order.num}</span>
            <span className="text-xs text-white/60">Tafel: {order.table_name}</span>
            <span className="text-xs text-white/60">Ober: {order.waiter}</span>
            {statusBadge}
          </div>
          {isUrgent && (
            <div className="flex items-center gap-1 text-red-400 text-xs font-semibold">
              <AlertTriangle size={12} /> Wacht al {min} minuten — dringend
            </div>
          )}
        </div>
        <div className={`text-xs flex items-center gap-1 ${minColor} flex-none`}>
          <Clock size={12} />
          <span className="font-mono">{fmtTime(order.created_at)}</span>
          <span>·</span>
          <span className="font-bold">{min}m</span>
          {frozen && <span className="text-white/30">⏸</span>}
          <ChevronDown size={14} className={`transition-transform ${expanded ? 'rotate-180' : ''} text-white/30`} />
        </div>
      </button>

      {expanded && !compact && (
        <div className="px-3 pb-2 flex flex-col gap-1 border-t border-white/[0.04] pt-2">
          {order.items.map((it, i) => (
            <div key={i} className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                <span className="bg-white/[0.08] rounded px-1.5 py-0.5 text-xs font-mono font-bold">{it.qty}×</span>
                <span className="text-white/90">{it.name}</span>
                {it.note && <span className="text-amber-400/80 text-xs italic">— {it.note}</span>}
              </span>
              <span className="text-white/50 text-xs">{fmtEUR(it.price * it.qty)}</span>
            </div>
          ))}
          {order.note && <p className="text-amber-400/80 text-xs italic mt-1">Opmerking: {order.note}</p>}
        </div>
      )}

      {expanded && (
        <div className="px-3 pb-3 pt-2 border-t border-white/[0.04]">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3 text-xs">
              <span className="text-white/70 font-semibold">{fmtEUR(order.total)}</span>
              <span className="badge bg-violet-500/10 text-violet-300">{order.vakjes} vakjes</span>
            </div>
            {onDetails && (
              <button onClick={() => onDetails(order)} className="text-xs text-white/40 hover:text-white/70 transition">
                Details
              </button>
            )}
          </div>

          {confirmAction ? (
            <div className="flex flex-col gap-2 p-2 bg-white/[0.04] rounded-md">
              <p className="text-xs text-white/70 text-center">
                {confirmAction === 'advance'
                  ? `Bestelling #${order.num} afronden als "${statusLabel(nextStatus(order.status, workflowMode)!, workflowMode)}"?`
                  : `Bestelling #${order.num} annuleren?`}
              </p>
              <div className="flex gap-2">
                <button onClick={() => setConfirmAction(null)} className="btn-ghost flex-1 py-2 text-xs">
                  Annuleren
                </button>
                <button
                  onClick={() => {
                    if (confirmAction === 'advance') onAdvance?.(order);
                    else onCancel?.(order);
                    setConfirmAction(null);
                  }}
                  className={`flex-1 py-2 text-xs rounded-md font-semibold transition ${confirmAction === 'advance' ? 'bg-emerald-600 hover:bg-emerald-500 text-white' : 'bg-red-600 hover:bg-red-500 text-white'}`}
                >
                  Bevestigen
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 flex-wrap">
              {onPrint && (
                <button onClick={() => onPrint(order)} className="btn-ghost px-2.5 py-1.5 text-xs">
                  Print
                </button>
              )}
              {onEdit && order.status === 'pending' && (
                <button onClick={() => onEdit(order)} className="btn-ghost px-2.5 py-1.5 text-xs">
                  Aanpassen
                </button>
              )}
              {canRevert && (
                <button onClick={() => onRevert!(order)} className="btn-ghost px-2.5 py-1.5 text-xs flex items-center gap-1">
                  <RotateCcw size={12} /> {revertLabel(order.status, workflowMode)}
                </button>
              )}
              {onCancel && (order.status === 'pending' || order.status === 'done') && (
                <button onClick={handleCancel} className="btn-warn px-2.5 py-1.5 text-xs">
                  Annuleren
                </button>
              )}
              {canAdvance && (
                <button
                  onClick={handleAdvance}
                  className="btn-primary px-3 py-1.5 text-xs ml-auto"
                >
                  {advanceLabel(order.status, workflowMode)}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
