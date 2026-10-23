import { useEffect, useState } from "react";

import { ApiError } from "../lib/api";
import { formatRupiah } from "../lib/format";
import type { PaymentMethod, Product } from "../types";
import BottomSheet from "./BottomSheet";
import { Alert, Badge, Button, Input } from "./ui";
import { IconMinus, IconPlus, IconTrash } from "./icons";

export interface CartItem {
  product: Product;
  qty: number;
}

export interface CheckoutPayload {
  method: PaymentMethod;
  amount: string;
  reference: string | null;
  discount: number;
}

interface Props {
  open: boolean;
  items: CartItem[];
  isOwner: boolean;
  onClose: () => void;
  onChangeQty: (productId: number, qty: number) => void;
  onRemove: (productId: number) => void;
  onSubmit: (payload: CheckoutPayload) => Promise<void>;
}

const METHODS: { key: PaymentMethod; label: string; hint: string }[] = [
  { key: "cash", label: "Tunai", hint: "Uang diterima & kembalian" },
  { key: "transfer", label: "Transfer", hint: "Rekening / e-wallet" },
  { key: "qris", label: "QRIS", hint: "Scan QR" },
];

const QUICK_CASH = [20000, 50000, 100000, 200000];

export default function CartSheet({
  open,
  items,
  isOwner,
  onClose,
  onChangeQty,
  onRemove,
  onSubmit,
}: Props) {
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [cashAmount, setCashAmount] = useState("");
  const [reference, setReference] = useState("");
  const [discount, setDiscount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setCashAmount("");
    setReference("");
    setDiscount("");
  }, [open]);

  const subtotal = items.reduce(
    (sum, item) => sum + Number(item.product.price_sale) * item.qty,
    0,
  );
  const discountValue = Math.min(Math.max(Number(discount) || 0, 0), subtotal);
  const total = Math.max(0, subtotal - discountValue);
  const cash = Number(cashAmount) || 0;
  const change = method === "cash" ? Math.max(0, cash - total) : 0;

  const handleSubmit = async () => {
    setError(null);
    if (items.length === 0) {
      setError("Keranjang masih kosong.");
      return;
    }
    if (method === "cash" && cash < total) {
      setError("Uang diterima kurang dari total transaksi.");
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit({
        method,
        amount: method === "cash" ? String(cash) : String(total),
        reference: reference.trim() || null,
        discount: discountValue,
      });
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Gagal menyimpan transaksi. Silakan coba lagi.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <BottomSheet
      open={open}
      title="Keranjang"
      subtitle={`${items.length} produk`}
      onClose={onClose}
      footer={
        <div className="space-y-2">
          {error && <Alert variant="error">{error}</Alert>}
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-500">Total</span>
            <span className="text-lg font-bold text-slate-900">
              {formatRupiah(total)}
            </span>
          </div>
          <Button full loading={submitting} onClick={() => void handleSubmit()}>
            {method === "cash" && cash >= total && total > 0
              ? `Bayar ${formatRupiah(cash)}`
              : `Bayar ${formatRupiah(total)}`}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">

        {items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
            Keranjang masih kosong. Pilih produk untuk memulai transaksi.
          </div>
        ) : (
          <ul className="space-y-2">
            {items.map((item) => (
              <li
                key={item.product.id}
                className="rounded-2xl border border-slate-200 p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-slate-900">
                      {item.product.name}
                    </p>
                    <p className="text-xs text-slate-500">
                      {formatRupiah(item.product.price_sale)} /{" "}
                      {item.product.unit}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onRemove(item.product.id)}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                    aria-label={`Hapus ${item.product.name}`}
                  >
                    <IconTrash className="h-5 w-5" />
                  </button>
                </div>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => onChangeQty(item.product.id, item.qty - 1)}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-700 active:bg-slate-200"
                      aria-label="Kurangi"
                    >
                      <IconMinus className="h-4 w-4" />
                    </button>
                    <span className="w-9 text-center text-sm font-bold text-slate-900">
                      {item.qty}
                    </span>
                    <button
                      type="button"
                      onClick={() => onChangeQty(item.product.id, item.qty + 1)}
                      disabled={item.qty >= item.product.stock}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-700 active:bg-slate-200 disabled:opacity-40"
                      aria-label="Tambah"
                    >
                      <IconPlus className="h-4 w-4" />
                    </button>
                  </div>
                  <p className="text-sm font-bold text-brand-700">
                    {formatRupiah(Number(item.product.price_sale) * item.qty)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="space-y-1.5 border-t border-slate-100 pt-3 text-sm">
          <div className="flex justify-between text-slate-500">
            <span>Subtotal</span>
            <span>{formatRupiah(subtotal)}</span>
          </div>
          {discountValue > 0 && (
            <div className="flex justify-between text-emerald-600">
              <span>Diskon</span>
              <span>-{formatRupiah(discountValue)}</span>
            </div>
          )}
          <div className="flex justify-between text-base font-bold text-slate-900">
            <span>Total</span>
            <span>{formatRupiah(total)}</span>
          </div>
        </div>

        {isOwner && (
          <Input
            label="Diskon (rupiah)"
            value={discount}
            onChange={(event) => setDiscount(event.target.value)}
            type="number"
            inputMode="numeric"
            placeholder="0"
            hint="Diskon hanya bisa diberikan owner."
          />
        )}

        <div>
          <span className="mb-1.5 block text-sm font-medium text-slate-700">
            Metode pembayaran
          </span>
          <div className="grid grid-cols-3 gap-2">
            {METHODS.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setMethod(item.key)}
                className={`min-h-[56px] rounded-xl px-2 py-2 text-center transition ${
                  method === item.key
                    ? "bg-brand-600 text-white shadow-sm"
                    : "bg-slate-50 text-slate-600 ring-1 ring-slate-200"
                }`}
              >
                <span className="block text-sm font-bold">{item.label}</span>
                <span className="block text-[10px] opacity-80">{item.hint}</span>
              </button>
            ))}
          </div>
        </div>

        {method === "cash" ? (
          <div className="space-y-2">
            <Input
              label="Uang diterima"
              value={cashAmount ? Number(cashAmount).toLocaleString("id-ID") : ""}
              onChange={(event) => setCashAmount(event.target.value.replace(/[^0-9]/g, ""))}
              inputMode="numeric"
              placeholder={String(Math.ceil(total))}
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setCashAmount(String(Math.ceil(total)))}
                className="min-h-[36px] rounded-lg bg-slate-100 px-3 text-xs font-semibold text-slate-700"
              >
                Uang pas
              </button>
              {QUICK_CASH.filter((value) => value > total).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setCashAmount(String(value))}
                  className="min-h-[36px] rounded-lg bg-slate-100 px-3 text-xs font-semibold text-slate-700"
                >
                  {formatRupiah(value)}
                </button>
              ))}
            </div>
            {cash >= total && total > 0 && (
              <div className="flex items-center justify-between rounded-xl bg-emerald-50 px-3.5 py-2.5 text-sm">
                <span className="text-emerald-700">Kembalian</span>
                <span className="font-bold text-emerald-700">
                  {formatRupiah(change)}
                </span>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <Input
              label={method === "transfer" ? "Referensi transfer" : "Referensi QRIS"}
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              placeholder="Opsional, mis. nomor transaksi"
            />
            <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3.5 py-2.5 text-sm">
              <span className="text-slate-500">Jumlah dibayar</span>
              <span className="font-bold text-slate-900">{formatRupiah(total)}</span>
            </div>
            <p className="text-xs text-slate-500">
              Pastikan pembayaran sudah diterima sebelum menekan tombol bayar.
            </p>
          </div>
        )}

        {items.length > 0 && (
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Badge tone="slate">Total item</Badge>
            {items.reduce((sum, item) => sum + item.qty, 0)} unit
          </div>
        )}
      </div>
    </BottomSheet>
  );
}
