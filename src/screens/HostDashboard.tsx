import { useState, useEffect, useMemo } from 'react';
import { createRoot as ReactDOMCreateRoot } from 'react-dom/client';
import { LogOut, ListOrdered, UtensilsCrossed, BarChart3, Settings, Plus, Volume2, VolumeX, Download, Upload, ArrowUp, ArrowDown, Users, Smartphone, Flame } from 'lucide-react';
import type { Session, Product, Order, OrderItem, WorkflowMode } from '../lib/types';
import { fmtEUR, waitMinutes, statusLabel, advanceLabel, nextStatus, prevStatus, playNotificationSound } from '../lib/utils';
import { fetchProducts, fetchOrders, updateOrderStatus, updateOrder, upsertProduct, deleteProduct, reorderProducts, updateSession } from '../lib/db';
import { OrderCard, type TimerThresholds } from '../components/OrderCard';
import { Stats } from '../components/Stats';
import { Modal } from '../components/Modal';
import { Receipt } from '../components/Receipt';
import { QRCode } from '../components/QRCode';
import { EditOrderModal, CancelModal, DetailsModal } from '../components/OrderModals';
import { ProductModal, SettingsModal, UsersModal } from '../components/AdminModals';
import { useToast } from '../components/Toast';
import { StatusDot } from '../components/ui';
import { supabase } from '../lib/supabase';

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
  const [orders, setOrders] = useState<Order[]>([]);
  const [showPin, setShowPin] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [sound, setSound] = useState(true);
  const [editOrder, setEditOrder] = useState<Order | null>(null);
  const [cancelOrder, setCancelOrder] = useState<Order | null>(null);
  const [detailsOrder, setDetailsOrder] = useState<Order | null>(null);
  const [printOrder, setPrintOrder] = useState<Order | null>(null);
  const [productModal, setProductModal] = useState<{ open: boolean; product?: Product }>({ open: false });
  const [settingsModal, setSettingsModal] = useState(false);
  const [usersModal, setUsersModal] = useState(false);
  const [knownOrderIds, setKnownOrderIds] = useState<Set<string>>(new Set());
  const [currentSession, setCurrentSession] = useState(session);

  const workflowMode: WorkflowMode = currentSession.workflow_mode ?? '2-step';
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
      const [ps, os] = await Promise.all([fetchProducts(currentSession.id), fetchOrders(currentSession.id)]);
      setProducts(ps);
      setOrders((prev) => {
        const next = os;
        const prevIds = new Set(prev.map((o) => o.id));
        const fresh = next.filter((o) => !prevIds.has(o.id) && o.status === 'pending');
        if (fresh.length > 0 && prev.length > 0) {
          if (sound) playNotificationSound(currentSession.sound_type ?? 'beep', currentSession.sound_url);
          push(`${fresh.length} nieuwe bestelling(en)`, 'success');
          if (currentSession.auto_print !== false) fresh.forEach((o) => autoPrintReceipt(o));
        }
        return next;
      });
    } catch {}
  }

  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, [currentSession.id]);

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
          const freshAlerts = stale.filter((o) => !prev.has(o.id));
          if (freshAlerts.length > 0) {
            push(`Mogelijk vergeten: #${freshAlerts[0].num}`, 'error');
            return new Set([...prev, ...ids]);
          }
          return prev;
        });
      }
    }, 30000);
    return () => clearInterval(t);
  }, [orders, push, timers.critical]);

  // Auto-refresh on visibility
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    const t = setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, 20000);
    return () => { document.removeEventListener('visibilitychange', onVisible); window.removeEventListener('focus', onVisible); clearInterval(t); };
    // eslint-disable-next-line
  }, [currentSession.id]);

  const sortedOrders = useMemo(() => {
    const pending = orders.filter((o) => o.status === 'pending').sort((a, b) => a.created_at.localeCompare(b.created_at));
    const done = orders.filter((o) => o.status === 'done').sort((a, b) => (b.completed_at || '').localeCompare(a.completed_at || ''));
    const completed = orders.filter((o) => o.status === 'completed').sort((a, b) => (b.picked_up_at || b.updated_at).localeCompare(a.picked_up_at || a.updated_at));
    const cancelled = orders.filter((o) => o.status === 'cancelled').sort((a, b) => b.num - a.num);
    return { pending, done, completed, cancelled };
  }, [orders]);

  async function handleAdvance(o: Order) {
    const next = nextStatus(o.status, workflowMode);
    if (next === null) return;
    await updateOrderStatus(o.id, next, undefined, currentSession.id);
    push(`#${o.num} → ${statusLabel(next, workflowMode)}`, 'success');
  }

  async function handleRevert(o: Order) {
    const prev = prevStatus(o.status, workflowMode);
    if (prev === null) return;
    await updateOrderStatus(o.id, prev, undefined, currentSession.id);
    push(`#${o.num} → ${statusLabel(prev, workflowMode)} (teruggezet)`, 'info');
  }

  async function handleCancel(o: Order, reason: string) {
    await updateOrderStatus(o.id, 'cancelled', reason, currentSession.id);
    setCancelOrder(null);
    push(`#${o.num} geannuleerd`, 'info');
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

  async function handleSettingsSave(patch: any) {
    await updateSession(currentSession.id, patch);
    setCurrentSession((s) => ({ ...s, ...patch }));
    setSettingsModal(false);
    push('Instellingen opgeslagen', 'success');
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

  const pendingLabel = workflowMode === '1-step' ? 'Verzonden' : 'Keuken ontvangen';
  const doneLabel = workflowMode === '1-step' ? 'Gemaakt' : 'Keuken klaar';

  return (
    <div className="min-h-full flex flex-col">
      <header className="sticky top-0 z-30 bg-[#0a0d12]/95 backdrop-blur border-b border-white/[0.06]">
        <div className="max-w-6xl mx-auto px-3 py-2.5 flex items-center gap-2 flex-wrap">
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-bold text-white truncate">{currentSession.event_name}</h1>
            <p className="text-white/40 text-xs">Sessie <span className="font-mono tracking-wider text-white/60">{currentSession.code}</span> · {workflowMode}</p>
          </div>
          <div className="flex items-center gap-1.5">
            <StatusDot status={connStatus} />
            <button onClick={() => setSound((s) => !s)} className="btn-ghost p-1.5" title="Geluid">{sound ? <Volume2 size={16} /> : <VolumeX size={16} />}</button>
            <button onClick={() => setShowPin((s) => !s)} className="btn-ghost px-2 py-1.5 text-xs font-mono" title="Host PIN">{showPin ? currentSession.pin : '••••'}</button>
            <button onClick={() => setShowQr(true)} className="btn-ghost p-1.5" title="QR"><Plus size={16} /></button>
            <button onClick={onLeave} className="btn-ghost p-1.5"><LogOut size={16} /></button>
          </div>
        </div>
        <nav className="max-w-6xl mx-auto px-3 flex gap-1 overflow-x-auto">
          {tabs.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-3 py-2 text-xs font-semibold border-b-2 transition flex items-center gap-1.5 whitespace-nowrap ${tab === t.id ? 'border-emerald-400 text-emerald-400' : 'border-transparent text-white/40 hover:text-white/70'}`}>
              <t.icon size={14} /> {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="flex-1 max-w-6xl mx-auto w-full p-3">
        {tab === 'orders' && (
          <div className="flex flex-col gap-4">
            <section>
              <h2 className="section-title mb-2">{pendingLabel} — {sortedOrders.pending.length}</h2>
              <div className="grid md:grid-cols-2 gap-2">
                {sortedOrders.pending.map((o) => (
                  <OrderCard key={o.id} order={o} workflowMode={workflowMode} timers={timers} onAdvance={handleAdvance} onRevert={handleRevert} onEdit={setEditOrder} onCancel={setCancelOrder} onPrint={printReceipt} onDetails={setDetailsOrder} showRevert />
                ))}
              </div>
              {sortedOrders.pending.length === 0 && <p className="text-white/30 text-xs">Geen open bestellingen.</p>}
            </section>
            <section>
              <h2 className="section-title mb-2 text-sky-400">{doneLabel} — {sortedOrders.done.length}</h2>
              <div className="grid md:grid-cols-2 gap-2">
                {sortedOrders.done.slice(0, 20).map((o) => (
                  <OrderCard key={o.id} order={o} workflowMode={workflowMode} timers={timers} onAdvance={handleAdvance} onRevert={handleRevert} onPrint={printReceipt} onDetails={setDetailsOrder} showRevert />
                ))}
              </div>
              {sortedOrders.done.length === 0 && <p className="text-white/30 text-xs">Niets klaar.</p>}
            </section>
            {sortedOrders.completed.length > 0 && (
              <section>
                <h2 className="section-title mb-2">Afgerond — {sortedOrders.completed.length}</h2>
                <div className="grid md:grid-cols-2 gap-2">
                  {sortedOrders.completed.slice(0, 20).map((o) => (
                    <OrderCard key={o.id} order={o} workflowMode={workflowMode} onRevert={handleRevert} onPrint={printReceipt} onDetails={setDetailsOrder} showRevert compact />
                  ))}
                </div>
              </section>
            )}
            {sortedOrders.cancelled.length > 0 && (
              <section>
                <h2 className="section-title mb-2">Geannuleerd — {sortedOrders.cancelled.length}</h2>
                <div className="grid md:grid-cols-2 gap-2">
                  {sortedOrders.cancelled.slice(0, 10).map((o) => (
                    <OrderCard key={o.id} order={o} workflowMode={workflowMode} onDetails={setDetailsOrder} compact />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}

        {tab === 'products' && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h2 className="text-base font-bold text-white">Producten — {products.length}</h2>
              <div className="flex gap-1.5 flex-wrap">
                <button onClick={() => exportProducts(products)} className="btn-ghost px-2.5 py-1.5 text-xs"><Download size={14} /> Exporteren</button>
                <label className="btn-ghost px-2.5 py-1.5 text-xs cursor-pointer flex items-center gap-1.5">
                  <Upload size={14} /> Importeren
                  <input type="file" accept=".json" className="hidden" onChange={(e) => importProducts(e, currentSession.id, () => refresh())} />
                </label>
                <button onClick={() => setProductModal({ open: true })} className="btn-primary px-3 py-1.5 text-xs"><Plus size={14} /> Product</button>
              </div>
            </div>

            {/* Products table — clean, compact, no overlapping */}
            <div className="card overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/[0.06]">
                    <th className="text-left p-2.5 section-title font-semibold">Volgorde</th>
                    <th className="text-left p-2.5 section-title font-semibold">Product</th>
                    <th className="text-left p-2.5 section-title font-semibold">Prijs</th>
                    <th className="text-left p-2.5 section-title font-semibold">Categorie</th>
                    <th className="text-left p-2.5 section-title font-semibold">Vakjes</th>
                    <th className="text-left p-2.5 section-title font-semibold">Zichtbaarheid</th>
                    <th className="text-right p-2.5 section-title font-semibold">Acties</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((p, idx) => {
                    const avail = p.availability || (p.available ? 'available' : 'unavailable');
                    return (
                      <tr key={p.id} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition">
                        <td className="p-2.5">
                          <div className="flex flex-col gap-0.5">
                            <button onClick={() => handleReorder(idx, -1)} disabled={idx === 0} className="text-white/30 hover:text-white disabled:opacity-20"><ArrowUp size={12} /></button>
                            <button onClick={() => handleReorder(idx, 1)} disabled={idx === products.length - 1} className="text-white/30 hover:text-white disabled:opacity-20"><ArrowDown size={12} /></button>
                          </div>
                        </td>
                        <td className="p-2.5">
                          <div className="flex items-center gap-2">
                            {p.photo_url ? (
                              <img src={p.photo_url} alt="" className="w-8 h-8 rounded object-cover flex-none" onError={(e) => (e.currentTarget.style.display = 'none')} />
                            ) : (
                              <span className="text-xl flex-none">{p.emoji}</span>
                            )}
                            <span className="font-medium text-white truncate">{p.name}</span>
                          </div>
                        </td>
                        <td className="p-2.5 text-emerald-400">{fmtEUR(Number(p.price))}</td>
                        <td className="p-2.5 text-white/60">{p.category}</td>
                        <td className="p-2.5 text-white/60">{p.vakjes_override != null ? `${p.vakjes_override} (vast)` : 'auto'}</td>
                        <td className="p-2.5">
                          {avail === 'available' && <span className="badge bg-emerald-500/15 text-emerald-400">Beschikbaar</span>}
                          {avail === 'unavailable' && <span className="badge bg-amber-500/15 text-amber-400">Niet beschikbaar</span>}
                          {avail === 'hidden' && <span className="badge bg-white/[0.06] text-white/40">Verborgen</span>}
                        </td>
                        <td className="p-2.5">
                          <div className="flex items-center justify-end gap-1.5">
                            <button onClick={() => setProductModal({ open: true, product: p })} className="btn-ghost px-2 py-1 text-xs">Wijzig</button>
                            <button
                              onClick={async () => { if (confirm(`"${p.name}" verwijderen?`)) { await deleteProduct(p.id); refresh(); } }}
                              className="btn-danger px-2 py-1 text-xs"
                            >
                              Verwijder
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {products.length === 0 && <p className="text-white/30 text-sm p-4 text-center">Nog geen producten. Voeg er een paar toe.</p>}
            </div>
          </div>
        )}

        {tab === 'stats' && <Stats orders={orders} />}

        {tab === 'settings' && (
          <div className="flex flex-col gap-2 max-w-md">
            <button onClick={() => setSettingsModal(true)} className="card-hover p-3 text-left">
              <p className="font-semibold text-sm text-white">Algemeen & timers</p>
              <p className="text-white/40 text-xs">Evenementnaam, werkmodus, vakjes, timers, geluid, printer</p>
            </button>
            <button onClick={() => setProductModal({ open: true })} className="card-hover p-3 text-left">
              <p className="font-semibold text-sm text-white">Product toevoegen</p>
              <p className="text-white/40 text-xs">Nieuw product aanmaken</p>
            </button>
            <button onClick={() => setUsersModal(true)} className="card-hover p-3 text-left">
              <p className="font-semibold text-sm text-white flex items-center gap-2"><Users size={14} /> Obers</p>
              <p className="text-white/40 text-xs">{waiterNames.length} ober(s) verbonden</p>
            </button>
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
          <button onClick={() => printReceipt(printOrder)} className="btn-primary w-full py-2.5 mt-2 text-sm">Afdrukken</button>
        </Modal>
      )}
      {productModal.open && <ProductModal product={productModal.product} sessionId={currentSession.id} onClose={() => setProductModal({ open: false })} onSave={handleProductSave} />}
      {settingsModal && <SettingsModal session={currentSession} sound={sound} onClose={() => setSettingsModal(false)} onSave={handleSettingsSave} onToggleSound={() => setSound((s) => !s)} />}
      {usersModal && <UsersModal waiters={waiterNames} onClose={() => setUsersModal(false)} />}

      <Modal open={showQr} onClose={() => setShowQr(false)} title="Verbinden via QR-code">
        <div className="flex flex-col items-center gap-6">
          <div className="flex flex-col items-center gap-2">
            <div className="flex items-center gap-1.5 text-sky-400 text-xs font-semibold"><Smartphone size={14} /> Ober</div>
            <QRCode value={`${joinUrl}&role=waiter`} size={180} />
            <p className="text-white/50 text-xs text-center">Scan om als ober te verbinden met <span className="font-mono">{currentSession.code}</span>.</p>
          </div>
          <div className="w-full border-t border-white/[0.06]" />
          <div className="flex flex-col items-center gap-2">
            <div className="flex items-center gap-1.5 text-amber-400 text-xs font-semibold"><Flame size={14} /> Keuken</div>
            <QRCode value={`${joinUrl}&role=kitchen`} size={180} />
            <p className="text-white/50 text-xs text-center">Scan om als keuken te verbinden met <span className="font-mono">{currentSession.code}</span>.</p>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function exportProducts(products: Product[]) {
  const data = products.map((p) => ({ name: p.name, price: Number(p.price), emoji: p.emoji, category: p.category, availability: p.availability || 'available' }));
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
    const items: { name: string; price: number; emoji: string; category: string; availability?: string }[] = JSON.parse(text);
    for (const it of items) {
      await upsertProduct({
        session_id: sessionId,
        name: it.name,
        price: it.price,
        emoji: it.emoji || '🛎️',
        category: it.category || 'Overige',
        availability: (it.availability as any) || 'available',
      });
    }
    onDone();
  } catch {
    alert('Importeren mislukt: ongeldig JSON-bestand.');
  }
  e.target.value = '';
}

function supabaseRealtime(sessionId: string, onChange: () => void) {
  const ch = supabase
    .channel(`klj-host-${sessionId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'klj_orders', filter: `session_id=eq.${sessionId}` }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'klj_products', filter: `session_id=eq.${sessionId}` }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'klj_sessions', filter: `id=eq.${sessionId}` }, onChange)
    .subscribe();
  return ch;
}
