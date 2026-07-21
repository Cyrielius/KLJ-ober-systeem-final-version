import { useState, useEffect, useMemo } from 'react';
import { LogOut, Plus, Search, History, BarChart3, ArrowLeft, MoreVertical, CheckCircle2 } from 'lucide-react';
import type { Session, Product, TableConfig, Order, OrderItem } from '../lib/types';
import { fetchProducts, fetchTables, fetchOrders, createOrder, updateOrderStatus, updateOrder } from '../lib/db';
import { OrderCard, type TimerThresholds } from '../components/OrderCard';
import { Stats } from '../components/Stats';
import { EditOrderModal, CancelModal, DetailsModal } from '../components/OrderModals';
import { useToast } from '../components/Toast';
import { StatusDot, EmptyState } from '../components/ui';
import { fmtEUR } from '../lib/utils';
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
  const timers: TimerThresholds = {
    yellow: session.timer_yellow ?? 5,
    orange: session.timer_orange ?? 8,
    red: session.timer_red ?? 10,
    critical: session.timer_critical ?? 15,
  };
  const [view, setView] = useState<View>('main');
  const [products, setProducts] = useState<Product[]>([]);
  const [tables, setTables] = useState<TableConfig[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [editOrder, setEditOrder] = useState<Order | null>(null);
  const [cancelOrder, setCancelOrder] = useState<Order | null>(null);
  const [detailsOrder, setDetailsOrder] = useState<Order | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [q, setQ] = useState('');

  async function refresh() {
    try {
      const [ps, ts, os] = await Promise.all([fetchProducts(session.id), fetchTables(session.id), fetchOrders(session.id)]);
      setProducts(ps); setTables(ts); setOrders(os);
    } catch {}
  }
  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, [session.id]);

  useEffect(() => {
    const ch = supabase.channel(`klj-waiter-${session.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'klj_orders', filter: `session_id=eq.${session.id}` }, () => refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'klj_products', filter: `session_id=eq.${session.id}` }, () => refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'klj_tables', filter: `session_id=eq.${session.id}` }, () => refresh())
      .subscribe();
    return () => { ch.unsubscribe(); };
    // eslint-disable-next-line
  }, [session.id]);

  const myOrders = useMemo(() => orders.filter((o) => o.waiter === waiterName), [orders, waiterName]);
  const receivedOrders = useMemo(() => orders.filter((o) => o.status === 'pending').sort((a, b) => a.created_at.localeCompare(b.created_at)), [orders]);
  const readyOrders = useMemo(() => orders.filter((o) => o.status === 'done').sort((a, b) => (b.completed_at || '').localeCompare(a.completed_at || '')), [orders]);
  const completedOrders = useMemo(() => orders.filter((o) => o.status === 'completed').sort((a, b) => (b.picked_up_at || b.updated_at).localeCompare(a.picked_up_at || a.updated_at)), [orders]);

  async function submitOrder(table: string, items: OrderItem[], note?: string) {
    const o = await createOrder(session.id, table, waiterName, items, session.vakje_value, note);
    push(`Bestelling #${o.num || '(lokaal)'} verzonden`, 'success');
    setView('main');
    refresh();
  }
  async function handleComplete(o: Order) { await updateOrderStatus(o.id, 'completed'); push(`#${o.num} volledig afgewerkt`); refresh(); }
  async function handleCancel(o: Order, reason: string) { await updateOrderStatus(o.id, 'cancelled', reason); setCancelOrder(null); push(`#${o.num} geannuleerd`, 'info'); refresh(); }
  async function handleEditSave(items: OrderItem[], note?: string) {
    if (!editOrder) return;
    const total = items.reduce((s, i) => s + i.price * i.qty, 0);
    const vakjes = items.reduce((s, i) => s + Math.round(i.price / session.vakje_value) * i.qty, 0);
    await updateOrder(editOrder.id, { items, total, vakjes, note: note || null });
    setEditOrder(null); push('Aangepast'); refresh();
  }

  if (view === 'new') return <NewOrder products={products} tables={tables} vakjeValue={session.vakje_value} waiter={waiterName} onBack={() => setView('main')} onSubmit={submitOrder} />;

  const searchResults = q.trim() ? orders.filter((o) => {
    const s = q.toLowerCase();
    return String(o.num).includes(s) || o.table_name.toLowerCase().includes(s) || o.waiter.toLowerCase().includes(s) || o.status.includes(s) || o.items.some((i) => i.name.toLowerCase().includes(s));
  }) : orders;

  return (
    <div className="min-h-full flex flex-col">
      <header className="sticky top-0 z-30 bg-[#0b0f14]/95 backdrop-blur border-b border-white/5">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          {view !== 'main' && <button onClick={() => setView('main')} className="btn-ghost p-2"><ArrowLeft size={18} /></button>}
          <div className="flex-1 min-w-0">
            <h1 className="font-bold truncate">{waiterName}</h1>
            <p className="text-white/40 text-sm truncate">{session.event_name} · <span className="font-mono">{session.code}</span></p>
          </div>
          <StatusDot status={connStatus} />
          {view === 'main' ? (
            <div className="relative">
              <button onClick={() => setMoreOpen((v) => !v)} className="btn-ghost p-2"><MoreVertical size={18} /></button>
              {moreOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setMoreOpen(false)} />
                  <div className="absolute right-0 top-full mt-1 z-50 card p-2 flex flex-col gap-1 min-w-[180px]">
                    <MoreBtn icon={<Search size={16} />} label="Zoeken" onClick={() => { setView('search'); setMoreOpen(false); }} />
                    <MoreBtn icon={<History size={16} />} label="Laatste" onClick={() => { setView('history'); setMoreOpen(false); }} />
                    <MoreBtn icon={<BarChart3 size={16} />} label="Mijn statistieken" onClick={() => { setView('stats'); setMoreOpen(false); }} />
                    <div className="border-t border-white/10 my-1" />
                    <MoreBtn icon={<LogOut size={16} />} label="Uitloggen" onClick={onLeave} danger />
                  </div>
                </>
              )}
            </div>
          ) : (
            <button onClick={onLeave} className="btn-ghost p-2"><LogOut size={18} /></button>
          )}
        </div>
      </header>

      <main className="flex-1 max-w-5xl mx-auto w-full p-4 pb-28">
        {view === 'main' && (
          <div className="grid md:grid-cols-3 gap-5">
            {/* Klaar — bovenaan, direct af te halen */}
            <section>
              <h2 className="text-sky-400 text-sm uppercase tracking-wider mb-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-sky-400" /> Keuken afgewerkt ({readyOrders.length})
              </h2>
              <div className="flex flex-col gap-3">
                {readyOrders.map((o) => (
                  <OrderCard key={o.id} order={o} timers={timers} onComplete={handleComplete} onDetails={setDetailsOrder} defaultExpanded />
                ))}
                {readyOrders.length === 0 && <p className="text-white/30 text-sm">Niets klaar om af te halen.</p>}
              </div>
            </section>

            {/* Ontvangen */}
            <section>
              <h2 className="text-emerald-400 text-sm uppercase tracking-wider mb-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400" /> Keuken ontvangen ({receivedOrders.length})
              </h2>
              <div className="flex flex-col gap-3">
                {receivedOrders.map((o) => (
                  <OrderCard key={o.id} order={o} timers={timers} onEdit={setEditOrder} onDetails={setDetailsOrder} />
                ))}
                {receivedOrders.length === 0 && <p className="text-white/30 text-sm">Geen bestellingen wachten in de keuken.</p>}
              </div>
            </section>

            {/* Afgerond */}
            <section>
              <h2 className="text-white/50 text-sm uppercase tracking-wider mb-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-white/30" /> Volledig afgewerkt ({completedOrders.length})
              </h2>
              <div className="flex flex-col gap-3">
                {completedOrders.slice(0, 15).map((o) => (
                  <OrderCard key={o.id} order={o} timers={timers} onDetails={setDetailsOrder} compact />
                ))}
                {completedOrders.length === 0 && <p className="text-white/30 text-sm">Nog niets afgerond.</p>}
              </div>
            </section>
          </div>
        )}

        {view === 'search' && (
          <div className="flex flex-col gap-3">
            <input className="input" placeholder="Zoek op ordernr, tafel, ober, product..." value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
            {searchResults.slice(0, 50).map((o) => <OrderCard key={o.id} order={o} timers={timers} onDetails={setDetailsOrder} onEdit={setEditOrder} onCancel={setCancelOrder} onComplete={handleComplete} />)}
            {searchResults.length === 0 && <EmptyState title="Geen resultaten" />}
          </div>
        )}

        {view === 'history' && (
          <div className="flex flex-col gap-3">
            <h2 className="text-white/60 text-sm uppercase">Mijn laatste bestellingen</h2>
            {myOrders.slice(0, 30).map((o) => <OrderCard key={o.id} order={o} timers={timers} onDetails={setDetailsOrder} />)}
            {myOrders.length === 0 && <EmptyState title="Nog geen bestellingen" />}
          </div>
        )}

        {view === 'stats' && (
          <div className="flex flex-col gap-4">
            <div className="card p-4">
              <p className="text-white/40 text-xs uppercase">Jouw omzet</p>
              <p className="text-3xl font-bold text-emerald-400">{fmtEUR(myOrders.filter((o) => o.status === 'completed').reduce((s, o) => s + Number(o.total), 0))}</p>
            </div>
            <Stats orders={myOrders} />
          </div>
        )}
      </main>

      {view === 'main' && (
        <div className="fixed bottom-0 left-0 right-0 z-20 bg-[#0b0f14]/95 backdrop-blur border-t border-white/5 p-3">
          <div className="max-w-5xl mx-auto">
            <button onClick={() => setView('new')} className="btn-primary w-full py-4 text-lg font-semibold flex items-center justify-center gap-2 active:scale-[0.98] transition">
              <Plus size={24} /> Nieuwe bestelling
            </button>
          </div>
        </div>
      )}

      {editOrder && <EditOrderModal order={editOrder} products={products} vakjeValue={session.vakje_value} onClose={() => setEditOrder(null)} onSave={handleEditSave} onCancel={(o) => { setEditOrder(null); setCancelOrder(o); }} />}
      {cancelOrder && <CancelModal order={cancelOrder} onClose={() => setCancelOrder(null)} onConfirm={(reason) => handleCancel(cancelOrder, reason)} />}
      {detailsOrder && <DetailsModal order={detailsOrder} vakjeValue={session.vakje_value} onClose={() => setDetailsOrder(null)} />}
    </div>
  );
}

function MoreBtn({ icon, label, onClick, danger }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-left transition hover:bg-white/10 ${danger ? 'text-red-400' : 'text-white/80'}`}>
      {icon} {label}
    </button>
  );
}
