import { useState, useEffect, useMemo } from 'react';
import { LogOut, Plus, Search, History, BarChart3, ArrowLeft, MoreVertical, AlertTriangle, User } from 'lucide-react';
import type { Session, Product, Order, OrderItem, WorkflowMode } from '../lib/types';
import { fetchProducts, fetchOrders, createOrder, updateOrderStatus, updateOrder } from '../lib/db';
import { OrderCard, type TimerThresholds } from '../components/OrderCard';
import { Stats } from '../components/Stats';
import { EditOrderModal, CancelModal, DetailsModal } from '../components/OrderModals';
import { useToast } from '../components/Toast';
import { StatusDot, EmptyState } from '../components/ui';
import { fmtEUR, statusLabel, nextStatus, prevStatus } from '../lib/utils';
import { supabase } from '../lib/supabase';
import { NewOrder } from './NewOrder';

type View = 'main' | 'new' | 'search' | 'history' | 'stats';
type ConnStatus = 'online' | 'sync' | 'offline';

interface Props {
  session: Session;
  waiterName: string;
  onLeave: () => void;
  connStatus: ConnStatus;
}

export function WaiterDashboard({ session, waiterName, onLeave, connStatus }: Props) {
  const { push } = useToast();
  const workflowMode: WorkflowMode = session.workflow_mode ?? '2-step';
  const timers: TimerThresholds = {
    yellow: session.timer_yellow ?? 5,
    orange: session.timer_orange ?? 8,
    red: session.timer_red ?? 10,
    critical: session.timer_critical ?? 15,
  };
  const [view, setView] = useState<View>('main');
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [editOrder, setEditOrder] = useState<Order | null>(null);
  const [cancelOrder, setCancelOrder] = useState<Order | null>(null);
  const [detailsOrder, setDetailsOrder] = useState<Order | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [q, setQ] = useState('');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [skipConfirm, setSkipConfirm] = useState<Order | null>(null);
  const toggleExpanded = (id: string) => setExpandedIds((s) => { const n = new Set(s); if (n.has(id)) { n.delete(id); } else { n.add(id); } return n; });

  async function refresh() {
    try {
      const [ps, os] = await Promise.all([fetchProducts(session.id), fetchOrders(session.id)]);
      setProducts(ps); setOrders(os);
    } catch {}
  }
  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, [session.id]);

  useEffect(() => {
    const ch = supabase.channel(`klj-waiter-${session.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'klj_orders', filter: `session_id=eq.${session.id}` }, () => refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'klj_products', filter: `session_id=eq.${session.id}` }, () => refresh())
      .subscribe();
    return () => { ch.unsubscribe(); };
    // eslint-disable-next-line
  }, [session.id]);

  const myOrders = useMemo(() => orders.filter((o) => o.waiter === waiterName), [orders, waiterName]);

  // In 1-step mode: pending = "Verzonden", done = "Gemaakt" (ready for ober to complete)
  // In 2-step mode: pending = "Keuken ontvangen", done = "Keuken klaar" (ready for ober to complete)
  const receivedOrders = useMemo(() =>
    orders.filter((o) => o.status === 'pending').sort((a, b) => a.created_at.localeCompare(b.created_at)),
    [orders]);
  const readyOrders = useMemo(() =>
    workflowMode === '1-step' ? [] : orders.filter((o) => o.status === 'done').sort((a, b) => (b.completed_at || '').localeCompare(a.completed_at || '')),
    [orders, workflowMode]);
  const completedOrders = useMemo(() =>
    orders.filter((o) => o.status === 'completed').sort((a, b) =>
      (b.picked_up_at || b.updated_at).localeCompare(a.picked_up_at || a.updated_at)),
    [orders]);

  async function submitOrder(table: string, items: OrderItem[], note?: string) {
    const o = await createOrder(session.id, table, waiterName, items, session.vakje_value, note);
    push(`Bestelling #${o.num || '(lokaal)'} verzonden`, 'success');
    setView('main');
    refresh();
  }

  // Waiter can ALWAYS advance an order — even if kitchen forgot to mark done (noodoplossing).
  // But if the kitchen hasn't finished yet (status pending), show a clear skip-warning first.
  function handleAdvance(o: Order) {
    const next = nextStatus(o.status, workflowMode);
    if (next === null) return;
    if (o.status === 'pending') {
      setSkipConfirm(o);
      return;
    }
    void doAdvance(o);
  }

  async function doAdvance(o: Order) {
    const next = nextStatus(o.status, workflowMode);
    if (next === null) return;
    await updateOrderStatus(o.id, next, undefined, session.id);
    push(`#${o.num} → ${statusLabel(next, workflowMode)}`, 'success');
    refresh();
  }

  async function confirmSkip() {
    if (!skipConfirm) return;
    const next = nextStatus(skipConfirm.status, workflowMode);
    if (next) {
      await updateOrderStatus(skipConfirm.id, next, undefined, session.id);
      push(`#${skipConfirm.num} overgeslagen naar ${statusLabel(next, workflowMode)}`, 'info');
    }
    setSkipConfirm(null);
    refresh();
  }

  async function handleRevert(o: Order) {
    const prev = prevStatus(o.status, workflowMode);
    if (prev === null) return;
    await updateOrderStatus(o.id, prev, undefined, session.id);
    push(`#${o.num} → ${statusLabel(prev, workflowMode)} (teruggezet)`, 'info');
    refresh();
  }

  async function handleCancel(o: Order, reason: string) {
    await updateOrderStatus(o.id, 'cancelled', reason, session.id);
    setCancelOrder(null);
    push(`#${o.num} geannuleerd`, 'info');
    refresh();
  }

  async function handleEditSave(items: OrderItem[], note?: string) {
    if (!editOrder) return;
    const total = items.reduce((s, i) => s + i.price * i.qty, 0);
    const vakjes = items.reduce((s, i) => s + Math.round(i.price / session.vakje_value) * i.qty, 0);
    await updateOrder(editOrder.id, { items, total, vakjes, note: note || null });
    setEditOrder(null); push('Aangepast'); refresh();
  }

  if (view === 'new') return <NewOrder products={products} vakjeValue={session.vakje_value} waiter={waiterName} onBack={() => setView('main')} onSubmit={submitOrder} />;

  const searchResults = q.trim() ? orders.filter((o) => {
    const s = q.toLowerCase();
    return String(o.num).includes(s) || o.table_name.toLowerCase().includes(s) || o.waiter.toLowerCase().includes(s) || o.status.includes(s) || o.items.some((i) => i.name.toLowerCase().includes(s));
  }) : orders;

  // Section labels depend on workflow mode
  const readyLabel = workflowMode === '1-step' ? 'Gemaakt — af te halen' : 'Keuken klaar — af te halen';
  const receivedLabel = workflowMode === '1-step' ? 'Verzonden' : 'Keuken ontvangen';

  return (
    <div className="min-h-full flex flex-col">
      <header className="sticky top-0 z-30 bg-[#0a0d12]/95 backdrop-blur border-b border-white/[0.06]">
        <div className="max-w-5xl mx-auto px-3 py-2.5 flex items-center gap-2">
          {view !== 'main' && <button onClick={() => setView('main')} className="btn-ghost px-2 py-1.5"><ArrowLeft size={16} /></button>}
          <div className="flex-1 min-w-0">
            <h1 className="font-bold text-sm text-white truncate">{waiterName}</h1>
            <p className="text-white/40 text-xs truncate">{session.event_name} · <span className="font-mono">{session.code}</span></p>
          </div>
          <StatusDot status={connStatus} />
          {view === 'main' ? (
            <div className="relative">
              <button onClick={() => setMoreOpen((v) => !v)} className="btn-ghost p-1.5"><MoreVertical size={16} /></button>
              {moreOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setMoreOpen(false)} />
                  <div className="absolute right-0 top-full mt-1 z-50 card p-1.5 flex flex-col gap-0.5 min-w-[180px]">
                    <MoreBtn icon={<Search size={14} />} label="Zoeken" onClick={() => { setView('search'); setMoreOpen(false); }} />
                    <MoreBtn icon={<History size={14} />} label="Laatste" onClick={() => { setView('history'); setMoreOpen(false); }} />
                    <MoreBtn icon={<BarChart3 size={14} />} label="Mijn statistieken" onClick={() => { setView('stats'); setMoreOpen(false); }} />
                    <div className="border-t border-white/[0.06] my-1" />
                    <MoreBtn icon={<LogOut size={14} />} label="Uitloggen" onClick={onLeave} danger />
                  </div>
                </>
              )}
            </div>
          ) : (
            <button onClick={onLeave} className="btn-ghost p-1.5"><LogOut size={16} /></button>
          )}
        </div>
      </header>

      <main className="flex-1 max-w-5xl mx-auto w-full p-3 pb-24">
        {view === 'main' && (
          <div className="grid md:grid-cols-3 gap-3">
            {/* Ready — top priority, ober can complete (Mode 2 only) */}
            {workflowMode !== '1-step' && (
            <section>
              <h2 className="section-title mb-2 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-sky-400" /> {readyLabel} ({readyOrders.length})
              </h2>
              <div className="flex flex-col gap-2">
                {readyOrders.map((o) => (
                  <OrderCard
                    key={o.id}
                    order={o}
                    workflowMode={workflowMode}
                    timers={timers}
                    expanded={expandedIds.has(o.id)}
                    onToggle={() => toggleExpanded(o.id)}
                    onAdvance={handleAdvance}
                    onRevert={handleRevert}
                    onDetails={setDetailsOrder}
                    onPrint={(o) => push('Print niet beschikbaar op ober', 'info')}
                    showRevert
                  />
                ))}
                {readyOrders.length === 0 && <p className="text-white/30 text-xs">Niets klaar om af te halen.</p>}
              </div>
            </section>
            )}

            {/* Received / Sent */}
            <section>
              <h2 className="section-title mb-2 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> {receivedLabel} ({receivedOrders.length})
              </h2>
              <div className="flex flex-col gap-2">
                {receivedOrders.map((o) => (
                  <div key={o.id} className="flex flex-col gap-1">
                    {o.kitchen_claimed_by && (
                      <span className="badge bg-sky-500/15 text-sky-400 self-start text-[10px]"><User size={9} /> Bezig: {o.kitchen_claimed_by}</span>
                    )}
                    <OrderCard
                      key={o.id}
                      order={o}
                      workflowMode={workflowMode}
                      timers={timers}
                      expanded={expandedIds.has(o.id)}
                      onToggle={() => toggleExpanded(o.id)}
                      onAdvance={handleAdvance}
                      onEdit={setEditOrder}
                      onRevert={handleRevert}
                      onDetails={setDetailsOrder}
                      showRevert
                  />
                  </div>
                ))}
                {receivedOrders.length === 0 && <p className="text-white/30 text-xs">Geen bestellingen wachten.</p>}
              </div>
            </section>

            {/* Completed */}
            <section>
              <h2 className="section-title mb-2 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-white/30" /> Afgerond ({completedOrders.length})
              </h2>
              <div className="flex flex-col gap-2">
                {completedOrders.slice(0, 15).map((o) => (
                  <OrderCard
                    key={o.id}
                    order={o}
                    workflowMode={workflowMode}
                    timers={timers}
                    expanded={expandedIds.has(o.id)}
                    onToggle={() => toggleExpanded(o.id)}
                    onRevert={handleRevert}
                    onDetails={setDetailsOrder}
                    showRevert
                    compact
                  />
                ))}
                {completedOrders.length === 0 && <p className="text-white/30 text-xs">Nog niets afgerond.</p>}
              </div>
            </section>
          </div>
        )}

        {view === 'search' && (
          <div className="flex flex-col gap-2">
            <input className="input" placeholder="Zoek op ordernr, tafel, ober, product..." value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
            {searchResults.slice(0, 50).map((o) => (
              <OrderCard
                key={o.id}
                order={o}
                workflowMode={workflowMode}
                timers={timers}
                expanded={expandedIds.has(o.id)}
                onToggle={() => toggleExpanded(o.id)}
                onDetails={setDetailsOrder}
                onEdit={setEditOrder}
                onRevert={handleRevert}
                onAdvance={handleAdvance}
                onCancel={(o) => setCancelOrder(o)}
                showRevert
              />
            ))}
            {searchResults.length === 0 && <EmptyState title="Geen resultaten" />}
          </div>
        )}

        {view === 'history' && (
          <div className="flex flex-col gap-2">
            <h2 className="section-title">Mijn laatste bestellingen</h2>
            {myOrders.slice(0, 30).map((o) => (
              <OrderCard
                key={o.id}
                order={o}
                workflowMode={workflowMode}
                timers={timers}
                expanded={expandedIds.has(o.id)}
                onToggle={() => toggleExpanded(o.id)}
                onDetails={setDetailsOrder}
                onRevert={handleRevert}
                showRevert
              />
            ))}
            {myOrders.length === 0 && <EmptyState title="Nog geen bestellingen" />}
          </div>
        )}

        {view === 'stats' && (
          <div className="flex flex-col gap-3">
            <div className="card p-3">
              <p className="label">Jouw omzet</p>
              <p className="text-2xl font-bold text-emerald-400">{fmtEUR(myOrders.filter((o) => o.status === 'completed').reduce((s, o) => s + Number(o.total), 0))}</p>
            </div>
            <Stats orders={myOrders} />
          </div>
        )}
      </main>

      {view === 'main' && (
        <div className="fixed bottom-0 left-0 right-0 z-20 bg-[#0a0d12]/95 backdrop-blur border-t border-white/[0.06] p-2.5">
          <div className="max-w-5xl mx-auto">
            <button onClick={() => setView('new')} className="btn-primary w-full py-3 text-sm font-semibold flex items-center justify-center gap-2 active:scale-[0.98] transition">
              <Plus size={20} /> Nieuwe bestelling
            </button>
          </div>
        </div>
      )}

      {editOrder && <EditOrderModal order={editOrder} products={products} vakjeValue={session.vakje_value} onClose={() => setEditOrder(null)} onSave={handleEditSave} onCancel={(o) => { setEditOrder(null); setCancelOrder(o); }} />}
      {cancelOrder && <CancelModal order={cancelOrder} onClose={() => setCancelOrder(null)} onConfirm={(reason) => handleCancel(cancelOrder, reason)} />}
      {detailsOrder && <DetailsModal order={detailsOrder} vakjeValue={session.vakje_value} onClose={() => setDetailsOrder(null)} />}

      {/* Keuken-overslaan waarschuwing */}
      {skipConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="card w-full max-w-md p-6 animate-pop">
            <div className="flex items-center justify-center mb-4">
              <div className="w-14 h-14 rounded-full bg-amber-500/15 text-amber-400 flex items-center justify-center"><AlertTriangle size={28} /></div>
            </div>
            <h3 className="text-lg font-bold text-white text-center mb-2">Keuken overslaan?</h3>
            <p className="text-white/60 text-sm text-center mb-6">
              De keuken heeft deze bestelling nog niet afgerond.
              <br />Ben je zeker dat je deze stap wilt overslaan?
              <br /><span className="text-white/40 text-xs">Bestelling #{skipConfirm.num} (tafel {skipConfirm.table_name}) → {statusLabel(nextStatus(skipConfirm.status, workflowMode)!, workflowMode)}</span>
            </p>
            <div className="flex gap-2">
              <button onClick={() => setSkipConfirm(null)} className="btn-ghost flex-1 py-3 text-sm">Annuleren</button>
              <button onClick={confirmSkip} className="btn-warn flex-1 py-3 text-sm">Ja, overslaan</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MoreBtn({ icon, label, onClick, danger }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick} className={`flex items-center gap-2.5 px-2.5 py-2 rounded-md text-xs text-left transition hover:bg-white/[0.06] ${danger ? 'text-red-400' : 'text-white/80'}`}>
      {icon} {label}
    </button>
  );
}
