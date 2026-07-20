import { useState, useEffect, useMemo } from 'react';
import { LogOut, Clock, Hash, Table2, User, CheckCircle2, Bell, Flame, TrendingUp, Package } from 'lucide-react';
import type { Session, Order } from '../lib/types';
import { fetchOrders, updateOrderStatus } from '../lib/db';
import { fmtTime, waitMinutesFrozen } from '../lib/utils';
import { useToast } from '../components/Toast';
import { supabase } from '../lib/supabase';

interface Props {
  session: Session;
  onLeave: () => void;
}

export function KitchenScreen({ session, onLeave }: Props) {
  const { push } = useToast();
  const [orders, setOrders] = useState<Order[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [seenIds, setSeenIds] = useState<Set<string>>(new Set());
  const [tab, setTab] = useState<'active' | 'completed'>('active');

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

  // Sound + toast on new pending orders.
  useEffect(() => {
    const newPending = orders.filter((o) => o.status === 'pending' && !seenIds.has(o.id));
    if (seenIds.size > 0 && newPending.length > 0) {
      push(`Nieuwe bestelling #${newPending[0].num}`, 'success');
      try {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.connect(g); g.connect(ctx.destination);
        o.frequency.value = 880; o.type = 'sine';
        g.gain.setValueAtTime(0.15, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
        o.start(); o.stop(ctx.currentTime + 0.5);
      } catch {}
    }
    setSeenIds(new Set(orders.map((o) => o.id)));
    // eslint-disable-next-line
  }, [orders]);

  const criticalThreshold = session.timer_critical ?? 15;
  const pending = useMemo(() => orders.filter((o) => o.status === 'pending').sort((a, b) => {
    const aCrit = waitMinutesFrozen(a) >= criticalThreshold;
    const bCrit = waitMinutesFrozen(b) >= criticalThreshold;
    if (aCrit !== bCrit) return aCrit ? -1 : 1;
    return a.created_at.localeCompare(b.created_at);
  }), [orders, criticalThreshold]);
  const ready = useMemo(() => orders.filter((o) => o.status === 'done' && o.completed_at && (Date.now() - new Date(o.completed_at).getTime()) < 10 * 60 * 1000).sort((a, b) => (b.completed_at || '').localeCompare(a.completed_at || '')), [orders]);
  const completed = useMemo(() => orders.filter((o) => o.status === 'completed').sort((a, b) => (b.picked_up_at || b.updated_at).localeCompare(a.picked_up_at || a.updated_at)), [orders]);

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
    await updateOrderStatus(o.id, 'done');
    push(`Bestelling #${o.num} klaar`, 'success');
  }

  return (
    <div className="min-h-full flex flex-col">
      <header className="sticky top-0 z-30 bg-[#0b0f14]/95 backdrop-blur border-b border-white/5">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <h1 className="font-bold text-lg flex items-center gap-2"><Flame className="text-amber-400" size={20} /> Keuken</h1>
            <p className="text-white/40 text-sm truncate">{session.event_name} · <span className="font-mono">{session.code}</span></p>
          </div>
          <div className="flex items-center gap-2">
            {pending.length > 0 && <span className="badge bg-emerald-500/15 text-emerald-400"><Bell size={12} /> {pending.length} nieuw</span>}
            {ready.length > 0 && <span className="badge bg-sky-500/15 text-sky-400">{ready.length} klaar</span>}
            <button onClick={onLeave} className="btn-ghost px-3 py-2 text-red-400 flex items-center gap-2"><LogOut size={18} /> Sluiten</button>
          </div>
        </div>

        {/* Live stats bar */}
        <div className="max-w-6xl mx-auto px-4 pb-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
          <StatChip icon={<CheckCircle2 size={14} />} label="Gemaakt" value={stats.totalOrders} accent="text-emerald-400" />
          <StatChip icon={<Package size={14} />} label="Producten" value={stats.totalItems} accent="text-sky-400" />
          <StatChip icon={<Clock size={14} />} label="Gem. wachttijd" value={`${stats.avgWait}m`} accent="text-amber-400" />
          <StatChip icon={<TrendingUp size={14} />} label="Top" value={stats.topProduct || '—'} accent="text-white/70" />
        </div>

        {/* Tabs */}
        <div className="max-w-6xl mx-auto px-4 flex gap-1">
          <TabBtn active={tab === 'active'} onClick={() => setTab('active')} label={`Actief (${pending.length + ready.length})`} />
          <TabBtn active={tab === 'completed'} onClick={() => setTab('completed')} label={`Afgerond (${completed.length})`} />
        </div>
      </header>

      <main className="flex-1 max-w-6xl mx-auto w-full p-4 flex flex-col gap-6">
        {tab === 'active' && (
          <>
            <section>
              <h2 className="text-emerald-400 text-sm uppercase tracking-wider mb-3">Te maken ({pending.length})</h2>
              {pending.length === 0 ? <p className="text-white/30 text-sm">Geen bestellingen wachten.</p> : (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {pending.map((o) => (
                    <KitchenCard key={o.id} order={o} expanded={!!expanded[o.id]} onToggle={() => setExpanded((s) => ({ ...s, [o.id]: !s[o.id] }))} onDone={handleDone} />
                  ))}
                </div>
              )}
            </section>

            {ready.length > 0 && (
              <section>
                <h2 className="text-sky-400 text-sm uppercase tracking-wider mb-3">Klaar — wacht op ober ({ready.length})</h2>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {ready.map((o) => (
                    <KitchenCard key={o.id} order={o} expanded={!!expanded[o.id]} onToggle={() => setExpanded((s) => ({ ...s, [o.id]: !s[o.id] }))} />
                  ))}
                </div>
              </section>
            )}
          </>
        )}

        {tab === 'completed' && (
          <section>
            <h2 className="text-white/50 text-sm uppercase tracking-wider mb-3">Afgerond vandaag ({completed.length})</h2>
            {completed.length === 0 ? <p className="text-white/30 text-sm">Nog niets afgerond.</p> : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
                {completed.slice(0, 60).map((o) => (
                  <button key={o.id} onClick={() => setExpanded((s) => ({ ...s, [o.id]: !s[o.id] }))} className="card p-3 text-left">
                    <div className="flex items-center justify-between">
                      <span className="badge bg-white/10 text-white"><Hash size={12} />{o.num}</span>
                      <span className="text-xs text-white/40">{fmtTime(o.picked_up_at || o.updated_at)}</span>
                    </div>
                    {expanded[o.id] && (
                      <div className="mt-2 flex flex-col gap-1">
                        {o.items.map((it, i) => <div key={i} className="text-sm flex items-center gap-2"><span className="font-mono text-xs bg-white/10 rounded px-1.5">{it.qty}×</span>{it.emoji} {it.name}</div>)}
                        <p className="text-white/40 text-xs mt-1"><Table2 size={10} className="inline" /> {o.table_name} · <User size={10} className="inline" /> {o.waiter}</p>
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}

function StatChip({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string | number; accent: string }) {
  return (
    <div className="card p-2 flex items-center gap-2">
      <span className={accent}>{icon}</span>
      <div className="min-w-0">
        <p className="text-white/40 text-[10px] uppercase tracking-wider leading-none">{label}</p>
        <p className={`font-bold text-sm truncate ${accent}`}>{value}</p>
      </div>
    </div>
  );
}

function TabBtn({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} className={`px-4 py-2 text-sm font-semibold border-b-2 transition ${active ? 'border-amber-400 text-amber-400' : 'border-transparent text-white/40 hover:text-white/70'}`}>
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

function KitchenCard({ order, expanded, onToggle, onDone }: { order: Order; expanded: boolean; onToggle: () => void; onDone?: (o: Order) => void }) {
  const min = waitMinutesFrozen(order);
  const isReady = order.status === 'done';
  const ring = isReady
    ? 'border-sky-500/50 bg-sky-500/5'
    : min >= 15 ? 'border-red-500/60 bg-red-500/5'
    : min >= 10 ? 'border-red-500/50'
    : min >= 8 ? 'border-amber-500/50'
    : min >= 5 ? 'border-yellow-500/40'
    : 'border-white/10';
  const minColor = isReady ? 'text-sky-400'
    : min >= 15 ? 'text-red-500'
    : min >= 10 ? 'text-red-400'
    : min >= 8 ? 'text-amber-400'
    : min >= 5 ? 'text-yellow-400'
    : 'text-white/50';

  return (
    <div className={`card border-2 ${ring} overflow-hidden`}>
      <button onClick={onToggle} className="w-full p-4 text-left">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="badge bg-white/15 text-white font-bold"><Hash size={12} />{order.num}</span>
            <span className="badge bg-white/10 text-white"><Table2 size={12} />{order.table_name}</span>
            <span className="badge bg-white/10 text-white"><User size={12} />{order.waiter}</span>
          </div>
          <div className={`text-lg font-bold flex items-center gap-1 ${minColor}`}>
            <Clock size={16} /> {min}m{isReady ? ' ⏸' : ''}
          </div>
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            {order.items.map((it, i) => (
              <div key={i} className="flex items-center gap-2 text-base">
                <span className="bg-white/15 rounded px-2 py-0.5 text-sm font-mono font-bold">{it.qty}×</span>
                <span>{it.emoji} {it.name}</span>
              </div>
            ))}
            {order.note && <p className="text-amber-300 text-xs italic mt-1">⚠ {order.note}</p>}
          </div>

          {onDone && order.status === 'pending' && (
            <button onClick={() => onDone(order)} className="btn-primary py-3 font-semibold flex items-center justify-center gap-2">
              <CheckCircle2 size={18} /> Klaar
            </button>
          )}
          {isReady && (
            <p className="text-sky-400 text-sm text-center font-semibold">Wacht op ober</p>
          )}
        </div>
      )}
    </div>
  );
}
