/**
 * Printer-ondersteuning voor KLJ Bestelsysteem.
 *
 * Ondersteunt twee soorten directe (pop-up-vrije) printers via WebUSB/WebSerial:
 *   1. ESC/POS thermische bonprinters (Volcora, Epson, enz.) — ruwe bytes via USB/Serial
 *   2. Dymo LabelWriter labelprinters (450, 550, Twin Turbo, Duo) — via @thermal-label/labelwriter-web
 *
 * Beide printen volledig automatisch: geen pop-up, geen "Afdrukken"-knop.
 * Als er geen directe printer verbonden is, valt het systeem terug op browser-print.
 */
import type { Order } from './types';
import { requestPrinter, type WebLabelWriterPrinter } from '@thermal-label/labelwriter-web';

const ESC = 0x1b;
const GS = 0x1d;

type Printer = { kind: 'usb'; device: USBDevice; endpoint: number } | { kind: 'serial'; port: SerialPort };

let connected: Printer | null = null;
let dymoPrinter: WebLabelWriterPrinter | null = null;
const listeners = new Set<(connected: boolean) => void>();

function notifyPrinterChange() {
  const ok = connected !== null || (dymoPrinter !== null && dymoPrinter.connected);
  listeners.forEach((fn) => fn(ok));
}

export function onPrinterChange(fn: (connected: boolean) => void): () => void {
  listeners.add(fn);
  fn(connected !== null || (dymoPrinter !== null && dymoPrinter.connected));
  return () => listeners.delete(fn);
}

function bytes(...parts: (number | number[] | string)[]): Uint8Array {
  const out: number[] = [];
  for (const p of parts) {
    if (typeof p === 'number') out.push(p);
    else if (Array.isArray(p)) out.push(...p);
    else {
      for (let i = 0; i < p.length; i++) out.push(p.charCodeAt(i));
    }
  }
  return new Uint8Array(out);
}

function strBytes(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

// ESC/POS helpers
const init = () => bytes(ESC, 0x40);
const align = (n: 0 | 1 | 2) => bytes(ESC, 0x61, n);
const bold = (on: boolean) => bytes(ESC, 0x45, on ? 1 : 0);
const size = (w: 1 | 2, h: 1 | 2) => bytes(GS, 0x21, ((w - 1) << 4) | (h - 1));
const feed = (n = 1) => bytes(ESC, 0x64, n);
const cut = () => bytes(GS, 0x56, 0x00);

async function send(prn: Printer, data: Uint8Array): Promise<void> {
  if (prn.kind === 'usb') {
    await prn.device.transferOut(prn.endpoint, data);
  } else {
    const writer = prn.port.writable?.getWriter();
    if (!writer) throw new Error('Seriële poort niet schrijfbaar');
    try {
      await writer.write(data);
    } finally {
      writer.releaseLock();
    }
  }
}

// ---- Public API ----
export function isWebUSBSupported(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.usb;
}

export function isWebSerialSupported(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.serial;
}

export function isPrinterConnected(): boolean {
  return connected !== null || (dymoPrinter !== null && dymoPrinter.connected);
}

export function isDymoConnected(): boolean {
  return dymoPrinter !== null && dymoPrinter.connected;
}

export async function connectUSBPrinter(): Promise<void> {
  if (!isWebUSBSupported()) throw new Error('WebUSB niet ondersteund in deze browser. Gebruik Chrome of Edge.');
  const device = await navigator.usb!.requestDevice({ filters: [] });
  await device.open();
  if (!device.configuration) {
    await device.selectConfiguration(1);
  }
  const cfg = device.configuration;
  if (!cfg) throw new Error('Geen USB-configuratie beschikbaar');
  const iface = cfg.interfaces[0];
  await device.claimInterface(iface.interfaceNumber);
  const ep = iface.alternates[0].endpoints.find((e) => e.direction === 'out') ?? iface.alternates[0].endpoints[0];
  connected = { kind: 'usb', device, endpoint: ep.endpointNumber };
  notifyPrinterChange();
}

export async function connectSerialPrinter(): Promise<void> {
  if (!isWebSerialSupported()) throw new Error('Web Serial niet ondersteund in deze browser. Gebruik Chrome of Edge.');
  const port = await navigator.serial!.requestPort();
  await port.open({ baudRate: 9600 });
  connected = { kind: 'serial', port };
  notifyPrinterChange();
}

export async function connectDymoPrinter(): Promise<void> {
  if (!isWebUSBSupported()) throw new Error('WebUSB niet ondersteund in deze browser. Gebruik Chrome of Edge.');
  const printer = await requestPrinter();
  try { await printer.getStatus(); } catch { /* media-detectie optioneel */ }
  dymoPrinter = printer;
  notifyPrinterChange();
}

export async function disconnectDymoPrinter(): Promise<void> {
  if (dymoPrinter) {
    try { await dymoPrinter.close(); } catch { /* ignore */ }
    dymoPrinter = null;
    notifyPrinterChange();
  }
}

export async function disconnectPrinter(): Promise<void> {
  try {
    if (connected) {
      if (connected.kind === 'usb') {
        try { await connected.device.releaseInterface(0); } catch { /* ignore */ }
        await connected.device.close();
      } else {
        await connected.port.close();
      }
      connected = null;
    }
    if (dymoPrinter) {
      try { await dymoPrinter.close(); } catch { /* ignore */ }
      dymoPrinter = null;
    }
  } finally {
    notifyPrinterChange();
  }
}

function pad(s: string, len: number): string {
  return s.length >= len ? s.slice(0, len) : s + ' '.repeat(len - s.length);
}

function fmtEUR(n: number): string {
  return new Intl.NumberFormat('nl-BE', { style: 'currency', currency: 'EUR' }).format(n);
}

function vakjesFor(price: number, vakjeValue: number, override?: number | null): number {
  if (override != null && override >= 0) return override;
  if (vakjeValue <= 0) return 0;
  return Math.round(price / vakjeValue);
}

// ---- ESC/POS beeld-commando's (logo) ----

async function imageToEscPosRaster(logoUrl: string, maxWidth = 384): Promise<Uint8Array | null> {
  try {
    const res = await fetch(logoUrl);
    if (!res.ok) return null;
    const blob = await res.blob();
    const bitmap = await createImageBitmap(blob);
    const aspect = bitmap.height / bitmap.width;
    const w = Math.min(maxWidth, bitmap.width);
    const h = Math.round(w * aspect);

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, w, h);
    const imgData = ctx.getImageData(0, 0, w, h);

    const gray = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) {
      const r = imgData.data[i * 4];
      const g = imgData.data[i * 4 + 1];
      const b = imgData.data[i * 4 + 2];
      const a = imgData.data[i * 4 + 3];
      gray[i] = (0.299 * r + 0.587 * g + 0.114 * b) * (a / 255);
    }

    const bw = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        const oldVal = gray[idx];
        const newVal = oldVal < 128 ? 0 : 255;
        bw[idx] = newVal < 128 ? 1 : 0;
        const err = oldVal - newVal;
        if (x + 1 < w) gray[idx + 1] += err * 7 / 16;
        if (y + 1 < h) {
          if (x > 0) gray[idx + w - 1] += err * 3 / 16;
          gray[idx + w] += err * 5 / 16;
          if (x + 1 < w) gray[idx + w + 1] += err * 1 / 16;
        }
      }
    }

    const widthBytes = Math.ceil(w / 8);
    const roundedWidth = widthBytes * 8;
    const raster = new Uint8Array(widthBytes * h);
    for (let y = 0; y < h; y++) {
      for (let xByte = 0; xByte < widthBytes; xByte++) {
        let byteVal = 0;
        for (let bit = 0; bit < 8; bit++) {
          const x = xByte * 8 + bit;
          if (x < w && bw[y * w + x]) {
            byteVal |= 0x80 >> bit;
          }
        }
        raster[y * widthBytes + xByte] = byteVal;
      }
    }

    const header = bytes(GS, 0x76, 0x30, 0x00, widthBytes & 0xff, (widthBytes >> 8) & 0xff, h & 0xff, (h >> 8) & 0xff);
    const result = new Uint8Array(header.length + raster.length);
    result.set(header, 0);
    result.set(raster, header.length);
    void roundedWidth;
    return result;
  } catch {
    return null;
  }
}

function concatChunks(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((a, c) => a + c.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.length; }
  return out;
}

export async function buildReceipt(order: Order, vakjeValue: number, logoUrl?: string | null): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  const push = (...p: (number | number[] | string)[]) => chunks.push(bytes(...p));
  const pushStr = (s: string) => chunks.push(strBytes(s));

  push(...init());

  if (logoUrl) {
    const logoData = await imageToEscPosRaster(logoUrl, 384);
    if (logoData) {
      push(...align(1));
      chunks.push(logoData);
      pushStr('\n');
    }
  }

  push(...align(1), ...bold(true), ...size(1, 2));
  pushStr('KLJ Bestelsysteem\n');
  push(...bold(false), ...size(1, 1));
  const dt = new Date(order.created_at).toLocaleString('nl-BE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  pushStr(`${dt}\n`);

  pushStr('\n--------------------------------\n');
  push(...align(0));
  push(...bold(true));
  pushStr(`Order:  #${order.num}\n`);
  push(...bold(false));
  pushStr(`Tafel:  ${order.table_name}\n`);
  pushStr(`Ober:   ${order.waiter}\n`);
  pushStr('--------------------------------\n');

  for (const item of order.items) {
    push(...bold(true));
    const left = `${item.qty}x ${item.name}`;
    const right = fmtEUR(item.price * item.qty);
    pushStr(pad(left, 24) + right + '\n');
    push(...bold(false));
    const vk = vakjesFor(item.price, vakjeValue, item.vakjes_override) * item.qty;
    pushStr(`  ${vk} vakjes  ${fmtEUR(item.price)}/st\n`);
    if (item.note) pushStr(`  >> ${item.note}\n`);
  }

  pushStr('--------------------------------\n');
  push(...bold(true), ...size(1, 2));
  pushStr(pad('Totaal', 18) + fmtEUR(order.total) + '\n');
  push(...size(1, 1));
  pushStr(pad('Vakjes', 24) + String(order.vakjes) + '\n');
  push(...bold(false));
  if (order.note) pushStr(`Opmerking: ${order.note}\n`);

  push(...align(1));
  pushStr('\nBedankt!\n');
  pushStr('\n\n\n');
  push(...feed(2));
  push(...cut());
  push(...init());

  return concatChunks(chunks);
}

/**
 * Print een klantbon. Probeert Dymo, dan ESC/POS thermisch, dan browser fallback.
 * De Dymo en ESC/POS paden printen volledig automatisch — geen pop-up, geen knop.
 */
export async function printReceiptThermal(order: Order, vakjeValue: number, logoUrl?: string | null): Promise<'thermal' | 'fallback'> {
  if (dymoPrinter && dymoPrinter.connected) {
    try {
      await printReceiptDymo(order, vakjeValue);
      return 'thermal';
    } catch (err) {
      console.error('Dymo print mislukt, fallback:', err);
    }
  }
  if (connected) {
    try {
      const data = await buildReceipt(order, vakjeValue, logoUrl);
      await send(connected, data);
      return 'thermal';
    } catch (err) {
      console.error('Thermische print mislukt, fallback:', err);
      connected = null;
      notifyPrinterChange();
    }
  }
  printReceiptFallback(order, vakjeValue, logoUrl);
  return 'fallback';
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

function printReceiptFallback(order: Order, vakjeValue: number, logoUrl?: string | null): void {
  const w = window.open('', '_blank', 'width=320,height=600');
  if (!w) {
    alert('Kon bon niet printen: pop-up geblokkeerd. Sta pop-ups toe voor deze site.');
    return;
  }
  const items = order.items.map((it) => {
    const vk = vakjesFor(it.price, vakjeValue, it.vakjes_override) * it.qty;
    const note = it.note ? `<div class="note">>> ${escapeHtml(it.note)}</div>` : '';
    return `<div class="item"><span class="qty">${it.qty}x</span> ${escapeHtml(it.name)} <span class="price">${fmtEUR(it.price * it.qty)}</span><div class="sub">${vk} vakjes &middot; ${fmtEUR(it.price)}/st</div>${note}</div>`;
  }).join('');
  const dt = new Date(order.created_at).toLocaleString('nl-BE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  const logoHtml = logoUrl ? `<img src="${escapeHtml(logoUrl)}" class="logo" alt="logo" />` : '';
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Bon #${order.num}</title>
  <style>
    @page { size: 80mm auto; margin: 2mm; }
    * { font-family: 'Courier New', monospace; }
    body { width: 76mm; margin: 0 auto; color:#000; background:#fff; }
    .center { text-align:center; }
    .logo { display:block; margin:0 auto 4px; max-width:60mm; max-height:30mm; }
    .header { font-size: 16px; font-weight: bold; }
    .date { font-size:12px; }
    .item { font-size: 14px; margin: 3px 0; }
    .qty { font-weight: bold; }
    .price { float: right; font-weight: bold; }
    .sub { font-size: 11px; color: #555; margin-left: 14px; }
    .note { font-size: 12px; font-weight:bold; margin-left:14px; }
    hr { border:none; border-top:1px dashed #000; margin:6px 0; }
    .tot { font-size: 16px; font-weight: bold; }
    .foot { font-size: 12px; text-align:center; margin-top:8px; }
    .thanks { font-size: 14px; font-weight: bold; text-align:center; margin-top:6px; }
  </style></head><body>
    ${logoHtml}
    <div class="center header">KLJ Bestelsysteem</div>
    <div class="center date">${dt}</div>
    <hr>
    <div><strong>Order: #${order.num}</strong></div>
    <div>Tafel: ${escapeHtml(order.table_name)}</div>
    <div>Ober: ${escapeHtml(order.waiter)}</div>
    <hr>
    ${items}
    <hr>
    <div class="tot">Totaal: ${fmtEUR(order.total)}</div>
    <div class="tot">Vakjes: ${order.vakjes}</div>
    ${order.note ? `<div>Opmerking: ${escapeHtml(order.note)}</div>` : ''}
    <div class="thanks">Bedankt!</div>
    <div class="foot">Graag tot de volgende keer!</div>
    <script>window.onload=function(){setTimeout(function(){window.print();},250);}</` + `script>
  </body></html>`);
  w.document.close();
}

// ---- Dymo LabelWriter printen ----

function renderReceiptToCanvas(order: Order, vakjeValue: number, width: number): HTMLCanvasElement {
  const padding = Math.round(width * 0.05);
  const headerSize = Math.round(width * 0.055);
  const bodySize = Math.round(width * 0.038);
  const smallSize = Math.round(width * 0.03);
  const largeSize = Math.round(width * 0.05);
  const lineH = (s: number) => Math.round(s * 1.5);

  interface Line { text: string; size: number; bold: boolean; align: 'left' | 'center'; }
  const lines: Line[] = [];

  lines.push({ text: 'KLJ Bestelsysteem', size: headerSize, bold: true, align: 'center' });
  const dt = new Date(order.created_at).toLocaleString('nl-BE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  lines.push({ text: dt, size: smallSize, bold: false, align: 'center' });
  lines.push({ text: '--------------------------------', size: smallSize, bold: false, align: 'center' });
  lines.push({ text: `Order:  #${order.num}`, size: bodySize, bold: true, align: 'left' });
  lines.push({ text: `Tafel:  ${order.table_name}`, size: bodySize, bold: false, align: 'left' });
  lines.push({ text: `Ober:   ${order.waiter}`, size: bodySize, bold: false, align: 'left' });
  lines.push({ text: '--------------------------------', size: smallSize, bold: false, align: 'center' });

  for (const item of order.items) {
    lines.push({ text: `${item.qty}x ${item.name}`, size: bodySize, bold: true, align: 'left' });
    const vk = vakjesFor(item.price, vakjeValue, item.vakjes_override) * item.qty;
    lines.push({ text: `  ${vk} vakjes  ${fmtEUR(item.price)}/st`, size: smallSize, bold: false, align: 'left' });
    if (item.note) lines.push({ text: `  >> ${item.note}`, size: smallSize, bold: false, align: 'left' });
  }

  lines.push({ text: '--------------------------------', size: smallSize, bold: false, align: 'center' });
  lines.push({ text: `Totaal:  ${fmtEUR(order.total)}`, size: largeSize, bold: true, align: 'left' });
  lines.push({ text: `Vakjes:  ${order.vakjes}`, size: bodySize, bold: false, align: 'left' });
  if (order.note) lines.push({ text: `Opmerking: ${order.note}`, size: smallSize, bold: false, align: 'left' });
  lines.push({ text: 'Bedankt!', size: bodySize, bold: true, align: 'center' });

  const totalHeight = lines.reduce((h, l) => h + lineH(l.size), 0) + padding * 2;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = totalHeight;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, totalHeight);
  ctx.fillStyle = '#000000';
  ctx.textBaseline = 'top';

  let y = padding;
  for (const line of lines) {
    ctx.font = `${line.bold ? 'bold ' : ''}${line.size}px "Courier New", monospace`;
    if (line.align === 'center') {
      ctx.textAlign = 'center';
      ctx.fillText(line.text, width / 2, y);
    } else {
      ctx.textAlign = 'left';
      ctx.fillText(line.text, padding, y);
    }
    y += lineH(line.size);
  }

  return canvas;
}

async function printReceiptDymo(order: Order, vakjeValue: number): Promise<void> {
  if (!dymoPrinter || !dymoPrinter.connected) throw new Error('Dymo printer niet verbonden');
  const status = await dymoPrinter.getStatus().catch(() => null);
  const widthMm = status?.detectedMedia?.widthMm ?? 89;
  const canvasWidth = Math.round(widthMm * 300 / 25.4);
  const canvas = renderReceiptToCanvas(order, vakjeValue, canvasWidth);
  const ctx = canvas.getContext('2d')!;
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  await dymoPrinter.print({
    width: canvas.width,
    height: canvas.height,
    data: new Uint8Array(imgData.data),
  });
}

// ---- QR-code printen ----

export function printQRCodes(obers: { url: string; title: string; desc: string }[], logoUrl?: string | null): void {
  const w = window.open('', '_blank', 'width=800,height=600');
  if (!w) {
    alert('Kon QR-codes niet printen: pop-up geblokkeerd. Sta pop-ups toe voor deze site.');
    return;
  }
  const logoHtml = logoUrl ? `<img src="${escapeHtml(logoUrl)}" class="logo" alt="logo" />` : '';
  const qrCards = obers.map((q) => `
    <div class="qr-card">
      <p class="qr-title">${escapeHtml(q.title)}</p>
      <div class="qr-img" data-url="${escapeHtml(q.url)}"></div>
      <p class="qr-desc">${escapeHtml(q.desc)}</p>
    </div>
  `).join('');

  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>KLJ QR-codes</title>
  <script src="https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js"></script>
  <style>
    @page { size: A4; margin: 15mm; }
    * { font-family: 'Inter', Arial, sans-serif; }
    body { margin: 0; color: #000; background: #fff; }
    .header { text-align: center; margin-bottom: 20px; }
    .logo { max-width: 120px; max-height: 50px; margin-bottom: 8px; }
    .header h1 { font-size: 22px; margin: 4px 0; }
    .header p { font-size: 13px; color: #666; margin: 2px 0; }
    .grid { display: flex; flex-wrap: wrap; gap: 20px; justify-content: center; }
    .qr-card { text-align: center; padding: 16px; border: 2px solid #eee; border-radius: 12px; min-width: 200px; }
    .qr-title { font-size: 16px; font-weight: bold; margin: 0 0 10px; }
    .qr-img { display: inline-block; }
    .qr-img canvas { display: block; }
    .qr-desc { font-size: 12px; color: #666; margin: 8px 0 0; }
    @media print { .no-print { display: none; } }
    .no-print { text-align:center; margin: 16px 0; }
    .no-print button { padding: 10px 24px; font-size: 16px; background: #10b981; color: #fff; border: none; border-radius: 8px; cursor: pointer; }
  </style></head><body>
    <div class="header">
      ${logoHtml}
      <h1>KLJ Bestelsysteem</h1>
      <p>Scan de QR-code om te verbinden</p>
    </div>
    <div class="grid">${qrCards}</div>
    <div class="no-print"><button onclick="window.print()">Printen</button></div>
    <script>
      function makeQr(el, url, size) {
        var qr = qrcode(0, 'M');
        qr.addData(url);
        qr.make();
        var count = qr.getModuleCount();
        var cell = Math.max(3, Math.floor(size / count));
        var dim = cell * count;
        var canvas = document.createElement('canvas');
        canvas.width = dim; canvas.height = dim;
        var ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, dim, dim);
        ctx.fillStyle = '#000';
        for (var r = 0; r < count; r++) {
          for (var c = 0; c < count; c++) {
            if (qr.isDark(r, c)) ctx.fillRect(c * cell, r * cell, cell, cell);
          }
        }
        el.appendChild(canvas);
      }
      document.querySelectorAll('.qr-img').forEach(function(el) {
        makeQr(el, el.getAttribute('data-url'), 180);
      });
    </` + `script>
  </body></html>`);
  w.document.close();
}
