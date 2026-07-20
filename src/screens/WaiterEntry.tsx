import { useState } from 'react';
import { ArrowLeft, Loader2, Wifi } from 'lucide-react';
import { getSessionByCode } from '../lib/db';
import type { Session } from '../lib/types';

interface Props {
  onBack: () => void;
  onJoin: (s: Session, waiterName: string) => void;
  savedName?: string;
}

export function WaiterEntry({ onBack, onJoin, savedName }: Props) {
  const initialCode = (() => {
    try {
      const p = new URLSearchParams(window.location.search).get('code');
      return p ? p.replace(/\D/g, '').slice(0, 6) : '';
    } catch { return ''; }
  })();
  const [name, setName] = useState(savedName || '');
  const [code, setCode] = useState(initialCode);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function connect() {
    if (!name.trim()) return setErr('Vul je naam in.');
    if (!code.trim()) return setErr('Vul de sessiecode in.');
    setBusy(true); setErr('');
    try {
      const s = await getSessionByCode(code.trim());
      if (!s) return setErr('Sessie niet gevonden.');
      onJoin(s, name.trim());
    } catch (e: any) { setErr(e.message || 'Fout bij verbinden.'); }
    finally { setBusy(false); }
  }

  return (
    <div className="min-h-full flex flex-col p-5 max-w-md mx-auto w-full">
      <button onClick={onBack} className="btn-ghost px-3 py-2 self-start mb-6"><ArrowLeft size={18} /> Terug</button>
      <h2 className="text-2xl font-bold mb-6">Ober aanmelden</h2>
      <div className="flex flex-col gap-4">
        <label className="text-sm text-white/60">Jouw naam</label>
        <input className="input" placeholder="bv. Seppe" value={name} onChange={(e) => setName(e.target.value)} autoFocus={!initialCode} />
        <label className="text-sm text-white/60">Sessiecode</label>
        <input className="input tracking-widest text-center text-lg" placeholder="000000" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} onKeyDown={(e) => e.key === 'Enter' && connect()} readOnly={!!initialCode} />
        {initialCode && <p className="text-emerald-400 text-xs">Sessiecode ingevuld via QR-code.</p>}
        {err && <p className="text-red-400 text-sm">{err}</p>}
        <button onClick={connect} className="btn-primary py-4 text-lg" disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : <><Wifi size={20} /> Verbinden</>}
        </button>
        <p className="text-white/30 text-xs">Geen account of wachtwoord nodig. Je naam wordt onthouden op dit toestel.</p>
      </div>
    </div>
  );
}
