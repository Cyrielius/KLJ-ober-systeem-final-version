export function fmtEUR(n: number): string {
  return new Intl.NumberFormat('nl-BE', { style: 'currency', currency: 'EUR' }).format(n);
}

export function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' });
}

export function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString('nl-BE', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

export function waitMinutes(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
}

// Wachttijd in minuten, bevroren op het tijdstip dat de bestelling klaar werd gemarkeerd.
// De timer stopt zodra de keuken de bestelling afwerkt (done), en blijft bevroren
// voor ober-afgewerkt (completed) en geannuleerd (cancelled).
export function waitMinutesFrozen(order: { created_at: string; completed_at?: string | null; updated_at?: string; status?: string }): number {
  let end: number;
  if (order.completed_at) {
    end = new Date(order.completed_at).getTime();
  } else if (order.status === 'cancelled' && order.updated_at) {
    end = new Date(order.updated_at).getTime();
  } else {
    end = Date.now();
  }
  return Math.floor((end - new Date(order.created_at).getTime()) / 60000);
}

export function genCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export function genPin(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

export function vakjesFor(price: number, vakjeValue: number, override?: number | null): number {
  if (override != null && override >= 0) return override;
  if (vakjeValue <= 0) return 0;
  return Math.round(price / vakjeValue);
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}
