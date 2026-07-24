import { useState } from 'react';
import { ArrowLeft, Loader2, Flame } from 'lucide-react';
import { getSessionByCode } from '../lib/db';
import type { Session } from '../lib/types';

interface Props {
  onBack: () => void;
  onJoin: (s: Session) => void;
}

export function KitchenEntry({ onBack, onJoin }: Props) {
  const initialCode = (() => {
    try {
      const p = new URLSearchParams(window.location.search).get('code');
      return p ? p.replace(/\D/g, '').slice(0, 6) : '';
    } catch { return ''; }
  })();
  const [code, setCode] = useState(initialCode);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function connect() {
    if (!code.trim()) return setErr('Vul de sessiecode in.');
    setBusy(true); setErr('');
    try {
      const s = await getSessionByCode(code.trim());
      if (!s) return setErr('Sessie niet gevonden.');
      onJoin(s);
    } catch (e: any) { setErr(e.message || 'Fout bij verbinden.'); }
    finally { setBusy(false); }
  }

  return (
    <div className="min-h-full flex flex-col p-4 max-w-md mx-auto w-full">
      <button onClick={onBack} className="btn-ghost px-2.5 py-1.5 self-start mb-4 text-sm"><ArrowLeft size={16} /> Terug</button>
      <div className="flex items-center gap-2.5 mb-4">
        <div className="w-10 h-10 rounded-md bg-amber-500/10 flex items-center justify-center"><Flame className="text-amber-400" size={20} /></div>
        <h2 className="text-lg font-bold text-white">Keuken aanmelden</h2>
      </div>
      <div className="flex flex-col gap-3">
        <div>
          <label className="label">Sessiecode</label>
          <input className="input tracking-widest text-center text-base mt-1" placeholder="000000" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} onKeyDown={(e) => e.key === 'Enter' && connect()} readOnly={!!initialCode} autoFocus={!initialCode} />
        </div>
        {initialCode && <p className="text-emerald-400 text-xs">Sessiecode ingevuld via QR-code.</p>}
        {err && <p className="text-red-400 text-xs">{err}</p>}
        <button onClick={connect} className="btn-primary py-3 text-sm" disabled={busy}>
          {busy ? <Loader2 className="animate-spin" size={16} /> : <><Flame size={16} /> Verbinden</>}
        </button>
        <p className="text-white/25 text-xs">Scan de QR-code die de host toont, of typ de 6-cijferige sessiecode in.</p>
      </div>
    </div>
  );
}
