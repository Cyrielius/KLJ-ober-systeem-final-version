import { useState } from 'react';
import { Modal } from './Modal';
import { Minus, Plus, Trash2, Loader2 } from 'lucide-react';
import type { Order, OrderItem, Product } from '../lib/types';
import { fmtEUR, vakjesFor } from '../lib/utils';

interface EditProps {
  order: Order;
  products: Product[];
  vakjeValue: number;
  onClose: () => void;
  onSave: (items: OrderItem[], note?: string) => Promise<void>;
  onCancel?: (order: Order) => void;
}

export function EditOrderModal({ order, products, vakjeValue, onClose, onSave, onCancel }: EditProps) {
  const [items, setItems] = useState<OrderItem[]>(order.items.map((i) => ({ ...i })));
  const [note, setNote] = useState(order.note || '');
  const [busy, setBusy] = useState(false);

  const total = items.reduce((s, i) => s + i.price * i.qty, 0);
  const vakjes = items.reduce((s, i) => s + vakjesFor(i.price, vakjeValue, i.vakjes_override) * i.qty, 0);

  function addProduct(p: Product) {
    setItems((arr) => {
      const ex = arr.find((a) => a.product_id === p.id);
      if (ex) return arr.map((a) => a.product_id === p.id ? { ...a, qty: a.qty + 1 } : a);
      return [...arr, { product_id: p.id, name: p.name, price: Number(p.price), emoji: p.emoji, qty: 1, vakjes_override: p.vakjes_override ?? undefined }];
    });
  }
  function changeQty(id: string, delta: number) {
    setItems((arr) => arr.map((a) => a.product_id === id ? { ...a, qty: Math.max(0, a.qty + delta) } : a).filter((a) => a.qty > 0));
  }
  function setNoteLine(id: string, n: string) {
    setItems((arr) => arr.map((a) => a.product_id === id ? { ...a, note: n } : a));
  }

  async function save() {
    setBusy(true);
    try { await onSave(items, note.trim() || undefined); } finally { setBusy(false); }
  }

  return (
    <Modal open onClose={onClose} title={`Bestelling #${order.num} aanpassen`} size="lg">
      <div className="flex flex-col gap-3">
        <div>
          <p className="label mb-1.5">Producten</p>
          <div className="flex flex-col gap-1.5">
            {items.map((l) => (
              <div key={l.product_id} className="flex items-center gap-2 text-sm bg-white/[0.03] rounded-md p-2">
                <span className="flex-1 text-white/90">{l.name} — {fmtEUR(l.price)}</span>
                <input className="input py-1 px-2 text-xs w-28" placeholder="opmerking" value={l.note || ''} onChange={(e) => setNoteLine(l.product_id, e.target.value)} />
                <button onClick={() => changeQty(l.product_id, -1)} className="btn-ghost p-1"><Minus size={12} /></button>
                <span className="font-mono w-5 text-center text-xs">{l.qty}</span>
                <button onClick={() => changeQty(l.product_id, 1)} className="btn-ghost p-1"><Plus size={12} /></button>
                <button onClick={() => changeQty(l.product_id, -l.qty)} className="btn-danger p-1"><Trash2 size={12} /></button>
              </div>
            ))}
          </div>
        </div>
        <div>
          <p className="label mb-1.5">Product toevoegen</p>
          <div className="flex flex-wrap gap-1.5">
            {products.filter((p) => p.availability === 'available' || (!p.availability && p.available)).map((p) => (
              <button key={p.id} onClick={() => addProduct(p)} className="btn-ghost px-2.5 py-1.5 text-xs">{p.name}</button>
            ))}
          </div>
        </div>
        <input className="input text-sm" placeholder="Algemene opmerking" value={note} onChange={(e) => setNote(e.target.value)} />
        <div className="flex items-center justify-between gap-2">
          {onCancel && order.status === 'pending' ? (
            <button onClick={() => onCancel(order)} className="btn-warn px-3 py-2 text-xs">Annuleren</button>
          ) : <span />}
          <div className="flex items-center gap-3">
            <span className="text-white/50 text-xs">Totaal: <b className="text-white">{fmtEUR(total)}</b> · {vakjes} vakjes</span>
            <button onClick={save} className="btn-primary px-4 py-2 text-sm" disabled={busy}>{busy ? <Loader2 className="animate-spin" size={16} /> : 'Opslaan'}</button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

interface CancelProps {
  order: Order;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
}

export function CancelModal({ order, onClose, onConfirm }: CancelProps) {
  const [reason, setReason] = useState('Verkeerd besteld');
  const [confirmText, setConfirmText] = useState('');
  const [busy, setBusy] = useState(false);
  const reasons = ['Verkeerd besteld', 'Klant geannuleerd', 'Dubbele bestelling', 'Andere reden'];
  const required = String(order.num);
  const canConfirm = confirmText.trim() === required && !busy;
  return (
    <Modal open onClose={onClose} title={`Bestelling #${order.num} annuleren`}>
      <div className="flex flex-col gap-3">
        <div className="bg-red-500/10 border border-red-500/30 rounded-md p-2.5 text-xs text-red-300">
          Deze bestelling blijft zichtbaar in de geschiedenis maar kan niet ongedaan gemaakt worden.
        </div>
        <div>
          <p className="text-white/50 text-xs mb-1.5">Waarom wordt deze bestelling geannuleerd?</p>
          <div className="flex flex-col gap-1.5">
            {reasons.map((r) => (
              <button key={r} onClick={() => setReason(r)} className={`px-3 py-2 rounded-md text-left text-sm transition ${reason === r ? 'bg-amber-600 text-white font-semibold' : 'bg-white/[0.03] hover:bg-white/[0.06]'}`}>{r}</button>
            ))}
          </div>
        </div>
        <div>
          <p className="text-white/50 text-xs mb-1">Typ het bestelnummer <b className="text-white">#{order.num}</b> om te bevestigen:</p>
          <input className="input font-mono text-center text-base" placeholder={required} value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoFocus />
        </div>
        <div className="flex gap-2">
          <button onClick={onClose} className="btn-ghost px-3 py-2.5 flex-1 text-sm">Terug</button>
          <button
            onClick={async () => { if (!canConfirm) return; setBusy(true); try { await onConfirm(reason); } finally { setBusy(false); } }}
            className={`px-3 py-2.5 flex-1 rounded-md font-semibold text-sm transition ${canConfirm ? 'bg-red-600 hover:bg-red-500 text-white' : 'bg-white/[0.03] text-white/30 cursor-not-allowed'}`}
            disabled={!canConfirm}
          >
            {busy ? 'Annuleren...' : 'Bevestig annulering'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

interface DetailsProps {
  order: Order;
  vakjeValue: number;
  onClose: () => void;
}

export function DetailsModal({ order, vakjeValue, onClose }: DetailsProps) {
  return (
    <Modal open onClose={onClose} title={`Bestelling #${order.num}`} size="md">
      <div className="flex flex-col gap-1.5 text-sm">
        <div className="flex justify-between"><span className="text-white/40">Tafel</span><span className="text-white">{order.table_name}</span></div>
        <div className="flex justify-between"><span className="text-white/40">Ober</span><span className="text-white">{order.waiter}</span></div>
        <div className="flex justify-between"><span className="text-white/40">Tijd</span><span className="text-white">{new Date(order.created_at).toLocaleString('nl-BE')}</span></div>
        <div className="flex justify-between"><span className="text-white/40">Status</span><span className="text-white">{order.status}</span></div>
        {order.cancel_reason && <div className="flex justify-between"><span className="text-white/40">Reden annulering</span><span className="text-white">{order.cancel_reason}</span></div>}
        <div className="border-t border-white/[0.06] my-1.5" />
        {order.items.map((it, i) => (
          <div key={i} className="flex justify-between">
            <span className="text-white/90">{it.qty}× {it.name} {it.note && <span className="text-white/40 italic">— {it.note}</span>}</span>
            <span className="text-white/60">{fmtEUR(it.price * it.qty)}</span>
          </div>
        ))}
        <div className="border-t border-white/[0.06] my-1.5" />
        <div className="flex justify-between font-bold"><span className="text-white">Totaal</span><span className="text-white">{fmtEUR(order.total)}</span></div>
        <div className="flex justify-between"><span className="text-white/40">Vakjes</span><span className="text-white">{order.vakjes}</span></div>
      </div>
    </Modal>
  );
}
