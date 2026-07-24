import { useState } from 'react';
import { Modal } from './Modal';
import { Plus, Trash2, Loader2, ArrowUp, ArrowDown, Printer, Volume2, Users, Palette, Clock, Workflow, Upload, Play } from 'lucide-react';
import type { Product, Session, ProductAvailability, WorkflowMode, SoundType } from '../lib/types';
import { fmtEUR, playNotificationSound } from '../lib/utils';
import { supabase } from '../lib/supabase';

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
  const [availability, setAvailability] = useState<ProductAvailability>(product?.availability || 'available');
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
        availability,
        photo_url: photoUrl.trim() || null,
        vakjes_override: vo,
      });
    } catch (e: any) {
      setErr(e?.message || 'Opslaan mislukt.');
    } finally { setBusy(false); }
  }

  const availabilityOptions: { value: ProductAvailability; label: string; desc: string; color: string }[] = [
    { value: 'available', label: 'Beschikbaar', desc: 'Normaal zichtbaar en bestelbaar', color: 'text-emerald-400' },
    { value: 'unavailable', label: 'Niet beschikbaar', desc: 'Zichtbaar maar niet bestelbaar', color: ' ' },
    { value: 'hidden', label: 'Verborgen', desc: 'Volledig verborgen voor obers', color: 'text-white/40' },
  ];

  return (
    <Modal open onClose={onClose} title={product ? 'Product aanpassen' : 'Product toevoegen'} size="lg">
      <div className="flex flex-col gap-3">
        <div>
          <label className="label">Naam</label>
          <input className="input mt-1" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Prijs (€)</label>
            <input className="input mt-1" type="number" step="0.5" value={price} onChange={(e) => setPrice(e.target.value)} />
          </div>
          <div>
            <label className="label">Categorie</label>
            <input className="input mt-1" value={category} onChange={(e) => setCategory(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="label">Foto URL (optioneel)</label>
          <input className="input mt-1" placeholder="https://..." value={photoUrl} onChange={(e) => setPhotoUrl(e.target.value)} />
          {photoUrl && <img src={photoUrl} alt="" className="w-12 h-12 rounded object-cover mt-1.5" onError={(e) => (e.currentTarget.style.display = 'none')} />}
        </div>
        <div>
          <label className="label">Vakjes (leeg = automatisch berekend)</label>
          <input className="input mt-1" type="number" min="0" placeholder="auto" value={vakjesOverride} onChange={(e) => setVakjesOverride(e.target.value)} />
        </div>

        {/* 3-state availability */}
        <div>
          <label className="label">Zichtbaarheid</label>
          <div className="flex flex-col gap-1.5 mt-1">
            {availabilityOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setAvailability(opt.value)}
                className={`p-2.5 rounded-md text-left transition border ${availability === opt.value ? 'border-emerald-500/50 bg-emerald-500/[0.08]' : 'border-white/[0.06] hover:border-white/[0.12]'}`}
              >
                <div className="flex items-center justify-between">
                  <span className={`text-sm font-semibold ${opt.color}`}>{opt.label}</span>
                  {availability === opt.value && <span className="text-emerald-400 text-xs">✓</span>}
                </div>
                <p className="text-white/40 text-xs mt-0.5">{opt.desc}</p>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="label">Icoon</label>
          <div className="flex flex-wrap gap-1 mt-1 max-h-28 overflow-y-auto bg-[#0d1117] rounded-md p-2">
            {EMOJIS.map((e) => (
              <button key={e} onClick={() => setEmoji(e)} className={`text-lg p-1 rounded ${emoji === e ? 'bg-emerald-500/20' : 'hover:bg-white/[0.06]'}`}>{e}</button>
            ))}
          </div>
        </div>

        <button onClick={save} className="btn-primary py-2.5 text-sm" disabled={busy}>
          {busy ? <Loader2 className="animate-spin" size={16} /> : 'Opslaan'}
        </button>
        {err && <p className="text-red-400 text-xs">{err}</p>}
      </div>
    </Modal>
  );
}

interface SettingsModalProps {
  session: Session;
  sound: boolean;
  onClose: () => void;
  onSave: (patch: {
    event_name: string;
    vakje_value: number;
    timer_yellow: number;
    timer_orange: number;
    timer_red: number;
    timer_critical: number;
    auto_print: boolean;
    workflow_mode: WorkflowMode;
    sound_type: SoundType;
    sound_url?: string | null;
  }) => Promise<void>;
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
  const [workflowMode, setWorkflowMode] = useState<WorkflowMode>(session.workflow_mode ?? '2-step');
  const [soundType, setSoundType] = useState<SoundType>(session.sound_type ?? 'beep');
  const [soundUrl, setSoundUrl] = useState<string | null>(session.sound_url ?? null);
  const [busy, setBusy] = useState(false);

  async function uploadSound(file: File) {
    setBusy(true);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'mp3';
      const path = `${session.id}/sound.${ext}`;
      const { error: upErr } = await supabase.storage.from('klj-sounds').upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from('klj-sounds').getPublicUrl(path);
      setSoundUrl(urlData.publicUrl);
      setSoundType('custom');
    } catch (e: any) {
      alert('Upload mislukt: ' + (e?.message || 'onbekende fout'));
    } finally {
      setBusy(false);
    }
  }

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
        workflow_mode: workflowMode,
        sound_type: soundType,
        sound_url: soundUrl,
      });
    } finally { setBusy(false); }
  }

  const soundOptions: { value: SoundType; label: string }[] = [
    { value: 'beep', label: 'Beep' },
    { value: 'chime', label: 'Chime (3 noten)' },
    { value: 'ding', label: 'Ding' },
    { value: 'alert', label: 'Alert (2-toon)' },
  ];

  return (
    <Modal open onClose={onClose} title="Instellingen" size="lg">
      <div className="flex flex-col gap-4">
        {/* Workflow mode */}
        <section className="flex flex-col gap-2">
          <p className="section-title flex items-center gap-1"><Workflow size={12} /> Werkmodus</p>
          <div className="flex flex-col gap-1.5">
            <button
              onClick={() => setWorkflowMode('2-step')}
              className={`p-2.5 rounded-md text-left transition border ${workflowMode === '2-step' ? 'border-emerald-500/50 bg-emerald-500/[0.08]' : 'border-white/[0.06] hover:border-white/[0.12]'}`}
            >
              <span className="text-sm font-semibold text-white">2-staps</span>
              <p className="text-white/40 text-xs mt-0.5">Keuken ontvangen → Keuken klaar → Ober klaar</p>
            </button>
            <button
              onClick={() => setWorkflowMode('1-step')}
              className={`p-2.5 rounded-md text-left transition border ${workflowMode === '1-step' ? 'border-emerald-500/50 bg-emerald-500/[0.08]' : 'border-white/[0.06] hover:border-white/[0.12]'}`}
            >
              <span className="text-sm font-semibold text-white">1-staps</span>
              <p className="text-white/40 text-xs mt-0.5">Verzonden → Bestelling gemaakt (met bevestigingsscherm)</p>
            </button>
          </div>
        </section>

        <section className="flex flex-col gap-2">
          <p className="section-title flex items-center gap-1"><Palette size={12} /> Algemeen</p>
          <div>
            <label className="label">Naam evenement</label>
            <input className="input mt-1" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="label">Waarde per vakje (€)</label>
            <input className="input mt-1" type="number" step="0.25" value={vv} onChange={(e) => setVv(e.target.value)} />
            <p className="text-white/30 text-xs mt-1">Voorbeeld: Cola €2,00 = 4 vakjes bij €0,50/vakje</p>
          </div>
        </section>

        <section className="flex flex-col gap-2">
          <p className="section-title flex items-center gap-1"><Clock size={12} /> Vergeten-bestelling timers (minuten)</p>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Geel</label><input className="input mt-1" type="number" min="0" value={ty} onChange={(e) => setTy(e.target.value)} /></div>
            <div><label className="label">Oranje</label><input className="input mt-1" type="number" min="0" value={to} onChange={(e) => setTo(e.target.value)} /></div>
            <div><label className="label">Rood</label><input className="input mt-1" type="number" min="0" value={tr} onChange={(e) => setTr(e.target.value)} /></div>
            <div><label className="label">Kritiek</label><input className="input mt-1" type="number" min="0" value={tc} onChange={(e) => setTc(e.target.value)} /></div>
          </div>
        </section>

        <section className="flex flex-col gap-2">
          <p className="section-title flex items-center gap-1"><Volume2 size={12} /> Geluid bij nieuwe bestelling</p>
          <button onClick={onToggleSound} className="card p-2.5 text-left flex items-center justify-between hover:bg-white/[0.03]">
            <span className="text-sm">Geluid aan/uit</span>
            <span className={`badge ${sound ? 'bg-emerald-500/15 text-emerald-400' : 'bg-white/[0.06] text-white/50'}`}>{sound ? 'Aan' : 'Uit'}</span>
          </button>
          <div className="flex flex-col gap-1.5">
            <p className="label">Geluidstype</p>
            <div className="grid grid-cols-2 gap-2">
              {soundOptions.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => { setSoundType(opt.value); playNotificationSound(opt.value); }}
                  className={`p-2 rounded-md text-sm transition border flex items-center justify-between ${soundType === opt.value ? 'border-emerald-500/50 bg-emerald-500/[0.08] text-white' : 'border-white/[0.06] hover:border-white/[0.12] text-white/70'}`}
                >
                  {opt.label}
                  <Play size={12} className="text-white/40" />
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="label">Eigen geluid (MP3)</p>
            <label className="btn-ghost px-3 py-2 text-sm cursor-pointer mt-1 flex items-center gap-2 w-fit">
              <Upload size={14} /> Bestand kiezen
              <input
                type="file"
                accept="audio/mp3,audio/*"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadSound(f); }}
              />
            </label>
            {soundUrl && soundType === 'custom' && (
              <p className="text-emerald-400 text-xs mt-1">Eigen geluid ingesteld</p>
            )}
            {busy && <p className="text-white/40 text-xs mt-1">Bezig met uploaden...</p>}
          </div>
        </section>

        <section className="flex flex-col gap-2">
          <p className="section-title flex items-center gap-1"><Printer size={12} /> Printer</p>
          <button onClick={() => setAutoPrint((v) => !v)} className="card p-2.5 text-left flex items-center justify-between hover:bg-white/[0.03]">
            <span className="text-sm">Automatisch printen bij nieuwe bestelling</span>
            <span className={`badge ${autoPrint ? 'bg-emerald-500/15 text-emerald-400' : 'bg-white/[0.06] text-white/50'}`}>{autoPrint ? 'Aan' : 'Uit'}</span>
          </button>
        </section>

        <button onClick={save} className="btn-primary py-2.5 text-sm" disabled={busy}>
          {busy ? <Loader2 className="animate-spin" size={16} /> : 'Opslaan'}
        </button>
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
        <p className="text-white/50 text-sm">{waiters.length} ober(s) actief</p>
        {waiters.length === 0 && <p className="text-white/30 text-sm">Nog geen obers verbonden.</p>}
        <div className="flex flex-col gap-1">
          {waiters.map((w) => (
            <div key={w} className="card p-2 flex items-center gap-2 text-sm">
              <Users size={14} className="text-emerald-400" /> {w}
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}
