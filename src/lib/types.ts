export type OrderStatus = 'pending' | 'done' | 'completed' | 'cancelled';

export interface Session {
  id: string;
  code: string;
  pin: string;
  event_name: string;
  vakje_value: number;
  next_order_num: number;
  timer_yellow: number;
  timer_orange: number;
  timer_red: number;
  timer_critical: number;
  auto_print: boolean;
  created_at: string;
}

export interface Product {
  id: string;
  session_id: string;
  name: string;
  price: number;
  emoji: string;
  category: string;
  available: boolean;
  sort_order: number;
  photo_url?: string | null;
  vakjes_override?: number | null;
  created_at: string;
}

export interface TableConfig {
  id: string;
  session_id: string;
  name: string;
  sort_order: number;
  created_at: string;
}

export interface OrderItem {
  product_id: string;
  name: string;
  price: number;
  emoji: string;
  qty: number;
  note?: string;
  vakjes_override?: number | null;
}

export interface Order {
  id: string;
  session_id: string;
  num: number;
  table_name: string;
  waiter: string;
  items: OrderItem[];
  total: number;
  vakjes: number;
  note?: string | null;
  status: OrderStatus;
  cancel_reason?: string | null;
  completed_at?: string | null;
  picked_up_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrderEvent {
  id: string;
  order_id: string;
  session_id: string;
  event_type: string;
  waiter?: string | null;
  detail?: string | null;
  created_at: string;
}
