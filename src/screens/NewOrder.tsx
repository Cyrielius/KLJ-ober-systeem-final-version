import { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Minus, Plus, Send, Loader2, Search } from 'lucide-react';
import type { Product, TableConfig, OrderItem } from '../lib/types';
import { fmtEUR, vakjesFor } from '../lib/utils';

interface Props {
  products: Product[];
  tables: TableConfig[];
  vakjeValue: number;
  waiter: string;
  onBack: () => void;
  onSubmit: (table: string, items: OrderItem[], note?: string) => Promise<void>;
}

interface CartLine extends OrderItem {}

export function NewOrder({ products, tables, vakjeValue, waiter, onBack, onSubmit }: Props) {
  const [table, setTable] = useState('');
  const [cart, setCart] = useState<Record<string, CartLine>>({});
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [query, setQuery] = useState('');
  const cartBarRef = useRef<HTMLDivElement>(null);
  const [cartBarHeight, setCartBarHeight] = useState(0);

  const available = products.filter((p) => p.available);
  const filtered = query.trim()
    ? available.filter((p) => p.name.toLowerCase().includes(query.trim().toLowerCase()) || p.category.toLowerCase().includes(query.trim().toLowerCase()))
    : available;
  const categories = [...new Set(filtered.map((p) => p.category))].sort();
  const cartLines = Object.values(cart);
  const total = cartLines.reduce((s, l) => s + l.price * l.qty, 0);
  const vakjes = cartLines.reduce((s, l) => s + vakjesFor(l.price, vakjeValue, l.vakjes_override) * l.qty, 0);

  function add(p: Product) {
    setCart((c) => {
      const ex = c[p.id];
      return { ...c, [p.id]: ex ? { ...ex, qty: ex.qty + 1 } : { product_id: p.id, name: p.name, price: Number(p.price), emoji: p.emoji, qty: 1, vakjes_override: p.vakjes_override ?? undefined } };
    });
  }
  function dec(id: string) {
    setCart((c) => {
      const ex = c[id];
      if (!ex) return c;
      if (ex.qty <= 1) { const { [id]: _, ...rest } = c; return rest; }
      return { ...c, [id]: { ...ex, qty: ex.qty - 1 } };
    });
  }
  function setNoteLine(id: string, note: string) {
    setCart((c) => c[id] ? { ...c, [id]: { ...c[id], note } } : c);
  }

  useEffect(() => {
    const el = cartBarRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setCartBarHeight(el.offsetHeight));
    ro.observe(el);
    setCartBarHeight(el.offsetHeight);
    return () => ro.disconnect();
  }, [cartLines.length]);

  async function submit() {
    if (!table) return setErr('Kies eerst een tafel.');
    if (cartLines.length === 0) return setErr('Voeg minstens één product toe.');
    setBusy(true); setErr('');
    try {
      await onSubmit(table, cartLines, note.trim() || undefined);
    } catch (e: any) { setErr(e.message || 'Verzenden mislukt.'); }
    finally { setBusy(false); }
  }

  return (
    <div className="min-h-full flex flex-col">
      <div className="sticky top-0 z-20 bg-[#0b0f14]/95 backdrop-blur border-b border-white/5 p-4 flex items-center gap-3">
        <button onClick={onBack} className="btn-ghost px-3 py-2"><ArrowLeft size={18} /></button>
        <h2 className="text-xl font-bold">Nieuwe bestelling</h2>
        <span className="ml-auto text-sm text-white/40">Ober: {waiter}</span>
      </div>

      {/* Table input */}
      <div className="p-4">
        <p className="text-sm text-white/60 mb-2">1. Tafelnummer</p>
        <input
          className="input text-lg max-w-xs"
          placeholder="bv. 5"
          value={table}
          onChange={(e) => setTable(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLElement).blur()}
        />
      </div>

      {/* Products */}
      <div className="px-4" style={{ paddingBottom: cartBarHeight + 16 }}>
        <p className="text-sm text-white/60 mb-2">2. Kies producten</p>
        <div className="relative mb-3">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
          <input className="input pl-9" placeholder="Product zoeken..." value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        {filtered.length === 0 && <p className="text-white/30 text-sm">Geen producten gevonden.</p>}
        {categories.map((cat) => (
          <div key={cat} className="mb-4">
            <p className="text-white/40 text-xs uppercase tracking-wider mb-2">{cat}</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {filtered.filter((p) => p.category === cat).map((p) => {
                const line = cart[p.id];
                return (
                  <button key={p.id} onClick={() => add(p)}
                    className={`card p-3 text-left hover:border-emerald-400/40 transition active:scale-[0.97] relative ${line ? 'border-emerald-400/50' : ''}`}>
                    {p.photo_url ? <img src={p.photo_url} alt="" className="w-full h-20 rounded-lg object-cover mb-1" onError={(e) => (e.currentTarget.style.display = 'none')} /> : <div className="text-3xl mb-1">{p.emoji}</div>}
                    <p className="font-semibold text-sm leading-tight">{p.name}</p>
                    <p className="text-emerald-400 text-sm">{fmtEUR(Number(p.price))}</p>
                    <p className="text-white/30 text-xs">{vakjesFor(Number(p.price), vakjeValue, p.vakjes_override)} vakjes</p>
                    {line && <span className="absolute top-2 right-2 bg-emerald-500 text-black rounded-full w-6 h-6 flex items-center justify-text-sm font-bold">{line.qty}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Cart bar */}
      {cartLines.length > 0 && (
        <div ref={cartBarRef} className="fixed bottom-0 left-0 right-0 z-30 bg-[#141b24] border-t border-white/10 p-4">
          <div className="max-w-3xl mx-auto">
            <div className="flex flex-col gap-2 mb-3 max-h-32 overflow-y-auto">
              {cartLines.map((l) => (
                <div key={l.product_id} className="flex items-center gap-2 text-sm">
                  <span className="bg-white/10 rounded px-2 py-0.5 font-mono">{l.qty}×</span>
                  <span className="flex-1">{l.emoji} {l.name}</span>
                  <input className="input py-1 px-2 text-xs flex-none w-32" placeholder="opmerking" value={l.note || ''} onChange={(e) => setNoteLine(l.product_id, e.target.value)} />
                  <button onClick={() => dec(l.product_id)} className="btn-ghost p-1.5"><Minus size={14} /></button>
                  <button onClick={() => add(products.find((p) => p.id === l.product_id)!)} className="btn-ghost p-1.5"><Plus size={14} /></button>
                </div>
              ))}
            </div>
            <input className="input mb-3" placeholder="Algemene opmerking (bv. zonder ijs)" value={note} onChange={(e) => setNote(e.target.value)} />
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm">
                <span className="text-white/60">Totaal: </span>
                <span className="font-bold text-lg">{fmtEUR(total)}</span>
                <span className="text-violet-300 ml-3">{vakjes} vakjes</span>
              </div>
              <button onClick={submit} className="btn-primary px-6 py-3.5 text-base flex-1 sm:flex-none" disabled={busy}>
                {busy ? <Loader2 className="animate-spin" /> : <><Send size={18} /> Verzenden</>}
              </button>
            </div>
            {err && <p className="text-red-400 text-sm mt-2">{err}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
