import { useState } from 'react';
import { ArrowLeft, Plus, RotateCw, Loader2 } from 'lucide-react';
import { createSession, getSessionByCode } from '../lib/db';
import type { Session } from '../lib/types';

interface Props {
  onBack: () => void;
  onHostSession: (s: Session) => void;
}

export function HostEntry({ onBack, onHostSession }: Props) {
  const [view, setView] = useState<'menu' | 'new' | 'resume'>('menu');
  const [eventName, setEventName] = useState('');
  const [code, setCode] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function startNew() {
    if (!eventName.trim()) return setErr('Vul een evenementnaam in.');
    setBusy(true); setErr('');
    try {
      const s = await createSession(eventName.trim());
      onHostSession(s);
    } catch (e: any) { setErr(e.message || 'Kon sessie niet aanmaken.'); }
    finally { setBusy(false); }
  }

  async function resume() {
    if (!code.trim() || !pin.trim()) return setErr('Vul sessiecode en PIN in.');
    setBusy(true); setErr('');
    try {
      const s = await getSessionByCode(code.trim());
      if (!s) return setErr('Sessie niet gevonden.');
      if (s.pin !== pin.trim()) return setErr('Onjuiste PIN.');
      onHostSession(s);
    } catch (e: any) { setErr(e.message || 'Fout bij ophalen sessie.'); }
    finally { setBusy(false); }
  }

  return (
    <div className="min-h-full flex flex-col p-5 max-w-md mx-auto w-full">
      <button onClick={view === 'menu' ? onBack : () => setView('menu')} className="btn-ghost px-3 py-2 self-start mb-6">
        <ArrowLeft size={18} /> Terug
      </button>

      {view === 'menu' && (
        <div className="flex flex-col gap-4 mt-4">
          <h2 className="text-2xl font-bold">Host</h2>
          <button onClick={() => setView('new')} className="card p-6 flex items-center gap-4 hover:border-emerald-400/40 hover:bg-emerald-500/5 transition active:scale-[0.98]">
            <div className="w-14 h-14 rounded-xl bg-emerald-500/15 flex items-center justify-center"><Plus className="text-emerald-400" size={28} /></div>
            <div className="text-left"><p className="font-bold text-lg">Nieuwe sessie starten</p><p className="text-white/40 text-sm">Maak een nieuwe evenement aan</p></div>
          </button>
          <button onClick={() => setView('resume')} className="card p-6 flex items-center gap-4 hover:border-sky-400/40 hover:bg-sky-500/5 transition active:scale-[0.98]">
            <div className="w-14 h-14 rounded-xl bg-sky-500/15 flex items-center justify-center"><RotateCw className="text-sky-400" size={28} /></div>
            <div className="text-left"><p className="font-bold text-lg">Bestaande sessie hervatten</p><p className="text-white/40 text-sm">Met sessiecode en PIN</p></div>
          </button>
        </div>
      )}

      {view === 'new' && (
        <div className="flex flex-col gap-4 mt-4">
          <h2 className="text-2xl font-bold">Nieuwe sessie</h2>
          <label className="text-sm text-white/60">Naam evenement</label>
          <input className="input" placeholder="bv. KLJ Baravond" value={eventName} onChange={(e) => setEventName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && startNew()} autoFocus />
          {err && <p className="text-red-400 text-sm">{err}</p>}
          <button onClick={startNew} className="btn-primary py-4 text-lg" disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : 'Sessie starten'}
          </button>
          <p className="text-white/30 text-xs">Een unieke sessiecode (6 cijfers) en Host PIN (4 cijfers) worden automatisch gegenereerd.</p>
        </div>
      )}

      {view === 'resume' && (
        <div className="flex flex-col gap-4 mt-4">
          <h2 className="text-2xl font-bold">Sessie hervatten</h2>
          <label className="text-sm text-white/60">Sessiecode</label>
          <input className="input tracking-widest text-center text-lg" placeholder="000000" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} autoFocus />
          <label className="text-sm text-white/60">Host PIN</label>
          <input className="input tracking-widest text-center text-lg" placeholder="0000" maxLength={4} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} onKeyDown={(e) => e.key === 'Enter' && resume()} />
          {err && <p className="text-red-400 text-sm">{err}</p>}
          <button onClick={resume} className="btn-primary py-4 text-lg" disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : 'Hervatten'}
          </button>
        </div>
      )}
    </div>
  );
}
