import { useMemo } from 'react';
import type { Order } from '../lib/types';
import { fmtEUR } from '../lib/utils';
import { Download, FileText, FileSpreadsheet, Printer } from 'lucide-react';

export function Stats({ orders }: { orders: Order[] }) {
  const s = useMemo(() => {
    const done = orders.filter((o) => o.status === 'done' || o.status === 'completed');
    const pending = orders.filter((o) => o.status === 'pending');
    const cancelled = orders.filter((o) => o.status === 'cancelled');
    const completed = orders.filter((o) => o.status === 'completed');
    const revenue = completed.reduce((sum, o) => sum + Number(o.total), 0);
    const vakjes = completed.reduce((sum, o) => sum + o.vakjes, 0);
    const avg = completed.length ? revenue / completed.length : 0;

    const waitTimes = done.map((o) => (new Date(o.completed_at || o.updated_at).getTime() - new Date(o.created_at).getTime()) / 60000);
    const avgWait = waitTimes.length ? waitTimes.reduce((a, b) => a + b, 0) / waitTimes.length : 0;

    const productCount: Record<string, number> = {};
    const productRevenue: Record<string, number> = {};
    done.forEach((o) => o.items.forEach((it) => {
      productCount[it.name] = (productCount[it.name] || 0) + it.qty;
      productRevenue[it.name] = (productRevenue[it.name] || 0) + Number(it.price) * it.qty;
    }));
    const allProducts = Object.entries(productCount).sort((a, b) => b[1] - a[1]);
    const topProducts = allProducts.slice(0, 5);

    const tableCount: Record<string, number> = {};
    completed.forEach((o) => { tableCount[o.table_name] = (tableCount[o.table_name] || 0) + Number(o.total); });
    const topTables = Object.entries(tableCount).sort((a, b) => b[1] - a[1]).slice(0, 5);

    const waiterCount: Record<string, number> = {};
    completed.forEach((o) => { waiterCount[o.waiter] = (waiterCount[o.waiter] || 0) + Number(o.total); });
    const topWaiters = Object.entries(waiterCount).sort((a, b) => b[1] - a[1]).slice(0, 5);

    const hourly: Record<string, number> = {};
    completed.forEach((o) => {
      const h = new Date(o.created_at).getHours();
      hourly[h] = (hourly[h] || 0) + Number(o.total);
    });
    const hourlyRows = Object.entries(hourly).sort((a, b) => Number(a[0]) - Number(b[0]));
    const maxHour = Math.max(1, ...hourlyRows.map((r) => r[1]));

    return { done: done.length, pending: pending.length, cancelled: cancelled.length, completed: completed.length, revenue, vakjes, avg, avgWait, topProducts, topTables, topWaiters, hourlyRows, maxHour, allProducts, productRevenue };
  }, [orders]);

  const cards = [
    { label: 'Keuken ontvangen', value: s.pending, color: 'text-emerald-400' },
    { label: 'Keuken afgewerkt', value: s.done, color: 'text-sky-400' },
    { label: 'Volledig afgewerkt', value: s.completed, color: 'text-white' },
    { label: 'Geannuleerd', value: s.cancelled, color: 'text-red-400' },
    { label: 'Omzet', value: fmtEUR(s.revenue), color: 'text-emerald-400' },
    { label: 'Vakjes', value: s.vakjes, color: 'text-violet-300' },
    { label: 'Gem. bestelling', value: fmtEUR(s.avg), color: 'text-white' },
    { label: 'Gem. wachttijd', value: `${Math.round(s.avgWait)}m`, color: 'text-amber-400' },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-xl font-bold">Statistieken</h2>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => exportCSV(orders)} className="btn-ghost px-3 py-2 text-sm flex items-center gap-2"><Download size={16} /> CSV</button>
          <button onClick={() => exportExcel(orders)} className="btn-ghost px-3 py-2 text-sm flex items-center gap-2"><FileSpreadsheet size={16} /> Excel</button>
          <button onClick={() => exportPDF(orders)} className="btn-ghost px-3 py-2 text-sm flex items-center gap-2"><FileText size={16} /> PDF</button>
          <button onClick={() => printProductSummary(orders)} className="btn-ghost px-3 py-2 text-sm flex items-center gap-2"><Printer size={16} /> Producten</button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {cards.map((c) => (
          <div key={c.label} className="card p-4">
            <p className="text-white/40 text-xs uppercase tracking-wider">{c.label}</p>
            <p className={`text-2xl font-bold ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="card p-4">
        <p className="text-white/40 text-xs uppercase tracking-wider mb-3">Omzet per uur</p>
        {s.hourlyRows.length === 0 && <p className="text-white/30 text-sm">Nog geen data</p>}
        <div className="flex items-end gap-1 h-40">
          {s.hourlyRows.map(([h, v]) => (
            <div key={h} className="flex-1 flex flex-col items-center gap-1 min-w-0">
              <div className="w-full bg-emerald-500/70 rounded-t hover:bg-emerald-400 transition-colors" style={{ height: `${(v / s.maxHour) * 100}%` }} title={fmtEUR(v)} />
              <span className="text-white/40 text-[10px]">{h}u</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid sm:grid-cols-3 gap-3">
        <TopList title="Top producten" rows={s.topProducts} fmt={(v) => `${v}×`} />
        <TopList title="Top tafels" rows={s.topTables} fmt={(v) => fmtEUR(v)} />
        <TopList title="Top obers" rows={s.topWaiters} fmt={(v) => fmtEUR(v)} />
      </div>

      <div className="card p-4">
        <p className="text-white/40 text-xs uppercase tracking-wider mb-3">Verkocht per product — totaal aantal</p>
        {s.allProducts.length === 0 && <p className="text-white/30 text-sm">Nog geen data</p>}
        <div className="flex flex-col gap-1">
          {s.allProducts.map(([k, v], i) => (
            <div key={k} className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2"><span className="text-white/30 w-6">{i + 1}.</span>{k}</span>
              <span className="text-white/70"><b className="text-white">{v}</b>× · {fmtEUR(s.productRevenue[k] || 0)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TopList({ title, rows, fmt }: { title: string; rows: [string, number][]; fmt: (v: number) => string }) {
  return (
    <div className="card p-4">
      <p className="text-white/40 text-xs uppercase tracking-wider mb-2">{title}</p>
      {rows.length === 0 && <p className="text-white/30 text-sm">Nog geen data</p>}
      <div className="flex flex-col gap-1">
        {rows.map(([k, v], i) => (
          <div key={k} className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2"><span className="text-white/30 w-4">{i + 1}.</span>{k}</span>
            <span className="text-white/70">{fmt(v)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Keuken ontvangen',
  done: 'Keuken afgewerkt',
  completed: 'Volledig afgewerkt',
  cancelled: 'Geannuleerd',
};

function orderRows(orders: Order[]) {
  return orders
    .filter((o) => o.status === 'done' || o.status === 'completed')
    .sort((a, b) => a.num - b.num)
    .map((o) => ({
      num: o.num,
      table: o.table_name,
      waiter: o.waiter,
      status: STATUS_LABELS[o.status] || o.status,
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

function printProductSummary(orders: Order[]) {
  const rows = orderRows(orders);
  const counts: Record<string, { qty: number; revenue: number }> = {};
  rows.forEach((r) => {
    r.items.split('; ').forEach((entry) => {
      const m = entry.match(/^(\d+)×\s(.+)$/);
      if (!m) return;
      const qty = Number(m[1]);
      const name = m[2];
      if (!counts[name]) counts[name] = { qty: 0, revenue: 0 };
      counts[name].qty += qty;
    });
  });
  const sorted = Object.entries(counts).sort((a, b) => b[1].qty - a[1].qty);
  const totalQty = sorted.reduce((s, [, v]) => s + v.qty, 0);
  const w = window.open('', '_blank', 'width=600,height=800');
  if (!w) return;
  const body = sorted.map(([name, v], i) => `<tr><td>${i + 1}</td><td>${name}</td><td style="text-align:center;font-weight:bold">${v.qty}×</td></tr>`).join('');
  w.document.write(`<!doctype html><html><head><title>KLJ Verkochte Producten</title><style>body{font-family:system-ui;padding:24px}h1{margin-bottom:4px}table{width:100%;border-collapse:collapse;font-size:14px;margin-top:12px}th,td{border:1px solid #ccc;padding:6px 10px;text-align:left}th{background:#f0f0f0}.total{margin-top:16px;font-size:16px;font-weight:bold}</style></head><body><h1>KLJ Bestelsysteem — Verkochte Producten</h1><p>${sorted.length} producten · ${totalQty} stuks totaal · ${new Date().toLocaleString('nl-BE')}</p><table><thead><tr><th>#</th><th>Product</th><th style="text-align:center">Aantal</th></tr></thead><tbody>${body}</tbody></table><p class="total">Totaal: ${totalQty} stuks</p><script>window.onload=()=>{setTimeout(()=>window.print(),300)}</script></body></html>`);
  w.document.close();
  w.focus();
}

function download(blob: Blob, ext: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `klj-statistieken-${new Date().toISOString().slice(0, 10)}.${ext}`;
  a.click();
  URL.revokeObjectURL(url);
}
