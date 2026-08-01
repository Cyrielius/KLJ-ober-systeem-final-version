/**
 * Native browsermeldingen (Web Notifications API + Service Worker).
 * Werkt op desktop Chrome/Edge/Firefox en op gsm wanneer de site als
 * PWA op het beginscherm geinstalleerd is.
 */

let swRegistration: ServiceWorkerRegistration | null = null;

export async function initNotifications(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  try {
    swRegistration = await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;
  } catch { /* ignore — SW niet kritisch */ }
}

export function notificationsSupported(): boolean {
  return typeof Notification !== 'undefined' && 'serviceWorker' in navigator;
}

export function notificationPermission(): NotificationPermission {
  if (!notificationsSupported()) return 'denied';
  return Notification.permission;
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!notificationsSupported()) return 'denied';
  if (Notification.permission === 'granted') return 'granted';
  const result = await Notification.requestPermission();
  return result;
}

/**
 * Toon een native systeemmelding. Gebruikt de Service Worker wanneer
 * beschikbaar (werkt ook als tabblad niet actief is), anders valt
 * terug op een directe Notification.
 */
export async function showNotification(title: string, body: string, tag?: string): Promise<void> {
  if (!notificationsSupported()) return;
  if (Notification.permission !== 'granted') return;

  const payload = {
    type: 'NOTIFY',
    title,
    body,
    tag: tag || 'klj-order',
    url: location.origin,
  };

  try {
    const reg = swRegistration || (await navigator.serviceWorker.ready);
    if (reg.active) {
      reg.active.postMessage(payload);
    } else {
      await reg.showNotification(title, { body, tag: tag || 'klj-order' });
    }
  } catch { /* ignore */ }
}
