// Offline queue: orders created while offline are stored locally and
// synced to Supabase when connectivity returns. Each entry is a full
// order payload + the session id it belongs to.

const KEY = 'klj_pending_orders';

export interface PendingOrder {
  local_id: string;
  session_id: string;
  table_name: string;
  waiter: string;
  items: any[];
  total: number;
  vakjes: number;
  note?: string | null;
  created_at: string;
}

export function loadPending(): PendingOrder[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]');
  } catch {
    return [];
  }
}

export function savePending(list: PendingOrder[]) {
  localStorage.setItem(KEY, JSON.stringify(list));
}

export function addPending(order: PendingOrder) {
  const list = loadPending();
  list.push(order);
  savePending(list);
}

export function removePending(local_id: string) {
  savePending(loadPending().filter((o) => o.local_id !== local_id));
}
