import { useState } from 'react';
import { Modal } from './Modal';
import { Plus, Trash2, Loader2, ArrowUp, ArrowDown, Printer, Volume2, Users, Palette, Clock } from 'lucide-react';
import type { Product, TableConfig, Session } from '../lib/types';
import { fmtEUR } from '../lib/utils';

interface ProductModalProps {
  product?: Product;
  sessionId: string;
  onClose: () => void;
  onSave: (p: Partial<Product> & { session_id: string }) => Promise<void>;
}

const EMOJIS = ['🛎️','🍔','🍟','🌭','🥨','🍕','🥗','🌮','🌯','🍜','🍝','🥘','🍖','🍗','🥩','🐟','🦐','🦪','🧆','🥞','🧇','🥓','🧀','🥪','🍿','🧂','🥤','🍺','🍻','🍷','🥂','🍹','☕','🍵','🧋','🥛','🍰','🎂','🧁','🍪','🍩','🍫','🍬','🍦','🍨','🥧','🍎','🍊','🍌','🍉','🍇','🍓','🍑','🥝','🍍','🥭','🥑','🥕','🥒','🌽','🍅','🥬','🥔','🍞','🥖','🥚','🍳'];

export function ProductModal({ product, sessionId, onClose, onSave }: ProductModalProps) {
  const [name, setName] = useState(product?.name || '');
  const [price, setPrice] = useState(String(product?.price ?? ''));
  const [emoji, setEmoji] = useState(product?.emoji || '🛎️');
  const [category, setCategory] = useState(product?.category || 'Overige');
  const [available, setAvailable] = useState(product?.available ?? true);
  const [photoUrl, setPhotoUrl] = useState(product?.photo_url || '');
  const [vakjesOverride, setVakjesOverride] = useState(product?.vakjes_override != null ? String(product.vakjes_override) : '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function save() {
    if (!name.trim()) return setErr('Vul een productnaam in.');
    setBusy(true); setErr('');
    try {
      const vo = vakjesOverride.trim() === '' ? null : Math.max(0, parseInt(vakjesOverride) || 0);
      await onSave({
        id: product?.id,
        session_id: sessionId,
        name: name.trim(),
        price: Number(price) || 0,
        emoji,
        category: category.trim() || 'Overige',
        available,
        photo_url: photoUrl.trim() || null,
        vakjes_override: vo,
      });
    } catch (e: any) {
      setErr(e?.message || 'Opslaan mislukt — controleer je verbinding en probeer opnieuw.');
    } finally { setBusy(false); }
  }

  return (
    <Modal open onClose={onClose} title={product ? 'Product aanpassen' : 'Product toevoegen'} size="lg">
      <div className="flex flex-col gap-3">
        <div>
          <label className="text-sm text-white/60">Naam</label>
          <input className="input mt-1" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm text-white/60">Prijs (€)</label>
            <input className="input mt-1" type="number" step="0.5" value={price} onChange={(e) => setPrice(e.target.value)} />
          </div>
          <div>
            <label className="text-sm text-white/60">Categorie</label>
            <input className="input mt-1" value={category} onChange={(e) => setCategory(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="text-sm text-white/60">Foto URL (optioneel)</label>
          <input className="input mt-1" placeholder="https://..." value={photoUrl} onChange={(e) => setPhotoUrl(e.target.value)} />
          {photoUrl && <img src={photoUrl} alt="" className="w-16 h-16 rounded-xl object-cover mt-2" onError={(e) => (e.currentTarget.style.display = 'none')} />}
        </div>
        <div>
          <label className="text-sm text-white/60">Vakjes (leeg = automatisch berekend)</label>
          <input className="input mt-1" type="number" min="0" placeholder="auto" value={vakjesOverride} onChange={(e) => setVakjesOverride(e.target.value)} />
        </div>
        <div>
          <label className="text-sm text-white/60">Icoon</label>
          <div className="flex flex-wrap gap-1 mt-1 max-h-32 overflow-y-auto bg-[#0f1620] rounded-xl p-2">
            {EMOJIS.map((e) => (
              <button key={e} onClick={() => setEmoji(e)} className={`text-xl p-1.5 rounded-lg ${emoji === e ? 'bg-emerald-500/30' : 'hover:bg-white/10'}`}>{e}</button>
            ))}
          </div>
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={available} onChange={(e) => setAvailable(e.target.checked)} className="w-5 h-5 accent-emerald-500" />
          <span>Beschikbaar</span>
        </label>
        <button onClick={save} className="btn-primary py-3" disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : 'Opslaan'}</button>
        {err && <p className="text-red-400 text-sm">{err}</p>}
      </div>
    </Modal>
  );
}

interface TableModalProps {
  tables: TableConfig[];
  sessionId: string;
  onClose: () => void;
  onSave: (t: Partial<TableConfig> & { session_id: string }) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export function TableModal({ tables, sessionId, onClose, onSave, onDelete }: TableModalProps) {
  const [count, setCount] = useState(String(tables.length || 1));
  const [busy, setBusy] = useState(false);

  async function apply() {
    const n = Math.max(0, Math.min(200, parseInt(count) || 0));
    setBusy(true);
    try {
      for (let i = tables.length - 1; i >= n; i--) {
        await onDelete(tables[i].id);
      }
      for (let i = tables.length; i < n; i++) {
        await onSave({ session_id: sessionId, name: `Tafel ${i + 1}`, sort_order: i });
      }
      onClose();
    } finally { setBusy(false); }
  }

  async function removeOne(id: string) {
    setBusy(true);
    try { await onDelete(id); } finally { setBusy(false); }
  }

  return (
    <Modal open onClose={onClose} title="Tafels beheren">
      <div className="flex flex-col gap-4">
        <div>
          <label className="text-sm text-white/60">Aantal tafels</label>
          <div className="flex gap-2 mt-1">
            <input className="input" type="number" min="0" max="200" value={count} onChange={(e) => setCount(e.target.value)} />
            <button onClick={apply} className="btn-primary px-5" disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : 'Toepassen'}</button>
          </div>
          <p className="text-white/40 text-xs mt-1">Tafels worden automatisch genummerd: Tafel 1, Tafel 2, ...</p>
        </div>
        <div className="border-t border-white/10 pt-3">
          <p className="text-white/60 text-sm mb-2">Huidige tafels ({tables.length})</p>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {tables.map((t, i) => (
              <div key={t.id} className="flex items-center gap-1 bg-white/5 rounded-xl p-2 text-sm">
                <span className="flex-1 truncate">{i + 1}. {t.name}</span>
                <button onClick={() => removeOne(t.id)} className="btn-danger p-1" disabled={busy}><Trash2 size={12} /></button>
              </div>
            ))}
            {tables.length === 0 && <p className="text-white/40 text-sm col-span-full">Nog geen tafels.</p>}
          </div>
        </div>
      </div>
    </Modal>
  );
}

interface SettingsModalProps {
  session: Session;
  sound: boolean;
  onClose: () => void;
  onSave: (patch: { event_name: string; vakje_value: number; timer_yellow: number; timer_orange: number; timer_red: number; timer_critical: number; auto_print: boolean }) => Promise<void>;
  onToggleSound: () => void;
}

export function SettingsModal({ session, sound, onClose, onSave, onToggleSound }: SettingsModalProps) {
  const [name, setName] = useState(session.event_name);
  const [vv, setVv] = useState(String(session.vakje_value));
  const [ty, setTy] = useState(String(session.timer_yellow ?? 5));
  const [to, setTo] = useState(String(session.timer_orange ?? 8));
  const [tr, setTr] = useState(String(session.timer_red ?? 10));
  const [tc, setTc] = useState(String(session.timer_critical ?? 15));
  const [autoPrint, setAutoPrint] = useState(session.auto_print ?? true);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      await onSave({
        event_name: name.trim() || 'KLJ',
        vakje_value: Number(vv) || 0.5,
        timer_yellow: Number(ty) || 5,
        timer_orange: Number(to) || 8,
        timer_red: Number(tr) || 10,
        timer_critical: Number(tc) || 15,
        auto_print: autoPrint,
      });
    } finally { setBusy(false); }
  }

  return (
    <Modal open onClose={onClose} title="Instellingen" size="lg">
      <div className="flex flex-col gap-5">
        <section className="flex flex-col gap-2">
          <p className="text-white/40 text-xs uppercase tracking-wider flex items-center gap-1"><Palette size={12} /> Algemeen</p>
          <div>
            <label className="text-sm text-white/60">Naam evenement</label>
            <input className="input mt-1" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="text-sm text-white/60">Waarde per vakje (€)</label>
            <input className="input mt-1" type="number" step="0.25" value={vv} onChange={(e) => setVv(e.target.value)} />
            <p className="text-white/40 text-xs mt-1">Voorbeeld: Cola €2,00 = 4 vakjes bij €0,50/vakje</p>
          </div>
        </section>

        <section className="flex flex-col gap-2">
          <p className="text-white/40 text-xs uppercase tracking-wider flex items-center gap-1"><Clock size={12} /> Vergeten-bestelling timers (minuten)</p>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-sm text-white/60">Geel</label><input className="input mt-1" type="number" min="0" value={ty} onChange={(e) => setTy(e.target.value)} /></div>
            <div><label className="text-sm text-white/60">Oranje</label><input className="input mt-1" type="number" min="0" value={to} onChange={(e) => setTo(e.target.value)} /></div>
            <div><label className="text-sm text-white/60">Rood</label><input className="input mt-1" type="number" min="0" value={tr} onChange={(e) => setTr(e.target.value)} /></div>
            <div><label className="text-sm text-white/60">Kritiek</label><input className="input mt-1" type="number" min="0" value={tc} onChange={(e) => setTc(e.target.value)} /></div>
          </div>
        </section>

        <section className="flex flex-col gap-2">
          <p className="text-white/40 text-xs uppercase tracking-wider flex items-center gap-1"><Volume2 size={12} /> Geluid</p>
          <button onClick={onToggleSound} className="card p-3 text-left flex items-center justify-between hover:bg-white/5">
            <span className="text-sm">Geluid bij nieuwe bestelling</span>
            <span className={`badge ${sound ? 'bg-emerald-500/15 text-emerald-400' : 'bg-white/10 text-white/50'}`}>{sound ? 'Aan' : 'Uit'}</span>
          </button>
        </section>

        <section className="flex flex-col gap-2">
          <p className="text-white/40 text-xs uppercase tracking-wider flex items-center gap-1"><Printer size={12} /> Printer</p>
          <button onClick={() => setAutoPrint((v) => !v)} className="card p-3 text-left flex items-center justify-between hover:bg-white/5">
            <span className="text-sm">Automatisch printen bij nieuwe bestelling</span>
            <span className={`badge ${autoPrint ? 'bg-emerald-500/15 text-emerald-400' : 'bg-white/10 text-white/50'}`}>{autoPrint ? 'Aan' : 'Uit'}</span>
          </button>
          <p className="text-white/40 text-xs">Bestellingen worden afgedrukt via de browserdialoog (Ctrl+P / ⌘+P). Kies daar je printer. Voor een thermische printer: installeer een ESC/POS-stuurprogramma en selecteer deze in de afdrukdialoog.</p>
        </section>

        <button onClick={save} className="btn-primary py-3" disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : 'Opslaan'}</button>
      </div>
    </Modal>
  );
}

interface UsersModalProps {
  waiters: string[];
  onClose: () => void;
}

export function UsersModal({ waiters, onClose }: UsersModalProps) {
  return (
    <Modal open onClose={onClose} title="Obers">
      <div className="flex flex-col gap-2">
        <p className="text-white/60 text-sm">{waiters.length} ober(s) actief in deze sessie</p>
        {waiters.length === 0 && <p className="text-white/30 text-sm">Nog geen obers verbonden.</p>}
        <div className="flex flex-col gap-1">
          {waiters.map((w) => (
            <div key={w} className="card p-2.5 flex items-center gap-2 text-sm">
              <Users size={14} className="text-emerald-400" /> {w}
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}
