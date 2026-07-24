import type { Order, OrderItem } from '../lib/types';
import { fmtEUR, fmtDateTime, vakjesFor } from '../lib/utils';

export function Receipt({ order, vakjeValue }: { order: Order; vakjeValue: number }) {
  return (
    <div className="bg-white text-black rounded-md p-4 font-mono text-sm mx-auto max-w-[300px]" id="receipt">
      <div className="text-center mb-2">
        <p className="font-bold text-base">KLJ Bestelsysteem</p>
        <p className="text-xs">{fmtDateTime(order.created_at)}</p>
      </div>
      <div className="border-t border-dashed border-black/30 my-2" />
      <div className="flex justify-between"><span>Order</span><span>#{order.num}</span></div>
      <div className="flex justify-between"><span>Tafel</span><span>{order.table_name}</span></div>
      <div className="flex justify-between"><span>Ober</span><span>{order.waiter}</span></div>
      <div className="border-t border-dashed border-black/30 my-2" />
      {order.items.map((it: OrderItem, i) => (
        <div key={i} className="mb-1">
          <div className="flex justify-between">
            <span>{it.qty}× {it.name}</span>
            <span>{fmtEUR(it.price * it.qty)}</span>
          </div>
          <div className="flex justify-between text-xs text-black/60">
            <span>&nbsp;&nbsp;{vakjesFor(it.price, vakjeValue, it.vakjes_override) * it.qty} vakjes</span>
            <span>{fmtEUR(it.price)} / stuk</span>
          </div>
          {it.note && <p className="text-xs italic">* {it.note}</p>}
        </div>
      ))}
      <div className="border-t border-dashed border-black/30 my-2" />
      <div className="flex justify-between font-bold"><span>Totaal</span><span>{fmtEUR(order.total)}</span></div>
      <div className="flex justify-between"><span>Vakjes</span><span>{order.vakjes}</span></div>
      {order.note && <p className="mt-2 text-xs italic">Opmerking: {order.note}</p>}
      <div className="text-center mt-3 text-xs">Bedankt!</div>
    </div>
  );
}
