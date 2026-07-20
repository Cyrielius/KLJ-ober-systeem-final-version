import { useState, useEffect, useMemo } from 'react';
import { createRoot as ReactDOMCreateRoot } from 'react-dom/client';
import { LogOut, ListOrdered, UtensilsCrossed, BarChart3, Settings, Plus, Eye, EyeOff, Volume2, VolumeX, Download, Upload, ArrowUp, ArrowDown, Users, CheckCircle2, Smartphone, Flame } from 'lucide-react';
import type { Session, Product, TableConfig, Order, OrderItem } from '../lib/types';
import { fmtEUR, waitMinutes } from '../lib/utils';
import { fetchProducts, fetchTables, fetchOrders, updateOrderStatus, updateOrder, upsertProduct, deleteProduct, reorderProducts, upsertTable, deleteTable, updateSession } from '../lib/db';
import { OrderCard, type TimerThresholds } from '../components/OrderCard';
import { Stats } from '../components/Stats';
import { Modal } from '../components/Modal';
import { Receipt } from '../components/Receipt';
import { QRCode } from '../components/QRCode';
import { EditOrderModal, CancelModal, DetailsModal } from '../components/OrderModals';
import { ProductModal, TableModal, SettingsModal, UsersModal } from '../components/AdminModals';
import { useToast } from '../components/Toast';
import { StatusDot } from '../components/ui';

type Tab = 'orders' | 'products' | 'stats' | 'settings';
type ConnStatus = 'online' | 'sync' | 'offline';

interface Props {
  session: Session;
  onLeave: () => void;
  connStatus: ConnStatus;
}

export function HostDashboard({ session, onLeave, connStatus }: Props) {
  const { push } = useToast();
  const [tab, setTab] = useState<Tab>('orders');
  const [products, setProducts] = useState<Product[]>([]);
  const [tables, setTables] = useState<TableConfig[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [showPin, setShowPin] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [sound, setSound] = useState(true);
  const [editOrder, setEditOrder] = useState<Order | null>(null);
  const [cancelOrder, setCancelOrder] = useState<Order | null>(null);
  const [detailsOrder, setDetailsOrder] = useState<Order | null>(null);
  const [printOrder, setPrintOrder] = useState<Order | null>(null);
  const [productModal, setProductModal] = useState<{ open: boolean; product?: Product }>({ open: false });
  const [tableModal, setTableModal] = useState(false);
  const [settingsModal, setSettingsModal] = useState(false);
  const [usersModal, setUsersModal] = useState(false);
  const [knownOrderIds, setKnownOrderIds] = useState<Set<string>>(new Set());
  const [currentSession, setCurrentSession] = useState(session);

  const joinUrl = `${location.origin}/?code=${currentSession.code}`;

  const timers: TimerThresholds = {
    yellow: currentSession.timer_yellow ?? 5,
    orange: currentSession.timer_orange ?? 8,
    red: currentSession.timer_red ?? 10,
    critical: currentSession.timer_critical ?? 15,
  };

  const waiterNames = useMemo(() => Array.from(new Set(orders.map((o) => o.waiter))).sort(), [orders]);

  async function refresh() {
    try {
      const [ps, ts, os] = await Promise.all([fetchProducts(currentSession.id), fetchTables(currentSession.id), fetchOrders(currentSession.id)]);
      setProducts(ps); setTables(ts);
      setOrders((prev) => {
        const next = os;
        // detect new pending orders
        const prevIds = new Set(prev.map((o) => o.id));
        const fresh = next.filter((o) => !prevIds.has(o.id) && o.status === 'pending');
        if (fresh.length > 0 && prev.length > 0) {
          if (sound) playBeep();
          push(`${fresh.length} nieuwe bestelling(en)`, 'success');
          // Auto-print each newly arrived order, only if enabled by the host
          if (currentSession.auto_print !== false) fresh.forEach((o) => autoPrintReceipt(o));
        }
        return next;
      });
    } catch (e) { /* realtime will catch up */ }
  }

  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, [currentSession.id]);

  // Realtime subscription
  useEffect(() => {
    const ch = supabaseRealtime(currentSession.id, () => refresh());
    return () => { ch.unsubscribe(); };
    // eslint-disable-next-line
  }, [currentSession.id]);

  // Forgotten order alerts
  useEffect(() => {
    const t = setInterval(() => {
      const stale = orders.filter((o) => o.status === 'pending' && waitMinutes(o.created_at) >= timers.critical);
      if (stale.length > 0) {
        const ids = new Set(stale.map((o) => o.id));
        setKnownOrderIds((prev) => {
          const fresh = stale.filter((o) => !prev.has(o.id));
          if (fresh.length > 0) {
            push(`Mogelijk vergeten bestelling: #${fresh[0].num}`, 'error');
            return new Set([...prev, ...ids]);
          }
          return prev;
        });
      }
    }, 30000);
    return () => clearInterval(t);
  }, [orders, push, timers.critical]);

  // Auto-refresh: periodic + on tab focus. Realtime subscription handles live updates,
  // but this catches missed events (e.g. tab was backgrounded) so the host never sees stale data.
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    const t = setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, 20000);
    return () => { document.removeEventListener('visibilitychange', onVisible); window.removeEventListener('focus', onVisible); clearInterval(t); };
    // eslint-disable-next-line
  }, [currentSession.id]);

  const sortedOrders = useMemo(() => {
    const pending = orders.filter((o) => o.status === 'pending').sort((a, b) => {
      const wa = waitMinutes(a.created_at), wb = waitMinutes(b.created_at);
      return wb - wa; // oldest first (most urgent)
    });
    const done = orders.filter((o) => o.status === 'done').sort((a, b) => (b.completed_at || '').localeCompare(a.completed_at || ''));
    const completed = orders.filter((o) => o.status === 'completed').sort((a, b) => (b.picked_up_at || b.updated_at).localeCompare(a.picked_up_at || a.updated_at));
    const cancelled = orders.filter((o) => o.status === 'cancelled').sort((a, b) => b.num - a.num);
    return { pending, done, completed, cancelled };
  }, [orders]);

  async function handleDone(o: Order) {
    await updateOrderStatus(o.id, 'done');
    push(`Bestelling #${o.num} klaar`, 'success');
  }
  async function handleComplete(o: Order) {
    await updateOrderStatus(o.id, 'completed');
    push(`Bestelling #${o.num} afgerond`, 'success');
  }
  async function handleCancel(o: Order, reason: string) {
    await updateOrderStatus(o.id, 'cancelled', reason);
    setCancelOrder(null);
    push(`Bestelling #${o.num} geannuleerd`, 'info');
  }
  async function handleEditSave(items: OrderItem[], note?: string) {
    if (!editOrder) return;
    const total = items.reduce((s, i) => s + i.price * i.qty, 0);
    const vakjes = items.reduce((s, i) => s + Math.round(i.price / currentSession.vakje_value) * i.qty, 0);
    await updateOrder(editOrder.id, { items, total, vakjes, note: note || null });
    setEditOrder(null);
    push('Bestelling aangepast', 'success');
  }
  async function handleProductSave(p: Partial<Product> & { session_id: string }) {
    await upsertProduct(p);
    setProductModal({ open: false });
    refresh();
    push('Product opgeslagen', 'success');
  }
  async function handleReorder(idx: number, dir: -1 | 1) {
    const next = [...products];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j], next[idx]];
    const ids = next.map((p) => p.id);
    setProducts(next);
    try { await reorderProducts(ids); } catch { refresh(); }
  }
  async function handleTableSave(t: Partial<TableConfig> & { session_id: string }) {
    await upsertTable(t);
    refresh();
  }
  async function handleSettingsSave(patch: { event_name: string; vakje_value: number; timer_yellow: number; timer_orange: number; timer_red: number; timer_critical: number; auto_print: boolean }) {
    await updateSession(currentSession.id, patch);
    setCurrentSession((s) => ({ ...s, ...patch }));
    setSettingsModal(false);
    push('Instellingen opgeslagen', 'success');
  }

  function playBeep() {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.frequency.value = 880; g.gain.setValueAtTime(0.15, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      o.start(); o.stop(ctx.currentTime + 0.4);
    } catch {}
  }

  function printReceipt(o: Order) {
    setPrintOrder(o);
    setTimeout(() => {
      const el = document.getElementById('receipt');
      if (el) {
        const w = window.open('', '_blank', 'width=320,height=600');
        if (w) { w.document.write(el.outerHTML); w.document.close(); w.focus(); w.print(); }
      }
    }, 100);
  }

  // Auto-print: render receipt into a hidden container, then print directly.
  function autoPrintReceipt(o: Order) {
    const holder = document.createElement('div');
    holder.style.position = 'fixed';
    holder.style.left = '-9999px';
    holder.style.top = '0';
    const root = ReactDOMCreateRoot(holder);
    document.body.appendChild(holder);
    root.render(<Receipt order={o} vakjeValue={currentSession.vakje_value} />);
    setTimeout(() => {
      const el = holder.querySelector('#receipt') || holder.firstElementChild;
      if (el) {
        const w = window.open('', '_blank', 'width=320,height=600');
        if (w) { w.document.write(el.outerHTML); w.document.close(); w.focus(); w.print(); }
      }
      setTimeout(() => { root.unmount(); holder.remove(); }, 1000);
    }, 150);
  }

  const tabs: { id: Tab; label: string; icon: any }[] = [
    { id: 'orders', label: 'Bestellingen', icon: ListOrdered },
    { id: 'products', label: 'Producten', icon: UtensilsCrossed },
    { id: 'stats', label: 'Statistieken', icon: BarChart3 },
    { id: 'settings', label: 'Instellingen', icon: Settings },
  ];

  return (
    <div className="min-h-full flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-[#0b0f14]/95 backdrop-blur border-b border-white/5">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3 flex-wrap">
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold truncate">{currentSession.event_name}</h1>
            <p className="text-white/40 text-sm">Sessie <span className="font-mono tracking-widest text-white/70">{currentSession.code}</span></p>
          </div>
          <div className="flex items-center gap-2">
            <StatusDot status={connStatus} />
            <button onClick={() => setSound((s) => !s)} className="btn-ghost p-2" title="Geluid">{sound ? <Volume2 size={18} /> : <VolumeX size={18} />}</button>
            <button onClick={() => setShowPin((s) => !s)} className="btn-ghost p-2 text-xs font-mono" title="Host PIN">{showPin ? currentSession.pin : '••••'}</button>
            <button onClick={() => setShowQr(true)} className="btn-ghost p-2" title="QR"><Plus size={18} /></button>
            <button onClick={onLeave} className="btn-ghost p-2"><LogOut size={18} /></button>
          </div>
        </div>
        <nav className="max-w-6xl mx-auto px-4 flex gap-1 overflow-x-auto">
          {tabs.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition flex items-center gap-2 whitespace-nowrap ${tab === t.id ? 'border-emerald-400 text-emerald-400' : 'border-transparent text-white/50 hover:text-white'}`}>
              <t.icon size={16} /> {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="flex-1 max-w-6xl mx-auto w-full p-4">
        {tab === 'orders' && (
          <div className="flex flex-col gap-5">
            <section>
              <h2 className="text-white/60 text-sm uppercase tracking-wider mb-2">Open — {sortedOrders.pending.length}</h2>
              <div className="grid md:grid-cols-2 gap-3">
                {sortedOrders.pending.map((o) => <OrderCard key={o.id} order={o} timers={timers} onDone={handleDone} onEdit={setEditOrder} onCancel={setCancelOrder} onPrint={printReceipt} onDetails={setDetailsOrder} />)}
              </div>
              {sortedOrders.pending.length === 0 && <p className="text-white/30 text-sm">Geen open bestellingen.</p>}
            </section>
            <section>
              <h2 className="text-sky-400/80 text-sm uppercase tracking-wider mb-2">Klaar — {sortedOrders.done.length}</h2>
              <div className="grid md:grid-cols-2 gap-3">
                {sortedOrders.done.slice(0, 20).map((o) => <OrderCard key={o.id} order={o} timers={timers} onComplete={handleComplete} onPrint={printReceipt} onDetails={setDetailsOrder} />)}
              </div>
              {sortedOrders.done.length === 0 && <p className="text-white/30 text-sm">Niets klaar.</p>}
            </section>
            {sortedOrders.completed.length > 0 && (
              <section>
                <h2 className="text-white/60 text-sm uppercase tracking-wider mb-2">Afgerond — {sortedOrders.completed.length}</h2>
                <div className="grid md:grid-cols-2 gap-3">
                  {sortedOrders.completed.slice(0, 20).map((o) => <OrderCard key={o.id} order={o} onPrint={printReceipt} onDetails={setDetailsOrder} compact />)}
                </div>
              </section>
            )}
            {sortedOrders.cancelled.length > 0 && (
              <section>
                <h2 className="text-white/60 text-sm uppercase tracking-wider mb-2">Geannuleerd — {sortedOrders.cancelled.length}</h2>
                <div className="grid md:grid-cols-2 gap-3">
                  {sortedOrders.cancelled.slice(0, 10).map((o) => <OrderCard key={o.id} order={o} onDetails={setDetailsOrder} compact />)}
                </div>
              </section>
            )}
          </div>
        )}

        {tab === 'products' && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h2 className="text-xl font-bold">Producten — {products.length}</h2>
              <div className="flex gap-2 flex-wrap">
                <button onClick={() => exportProducts(products)} className="btn-ghost px-3 py-2.5 text-sm"><Download size={16} /> Exporteren</button>
                <label className="btn-ghost px-3 py-2.5 text-sm cursor-pointer">
                  <Upload size={16} /> Importeren
                  <input type="file" accept=".json" className="hidden" onChange={(e) => importProducts(e, currentSession.id, () => refresh())} />
                </label>
                <button onClick={() => setProductModal({ open: true })} className="btn-primary px-4 py-2.5"><Plus size={18} /> Product</button>
              </div>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {products.map((p, idx) => (
                <div key={p.id} className="card p-4 flex items-center gap-3">
                  <div className="flex flex-col">
                    <button onClick={() => handleReorder(idx, -1)} disabled={idx === 0} className="text-white/40 hover:text-white disabled:opacity-20"><ArrowUp size={14} /></button>
                    <button onClick={() => handleReorder(idx, 1)} disabled={idx === products.length - 1} className="text-white/40 hover:text-white disabled:opacity-20"><ArrowDown size={14} /></button>
                  </div>
                  {p.photo_url ? <img src={p.photo_url} alt="" className="w-12 h-12 rounded-xl object-cover" onError={(e) => (e.currentTarget.style.display = 'none')} /> : <span className="text-3xl">{p.emoji}</span>}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate">{p.name}</p>
                    <p className="text-emerald-400 text-sm">{fmtEUR(Number(p.price))}</p>
                    <p className="text-white/30 text-xs">{p.category} · {p.available ? 'Beschikbaar' : 'Niet beschikbaar'}{p.vakjes_override != null ? ` · ${p.vakjes_override} vakjes` : ''}</p>
                  </div>
                  <button onClick={() => setProductModal({ open: true, product: p })} className="btn-ghost px-3 py-1.5 text-sm">Wijzig</button>
                  <button onClick={async () => { if (confirm(`"${p.name}" verwijderen?`)) { await deleteProduct(p.id); refresh(); } }} className="btn-danger p-1.5"><LogOut size={14} /></button>
                </div>
              ))}
              {products.length === 0 && <p className="text-white/30">Nog geen producten. Voeg er een paar toe.</p>}
            </div>
          </div>
        )}

        {tab === 'stats' && <Stats orders={orders} />}

        {tab === 'settings' && (
          <div className="flex flex-col gap-3 max-w-md">
            <button onClick={() => setSettingsModal(true)} className="card p-4 text-left hover:bg-white/5"><p className="font-semibold">Algemeen & timers</p><p className="text-white/40 text-sm">Evenementnaam, waarde per vakje, vergeten-bestelling timers</p></button>
            <button onClick={() => setTableModal(true)} className="card p-4 text-left hover:bg-white/5"><p className="font-semibold">Tafels</p><p className="text-white/40 text-sm">{tables.length} tafels ingesteld</p></button>
            <button onClick={() => setProductModal({ open: true })} className="card p-4 text-left hover:bg-white/5"><p className="font-semibold">Product toevoegen</p><p className="text-white/40 text-sm">Nieuw product aanmaken</p></button>
            <button onClick={() => setUsersModal(true)} className="card p-4 text-left hover:bg-white/5"><p className="font-semibold flex items-center gap-2"><Users size={16} /> Obers</p><p className="text-white/40 text-sm">{waiterNames.length} ober(s) verbonden</p></button>
          </div>
        )}
      </main>

      {/* Modals */}
      {editOrder && <EditOrderModal order={editOrder} products={products} vakjeValue={currentSession.vakje_value} onClose={() => setEditOrder(null)} onSave={handleEditSave} />}
      {cancelOrder && <CancelModal order={cancelOrder} onClose={() => setCancelOrder(null)} onConfirm={(reason) => handleCancel(cancelOrder, reason)} />}
      {detailsOrder && <DetailsModal order={detailsOrder} vakjeValue={currentSession.vakje_value} onClose={() => setDetailsOrder(null)} />}
      {printOrder && (
        <Modal open onClose={() => setPrintOrder(null)} title="Bonnetje">
          <Receipt order={printOrder} vakjeValue={currentSession.vakje_value} />
          <button onClick={() => printReceipt(printOrder)} className="btn-primary w-full py-3 mt-3">Afdrukken</button>
        </Modal>
      )}
      {productModal.open && <ProductModal product={productModal.product} sessionId={currentSession.id} onClose={() => setProductModal({ open: false })} onSave={handleProductSave} />}
      {tableModal && <TableModal tables={tables} sessionId={currentSession.id} onClose={() => setTableModal(false)} onSave={handleTableSave} onDelete={deleteTable} />}
      {settingsModal && <SettingsModal session={currentSession} sound={sound} onClose={() => setSettingsModal(false)} onSave={handleSettingsSave} onToggleSound={() => setSound((s) => !s)} />}
      {usersModal && <UsersModal waiters={waiterNames} onClose={() => setUsersModal(false)} />}

      <Modal open={showQr} onClose={() => setShowQr(false)} title="Verbinden via QR-code">
        <div className="flex flex-col items-center gap-6">
          <div className="flex flex-col items-center gap-3">
            <div className="flex items-center gap-2 text-sky-400 text-sm font-semibold"><Smartphone size={16} /> Ober</div>
            <QRCode value={`${joinUrl}&role=waiter`} size={180} />
            <p className="text-white/60 text-sm text-center">Scan om als ober te verbinden met <span className="font-mono">{currentSession.code}</span>.</p>
          </div>
          <div className="w-full border-t border-white/10" />
          <div className="flex flex-col items-center gap-3">
            <div className="flex items-center gap-2 text-amber-400 text-sm font-semibold"><Flame size={16} /> Keuken</div>
            <QRCode value={`${joinUrl}&role=kitchen`} size={180} />
            <p className="text-white/60 text-sm text-center">Scan om als keuken te verbinden met <span className="font-mono">{currentSession.code}</span>.</p>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// Realtime helper — defined here to avoid circular import with supabase.ts
import { supabase } from '../lib/supabase';

function exportProducts(products: Product[]) {
  const data = products.map((p) => ({ name: p.name, price: Number(p.price), emoji: p.emoji, category: p.category, available: p.available }));
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `klj-producten-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

async function importProducts(e: React.ChangeEvent<HTMLInputElement>, sessionId: string, onDone: () => void) {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const items: { name: string; price: number; emoji: string; category: string; available: boolean }[] = JSON.parse(text);
    for (const it of items) {
      await upsertProduct({ session_id: sessionId, name: it.name, price: it.price, emoji: it.emoji || '🛎️', category: it.category || 'Overige', available: it.available ?? true });
    }
    onDone();
  } catch (err) {
    alert('Importeren mislukt: ongeldig JSON-bestand.');
  }
  e.target.value = '';
}
function supabaseRealtime(sessionId: string, onChange: () => void) {
  const ch = supabase
    .channel(`klj-host-${sessionId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'klj_orders', filter: `session_id=eq.${sessionId}` }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'klj_products', filter: `session_id=eq.${sessionId}` }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'klj_tables', filter: `session_id=eq.${sessionId}` }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'klj_sessions', filter: `id=eq.${sessionId}` }, onChange)
    .subscribe();
  return ch;
}

