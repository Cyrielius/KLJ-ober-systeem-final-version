import { Monitor, Smartphone, Flame } from 'lucide-react';

interface Props {
  onHost: () => void;
  onWaiter: () => void;
  onKitchen: () => void;
}

export function StartScreen({ onHost, onWaiter, onKitchen }: Props) {
  return (
    <div className="min-h-full flex flex-col items-center justify-center p-6 gap-10">
      <div className="text-center">
        <h1 className="text-4xl sm:text-5xl font-black tracking-tight bg-gradient-to-b from-white to-white/60 bg-clip-text text-transparent">
          KLJ Bestelsysteem
        </h1>
        <p className="text-white/50 mt-2">Realtime bestellen voor eetfestijn &amp; evenement</p>
      </div>

      <div className="grid sm:grid-cols-3 gap-5 w-full max-w-3xl">
        <button
          onClick={onHost}
          className="card p-8 flex flex-col items-center gap-4 hover:border-emerald-400/40 hover:bg-emerald-500/5 transition-all active:scale-[0.98] group"
        >
          <div className="w-20 h-20 rounded-2xl bg-emerald-500/15 flex items-center justify-center group-hover:bg-emerald-500/25 transition-colors">
            <Monitor size={40} className="text-emerald-400" />
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold">HOST</p>
            <p className="text-white/40 text-sm mt-1">Beheer sessie &amp; producten</p>
          </div>
        </button>

        <button
          onClick={onKitchen}
          className="card p-8 flex flex-col items-center gap-4 hover:border-amber-400/40 hover:bg-amber-500/5 transition-all active:scale-[0.98] group"
        >
          <div className="w-20 h-20 rounded-2xl bg-amber-500/15 flex items-center justify-center group-hover:bg-amber-500/25 transition-colors">
            <Flame size={40} className="text-amber-400" />
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold">KEUKEN</p>
            <p className="text-white/40 text-sm mt-1">Bestellingen maken</p>
          </div>
        </button>

        <button
          onClick={onWaiter}
          className="card p-8 flex flex-col items-center gap-4 hover:border-sky-400/40 hover:bg-sky-500/5 transition-all active:scale-[0.98] group"
        >
          <div className="w-20 h-20 rounded-2xl bg-sky-500/15 flex items-center justify-center group-hover:bg-sky-500/25 transition-colors">
            <Smartphone size={40} className="text-sky-400" />
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold">OBER</p>
            <p className="text-white/40 text-sm mt-1">Bestellingen aanmaken</p>
          </div>
        </button>
      </div>

      <p className="text-white/30 text-xs max-w-md text-center">
        Alle bestellingen worden realtime gesynchroniseerd via Supabase. Werkt op desktop, tablet en mobiel.
      </p>
    </div>
  );
}
