import { useState } from 'react';
import { ArrowLeft, Plus, RotateCw, Loader2 } from 'lucide-react';
import { createSession, getSessionByCode } from '../lib/db';
import { unlockAudio } from '../lib/utils';
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
    unlockAudio();
    if (!eventName.trim()) return setErr('Vul een evenementnaam in.');
    setBusy(true); setErr('');
    try {
      const s = await createSession(eventName.trim());
      onHostSession(s);
    } catch (e: any) { setErr(e.message || 'Kon sessie niet aanmaken.'); }
    finally { setBusy(false); }
  }

  async function resume() {
    unlockAudio();
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
    <div className="min-h-full flex flex-col p-4 max-w-md mx-auto w-full">
      <button onClick={view === 'menu' ? onBack : () => setView('menu')} className="btn-ghost px-2.5 py-1.5 self-start mb-4 text-sm">
        <ArrowLeft size={16} /> Terug
      </button>

      {view === 'menu' && (
        <div className="flex flex-col gap-2 mt-2">
          <h2 className="text-lg font-bold text-white">Host</h2>
          <button onClick={() => setView('new')} className="card-hover p-4 flex items-center gap-3 text-left active:scale-[0.99]">
            <div className="w-10 h-10 rounded-md bg-emerald-500/10 flex items-center justify-center flex-none">
              <Plus className="text-emerald-400" size={20} />
            </div>
            <div className="text-left">
              <p className="font-semibold text-sm text-white">Nieuwe sessie starten</p>
              <p className="text-white/40 text-xs">Maak een nieuw evenement aan</p>
            </div>
          </button>
          <button onClick={() => setView('resume')} className="card-hover p-4 flex items-center gap-3 text-left active:scale-[0.99]">
            <div className="w-10 h-10 rounded-md bg-sky-500/10 flex items-center justify-center flex-none">
              <RotateCw className="text-sky-400" size={20} />
            </div>
            <div className="text-left">
              <p className="font-semibold text-sm text-white">Bestaande sessie hervatten</p>
              <p className="text-white/40 text-xs">Met sessiecode en PIN</p>
            </div>
          </button>
        </div>
      )}

      {view === 'new' && (
        <div className="flex flex-col gap-3 mt-2">
          <h2 className="text-lg font-bold text-white">Nieuwe sessie</h2>
          <div>
            <label className="label">Naam evenement</label>
            <input className="input mt-1" placeholder="bv. KLJ Baravond" value={eventName} onChange={(e) => setEventName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && startNew()} autoFocus />
          </div>
          {err && <p className="text-red-400 text-xs">{err}</p>}
          <button onClick={startNew} className="btn-primary py-3 text-sm" disabled={busy}>
            {busy ? <Loader2 className="animate-spin" size={16} /> : 'Sessie starten'}
          </button>
          <p className="text-white/25 text-xs">Een unieke sessiecode (6 cijfers) en Host PIN (4 cijfers) worden automatisch gegenereerd.</p>
        </div>
      )}

      {view === 'resume' && (
        <div className="flex flex-col gap-3 mt-2">
          <h2 className="text-lg font-bold text-white">Sessie hervatten</h2>
          <div>
            <label className="label">Sessiecode</label>
            <input className="input tracking-widest text-center text-base mt-1" placeholder="000000" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} autoFocus />
          </div>
          <div>
            <label className="label">Host PIN</label>
            <input className="input tracking-widest text-center text-base mt-1" placeholder="0000" maxLength={4} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} onKeyDown={(e) => e.key === 'Enter' && resume()} />
          </div>
          {err && <p className="text-red-400 text-xs">{err}</p>}
          <button onClick={resume} className="btn-primary py-3 text-sm" disabled={busy}>
            {busy ? <Loader2 className="animate-spin" size={16} /> : 'Hervatten'}
          </button>
        </div>
      )}
    </div>
  );
}
