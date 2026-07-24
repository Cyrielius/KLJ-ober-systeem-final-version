import { Monitor, Smartphone, Flame } from 'lucide-react';

interface Props {
  onHost: () => void;
  onWaiter: () => void;
  onKitchen: () => void;
}

export function StartScreen({ onHost, onWaiter, onKitchen }: Props) {
  return (
    <div className="min-h-full flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md flex flex-col gap-6">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">KLJ Bestelsysteem</h1>
          <p className="text-white/40 text-sm mt-0.5">Kies een rol om te beginnen</p>
        </div>

        <div className="flex flex-col gap-2">
          <button
            onClick={onHost}
            className="card-hover p-4 flex items-center gap-3 text-left active:scale-[0.99]"
          >
            <div className="w-10 h-10 rounded-md bg-emerald-500/10 flex items-center justify-center flex-none">
              <Monitor size={20} className="text-emerald-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-white text-sm">Host</p>
              <p className="text-white/40 text-xs">Sessie beheren, producten, instellingen</p>
            </div>
          </button>

          <button
            onClick={onKitchen}
            className="card-hover p-4 flex items-center gap-3 text-left active:scale-[0.99]"
          >
            <div className="w-10 h-10 rounded-md bg-amber-500/10 flex items-center justify-center flex-none">
              <Flame size={20} className="text-amber-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-white text-sm">Keuken</p>
              <p className="text-white/40 text-xs">Bestellingen maken en afwerken</p>
            </div>
          </button>

          <button
            onClick={onWaiter}
            className="card-hover p-4 flex items-center gap-3 text-left active:scale-[0.99]"
          >
            <div className="w-10 h-10 rounded-md bg-sky-500/10 flex items-center justify-center flex-none">
              <Smartphone size={20} className="text-sky-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-white text-sm">Ober</p>
              <p className="text-white/40 text-xs">Bestellingen aanmaken en volgen</p>
            </div>
          </button>
        </div>

        <p className="text-white/25 text-xs text-center">
          Realtime synchronisatie tussen alle toestellen
        </p>
      </div>
    </div>
  );
}
