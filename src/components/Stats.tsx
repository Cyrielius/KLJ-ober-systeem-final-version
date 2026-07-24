import { useMemo } from 'react';
import type { Order } from '../lib/types';
import { fmtEUR } from '../lib/utils';
import { Download, FileText, FileSpreadsheet, Printer } from 'lucide-react';

export function Stats({ orders }: { orders: Order[] }) {
  const s = useMemo(() => {
    // Count all non-cancelled orders as "active"
    const active = orders.filter((o) => o.status !== 'cancelled');
    const done = orders.filter((o) => o.status === 'done');
    const completed = orders.filter((o) => o.status === 'completed');
    const cancelled = orders.filter((o) => o.status === 'cancelled');
    const pending = orders.filter((o) => o.status === 'pending');

    // Revenue = all completed + done orders (both are "sold")
    const revenueOrders = [...completed, ...done];
    const revenue = revenueOrders.reduce((sum, o) => sum + Number(o.total), 0);
    const vakjes = revenueOrders.reduce((sum, o) => sum + o.vakjes, 0);
    const avg = revenueOrders.length ? revenue / revenueOrders.length : 0;

    // Wait times: from created to completed_at (for done) or picked_up_at (for completed)
    const waitTimes = revenueOrders.map((o) => {
      const end = o.picked_up_at || o.completed_at || o.updated_at;
      return (new Date(end).getTime() - new Date(o.created_at).getTime()) / 60000;
    });
    const avgWait = waitTimes.length ? waitTimes.reduce((a, b) => a + b, 0) / waitTimes.length : 0;

    // Product counts from completed + done orders only
    const productCount: Record<string, number> = {};
    const productRevenue: Record<string, number> = {};
    revenueOrders.forEach((o) => o.items.forEach((it) => {
      productCount[it.name] = (productCount[it.name] || 0) + it.qty;
      productRevenue[it.name] = (productRevenue[it.name] || 0) + Number(it.price) * it.qty;
    }));
    const allProducts = Object.entries(productCount).sort((a, b) => b[1] - a[1]);
    const topProducts = allProducts.slice(0, 5);

    const tableCount: Record<string, number> = {};
    revenueOrders.forEach((o) => { tableCount[o.table_name] = (tableCount[o.table_name] || 0) + Number(o.total); });
    const topTables = Object.entries(tableCount).sort((a, b) => b[1] - a[1]).slice(0, 5);

    const waiterCount: Record<string, number> = {};
    revenueOrders.forEach((o) => { waiterCount[o.waiter] = (waiterCount[o.waiter] || 0) + Number(o.total); });
    const topWaiters = Object.entries(waiterCount).sort((a, b) => b[1] - a[1]).slice(0, 5);

    const hourly: Record<string, number> = {};
    revenueOrders.forEach((o) => {
      const h = new Date(o.created_at).getHours();
      hourly[h] = (hourly[h] || 0) + Number(o.total);
    });
    const hourlyRows = Object.entries(hourly).sort((a, b) => Number(a[0]) - Number(b[0]));
    const maxHour = Math.max(1, ...hourlyRows.map((r) => r[1]));

    return {
      totalActive: active.length,
      done: done.length,
      completed: completed.length,
      pending: pending.length,
      cancelled: cancelled.length,
      revenue,
      vakjes,
      avg,
      avgWait,
      topProducts,
      topTables,
      topWaiters,
      hourlyRows,
      maxHour,
      allProducts,
      productRevenue,
    };
  }, [orders]);

  const cards = [
    { label: 'Open', value: s.pending, color: 'text-emerald-400' },
    { label: 'Klaar', value: s.done, color: 'text-sky-400' },
    { label: 'Afgerond', value: s.completed, color: 'text-white/70' },
    { label: 'Geannuleerd', value: s.cancelled, color: 'text-red-400' },
    { label: 'Omzet', value: fmtEUR(s.revenue), color: 'text-emerald-400' },
    { label: 'Vakjes', value: s.vakjes, color: 'text-violet-300' },
    { label: 'Gem. bestelling', value: fmtEUR(s.avg), color: 'text-white' },
    { label: 'Gem. wachttijd', value: `${Math.round(s.avgWait)}m`, color: 'text-amber-400' },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-base font-bold text-white">Statistieken</h2>
        <div className="flex gap-1.5 flex-wrap">
          <button onClick={() => printAllProducts(orders)} className="btn-primary px-2.5 py-1.5 text-xs flex items-center gap-1.5">
            <Printer size={14} /> Print alles
          </button>
          <button onClick={() => exportCSV(orders)} className="btn-ghost px-2.5 py-1.5 text-xs flex items-center gap-1.5"><Download size={14} /> CSV</button>
          <button onClick={() => exportExcel(orders)} className="btn-ghost px-2.5 py-1.5 text-xs flex items-center gap-1.5"><FileSpreadsheet size={14} /> Excel</button>
          <button onClick={() => exportPDF(orders)} className="btn-ghost px-2.5 py-1.5 text-xs flex items-center gap-1.5"><FileText size={14} /> PDF</button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {cards.map((c) => (
          <div key={c.label} className="card p-3">
            <p className="text-white/40 text-[10px] uppercase tracking-wider">{c.label}</p>
            <p className={`text-xl font-bold ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="card p-3">
        <p className="section-title mb-2">Omzet per uur</p>
        {s.hourlyRows.length === 0 && <p className="text-white/30 text-xs">Nog geen data</p>}
        <div className="flex items-end gap-1 h-32">
          {s.hourlyRows.map(([h, v]) => (
            <div key={h} className="flex-1 flex flex-col items-center gap-1 min-w-0">
              <div className="w-full bg-emerald-600/70 rounded-t hover:bg-emerald-500 transition-colors" style={{ height: `${(v / s.maxHour) * 100}%` }} title={fmtEUR(v)} />
              <span className="text-white/40 text-[10px]">{h}u</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid sm:grid-cols-3 gap-2">
        <TopList title="Top producten" rows={s.topProducts} fmt={(v) => `${v}×`} />
        <TopList title="Top tafels" rows={s.topTables} fmt={(v) => fmtEUR(v)} />
        <TopList title="Top obers" rows={s.topWaiters} fmt={(v) => fmtEUR(v)} />
      </div>

      <div className="card p-3">
        <p className="section-title mb-2">Verkocht per product — totaal aantal</p>
        {s.allProducts.length === 0 && <p className="text-white/30 text-xs">Nog geen data</p>}
        <div className="flex flex-col gap-0.5">
          {s.allProducts.map(([k, v], i) => (
            <div key={k} className="flex items-center justify-between text-sm py-1 border-b border-white/[0.03] last:border-0">
              <span className="flex items-center gap-2">
                <span className="text-white/30 w-6 text-xs">{i + 1}.</span>
                <span className="text-white/90">{k}</span>
              </span>
              <span className="text-white/70 text-xs">
                <b className="text-white">{v}</b>× · {fmtEUR(s.productRevenue[k] || 0)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TopList({ title, rows, fmt }: { title: string; rows: [string, number][]; fmt: (v: number) => string }) {
  return (
    <div className="card p-3">
      <p className="section-title mb-2">{title}</p>
      {rows.length === 0 && <p className="text-white/30 text-xs">Nog geen data</p>}
      <div className="flex flex-col gap-0.5">
        {rows.map(([k, v], i) => (
          <div key={k} className="flex items-center justify-between text-sm py-1">
            <span className="flex items-center gap-2">
              <span className="text-white/30 w-4 text-xs">{i + 1}.</span>
              <span className="text-white/90 truncate">{k}</span>
            </span>
            <span className="text-white/70 text-xs">{fmt(v)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Get product totals from completed + done orders
function productTotals(orders: Order[]): { name: string; qty: number; revenue: number }[] {
  const sold = orders.filter((o) => o.status === 'completed' || o.status === 'done');
  const counts: Record<string, number> = {};
  const revenue: Record<string, number> = {};
  sold.forEach((o) => o.items.forEach((it) => {
    counts[it.name] = (counts[it.name] || 0) + it.qty;
    revenue[it.name] = (revenue[it.name] || 0) + Number(it.price) * it.qty;
  }));
  return Object.entries(counts)
    .map(([name, qty]) => ({ name, qty, revenue: revenue[name] || 0 }))
    .sort((a, b) => b.qty - a.qty);
}

// Print a single overview of all sold products (totals per product, not per order)
function printAllProducts(orders: Order[]) {
  const products = productTotals(orders);
  const totalQty = products.reduce((s, p) => s + p.qty, 0);
  const totalRevenue = products.reduce((s, p) => s + p.revenue, 0);

  const w = window.open('', '_blank', 'width=600,height=800');
  if (!w) return;

  const rows = products.map((p) =>
    `<tr><td>${p.name}</td><td style="text-align:center">${p.qty}×</td><td style="text-align:right">${fmtEUR(p.revenue)}</td></tr>`
  ).join('');

  w.document.write(`<!doctype html><html><head><title>KLJ — Productoverzicht</title><style>
    body{font-family:system-ui;padding:24px;color:#111}
    h1{margin:0 0 4px 0;font-size:20px}
    .meta{color:#666;font-size:13px;margin-bottom:16px}
    table{width:100%;border-collapse:collapse;font-size:14px}
    th,td{border-bottom:1px solid #ddd;padding:8px 12px;text-align:left}
    th{background:#f5f5f5;font-weight:600;text-transform:uppercase;font-size:11px;letter-spacing:0.5px}
    .totals{margin-top:16px;padding-top:12px;border-top:2px solid #333;font-weight:bold;font-size:16px}
    .totals div{display:flex;justify-content:space-between;padding:4px 0}
  </style></head><body>
    <h1>KLJ Bestelsysteem — Productoverzicht</h1>
    <p class="meta">${new Date().toLocaleString('nl-BE')} · ${products.length} producten · ${totalQty} stuks verkocht</p>
    <table>
      <thead><tr><th>Product</th><th style="text-align:center">Aantal</th><th style="text-align:right">Omzet</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="totals">
      <div><span>Totaal stuks:</span><span>${totalQty}×</span></div>
      <div><span>Totale omzet:</span><span>${fmtEUR(totalRevenue)}</span></div>
    </div>
  </body></html>`);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 300);
}

function orderRows(orders: Order[]) {
  return orders.filter((o) => o.status === 'done' || o.status === 'completed').map((o) => ({
    num: o.num,
    table: o.table_name,
    waiter: o.waiter,
    status: o.status,
    total: Number(o.total),
    vakjes: o.vakjes,
    items: o.items.map((i) => `${i.qty}× ${i.name}`).join('; '),
    created: new Date(o.created_at).toLocaleString('nl-BE'),
  }));
}

function exportCSV(orders: Order[]) {
  const rows = orderRows(orders);
  const header = ['Nummer', 'Tafel', 'Ober', 'Status', 'Totaal', 'Vakjes', 'Producten', 'Tijdstip'];
  const lines = [header.join(';'), ...rows.map((r) => [r.num, r.table, r.waiter, r.status, r.total, r.vakjes, `"${r.items.replace(/"/g, '""')}"`, r.created].join(';'))];
  download(new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8' }), 'csv');
}

function exportExcel(orders: Order[]) {
  const rows = orderRows(orders);
  const header = '<tr><th>Nummer</th><th>Tafel</th><th>Ober</th><th>Status</th><th>Totaal</th><th>Vakjes</th><th>Producten</th><th>Tijdstip</th></tr>';
  const body = rows.map((r) => `<tr><td>${r.num}</td><td>${r.table}</td><td>${r.waiter}</td><td>${r.status}</td><td>${r.total}</td><td>${r.vakjes}</td><td>${r.items}</td><td>${r.created}</td></tr>`).join('');
  const html = `<table border="1">${header}${body}</table>`;
  download(new Blob([html], { type: 'application/vnd.ms-excel' }), 'xls');
}

function exportPDF(orders: Order[]) {
  const rows = orderRows(orders);
  const w = window.open('', '_blank', 'width=900,height=700');
  if (!w) return;
  const body = rows.map((r) => `<tr><td>${r.num}</td><td>${r.table}</td><td>${r.waiter}</td><td>${r.status}</td><td>€${r.total}</td><td>${r.vakjes}</td><td>${r.items}</td><td>${r.created}</td></tr>`).join('');
  w.document.write(`<!doctype html><html><head><title>KLJ Statistieken</title><style>body{font-family:system-ui;padding:24px}h1{margin-bottom:8px}table{width:100%;border-collapse:collapse;font-size:12px}th,td{border:1px solid #ccc;padding:4px 8px;text-align:left}th{background:#f0f0f0}</style></head><body><h1>KLJ Bestelsysteem — Statistieken</h1><p>${rows.length} bestellingen · ${new Date().toLocaleString('nl-BE')}</p><table><thead><tr><th>#</th><th>Tafel</th><th>Ober</th><th>Status</th><th>Totaal</th><th>Vakjes</th><th>Producten</th><th>Tijdstip</th></tr></thead><tbody>${body}</tbody></table></body></html>`);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 300);
}

function download(blob: Blob, ext: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `klj-statistieken-${new Date().toISOString().slice(0, 10)}.${ext}`;
  a.click();
  URL.revokeObjectURL(url);
}
