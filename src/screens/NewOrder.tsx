import { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Minus, Plus, Send, Loader2, Search, ChevronDown } from 'lucide-react';
import type { Product, OrderItem, ProductAvailability } from '../lib/types';
import { fmtEUR, vakjesFor } from '../lib/utils';

interface Props {
  products: Product[];
  vakjeValue: number;
  waiter: string;
  onBack: () => void;
  onSubmit: (table: string, items: OrderItem[], note?: string) => Promise<void>;
}

export function NewOrder({ products, vakjeValue, waiter, onBack, onSubmit }: Props) {
  const [table, setTable] = useState('');
  const [cart, setCart] = useState<Record<string, OrderItem>>({});
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [query, setQuery] = useState('');
  const [collapsedCats, setCollapsedCats] = useState<Record<string, boolean>>({});
  const cartBarRef = useRef<HTMLDivElement>(null);
  const [cartBarHeight, setCartBarHeight] = useState(0);

  // Hidden products are excluded entirely; unavailable products show grayed out
  const visible = products.filter((p) => p.availability !== 'hidden' && (p.availability || (p.available ? 'available' : 'unavailable')) !== 'hidden');
  const filtered = query.trim()
    ? visible.filter((p) =>
        p.name.toLowerCase().includes(query.trim().toLowerCase()) ||
        p.category.toLowerCase().includes(query.trim().toLowerCase()))
    : visible;
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

  function toggleCat(cat: string) {
    setCollapsedCats((s) => ({ ...s, [cat]: !s[cat] }));
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
    if (!table.trim()) return setErr('Vul een tafelnummer in (alleen cijfers).');
    if (cartLines.length === 0) return setErr('Voeg minstens één product toe.');
    setBusy(true); setErr('');
    try {
      await onSubmit(table.trim(), cartLines, note.trim() || undefined);
    } catch (e: any) { setErr(e.message || 'Verzenden mislukt.'); }
    finally { setBusy(false); }
  }

  return (
    <div className="min-h-full flex flex-col">
      <div className="sticky top-0 z-20 bg-[#0a0d12]/95 backdrop-blur border-b border-white/[0.06] px-3 py-2.5 flex items-center gap-2">
        <button onClick={onBack} className="btn-ghost px-2 py-1.5"><ArrowLeft size={16} /></button>
        <h2 className="text-base font-bold text-white">Nieuwe bestelling</h2>
        <span className="ml-auto text-xs text-white/40">Ober: {waiter}</span>
      </div>

      {/* Table input — numbers only */}
      <div className="p-3 border-b border-white/[0.04]">
        <label className="label">1. Tafelnummer</label>
        <input
          className="input text-lg max-w-[160px] mt-1 font-mono"
          placeholder="bv. 12"
          inputMode="numeric"
          pattern="[0-9]*"
          value={table}
          onChange={(e) => setTable(e.target.value.replace(/[^0-9]/g, ''))}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLElement).blur()}
          autoFocus
        />
      </div>

      {/* Products */}
      <div className="px-3 pt-3" style={{ paddingBottom: cartBarHeight + 16 }}>
        <label className="label">2. Producten</label>
        <div className="relative mt-1 mb-3">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
          <input className="input pl-9" placeholder="Product zoeken..." value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>

        {filtered.length === 0 && <p className="text-white/30 text-sm">Geen producten gevonden.</p>}

        {categories.map((cat) => {
          const isCollapsed = collapsedCats[cat];
          const catProducts = filtered.filter((p) => p.category === cat);
          return (
            <div key={cat} className="mb-3">
              <button
                onClick={() => toggleCat(cat)}
                className="w-full flex items-center gap-2 py-1.5 px-2 hover:bg-white/[0.03] rounded-md transition"
              >
                <ChevronDown size={14} className={`text-white/40 transition-transform ${isCollapsed ? '-rotate-90' : ''}`} />
                <span className="section-title">{cat}</span>
                <span className="text-white/30 text-xs">({catProducts.length})</span>
              </button>
              {!isCollapsed && (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 mt-1">
                  {catProducts.map((p) => {
                    const avail = p.availability || (p.available ? 'available' : 'unavailable');
                    const isUnavailable = avail === 'unavailable';
                    const line = cart[p.id];
                    return (
                      <button
                        key={p.id}
                        onClick={() => !isUnavailable && add(p)}
                        disabled={isUnavailable}
                        className={`card p-2.5 text-left transition relative ${isUnavailable ? 'opacity-40 cursor-not-allowed' : line ? 'border-emerald-500/40 active:scale-[0.97]' : 'hover:border-white/[0.12] active:scale-[0.97]'}`}
                      >
                        {p.photo_url ? (
                          <img src={p.photo_url} alt="" className="w-full h-16 rounded object-cover mb-1" onError={(e) => (e.currentTarget.style.display = 'none')} />
                        ) : (
                          <div className="text-2xl mb-1">{p.emoji}</div>
                        )}
                        <p className="font-semibold text-sm text-white leading-tight">{p.name}</p>
                        <p className="text-emerald-400 text-xs">{fmtEUR(Number(p.price))}</p>
                        <p className="text-white/30 text-[10px]">{vakjesFor(Number(p.price), vakjeValue, p.vakjes_override)} vakjes</p>
                        {isUnavailable && <p className="text-amber-400 text-[10px] font-semibold">Niet beschikbaar</p>}
                        {line && (
                          <span className="absolute top-1.5 right-1.5 bg-emerald-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold">
                            {line.qty}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Cart bar */}
      {cartLines.length > 0 && (
        <div ref={cartBarRef} className="fixed bottom-0 left-0 right-0 z-30 bg-[#131820] border-t border-white/[0.08] p-3">
          <div className="max-w-3xl mx-auto">
            <div className="flex flex-col gap-1.5 mb-2 max-h-32 overflow-y-auto">
              {cartLines.map((l) => (
                <div key={l.product_id} className="flex items-center gap-2 text-sm">
                  <span className="bg-white/[0.08] rounded px-1.5 py-0.5 font-mono text-xs font-bold">{l.qty}×</span>
                  <span className="flex-1 text-white/90">{l.name}</span>
                  <input
                    className="input py-1 px-2 text-xs flex-none w-28"
                    placeholder="opmerking"
                    value={l.note || ''}
                    onChange={(e) => setNoteLine(l.product_id, e.target.value)}
                  />
                  <button onClick={() => dec(l.product_id)} className="btn-ghost p-1"><Minus size={12} /></button>
                  <button onClick={() => add(products.find((p) => p.id === l.product_id)!)} className="btn-ghost p-1"><Plus size={12} /></button>
                </div>
              ))}
            </div>
            <input className="input mb-2 text-sm" placeholder="Algemene opmerking (bv. zonder ijs)" value={note} onChange={(e) => setNote(e.target.value)} />
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm">
                <span className="text-white/50">Totaal: </span>
                <span className="font-bold text-base text-white">{fmtEUR(total)}</span>
                <span className="text-violet-300 ml-2 text-xs">{vakjes} vakjes</span>
              </div>
              <button onClick={submit} className="btn-primary px-5 py-2.5 text-sm flex-1 sm:flex-none" disabled={busy}>
                {busy ? <Loader2 className="animate-spin" size={16} /> : <><Send size={16} /> Verzenden</>}
              </button>
            </div>
            {err && <p className="text-red-400 text-xs mt-1.5">{err}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
