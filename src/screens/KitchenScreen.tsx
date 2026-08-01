import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { LogOut, Clock, AlertTriangle, CheckCircle2, Bell, Flame, TrendingUp, Package, RotateCcw, User, Inbox, Wine } from 'lucide-react';
import type { Session, Order, WorkflowMode, KitchenSession, Product, OrderItem } from '../lib/types';
import { fetchOrders, updateOrderStatus, fetchKitchenSessions, upsertKitchenSession, heartbeatKitchenSession, claimOrder, releaseClaim, removeKitchenSession, cleanupStaleClaims, requestPrint, fetchProducts, createOrder } from '../lib/db';
import { fmtTime, waitMinutesFrozen, statusLabel, prevStatus, playNotificationSound, isAudioUnlocked, unlockAudio } from '../lib/utils';
import { useToast } from '../components/Toast';
import { supabase } from '../lib/supabase';
import { KitchenOrderView } from '../components/KitchenOrderView';
import { NotificationBell } from '../components/NotificationBell';
import { showNotification } from '../lib/notifications';
import { BarOrderModal } from '../components/BarOrderModal';

interface Props {
  session: Session;
  workerName: string;
  workerSessionId: string;
  onLeave: () => void;
}

export function KitchenScreen({ session, workerName, workerSessionId, onLeave }: Props) {
  const { push } = useToast();
  const workflowMode: WorkflowMode = session.workflow_mode ?? '2-step';
  const [orders, setOrders] = useState<Order[]>([]);
  const [workers, setWorkers] = useState<KitchenSession[]>([]);
  const [openOrderId, setOpenOrderId] = useState<string | null>(null);
  const [takeoverPrompt, setTakeoverPrompt] = useState<{ order: Order; by: string } | null>(null);
  const [exitConfirm, setExitConfirm] = useState(false);
  const [showBarOrder, setShowBarOrder] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const seenIdsRef = useRef<Set<string>>(new Set());

  const refresh = useCallback(async () => {
    try {
      const [os, ws] = await Promise.all([fetchOrders(session.id), fetchKitchenSessions(session.id)]);
      setOrders(os);
      setWorkers(ws);
    } catch { /* ignore */ }
  }, [session.id]);

  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, [session.id]);

  // Producten ophalen voor bar-bestellingen
  useEffect(() => {
    fetchProducts(session.id).then(setProducts).catch(() => {});
  }, [session.id]);

  // Realtime: orders + kitchen sessions
  useEffect(() => {
    const ch = supabase.channel(`klj-kitchen-${session.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'klj_orders', filter: `session_id=eq.${session.id}` }, () => refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'klj_kitchen_sessions', filter: `session_id=eq.${session.id}` }, () => refresh())
      .subscribe();
    return () => { ch.unsubscribe(); };
    // eslint-disable-next-line
  }, [session.id]);

  // Presence: upsert + heartbeat elke 5s + stale cleanup elke 8s
  useEffect(() => {
    upsertKitchenSession(session.id, workerSessionId, workerName).catch(() => {});
    const hb = window.setInterval(() => heartbeatKitchenSession(workerSessionId).catch(() => {}), 5000);
    const cleanup = window.setInterval(() => cleanupStaleClaims().catch(() => {}), 8000);
    const onUnload = () => {
      try {
        const xhr = new XMLHttpRequest();
        xhr.open('PATCH', `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/klj_kitchen_sessions?worker_session_id=eq.${workerSessionId}`, false);
        xhr.setRequestHeader('apikey', import.meta.env.VITE_SUPABASE_ANON_KEY);
        xhr.setRequestHeader('Authorization', `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`);
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.send(JSON.stringify({ last_heartbeat_at: new Date(Date.now() - 60000).toISOString() }));
      } catch { /* ignore */ }
    };
    window.addEventListener('beforeunload', onUnload);
    return () => {
      window.clearInterval(hb);
      window.clearInterval(cleanup);
      window.removeEventListener('beforeunload', onUnload);
    };
    // eslint-disable-next-line
  }, []);

  // Nieuwe bestelling => geluid + toast + native notificatie
  useEffect(() => {
    const newPending = orders.filter((o) => o.status === 'pending' && !seenIdsRef.current.has(o.id));
    if (seenIdsRef.current.size > 0 && newPending.length > 0) {
      push(`Nieuwe bestelling #${newPending[0].num}`, 'success');
      playNotificationSound(session.sound_type ?? 'beep', session.sound_url);
      const first = newPending[0];
      void showNotification(
        `Nieuwe bestelling #${first.num}`,
        newPending.length > 1 ? `${newPending.length} nieuwe bestellingen binnengekomen` : `Tafel ${first.table_name} — ${first.waiter}`,
        'klj-kitchen-order',
      );
    }
    seenIdsRef.current = new Set(orders.map((o) => o.id));
    // eslint-disable-next-line
  }, [orders]);

  const criticalThreshold = session.timer_critical ?? 15;

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

  const openOrder = useMemo(() => orders.find((o) => o.id === openOrderId) ?? null, [orders, openOrderId]);

  // Wie is waarmee bezig (claim badges)
  const myClaimedOrder = orders.find((o) => o.kitchen_claimed_session_id === workerSessionId) ?? null;
  const busyWorkers = workers.filter((w) => w.current_order_id && w.worker_session_id !== workerSessionId);
  const nobodyBusy = workers.length > 0 && workers.every((w) => !w.current_order_id);
  const pendingUnclaimed = pending.filter((o) => !o.kitchen_claimed_session_id);

  // Een bestelling openen => claimen of overname-venster
  async function handleOpen(o: Order) {
    // Reeds door mij geclaimd? Direct openen
    if (o.kitchen_claimed_session_id === workerSessionId) {
      setOpenOrderId(o.id);
      return;
    }
    // Geclaimd door andere actieve medewerker? Overname-venster
    if (o.kitchen_claimed_by && o.kitchen_claimed_session_id) {
      const other = workers.find((w) => w.worker_session_id === o.kitchen_claimed_session_id);
      const age = other ? Date.now() - new Date(other.last_heartbeat_at).getTime() : Infinity;
      if (age < 15000) {
        setTakeoverPrompt({ order: o, by: o.kitchen_claimed_by });
        return;
      }
    }
    // Vrij: claimen en openen
    try {
      const res = await claimOrder(session.id, o.id, workerSessionId, workerName, false);
      if (res.ok) {
        setOpenOrderId(o.id);
        refresh();
      } else if (res.claimedBy) {
        setTakeoverPrompt({ order: o, by: res.claimedBy });
      }
    } catch (e: any) {
      push(`Kon bestelling niet openen: ${e?.message || 'onbekende fout'}`, 'error');
    }
  }

  async function confirmTakeover() {
    if (!takeoverPrompt) return;
    const res = await claimOrder(session.id, takeoverPrompt.order.id, workerSessionId, workerName, true);
    if (res.ok) {
      setOpenOrderId(takeoverPrompt.order.id);
      push(`Bestelling #${takeoverPrompt.order.num} overgenomen`, 'info');
    }
    setTakeoverPrompt(null);
    refresh();
  }

  // Twee-staps: Klaar -> Bevestig klaar -> afronden
  // De bon wordt pas geprint wanneer de keuken op "Klaar" drukt
  async function handleConfirmReady() {
    if (!openOrder) return;
    if (workflowMode === '1-step') {
      // Mode 1: keuken bevestigt => direct completed (Verzonden -> Afgerond)
      await updateOrderStatus(openOrder.id, 'completed', undefined, session.id);
      await releaseClaim(workerSessionId);
      requestPrint(session.id, openOrder.id, openOrder.num, workerName).catch(() => {});
      push(`Bestelling #${openOrder.num} afgerond`, 'success');
    } else {
      // Mode 2: keuken klaar => done, wacht op ober "Afgehaald"
      await updateOrderStatus(openOrder.id, 'done', undefined, session.id);
      requestPrint(session.id, openOrder.id, openOrder.num, workerName).catch(() => {});
      push(`Bestelling #${openOrder.num} klaar`, 'success');
    }
    refresh();
  }

  async function handleRevert(o: Order) {
    const prev = prevStatus(o.status, workflowMode);
    if (prev === null) return;
    await updateOrderStatus(o.id, prev, undefined, session.id);
    push(`#${o.num} → ${statusLabel(prev, workflowMode)} (teruggezet)`, 'info');
    refresh();
  }

  async function handleExit() {
    setExitConfirm(false);
    await removeKitchenSession(workerSessionId);
    onLeave();
  }

  async function handleCloseView() {
    await releaseClaim(workerSessionId);
    setOpenOrderId(null);
    refresh();
  }

  async function handleBarOrderSubmit(items: OrderItem[], note?: string) {
    const order = await createOrder(session.id, 'Bar', workerName, items, session.vakje_value, note);
    // Bar-bestellingen gaan direct naar completed — ze hoeven niet gemaakt te worden
    await updateOrderStatus(order.id, 'completed', undefined, session.id);
    push(`Bar bestelling #${order.num} toegevoegd`, 'success');
    refresh();
  }

  const activeLabel = 'Te maken';
  const readyLabel = 'Keuken klaar — wacht op ober';

  return (
    <div className="min-h-full flex flex-col">
      <header className="sticky top-0 z-30 bg-[#0a0d12]/95 backdrop-blur border-b border-white/[0.06]">
        <div className="max-w-6xl mx-auto px-3 py-2.5 flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <h1 className="font-bold text-sm text-white flex items-center gap-1.5">
              <Flame size={16} className="text-amber-400" /> Keuken · {workerName}
            </h1>
            <p className="text-white/40 text-xs truncate">{session.event_name} · <span className="font-mono">{session.code}</span></p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <NotificationBell compact onEnabled={() => push('Meldingen ingeschakeld', 'success')} />
            {/* Bezig-met badges */}
            {myClaimedOrder && <span className="badge bg-sky-500/15 text-sky-400"><User size={10} /> Bezig: jij</span>}
            {busyWorkers.map((w) => (
              <span key={w.worker_session_id} className="badge bg-white/[0.06] text-white/60"><User size={10} /> Bezig: {w.name}</span>
            ))}
            {pending.length > 0 && <span className="badge bg-emerald-500/15 text-emerald-400"><Bell size={10} /> {pending.length} nieuw</span>}
            {ready.length > 0 && <span className="badge bg-sky-500/15 text-sky-400">{ready.length} klaar</span>}

            <button onClick={() => setShowBarOrder(true)} className="btn-primary px-2.5 py-1.5 text-xs flex items-center gap-1.5">
              <Wine size={14} /> Bar bestelling
            </button>
            <button onClick={() => setExitConfirm(true)} className="btn-ghost px-2.5 py-1.5 text-red-400 flex items-center gap-1.5 text-xs">
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
      </header>

      {/* Opvallende melding: niemand bezig + nieuwe bestellingen */}
      {pendingUnclaimed.length > 0 && nobodyBusy && (
        <div className="bg-amber-500 text-amber-950 px-3 py-3 animate-slideup">
          <div className="max-w-6xl mx-auto flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-amber-700 text-white flex items-center justify-center shrink-0 animate-pulse"><Bell size={20} /></div>
            <div className="flex-1">
              <p className="text-xl font-black leading-tight">{pendingUnclaimed.length} nieuwe bestelling{pendingUnclaimed.length > 1 ? 'en' : ''} wacht{pendingUnclaimed.length > 1 ? 'en' : ''}!</p>
              <p className="font-semibold text-amber-900/80 text-sm">Niemand is momenteel bezig — pak er eentje op.</p>
            </div>
          </div>
        </div>
      )}

      <main className="flex-1 max-w-6xl mx-auto w-full p-3 flex flex-col gap-4">
        {/* Jouw bestelling */}
        {myClaimedOrder && myClaimedOrder.status !== 'completed' && (
          <section>
            <h2 className="section-title mb-2 text-sky-400">Jouw bestelling</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
              <KitchenCard key={myClaimedOrder.id} order={myClaimedOrder} workflowMode={workflowMode} onOpen={() => handleOpen(myClaimedOrder)} onRevert={handleRevert} criticalThreshold={criticalThreshold} mine />
            </div>
          </section>
        )}

        {/* Te maken */}
        <section>
          <h2 className="section-title mb-2">{activeLabel} ({pending.length})</h2>
          {pending.length === 0 ? (
            <div className="card border border-dashed border-white/[0.08] p-8 text-center text-white/30">
              <Inbox size={32} className="mx-auto mb-2 opacity-50" />
              <p className="text-xs">Geen bestellingen wachten.</p>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {pending.map((o) => (
                <KitchenCard key={o.id} order={o} workflowMode={workflowMode} onOpen={() => handleOpen(o)} criticalThreshold={criticalThreshold} workerSessionId={workerSessionId} />
              ))}
            </div>
          )}
        </section>

        {/* Klaar - wacht op ober (Mode 2) */}
        {ready.length > 0 && (
          <section>
            <h2 className="section-title mb-2 text-sky-400">{readyLabel} ({ready.length})</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {ready.map((o) => (
                <KitchenCard key={o.id} order={o} workflowMode={workflowMode} onOpen={() => handleOpen(o)} onRevert={handleRevert} criticalThreshold={criticalThreshold} workerSessionId={workerSessionId} />
              ))}
            </div>
          </section>
        )}

        {/* Afgerond */}
        {completed.length > 0 && (
          <section>
            <h2 className="section-title mb-2">Afgerond ({completed.length})</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
              {completed.slice(0, 60).map((o) => (
                <div key={o.id} className="card p-2.5 opacity-70">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-white font-mono">#{o.num}</span>
                    <span className="text-xs text-white/40">{fmtTime(o.picked_up_at || o.updated_at)}</span>
                  </div>
                  <p className="text-white/40 text-[10px] mt-1">Tafel: {o.table_name}</p>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>

      {/* Full-screen order view */}
      {openOrder && (
        <KitchenOrderView
          order={openOrder}
          workerName={workerName}
          workflowMode={workflowMode}
          claimedByOther={openOrder.kitchen_claimed_session_id !== workerSessionId ? (openOrder.kitchen_claimed_by ?? null) : null}
          onClose={handleCloseView}
          onTakeover={async () => {
            if (openOrder.kitchen_claimed_session_id !== workerSessionId) {
              await claimOrder(session.id, openOrder.id, workerSessionId, workerName, true);
              push(`Bestelling #${openOrder.num} overgenomen`, 'info');
              refresh();
            }
          }}
          onConfirmReady={handleConfirmReady}
        />
      )}

      {/* Takeover prompt */}
      {takeoverPrompt && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="card w-full max-w-md p-6 animate-pop">
            <div className="flex items-center justify-center mb-4">
              <div className="w-14 h-14 rounded-full bg-amber-500/15 text-amber-400 flex items-center justify-center"><AlertTriangle size={28} /></div>
            </div>
            <h3 className="text-lg font-bold text-white text-center mb-2">Bestelling overnemen?</h3>
            <p className="text-white/60 text-sm text-center mb-6">
              <strong className="text-amber-400">{takeoverPrompt.by}</strong> is momenteel bezig met deze bestelling.
              <br />Ben je zeker dat je deze bestelling wilt overnemen?
            </p>
            <div className="flex gap-2">
              <button onClick={() => setTakeoverPrompt(null)} className="btn-ghost flex-1 py-3 text-sm">Annuleren</button>
              <button onClick={confirmTakeover} className="btn-warn flex-1 py-3 text-sm">Overnemen</button>
            </div>
          </div>
        </div>
      )}

      {/* Bar order modal */}
      {showBarOrder && (
        <BarOrderModal
          products={products}
          vakjeValue={session.vakje_value}
          workerName={workerName}
          onClose={() => setShowBarOrder(false)}
          onSubmit={handleBarOrderSubmit}
        />
      )}

      {/* Exit confirm */}
      {exitConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="card w-full max-w-md p-6 animate-pop">
            <h3 className="text-lg font-bold text-white mb-2">Keuken verlaten?</h3>
            <p className="text-white/60 text-sm mb-6">Je claim wordt vrijgegeven en je wordt uitgelogd. Andere medewerkers kunnen je bestelling overnemen.</p>
            <div className="flex gap-2">
              <button onClick={() => setExitConfirm(false)} className="btn-ghost flex-1 py-3 text-sm">Annuleren</button>
              <button onClick={handleExit} className="btn-danger flex-1 py-3 text-sm">Verlaten</button>
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

function topItem(items: { name: string; qty: number }[]): string {
  const counts: Record<string, number> = {};
  items.forEach((i) => { counts[i.name] = (counts[i.name] || 0) + i.qty; });
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return entries.length ? `${entries[0][0]} (${entries[0][1]}×)` : '';
}

function KitchenCard({ order, workflowMode, onOpen, onRevert, criticalThreshold, mine, workerSessionId }: {
  order: Order;
  workflowMode: WorkflowMode;
  onOpen: () => void;
  onRevert?: (o: Order) => void;
  criticalThreshold: number;
  mine?: boolean;
  workerSessionId?: string;
}) {
  const min = waitMinutesFrozen(order);
  const isReady = order.status === 'done';
  const isUrgent = !isReady && min >= criticalThreshold;
  const claimedByOther = order.kitchen_claimed_by && order.kitchen_claimed_session_id !== workerSessionId;

  const ring = mine
    ? 'border-sky-500/50 bg-sky-500/[0.04]'
    : isReady
    ? 'border-sky-500/50 bg-sky-500/[0.03]'
    : claimedByOther
    ? 'border-white/[0.06] opacity-60'
    : isUrgent ? 'border-red-500/60 bg-red-500/[0.05] animate-urgent'
    : min >= 10 ? 'border-red-500/40'
    : min >= 8 ? 'border-amber-500/40'
    : min >= 5 ? 'border-yellow-500/30'
    : 'border-white/[0.06]';

  const minColor = isReady ? 'text-sky-400'
    : isUrgent ? 'text-red-400'
    : min >= 10 ? 'text-red-400'
    : min >= 8 ? 'text-amber-400'
    : min >= 5 ? 'text-yellow-400'
    : 'text-white/50';

  return (
    <button onClick={onOpen} className={`card border ${ring} p-3 text-left transition active:scale-[0.98]`}>
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-sm font-bold text-white font-mono">#{order.num}</span>
          <span className="text-xs text-white/60">Tafel: {order.table_name}</span>
        </div>
        <div className={`text-xs flex items-center gap-1 ${minColor}`}>
          <Clock size={12} /><span className="font-bold">{min}m</span>
        </div>
      </div>
      <div className="flex items-center gap-1.5 flex-wrap mb-2">
        <span className="text-xs text-white/60">Ober: {order.waiter}</span>
        {mine && <span className="badge bg-sky-500/15 text-sky-400 text-[10px]"><User size={9} /> Bezig: jij</span>}
        {claimedByOther && <span className="badge bg-white/[0.06] text-white/50 text-[10px]"><User size={9} /> {order.kitchen_claimed_by}</span>}
        {!order.kitchen_claimed_by && !isReady && <span className="badge bg-emerald-500/15 text-emerald-400 text-[10px]">Nieuw</span>}
        {isReady && <span className="badge bg-sky-500/15 text-sky-400 text-[10px]">Klaar</span>}
      </div>
      {isUrgent && <div className="flex items-center gap-1 text-red-400 text-xs font-semibold mb-2"><AlertTriangle size={12} /> Wacht al {min} min</div>}
      <div className="flex flex-col gap-0.5">
        {order.items.slice(0, 3).map((it, i) => (
          <div key={i} className="flex items-center gap-2 text-sm">
            <span className="bg-white/[0.08] rounded px-1.5 py-0.5 text-xs font-mono font-bold">{it.qty}×</span>
            <span className="text-white/90 truncate">{it.name}</span>
          </div>
        ))}
        {order.items.length > 3 && <span className="text-xs text-white/30 mt-0.5">+{order.items.length - 3} meer</span>}
      </div>
      {isReady && onRevert && (
        <button onClick={(e) => { e.stopPropagation(); onRevert(order); }} className="btn-ghost mt-2.5 w-full py-2 text-xs flex items-center justify-center gap-1">
          <RotateCcw size={12} /> Terug naar {statusLabel('pending', workflowMode)}
        </button>
      )}
    </button>
  );
}
