import type { OrderStatus, WorkflowMode, SoundType } from './types';

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
export function waitMinutesFrozen(order: { created_at: string; completed_at?: string | null; picked_up_at?: string | null }): number {
  const freeze = order.picked_up_at || order.completed_at;
  const end = freeze ? new Date(freeze).getTime() : Date.now();
  return Math.floor((end - new Date(order.created_at).getTime()) / 60000);
}

export function waitSeconds(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
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

// Status labels based on workflow mode
export function statusLabel(status: OrderStatus, mode: WorkflowMode): string {
  if (mode === '1-step') {
    switch (status) {
      case 'pending': return 'Verzonden';
      case 'done': return 'Afgerond';
      case 'completed': return 'Afgerond';
      case 'cancelled': return 'Geannuleerd';
    }
  }
  // 2-step mode
  switch (status) {
    case 'pending': return 'Keuken ontvangen';
    case 'done': return 'Keuken klaar';
    case 'completed': return 'Ober klaar';
    case 'cancelled': return 'Geannuleerd';
  }
}

// Next status forward in the workflow
export function nextStatus(status: OrderStatus, mode: WorkflowMode): OrderStatus | null {
  if (mode === '1-step') {
    // Verzonden -> Afgerond (geen tussentijdse stap)
    if (status === 'pending') return 'completed';
    return null;
  }
  // 2-step
  if (status === 'pending') return 'done';
  if (status === 'done') return 'completed';
  return null;
}

// Previous status (revert one step)
export function prevStatus(status: OrderStatus, mode: WorkflowMode): OrderStatus | null {
  if (mode === '1-step') {
    // Verzonden <-> Afgerond
    if (status === 'completed') return 'pending';
    return null;
  }
  // 2-step
  if (status === 'completed') return 'done';
  if (status === 'done') return 'pending';
  return null;
}

// Action button label for advancing status
export function advanceLabel(status: OrderStatus, mode: WorkflowMode): string {
  if (mode === '1-step') {
    if (status === 'pending') return 'Bestelling afgerond';
    return '';
  }
  // 2-step
  if (status === 'pending') return 'Keuken klaar';
  if (status === 'done') return 'Ober klaar';
  return '';
}

// Revert button label
export function revertLabel(status: OrderStatus, mode: WorkflowMode): string {
  if (mode === '1-step') {
    if (status === 'completed') return 'Terug naar Verzonden';
    return '';
  }
  // 2-step
  if (status === 'done') return 'Terug naar Keuken ontvangen';
  if (status === 'completed') return 'Terug naar Keuken klaar';
  return '';
}

// Play a notification sound based on session config
// Browsers blokkeren Web Audio zonder gebruikersinteractie. We houdt een
// unlocked-vlag bij en unlocken de AudioContext bij de eerste tap/klik.
let _audioUnlocked = false;
let _audioCtx: AudioContext | null = null;

export function unlockAudio() {
  if (_audioUnlocked) return;
  try {
    _audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (_audioCtx.state === 'suspended') _audioCtx.resume();
    _audioUnlocked = true;
  } catch { /* ignore */ }
}

export function isAudioUnlocked(): boolean {
  return _audioUnlocked;
}

// Cache gedecodeerde custom audio buffers per URL (decode is duur)
const _audioBuffers = new Map<string, AudioBuffer>();

export async function playNotificationSound(soundType: SoundType, soundUrl?: string | null) {
  if (!_audioUnlocked) {
    try {
      _audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      if (_audioCtx.state === 'suspended') _audioCtx.resume();
      _audioUnlocked = true;
    } catch { return; }
  }
  const ctx = _audioCtx;
  if (!ctx) return;
  if (ctx.state === 'suspended') { await ctx.resume().catch(() => {}); }

  if (soundType === 'custom' && soundUrl) {
    try {
      let buffer = _audioBuffers.get(soundUrl);
      if (!buffer) {
        const res = await fetch(soundUrl);
        const arr = await res.arrayBuffer();
        buffer = await ctx.decodeAudioData(arr);
        _audioBuffers.set(soundUrl, buffer);
      }
      const src = ctx.createBufferSource();
      const g = ctx.createGain();
      src.buffer = buffer;
      src.connect(g); g.connect(ctx.destination);
      g.gain.value = 0.8;
      src.start();
      return;
    } catch {}
  }

  try {
    const now = ctx.currentTime;

    if (soundType === 'chime') {
      // Three ascending notes
      [523, 659, 784].forEach((freq, i) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.connect(g); g.connect(ctx.destination);
        o.frequency.value = freq;
        o.type = 'sine';
        const start = now + i * 0.15;
        g.gain.setValueAtTime(0, start);
        g.gain.linearRampToValueAtTime(0.15, start + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, start + 0.3);
        o.start(start); o.stop(start + 0.3);
      });
    } else if (soundType === 'ding') {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.frequency.value = 1320;
      o.type = 'sine';
      g.gain.setValueAtTime(0.2, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
      o.start(now); o.stop(now + 0.8);
    } else if (soundType === 'alert') {
      // Two-tone alert
      [880, 660].forEach((freq, i) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.connect(g); g.connect(ctx.destination);
        o.frequency.value = freq;
        o.type = 'square';
        const start = now + i * 0.2;
        g.gain.setValueAtTime(0.12, start);
        g.gain.exponentialRampToValueAtTime(0.001, start + 0.18);
        o.start(start); o.stop(start + 0.18);
      });
    } else {
      // Default beep
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.frequency.value = 880;
      o.type = 'sine';
      g.gain.setValueAtTime(0.15, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
      o.start(now); o.stop(now + 0.4);
    }
  } catch {}
}
