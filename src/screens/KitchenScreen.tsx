import { useState, useEffect, useMemo } from 'react';
import { LogOut, Clock, AlertTriangle, CheckCircle2, Bell, Flame, TrendingUp, Package, RotateCcw, X } from 'lucide-react';
import type { Session, Order, WorkflowMode } from '../lib/types';
import { fetchOrders, updateOrderStatus } from '../lib/db';
import { fmtTime, waitMinutesFrozen, statusLabel, advanceLabel, prevStatus, playNotificationSound } from '../lib/utils';
import { useToast } from '../components/Toast';
import { supabase } from '../lib/supabase';

interface Props {
  session: Session;
  onLeave: () => void;
}

export function KitchenScreen({ session, onLeave }: Props) {
  const { push } = useToast();
  const workflowMode: WorkflowMode = session.workflow_mode ?? '2-step';
  const [orders, setOrders] = useState<Order[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [seenIds, setSeenIds] = useState<Set<string>>(new Set());
  const [tab, setTab] = useState<'active' | 'completed'>('active');
  const [confirmOrder, setConfirmOrder] = useState<Order | null>(null);

  async function refresh() {
    try {
      const os = await fetchOrders(session.id);
      setOrders(os);
    } catch {}
  }
  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, [session.id]);

  useEffect(() => {
    const ch = supabase.channel(`klj-kitchen-${session.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'klj_orders', filter: `session_id=eq.${session.id}` }, () => refresh())
      .subscribe();
    return () => { ch.unsubscribe(); };
    // eslint-disable-next-line
  }, [session.id]);

  // Sound + toast on new pending orders
  useEffect(() => {
    const newPending = orders.filter((o) => o.status === 'pending' && !seenIds.has(o.id));
    if (seenIds.size > 0 && newPending.length > 0) {
      push(`Nieuwe bestelling #${newPending[0].num}`, 'success');
      playNotificationSound(session.sound_type ?? 'beep', session.sound_url);
    }
    setSeenIds(new Set(orders.map((o) => o.id)));
    // eslint-disable-next-line
  }, [orders]);

  const criticalThreshold = session.timer_critical ?? 15;

  // Oldest first — most urgent at top
  const pending = useMemo(() =>
    orders.filter((o) => o.status === 'pending').sort((a, b) => a.created_at.localeCompare(b.created_at)),
    [orders]);

  const ready = useMemo(() =>
    orders.filter((o) => o.status === 'done' && o.completed_at && (Date.now() - new Date(o.completed_at).getTime()) < 10 * 60 * 1000)
      .sort((a, b) => a.created_at.localeCompare(b.created_at)),
    [orders]);

  const completed = useMemo(() =>
    orders.filter((o) => o.status === 'completed').sort((a, b) =>
      (b.picked_up_at || b.updated_at).localeCompare(a.picked_up_at || a.updated_at)),
    [orders]);

  // Live stats
  const stats = useMemo(() => {
    const done = orders.filter((o) => o.status === 'completed' || o.status === 'done');
    const items = done.flatMap((o) => o.items);
    return {
      totalOrders: done.length,
      totalItems: items.reduce((s, i) => s + i.qty, 0),
      avgWait: done.length ? Math.round(done.reduce((s, o) => s + waitMinutesFrozen(o), 0) / done.length) : 0,
      topProduct: topItem(items),
    };
  }, [orders]);

  async function handleDone(o: Order) {
    if (workflowMode === '1-step') {
      // Show big confirmation screen
      setConfirmOrder(o);
      return;
    }
    // 2-step: mark as done (Keuken klaar)
    await updateOrderStatus(o.id, 'done', undefined, session.id);
    push(`Bestelling #${o.num} → ${statusLabel('done', workflowMode)}`, 'success');
  }

  async function handleConfirmMade(o: Order) {
    // In 1-step mode: kitchen done = order immediately completed (no waiter pickup step)
    await updateOrderStatus(o.id, 'completed', undefined, session.id);
    setConfirmOrder(null);
    push(`Bestelling #${o.num} afgerond`, 'success');
  }

  async function handleRevert(o: Order) {
    const prev = prevStatus(o.status, workflowMode);
    if (prev === null) return;
    await updateOrderStatus(o.id, prev, undefined, session.id);
    push(`#${o.num} → ${statusLabel(prev, workflowMode)} (teruggezet)`, 'info');
  }

  const activeLabel = workflowMode === '1-step' ? 'Te maken' : 'Te maken';
  const readyLabel = workflowMode === '1-step' ? 'Gemaakt — wacht op ober' : 'Keuken klaar — wacht op ober';

  return (
    <div className="min-h-full flex flex-col">
      <header className="sticky top-0 z-30 bg-[#0a0d12]/95 backdrop-blur border-b border-white/[0.06]">
        <div className="max-w-6xl mx-auto px-3 py-2.5 flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <h1 className="font-bold text-sm text-white flex items-center gap-1.5">
              <Flame size={16} className="text-amber-400" /> Keuken
            </h1>
            <p className="text-white/40 text-xs truncate">{session.event_name} · <span className="font-mono">{session.code}</span></p>
          </div>
          <div className="flex items-center gap-2">
            {pending.length > 0 && <span className="badge bg-emerald-500/15 text-emerald-400"><Bell size={10} /> {pending.length} nieuw</span>}
            {ready.length > 0 && <span className="badge bg-sky-500/15 text-sky-400">{ready.length} klaar</span>}
            <button onClick={onLeave} className="btn-ghost px-2.5 py-1.5 text-red-400 flex items-center gap-1.5 text-xs">
              <LogOut size={14} /> Sluiten
            </button>
          </div>
        </div>

        {/* Live stats bar */}
        <div className="max-w-6xl mx-auto px-3 pb-2.5 grid grid-cols-2 sm:grid-cols-4 gap-2">
          <StatChip icon={<CheckCircle2 size={12} />} label="Gemaakt" value={stats.totalOrders} accent="text-emerald-400" />
          <StatChip icon={<Package size={12} />} label="Producten" value={stats.totalItems} accent="text-sky-400" />
          <StatChip icon={<Clock size={12} />} label="Gem. wachttijd" value={`${stats.avgWait}m`} accent="text-amber-400" />
          <StatChip icon={<TrendingUp size={12} />} label="Top" value={stats.topProduct || '—'} accent="text-white/60" />
        </div>

        {/* Tabs */}
        <div className="max-w-6xl mx-auto px-3 flex gap-1">
          <TabBtn active={tab === 'active'} onClick={() => setTab('active')} label={`Actief (${pending.length + ready.length})`} />
          <TabBtn active={tab === 'completed'} onClick={() => setTab('completed')} label={`Afgerond (${completed.length})`} />
        </div>
      </header>

      <main className="flex-1 max-w-6xl mx-auto w-full p-3 flex flex-col gap-4">
        {tab === 'active' && (
          <>
            <section>
              <h2 className="section-title mb-2">{activeLabel} ({pending.length})</h2>
              {pending.length === 0 ? <p className="text-white/30 text-xs">Geen bestellingen wachten.</p> : (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {pending.map((o) => (
                    <KitchenCard
                      key={o.id}
                      order={o}
                      workflowMode={workflowMode}
                      expanded={!!expanded[o.id]}
                      onToggle={() => setExpanded((s) => ({ ...s, [o.id]: !s[o.id] }))}
                      onDone={handleDone}
                      onRevert={handleRevert}
                      criticalThreshold={criticalThreshold}
                    />
                  ))}
                </div>
              )}
            </section>

            {ready.length > 0 && (
              <section>
                <h2 className="section-title mb-2 text-sky-400">{readyLabel} ({ready.length})</h2>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {ready.map((o) => (
                    <KitchenCard
                      key={o.id}
                      order={o}
                      workflowMode={workflowMode}
                      expanded={!!expanded[o.id]}
                      onToggle={() => setExpanded((s) => ({ ...s, [o.id]: !s[o.id] }))}
                      onRevert={handleRevert}
                      criticalThreshold={criticalThreshold}
                    />
                  ))}
                </div>
              </section>
            )}
          </>
        )}

        {tab === 'completed' && (
          <section>
            <h2 className="section-title mb-2">Afgerond ({completed.length})</h2>
            {completed.length === 0 ? <p className="text-white/30 text-xs">Nog niets afgerond.</p> : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
                {completed.slice(0, 60).map((o) => (
                  <button key={o.id} onClick={() => setExpanded((s) => ({ ...s, [o.id]: !s[o.id] }))} className="card p-2.5 text-left">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-white font-mono">#{o.num}</span>
                      <span className="text-xs text-white/40">{fmtTime(o.picked_up_at || o.updated_at)}</span>
                    </div>
                    {expanded[o.id] && (
                      <div className="mt-1.5 flex flex-col gap-0.5">
                        {o.items.map((it, i) => (
                          <div key={i} className="text-xs flex items-center gap-1.5">
                            <span className="font-mono text-xs bg-white/[0.08] rounded px-1">{it.qty}×</span>
                            <span className="text-white/80">{it.name}</span>
                          </div>
                        ))}
                        <p className="text-white/40 text-[10px] mt-1">Tafel: {o.table_name} · Ober: {o.waiter}</p>
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </section>
        )}
      </main>

      {/* 1-step confirmation overlay */}
      {confirmOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="card w-full max-w-md p-6 animate-pop">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-white">Bestelling gemaakt</h3>
              <button onClick={() => setConfirmOrder(null)} className="btn-ghost p-1.5"><X size={16} /></button>
            </div>
            <p className="text-white/50 text-sm mb-4">Schrijf dit over op papier:</p>
            <div className="flex flex-col gap-3 mb-6">
              <div className="card p-4 text-center">
                <p className="label">Tafelnummer</p>
                <p className="text-4xl font-black text-white font-mono mt-1">{confirmOrder.table_name}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="card p-4 text-center">
                  <p className="label">Bestelnummer</p>
                  <p className="text-3xl font-black text-emerald-400 font-mono mt-1">#{confirmOrder.num}</p>
                </div>
                <div className="card p-4 text-center">
                  <p className="label">Streepjes</p>
                  <p className="text-3xl font-black text-violet-300 font-mono mt-1">{confirmOrder.vakjes}</p>
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setConfirmOrder(null)} className="btn-ghost flex-1 py-2.5 text-sm">
                Annuleren
              </button>
              <button
                onClick={() => handleConfirmMade(confirmOrder)}
                className="btn-primary flex-1 py-2.5 text-sm"
              >
                <CheckCircle2 size={16} /> Gemaakt
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatChip({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string | number; accent: string }) {
  return (
    <div className="card p-1.5 flex items-center gap-2">
      <span className={accent}>{icon}</span>
      <div className="min-w-0">
        <p className="text-white/40 text-[10px] uppercase tracking-wider leading-none">{label}</p>
        <p className={`font-bold text-xs truncate ${accent}`}>{value}</p>
      </div>
    </div>
  );
}

function TabBtn({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} className={`px-3 py-1.5 text-xs font-semibold border-b-2 transition ${active ? 'border-amber-400 text-amber-400' : 'border-transparent text-white/40 hover:text-white/70'}`}>
      {label}
    </button>
  );
}

function topItem(items: { name: string; qty: number }[]): string {
  const counts: Record<string, number> = {};
  items.forEach((i) => { counts[i.name] = (counts[i.name] || 0) + i.qty; });
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return entries.length ? `${entries[0][0]} (${entries[0][1]}×)` : '';
}

function KitchenCard({ order, workflowMode, expanded, onToggle, onDone, onRevert, criticalThreshold }: {
  order: Order;
  workflowMode: WorkflowMode;
  expanded: boolean;
  onToggle: () => void;
  onDone?: (o: Order) => void;
  onRevert?: (o: Order) => void;
  criticalThreshold: number;
}) {
  const min = waitMinutesFrozen(order);
  const isReady = order.status === 'done';
  const isUrgent = !isReady && min >= criticalThreshold;
  const isRed = !isReady && min >= 10;
  const isOrange = !isReady && min >= 8;
  const isYellow = !isReady && min >= 5;

  const ring = isReady
    ? 'border-sky-500/50 bg-sky-500/[0.03]'
    : isUrgent ? 'border-red-500/60 bg-red-500/[0.05] animate-urgent'
    : isRed ? 'border-red-500/40'
    : isOrange ? 'border-amber-500/40'
    : isYellow ? 'border-yellow-500/30'
    : 'border-white/[0.06]';

  const minColor = isReady ? 'text-sky-400'
    : isUrgent ? 'text-red-400'
    : isRed ? 'text-red-400'
    : isOrange ? 'text-amber-400'
    : isYellow ? 'text-yellow-400'
    : 'text-white/50';

  return (
    <div className={`card border ${ring} overflow-hidden`}>
      <button onClick={onToggle} className="w-full p-3 text-left">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-bold text-white font-mono">#{order.num}</span>
            <span className="text-xs text-white/60">Tafel: {order.table_name}</span>
            <span className="text-xs text-white/60">Ober: {order.waiter}</span>
          </div>
          <div className={`text-base font-bold flex items-center gap-1 ${minColor}`}>
            <Clock size={14} />
            <span className="font-mono">{min}m</span>
            {isReady && <span className="text-xs">⏸</span>}
          </div>
        </div>
        {isUrgent && (
          <div className="flex items-center gap-1 text-red-400 text-xs font-semibold mt-1.5">
            <AlertTriangle size={12} /> Wacht al {min} minuten — dringend
          </div>
        )}
      </button>

      {expanded && (
        <div className="px-3 pb-3 flex flex-col gap-2.5 border-t border-white/[0.04] pt-2">
          <div className="flex flex-col gap-1">
            {order.items.map((it, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <span className="bg-white/[0.08] rounded px-1.5 py-0.5 text-xs font-mono font-bold">{it.qty}×</span>
                <span className="text-white/90">{it.name}</span>
              </div>
            ))}
            {order.note && <p className="text-amber-400 text-xs italic mt-0.5">⚠ {order.note}</p>}
          </div>

          {onDone && order.status === 'pending' && (
            <button onClick={() => onDone(order)} className="btn-primary py-2.5 text-sm font-semibold flex items-center justify-center gap-1.5">
              <CheckCircle2 size={16} /> {advanceLabel(order.status, workflowMode)}
            </button>
          )}
          {isReady && (
            <div className="flex flex-col gap-2">
              <p className="text-sky-400 text-xs text-center font-semibold py-1">Wacht op ober</p>
              {onRevert && (
                <button onClick={() => onRevert(order)} className="btn-ghost py-2 text-xs flex items-center justify-center gap-1">
                  <RotateCcw size={12} /> Terug naar {statusLabel('pending', workflowMode)}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
