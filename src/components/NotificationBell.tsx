import { useState, useEffect, useCallback } from 'react';
import { Bell, BellOff, BellRing } from 'lucide-react';
import { notificationsSupported, notificationPermission, requestNotificationPermission, showNotification } from '../lib/notifications';
import { isAudioUnlocked } from '../lib/utils';

interface Props {
  onEnabled?: () => void;
  compact?: boolean;
}

/**
 * Knop om native browsermeldingen in/uit te schakelen.
 * Vraagt toestemming bij eerste klik, toont status daarna.
 */
export function NotificationBell({ onEnabled, compact }: Props) {
  const [perm, setPerm] = useState<NotificationPermission>('default');
  const [supported] = useState(notificationsSupported());

  useEffect(() => {
    if (supported) setPerm(notificationPermission());
  }, [supported]);

  const handleToggle = useCallback(async () => {
    if (!supported) {
      alert('Deze browser ondersteunt geen systeemmeldingen. Gebruik Chrome of Edge op gsm of desktop.');
      return;
    }
    if (perm === 'granted') {
      // Test notificatie
      await showNotification('KLJ Bestelsysteem', 'Meldingen staan aan - je krijgt nu meldingen bij nieuwe bestellingen.', 'klj-test');
      return;
    }
    if (perm === 'denied') {
      alert('Meldingen zijn geblokkeerd in je browser-instellingen. Sta meldingen toe voor deze site in de browser-instellingen om ze opnieuw in te schakelen.');
      return;
    }
    const result = await requestNotificationPermission();
    setPerm(result);
    if (result === 'granted') {
      isAudioUnlocked();
      await showNotification('KLJ Bestelsysteem', 'Meldingen ingeschakeld! Je krijgt nu een melding bij elke nieuwe bestelling.', 'klj-enabled');
      onEnabled?.();
    }
  }, [perm, supported, onEnabled]);

  if (!supported) {
    return (
      <button
        onClick={handleToggle}
        className="btn-ghost p-1.5 opacity-50"
        title="Geen ondersteuning voor meldingen"
      >
        <BellOff size={16} />
      </button>
    );
  }

  const icon = perm === 'granted' ? <BellRing size={16} className="text-emerald-400" /> : <Bell size={16} />;
  const title = perm === 'granted' ? 'Meldingen aan' : perm === 'denied' ? 'Meldingen geblokkeerd' : 'Meldingen inschakelen';

  if (compact) {
    return (
      <button onClick={handleToggle} className="btn-ghost p-1.5" title={title}>
        {icon}
      </button>
    );
  }

  return (
    <button onClick={handleToggle} className="btn-ghost px-2.5 py-1.5 text-xs flex items-center gap-1.5" title={title}>
      {icon}
      <span className="hidden sm:inline">{perm === 'granted' ? 'Meldingen aan' : 'Meldingen'}</span>
    </button>
  );
}
