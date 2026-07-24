import { supabase } from './supabase';
import type { Session, Product, TableConfig, Order, OrderItem, OrderStatus, WorkflowMode, SoundType, ProductAvailability } from './types';
import { addPending, loadPending, removePending } from './offline';
import { uid, vakjesFor } from './utils';

// ---- Sessions ----

export async function createSession(eventName: string): Promise<Session> {
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const pin = String(Math.floor(1000 + Math.random() * 9000));
  const { data, error } = await supabase
    .from('klj_sessions')
    .insert({ code, pin, event_name: eventName, vakje_value: 0.5, next_order_num: 1, workflow_mode: '2-step', sound_type: 'beep' })
    .select()
    .single();
  if (error) throw error;
  return data as Session;
}

export async function getSessionByCode(code: string): Promise<Session | null> {
  const { data, error } = await supabase
    .from('klj_sessions')
    .select('*')
    .eq('code', code)
    .maybeSingle();
  if (error) throw error;
  return data as Session | null;
}

export async function updateSession(id: string, patch: Partial<Session>): Promise<void> {
  const { error } = await supabase.from('klj_sessions').update(patch).eq('id', id);
  if (error) throw error;
}

// ---- Products ----

export async function fetchProducts(sessionId: string): Promise<Product[]> {
  const { data, error } = await supabase
    .from('klj_products')
    .select('*')
    .eq('session_id', sessionId)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return (data || []) as Product[];
}

export async function upsertProduct(p: Partial<Product> & { session_id: string }): Promise<Product> {
  const payload: any = { ...p };
  if (p.availability) {
    payload.available = p.availability === 'available';
  }
  if (p.id) {
    const { data, error } = await supabase.from('klj_products').update(payload).eq('id', p.id).select().single();
    if (error) throw error;
    return data as Product;
  }
  const { data, error } = await supabase
    .from('klj_products')
    .insert({ ...payload, sort_order: p.sort_order ?? 0 })
    .select()
    .single();
  if (error) throw error;
  return data as Product;
}

export async function deleteProduct(id: string): Promise<void> {
  const { error } = await supabase.from('klj_products').delete().eq('id', id);
  if (error) throw error;
}

export async function reorderProducts(ids: string[]): Promise<void> {
  await Promise.all(ids.map((id, i) =>
    supabase.from('klj_products').update({ sort_order: i }).eq('id', id),
  ));
}

// ---- Tables (legacy, kept for backward compat) ----

export async function fetchTables(sessionId: string): Promise<TableConfig[]> {
  const { data, error } = await supabase
    .from('klj_tables')
    .select('*')
    .eq('session_id', sessionId)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return (data || []) as TableConfig[];
}

export async function upsertTable(t: Partial<TableConfig> & { session_id: string }): Promise<TableConfig> {
  if (t.id) {
    const { data, error } = await supabase.from('klj_tables').update(t).eq('id', t.id).select().single();
    if (error) throw error;
    return data as TableConfig;
  }
  const { data, error } = await supabase
    .from('klj_tables')
    .insert({ ...t, sort_order: t.sort_order ?? 0 })
    .select()
    .single();
  if (error) throw error;
  return data as TableConfig;
}

export async function deleteTable(id: string): Promise<void> {
  const { error } = await supabase.from('klj_tables').delete().eq('id', id);
  if (error) throw error;
}

// ---- Orders ----

export async function fetchOrders(sessionId: string): Promise<Order[]> {
  const { data, error } = await supabase
    .from('klj_orders')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []) as Order[];
}

export async function createOrder(
  sessionId: string,
  tableName: string,
  waiter: string,
  items: OrderItem[],
  vakjeValue: number,
  note?: string,
): Promise<Order> {
  const total = items.reduce((s, i) => s + i.price * i.qty, 0);
  const vakjes = items.reduce((s, i) => s + vakjesFor(i.price, vakjeValue) * i.qty, 0);

  // Offline path: queue locally, sync later.
  if (!navigator.onLine) {
    addPending({
      local_id: uid(),
      session_id: sessionId,
      table_name: tableName,
      waiter,
      items,
      total,
      vakjes,
      note: note || null,
      created_at: new Date().toISOString(),
    });
    return {
      id: 'local-' + uid(),
      session_id: sessionId,
      num: 0,
      table_name: tableName,
      waiter,
      items,
      total,
      vakjes,
      note: note || null,
      status: 'pending',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as Order;
  }

  // Claim the next order number atomically via RPC.
  const { data: num, error: numErr } = await supabase.rpc('klj_claim_order_num', { p_session_id: sessionId });
  if (numErr) throw numErr;

  const { data, error } = await supabase
    .from('klj_orders')
    .insert({
      session_id: sessionId,
      num,
      table_name: tableName,
      waiter,
      items,
      total,
      vakjes,
      note: note || null,
      status: 'pending',
    })
    .select()
    .single();
  if (error) throw error;

  await supabase.from('klj_order_events').insert({
    order_id: (data as Order).id,
    session_id: sessionId,
    event_type: 'created',
    waiter,
    detail: `Bestelling #${num} aangemaakt (${items.length} regels)`,
  });

  return data as Order;
}

export async function updateOrderStatus(
  id: string,
  status: OrderStatus,
  reason?: string,
  sessionId?: string,
): Promise<void> {
  const now = new Date().toISOString();
  const patch: any = { status, updated_at: now };
  if (reason) patch.cancel_reason = reason;
  // completed_at tracks when kitchen marks done (2-step) or made (1-step)
  if (status === 'done') patch.completed_at = now;
  if (status !== 'done') patch.completed_at = null;
  // picked_up_at tracks when waiter completes the order
  if (status === 'completed') patch.picked_up_at = now;
  if (status !== 'completed') patch.picked_up_at = null;
  // made_at tracks 1-step "Bestelling gemaakt"
  if (status === 'done') patch.made_at = now;
  if (status !== 'done') patch.made_at = null;

  const { error } = await supabase.from('klj_orders').update(patch).eq('id', id);
  if (error) throw error;

  // Log event
  let sid = sessionId;
  if (!sid) {
    const { data } = await supabase.from('klj_orders').select('session_id').eq('id', id).maybeSingle();
    sid = data?.session_id;
  }
  await supabase.from('klj_order_events').insert({
    order_id: id,
    session_id: sid,
    event_type: status,
    detail: reason || `Status gewijzigd naar ${status}`,
  });
}

export async function updateOrder(id: string, patch: Partial<Order>): Promise<void> {
  const { error } = await supabase
    .from('klj_orders')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

// ---- Sync pending orders ----

export async function syncPendingOrders(): Promise<number> {
  const pending = loadPending();
  let synced = 0;
  for (const p of pending) {
    try {
      const { data: num, error: numErr } = await supabase.rpc('klj_claim_order_num', { p_session_id: p.session_id });
      if (numErr) throw numErr;
      const { error } = await supabase.from('klj_orders').insert({
        session_id: p.session_id,
        num,
        table_name: p.table_name,
        waiter: p.waiter,
        items: p.items,
        total: p.total,
        vakjes: p.vakjes,
        note: p.note,
        status: 'pending',
      });
      if (error) throw error;
      removePending(p.local_id);
      synced++;
    } catch {
      // keep retrying remaining orders
    }
  }
  return synced;
}
