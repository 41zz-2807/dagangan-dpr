export type Role = "owner" | "kasir";

export interface User {
  id: number;
  username: string;
  full_name: string | null;
  display_name: string;
  role: Role;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string | null;
}

export interface ApiErrorPayload {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface Category {
  id: number;
  name: string;
  description: string | null;
  is_active: boolean;
  product_count?: number;
  active_product_count?: number;
  created_at?: string | null;
}

export interface Product {
  id: number;
  sku: string;
  barcode: string | null;
  name: string;
  description: string | null;
  price_sale: string;
  price_purchase: string;
  stock: number;
  min_stock: number;
  unit: string;
  image_path: string | null;
  image_url: string | null;
  thumb_url: string | null;
  is_active: boolean;
  is_low_stock: boolean;
  category: { id: number; name: string } | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  per_page: number;
  pages: number;
}

export type MovementType = "sale" | "restock" | "adjust" | "void";

export interface StockMovement {
  id: number;
  product_id: number;
  product_name: string | null;
  qty: number;
  movement_type: MovementType;
  reason: string | null;
  user_id: number | null;
  username: string | null;
  sale_id: number | null;
  ref: string | null;
  created_at: string | null;
}

export interface StockSummary {
  total_products: number;
  total_units: number;
  low_stock_count: number;
}

export type PaymentMethod = "cash" | "transfer" | "qris";
export type SaleStatus = "paid" | "void";

export interface SaleItem {
  id: number;
  product_id: number | null;
  qty: number;
  product_name: string;
  product_sku: string | null;
  unit_price: string;
  subtotal: string;
}

export interface SalePayment {
  id: number;
  method: PaymentMethod;
  amount: string;
  reference: string | null;
  change_amount: string;
  created_at: string | null;
}

export interface Sale {
  id: number;
  invoice_no: string;
  cashier: { id: number; username: string; display_name: string } | null;
  subtotal: string;
  discount: string;
  total: string;
  status: SaleStatus;
  customer_name: string | null;
  customer_phone: string | null;
  receipt_token: string;
  created_at: string | null;
  voided_at: string | null;
  void_reason: string | null;
  note?: string | null;
  items?: SaleItem[];
  payments?: SalePayment[];
}

export interface ReportSummary {
  range: { from: string; to: string };
  omset: string;
  transaksi: number;
  produk_terjual: number;
  diskon: string;
  rata_rata: string;
  low_stock_count: number;
  by_method: { method: PaymentMethod; count: number; amount: string }[];
  by_cashier: {
    username: string;
    display_name: string;
    count: number;
    amount: string;
  }[];
}

export interface DailyReport {
  from: string;
  to: string;
  total: string;
  items: { date: string; count: number; amount: string }[];
}

export interface TopProduct {
  product_id: number | null;
  product_name: string;
  qty: number;
  amount: string;
}

export interface AuditEntry {
  id: number;
  user_id: number | null;
  username: string | null;
  action: string;
  entity: string | null;
  entity_id: string | null;
  before: unknown;
  after: unknown;
  ip: string | null;
  user_agent: string | null;
  created_at: string;
}
