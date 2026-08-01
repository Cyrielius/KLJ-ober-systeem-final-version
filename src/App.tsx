import { useState, useEffect, useCallback } from 'react';
import { ToastProvider } from './components/Toast';
import { StartScreen } from './screens/StartScreen';
import { HostEntry } from './screens/HostEntry';
import { HostDashboard } from './screens/HostDashboard';
import { WaiterEntry } from './screens/WaiterEntry';
import { WaiterDashboard } from './screens/WaiterDashboard';
import { KitchenEntry } from './screens/KitchenEntry';
import { KitchenScreen } from './screens/KitchenScreen';
import { getSessionByCode, syncPendingOrders } from './lib/db';
import { unlockAudio } from './lib/utils';
import type { Session } from './lib/types';

type Role = 'start' | 'host' | 'waiter' | 'kitchen';
type ConnStatus = 'online' | 'sync' | 'offline';

interface HostState { session: Session }
interface WaiterState { session: Session; name: string }
interface KitchenState { session: Session; name: string; workerSessionId: string }

const LS_HOST = 'klj_active_host';
const LS_WAITER_NAME = 'klj_waiter_name';
const LS_WAITER_SESSION = 'klj_active_waiter';
const LS_KITCHEN_SESSION = 'klj_active_kitchen';

function App() {
  const [role, setRole] = useState<Role>('start');
  const [host, setHost] = useState<HostState | null>(null);
  const [waiter, setWaiter] = useState<WaiterState | null>(null);
  const [kitchen, setKitchen] = useState<KitchenState | null>(null);
  const [conn, setConn] = useState<ConnStatus>('online');

  // History guard: keep the user on the site. Push a marker state on mount and
  // re-push it on popstate so the browser back button cannot navigate away from
  // the app (sessions auto-resume from localStorage on any reload anyway).
  useEffect(() => {
    const unlock = () => { unlockAudio(); window.removeEventListener('pointerdown', unlock); };
    window.addEventListener('pointerdown', unlock);
    return () => window.removeEventListener('pointerdown', unlock);
  }, []);

  // History guard: keep the user on the site. Push a marker state on mount and
  // re-push it on popstate so the browser back button cannot navigate away from
  // the app (sessions auto-resume from localStorage on any reload anyway).
  useEffect(() => {
    history.pushState({ kljGuard: true }, '');
    const onPop = () => { history.pushState({ kljGuard: true }, ''); };
    window.addEventListener('popstate', onPop);
    return () => { window.removeEventListener('popstate', onPop); };
  }, []);

  // Auto-route naar ober-aanmelding wanneer een ?code= parameter aanwezig is (via QR).
  useEffect(() => {
    try {
      const c = new URLSearchParams(window.location.search).get('code');
      if (c && role === 'start' && !host && !waiter) {
        const roleParam = new URLSearchParams(window.location.search).get('role');
        setRole(roleParam === 'kitchen' ? 'kitchen' : 'waiter');
      }
    } catch {}
    // eslint-disable-next-line
  }, []);

  // Connectivity tracking + offline sync
  useEffect(() => {
    const update = () => {
      if (navigator.onLine) {
        setConn((c) => (c === 'offline' ? 'sync' : 'online'));
        syncPendingOrders().then((n) => {
          if (n > 0) setConn('online');
          else setConn('online');
        }).catch(() => setConn('online'));
      } else {
        setConn('offline');
      }
    };
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    const t = setInterval(() => {
      if (navigator.onLine) syncPendingOrders().catch(() => {});
    }, 15000);
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); clearInterval(t); };
  }, []);

  // Auto-resume: silently restore host, waiter, or kitchen sessions on boot/refresh.
  // No PIN re-entry — the session was already authenticated when first started.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rawHost = localStorage.getItem(LS_HOST);
        if (rawHost) {
          const parsed = JSON.parse(rawHost) as { code: string; pin: string };
          const s = await getSessionByCode(parsed.code);
          if (!cancelled && s && s.pin === parsed.pin) {
            setHost({ session: s });
            setRole('host');
            return;
          }
        }
      } catch {}
      try {
        const rawWaiter = localStorage.getItem(LS_WAITER_SESSION);
        if (rawWaiter) {
          const parsed = JSON.parse(rawWaiter) as { code: string; name: string };
          const s = await getSessionByCode(parsed.code);
          if (!cancelled && s) {
            setWaiter({ session: s, name: parsed.name });
            setRole('waiter');
            return;
          }
        }
      } catch {}
      try {
        const rawKitchen = localStorage.getItem(LS_KITCHEN_SESSION);
        if (rawKitchen) {
          const parsed = JSON.parse(rawKitchen) as { code: string; name: string; workerSessionId: string };
          // Ongeldige/verouderde workerSessionId (geen UUID) vervangen door geldige
          const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
          let workerSessionId = parsed.workerSessionId;
          if (!uuidRe.test(workerSessionId)) {
            workerSessionId = crypto.randomUUID();
            localStorage.setItem(LS_KITCHEN_SESSION, JSON.stringify({ code: parsed.code, name: parsed.name, workerSessionId }));
          }
          const s = await getSessionByCode(parsed.code);
          if (!cancelled && s) {
            setKitchen({ session: s, name: parsed.name, workerSessionId });
            setRole('kitchen');
            return;
          }
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, []);

  const startHost = useCallback((s: Session) => {
    localStorage.setItem(LS_HOST, JSON.stringify({ id: s.id, code: s.code, pin: s.pin }));
    setHost({ session: s });
    setRole('host');
  }, []);

  const startWaiter = useCallback((s: Session, name: string) => {
    localStorage.setItem(LS_WAITER_NAME, name);
    localStorage.setItem(LS_WAITER_SESSION, JSON.stringify({ code: s.code, name }));
    setWaiter({ session: s, name });
    setRole('waiter');
  }, []);

  const startKitchen = useCallback((s: Session, name: string) => {
    const workerSessionId = crypto.randomUUID();
    localStorage.setItem(LS_KITCHEN_SESSION, JSON.stringify({ code: s.code, name, workerSessionId }));
    setKitchen({ session: s, name, workerSessionId });
    setRole('kitchen');
  }, []);

  const leaveHost = useCallback(() => {
    localStorage.removeItem(LS_HOST);
    setHost(null);
    setRole('start');
  }, []);

  const leaveWaiter = useCallback(() => {
    localStorage.removeItem(LS_WAITER_SESSION);
    setWaiter(null);
    setRole('start');
  }, []);

  const leaveKitchen = useCallback(() => {
    localStorage.removeItem(LS_KITCHEN_SESSION);
    setKitchen(null);
    setRole('start');
  }, []);

  return (
    <ToastProvider>
      <div className="min-h-screen">
        {role === 'start' && <StartScreen onHost={() => setRole('host')} onWaiter={() => setRole('waiter')} onKitchen={() => setRole('kitchen')} />}
        {role === 'host' && !host && <HostEntry onBack={() => setRole('start')} onHostSession={startHost} />}
        {role === 'host' && host && <HostDashboard session={host.session} onLeave={leaveHost} connStatus={conn} />}
        {role === 'waiter' && !waiter && <WaiterEntry onBack={() => setRole('start')} onJoin={startWaiter} savedName={localStorage.getItem(LS_WAITER_NAME) || undefined} />}
        {role === 'waiter' && waiter && <WaiterDashboard session={waiter.session} waiterName={waiter.name} onLeave={leaveWaiter} connStatus={conn} />}
        {role === 'kitchen' && !kitchen && <KitchenEntry onBack={() => setRole('start')} onJoin={startKitchen} />}
        {role === 'kitchen' && kitchen && <KitchenScreen session={kitchen.session} workerName={kitchen.name} workerSessionId={kitchen.workerSessionId} onLeave={leaveKitchen} />}
      </div>
    </ToastProvider>
  );
}

export default App;
