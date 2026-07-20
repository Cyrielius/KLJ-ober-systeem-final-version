import { createContext, useContext, useState, type ReactNode, useCallback } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info';
interface Toast { id: string; type: ToastType; msg: string }
interface Ctx { push: (msg: string, type?: ToastType) => void }
const ToastCtx = createContext<Ctx>({ push: () => {} });
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((msg: string, type: ToastType = 'success') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, type, msg }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }, []);

  return (
    <ToastCtx.Provider value={{ push }}>
      {children}
      <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 max-w-[90vw]">
        {toasts.map((t) => {
          const Icon = t.type === 'success' ? CheckCircle2 : t.type === 'error' ? AlertCircle : Info;
          const color = t.type === 'success' ? 'text-emerald-400' : t.type === 'error' ? 'text-red-400' : 'text-sky-400';
          return (
            <div key={t.id} className="card px-4 py-3 flex items-center gap-3 animate-slideup min-w-[260px]">
              <Icon className={color} size={20} />
              <span className="text-sm flex-1">{t.msg}</span>
              <button onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}><X size={16} className="text-white/40" /></button>
            </div>
          );
        })}
      </div>
    </ToastCtx.Provider>
  );
}
