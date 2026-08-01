import { useState, useEffect, useMemo } from 'react';
import { X, Plus, Minus, Send, Loader2, Search, Wine } from 'lucide-react';
import type { Product, OrderItem } from '../lib/types';
import { fmtEUR, vakjesFor } from '../lib/utils';

interface Props {
  products: Product[];
  vakjeValue: number;
  workerName: string;
  onClose: () => void;
  onSubmit: (items: OrderItem[], note?: string) => Promise<void>;
}

export function BarOrderModal({ products, vakjeValue, workerName, onClose, onSubmit }: Props) {
  const [cart, setCart] = useState<Record<string, OrderItem>>({});
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [query, setQuery] = useState('');
  const [justSent, setJustSent] = useState(false);

  const visible = products.filter((p) => (p.availability || (p.available ? 'available' : 'unavailable')) !== 'hidden');
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
  function setNoteLine(id: string, n: string) {
    setCart((c) => c[id] ? { ...c, [id]: { ...c[id], note: n } } : c);
  }

  useEffect(() => {
    if (justSent) {
      const t = setTimeout(() => { setJustSent(false); onClose(); }, 1200);
      return () => clearTimeout(t);
    }
  }, [justSent, onClose]);

  async function submit() {
    if (cartLines.length === 0) return setErr('Voeg minstens één product toe.');
    setBusy(true); setErr('');
    try {
      await onSubmit(cartLines, note.trim() || undefined);
      setJustSent(true);
    } catch (e: any) { setErr(e.message || 'Verzenden mislukt.'); }
    finally { setBusy(false); }
  }

  const sortedCart = useMemo(() => cartLines, [cartLines]);

  return (
    <div className="fixed inset-0 z-[60] flex items-stretch justify-center bg-black/80 backdrop-blur-sm">
      <div className="w-full max-w-2xl bg-[#0d1117] flex flex-col animate-pop">
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.08]">
          <Wine size={18} className="text-amber-400" />
          <h2 className="text-base font-bold text-white flex-1">Bar bestelling</h2>
          <span className="text-xs text-white/40">door {workerName}</span>
          <button onClick={onClose} className="btn-ghost p-1.5"><X size={18} /></button>
        </div>

        {justSent ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 p-8">
            <div className="w-16 h-16 rounded-full bg-emerald-500/15 text-emerald-400 flex items-center justify-center">
              <Send size={28} />
            </div>
            <p className="text-lg font-bold text-white">Bestelling toegevoegd</p>
            <p className="text-sm text-white/50">Wordt geregistreerd in de statistieken</p>
          </div>
        ) : (
          <>
            {/* Search */}
            <div className="p-3 border-b border-white/[0.04]">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                <input
                  className="input pl-9"
                  placeholder="Product zoeken..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  autoFocus
                />
              </div>
            </div>

            {/* Products grid */}
            <div className="flex-1 overflow-y-auto px-3 py-3" style={{ paddingBottom: sortedCart.length > 0 ? 180 : 16 }}>
              {filtered.length === 0 && <p className="text-white/30 text-sm text-center py-8">Geen producten gevonden.</p>}
              {categories.map((cat) => {
                const catProducts = filtered.filter((p) => p.category === cat);
                return (
                  <div key={cat} className="mb-3">
                    <p className="section-title mb-1.5">{cat}</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
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
                              <img src={p.photo_url} alt="" className="w-full h-14 rounded object-cover mb-1" onError={(e) => (e.currentTarget.style.display = 'none')} />
                            ) : (
                              <div className="text-2xl mb-1">{p.emoji}</div>
                            )}
                            <p className="font-semibold text-sm text-white leading-tight">{p.name}</p>
                            <p className="text-emerald-400 text-xs">{fmtEUR(Number(p.price))}</p>
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
                  </div>
                );
              })}
            </div>

            {/* Cart bar */}
            {sortedCart.length > 0 && (
              <div className="border-t border-white/[0.08] bg-[#131820] p-3">
                <div className="flex flex-col gap-1.5 mb-2 max-h-28 overflow-y-auto">
                  {sortedCart.map((l) => (
                    <div key={l.product_id} className="flex items-center gap-2 text-sm">
                      <span className="bg-white/[0.08] rounded px-1.5 py-0.5 font-mono text-xs font-bold">{l.qty}×</span>
                      <span className="flex-1 text-white/90 truncate">{l.name}</span>
                      <input
                        className="input py-1 px-2 text-xs flex-none w-24"
                        placeholder="opmerking"
                        value={l.note || ''}
                        onChange={(e) => setNoteLine(l.product_id, e.target.value)}
                      />
                      <button onClick={() => dec(l.product_id)} className="btn-ghost p-1"><Minus size={12} /></button>
                      <button onClick={() => add(products.find((p) => p.id === l.product_id)!)} className="btn-ghost p-1"><Plus size={12} /></button>
                    </div>
                  ))}
                </div>
                <input className="input mb-2 text-sm" placeholder="Opmerking (optioneel)" value={note} onChange={(e) => setNote(e.target.value)} />
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm">
                    <span className="text-white/50">Totaal: </span>
                    <span className="font-bold text-base text-white">{fmtEUR(total)}</span>
                    <span className="text-violet-300 ml-2 text-xs">{vakjes} vakjes</span>
                  </div>
                  <button onClick={submit} className="btn-primary px-5 py-2.5 text-sm flex items-center gap-2" disabled={busy}>
                    {busy ? <Loader2 className="animate-spin" size={16} /> : <><Send size={16} /> Toevoegen</>}
                  </button>
                </div>
                {err && <p className="text-red-400 text-xs mt-1.5">{err}</p>}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
