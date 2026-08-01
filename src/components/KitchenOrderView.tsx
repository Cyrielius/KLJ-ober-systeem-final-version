import { useState } from 'react';
import { ArrowLeft, X, CheckCircle2, AlertTriangle, Clock, User } from 'lucide-react';
import type { Order, WorkflowMode } from '../lib/types';

interface Props {
  order: Order;
  workerName: string;
  workflowMode: WorkflowMode;
  claimedByOther: string | null;
  onClose: () => void;
  onTakeover: () => void;
  onConfirmReady: () => Promise<void>;
}

/**
 * Full-screen keuken-weergave van één bestelling.
 * Neemt het volledige scherm in voor maximale leesbaarheid en efficiëntie.
 * Bevat de twee-staps "Klaar" -> "Bevestig klaar" flow + auto-print van de bon.
 */
export function KitchenOrderView({ order, workerName, workflowMode, claimedByOther, onClose, onTakeover, onConfirmReady }: Props) {
  const [confirmReady, setConfirmReady] = useState(false);
  const [busy, setBusy] = useState(false);

  const needsTakeover = !!claimedByOther;
  const isMine = !claimedByOther && order.kitchen_claimed_by === workerName;

  async function handleConfirm() {
    setBusy(true);
    await onConfirmReady();
    setBusy(false);
    setConfirmReady(false);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 bg-[#0a0d12] flex flex-col animate-pop">
      {/* Header */}
      <div className="bg-[#131820] border-b border-white/[0.08] px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={onClose} className="btn-ghost p-2 shrink-0"><ArrowLeft size={22} /></button>
          <div className="flex items-baseline gap-3 min-w-0">
            <span className="label uppercase tracking-wider shrink-0">Tafel</span>
            <span className="text-3xl font-black text-white font-mono truncate">{order.table_name}</span>
            <span className="text-white/30">·</span>
            <span className="text-xl font-bold text-white font-mono">#{order.num}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {needsTakeover && (
            <span className="badge bg-amber-500/15 text-amber-400 text-sm"><User size={14} /> Bezig: {claimedByOther}</span>
          )}
          {isMine && (
            <span className="badge bg-sky-500/15 text-sky-400 text-sm"><User size={14} /> Bezig: jij</span>
          )}
          {order.status === 'done' && <span className="badge bg-sky-500/15 text-sky-400 text-sm">Klaar</span>}
          <button onClick={onClose} className="btn-ghost p-2"><X size={20} /></button>
        </div>
      </div>

      {/* Body - groot en leesbaar */}
      <div className="flex-1 overflow-y-auto p-5 sm:p-8">
        <div className="max-w-2xl mx-auto">
          {/* Meta */}
          <div className="flex flex-wrap items-center gap-4 mb-6 text-sm text-white/50">
            <span className="flex items-center gap-1.5"><User size={16} /> Ober: <strong className="text-white/80">{order.waiter}</strong></span>
            <span className="flex items-center gap-1.5"><Clock size={16} /> {new Date(order.created_at).toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' })}</span>
            <span className="badge bg-violet-500/10 text-violet-300">Mode {workflowMode === '1-step' ? '1' : '2'}</span>
            {order.vakjes > 0 && <span className="badge bg-white/[0.06] text-white/60">{order.vakjes} vakjes</span>}
          </div>

          {order.note && (
            <div className="mb-6 px-4 py-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-amber-400 text-base font-semibold">
              Opmerking: {order.note}
            </div>
          )}

          {/* Takeover warning */}
          {needsTakeover && (
            <div className="mb-6 card border-amber-500/30 p-6 flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-amber-500/15 text-amber-400 flex items-center justify-center shrink-0"><AlertTriangle size={20} /></div>
                <div>
                  <p className="font-bold text-amber-400 text-lg">{claimedByOther} is momenteel bezig met deze bestelling.</p>
                  <p className="text-white/60 text-sm">Ben je zeker dat je deze bestelling wilt overnemen?</p>
                </div>
              </div>
              <button onClick={onTakeover} className="btn-warn px-5 py-2.5 text-sm">Overnemen</button>
            </div>
          )}

          {/* Items - groot en leesbaar */}
          <div className="card divide-y divide-white/[0.06] overflow-hidden">
            {order.items.map((it, i) => (
              <div key={i} className="p-5 sm:p-6">
                <div className="flex items-baseline gap-4">
                  <span className="text-4xl font-black text-white font-mono w-16 shrink-0">{it.qty}×</span>
                  <span className="text-2xl font-bold text-white">{it.name}</span>
                </div>
                {it.note && (
                  <div className="mt-3 ml-20 px-4 py-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 font-bold text-base">
                    &gt;&gt; {it.note}
                  </div>
                )}
              </div>
            ))}
          </div>

          {order.items.length === 0 && (
            <p className="text-center text-white/30 py-12">Geen items in deze bestelling.</p>
          )}
        </div>
      </div>

      {/* Footer actie-balk */}
      <div className="bg-[#131820] border-t border-white/[0.08] px-4 py-4">
        <div className="max-w-2xl mx-auto flex flex-col sm:flex-row items-center gap-3">
          <p className="text-xs text-white/40 flex-1 text-center sm:text-left">
            {workflowMode === '1-step'
              ? 'Mode 1: na bevestiging is de bestelling volledig afgerond. De bon wordt afgedrukt.'
              : 'Mode 2: na bevestiging wacht de ober op "Afgehaald". De bon wordt afgedrukt.'}
          </p>
          {needsTakeover ? (
            <button onClick={onTakeover} className="btn-warn px-6 py-3.5 text-base font-semibold w-full sm:w-auto">Eerst overnemen</button>
          ) : order.status === 'done' ? (
            <button disabled className="btn-sky px-6 py-3.5 text-base font-semibold opacity-60 w-full sm:w-auto"><CheckCircle2 size={20} /> Klaar bevestigd</button>
          ) : (
            <button
              onClick={() => setConfirmReady(true)}
              className="btn-primary px-6 py-3.5 text-base font-semibold w-full sm:w-auto min-w-[180px]"
            >
              <CheckCircle2 size={20} /> Klaar
            </button>
          )}
        </div>
      </div>

      {/* Twee-staps bevestiging: "Bevestig klaar" */}
      {confirmReady && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="card w-full max-w-md p-6 animate-pop">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-white">Bevestig klaar</h3>
              <button onClick={() => setConfirmReady(false)} className="btn-ghost p-1.5"><X size={16} /></button>
            </div>
            <p className="text-white/60 text-sm mb-6">
              Bevestig dat deze bestelling klaar is.
              <br />
              {workflowMode === '1-step'
                ? 'De bestelling wordt afgerond.'
                : 'De ober moet nog "Afgehaald" bevestigen.'}
            </p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmReady(false)} className="btn-ghost flex-1 py-3 text-sm">Annuleren</button>
              <button onClick={handleConfirm} disabled={busy} className="btn-primary flex-1 py-3 text-sm">
                <CheckCircle2 size={16} /> {busy ? 'Verwerken...' : 'Ja, bevestig klaar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
