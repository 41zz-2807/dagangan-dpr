import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiFetch } from "../lib/api";
import { useAuth } from "../lib/auth";
import { formatRupiah } from "../lib/format";
import type { Category, Paginated, Product, Sale } from "../types";
import CartSheet, {
  type CartItem,
  type CheckoutPayload,
} from "../components/CartSheet";
import PaymentSuccessSplash from "../components/PaymentSuccessSplash";
import { Alert, Badge, Button, Spinner } from "../components/ui";
import { IconCart, IconSearch } from "../components/icons";

export default function KasirPage() {
  const queryClient = useQueryClient();
  const { isOwner } = useAuth();
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [notice, setNotice] = useState<{ tone: "error" | "success"; text: string } | null>(
    null,
  );
  const [lastSale, setLastSale] = useState<Sale | null>(null);
  const [showSplash, setShowSplash] = useState(false);

  useEffect(() => {
    if (!lastSale) return;
    const timer = window.setTimeout(() => setShowSplash(false), 1000);
    return () => window.clearTimeout(timer);
  }, [lastSale]);

  const categoriesQuery = useQuery({
    queryKey: ["categories"],
    queryFn: () => apiFetch<{ items: Category[] }>("/categories"),
  });

  const productsQuery = useQuery({
    queryKey: ["products", "kasir", search, categoryId],
    queryFn: () => {
      const params = new URLSearchParams({ per_page: "100" });
      if (search.trim()) params.set("q", search.trim());
      if (categoryId) params.set("category_id", String(categoryId));
      return apiFetch<Paginated<Product>>(`/products?${params.toString()}`);
    },
  });

  const saleMutation = useMutation({
    mutationFn: async (payload: CheckoutPayload) => {
      const data = await apiFetch<{ sale: Sale }>("/sales", {
        method: "POST",
        body: {
          items: cart.map((item) => ({
            product_id: item.product.id,
            qty: item.qty,
          })),
          payments: [
            {
              method: payload.method,
              amount: payload.amount,
              reference: payload.reference,
            },
          ],
          discount: String(payload.discount || 0),
        },
      });
      return data.sale;
    },
    onSuccess: (sale) => {
      setCart([]);
      setCartOpen(false);
      setShowSplash(true);
      setLastSale(sale);
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["stock"] });
    },
  });

  const products = (productsQuery.data?.items ?? []).filter((product) => product.stock > 0);
  const categories = (categoriesQuery.data?.items ?? []).filter(
    (category) => category.is_active,
  );

  const cartCount = cart.reduce((sum, item) => sum + item.qty, 0);
  const cartTotal = useMemo(
    () =>
      cart.reduce(
        (sum, item) => sum + Number(item.product.price_sale) * item.qty,
        0,
      ),
    [cart],
  );

  const addToCart = (product: Product) => {
    setNotice(null);
    const existing = cart.find((item) => item.product.id === product.id);
    if (existing) {
      if (existing.qty >= product.stock) {
        setNotice({
          tone: "error",
          text: `Stok ${product.name} tinggal ${product.stock}.`,
        });
        return;
      }
      setCart(
        cart.map((item) =>
          item.product.id === product.id ? { ...item, qty: item.qty + 1 } : item,
        ),
      );
      return;
    }
    if (product.stock <= 0) {
      setNotice({ tone: "error", text: `Stok ${product.name} habis.` });
      return;
    }
    setCart([...cart, { product, qty: 1 }]);
  };

  const changeQty = (productId: number, qty: number) => {
    setCart(
      cart
        .map((item) =>
          item.product.id === productId
            ? { ...item, qty: Math.min(Math.max(qty, 0), item.product.stock) }
            : item,
        )
        .filter((item) => item.qty > 0),
    );
  };

  const removeItem = (productId: number) => {
    setCart(cart.filter((item) => item.product.id !== productId));
  };

  const handleCheckout = async (payload: CheckoutPayload) => {
    await saleMutation.mutateAsync(payload);
  };

  if (lastSale) {
    const payment = lastSale.payments?.[0];
    const change = payment ? Number(payment.change_amount) : 0;
    return (
      <>
        {showSplash && (
          <PaymentSuccessSplash
            amount={payment?.amount ?? lastSale.total}
            change={change}
          />
        )}
        <div className="flex min-h-[70vh] flex-col items-center justify-center gap-4 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
          <IconCart className="h-8 w-8" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Transaksi Berhasil</h1>
          <p className="mt-1 text-sm text-slate-500">{lastSale.invoice_no}</p>
        </div>
        <div className="w-full max-w-sm space-y-2 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm">
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">Total</span>
            <span className="font-bold text-slate-900">
              {formatRupiah(lastSale.total)}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">Metode</span>
            <span className="font-semibold capitalize text-slate-900">
              {payment?.method ?? "-"}
            </span>
          </div>
          {payment?.reference && (
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Referensi</span>
              <span className="font-semibold text-slate-900">
                {payment.reference}
              </span>
            </div>
          )}
          {change > 0 && (
            <div className="flex justify-between rounded-xl bg-emerald-50 px-3 py-2 text-sm">
              <span className="text-emerald-700">Kembalian</span>
              <span className="font-bold text-emerald-700">
                {formatRupiah(change)}
              </span>
            </div>
          )}
        </div>
        <div className="flex w-full max-w-sm flex-col gap-2">
          <Button full onClick={() => setLastSale(null)}>
            Transaksi Baru
          </Button>
          <Button
            variant="secondary"
            full
            onClick={() =>
              window.open(
                `${window.location.origin}/r/${lastSale.receipt_token}`,
                "_blank",
                "noopener",
              )
            }
          >
            Buka Struk
          </Button>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              full
              onClick={() =>
                window.open(
                  `/api/sales/${lastSale.id}/receipt.pdf`,
                  "_blank",
                  "noopener",
                )
              }
            >
              Cetak Struk
            </Button>
            <Button
              variant="secondary"
              full
              onClick={() => {
                const url = `${window.location.origin}/r/${lastSale.receipt_token}/pdf.pdf`;
                const text = `Struk ${lastSale.invoice_no} — ${formatRupiah(lastSale.total)}`;
                if (navigator.share) {
                  void navigator
                    .share({ title: `Struk ${lastSale.invoice_no}`, text, url })
                    .catch(() => {});
                } else {
                  void navigator.clipboard?.writeText(url);
                }
              }}
            >
              Bagikan
            </Button>
          </div>
        </div>
      </div>
      </>
    );
  }

  return (
    <div className="space-y-3 pb-40">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Kasir</h1>
        <p className="text-sm text-slate-500">Pilih produk</p>
      </div>

      {notice && (
        <div className="fixed bottom-[84px] left-0 right-0 z-50 px-4 md:left-64 md:px-4">
          <div className="mx-auto max-w-6xl">
            <Alert variant={notice.tone === "error" ? "error" : "success"}>
              {notice.text}
            </Alert>
          </div>
        </div>
      )}

      <div className="relative">
        <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Cari produk..."
          className="min-h-[48px] w-full rounded-xl border border-slate-300 bg-white pl-10 pr-3 text-base"
        />
      </div>

      <div>
        <select
          value={categoryId ?? ""}
          onChange={(event) =>
            setCategoryId(event.target.value ? Number(event.target.value) : null)
          }
          className="min-h-[48px] w-full rounded-xl border border-slate-300 bg-white px-3 text-base"
        >
          <option value="">Semua Kategori</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </div>

      {productsQuery.isLoading ? (
        <Spinner label="Memuat produk..." />
      ) : products.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          Produk tidak ditemukan.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
          {products.map((product) => {
            const soldOut = product.stock <= 0;
            const inCart = cart.find((item) => item.product.id === product.id);
            const canIncrease = inCart ? inCart.qty < product.stock : product.stock > 0;
            return (
              <div
                key={product.id}
                className="overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-sm transition"
              >
                <button
                  type="button"
                  disabled={soldOut}
                  onClick={() => addToCart(product)}
                  className="w-full text-left disabled:opacity-60 active:scale-[0.99]"
                >
                  <div className="relative aspect-square w-full overflow-hidden bg-slate-100">
                    {product.thumb_url ? (
                      <img
                        src={product.thumb_url}
                        alt={product.name}
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-xs font-medium text-slate-400">
                        Tanpa gambar
                      </div>
                    )}
                    {inCart && (
                      <span className="absolute right-2 top-2 flex h-7 min-w-7 items-center justify-center rounded-full bg-brand-600 px-2 text-xs font-bold text-white">
                        {inCart.qty}
                      </span>
                    )}
                  </div>
                  <div className="p-3">
                    <p className="line-clamp-2 text-sm font-semibold text-slate-900">
                      {product.name}
                    </p>
                    <p className="mt-1 text-sm font-bold text-brand-700">
                      {formatRupiah(product.price_sale)}
                    </p>
                    <div className="mt-1.5">
                      {soldOut ? (
                        <Badge tone="red">Stok habis</Badge>
                      ) : (
                        <Badge tone={product.is_low_stock ? "amber" : "slate"}>
                          Stok {product.stock}
                        </Badge>
                      )}
                    </div>
                  </div>
                </button>
                {inCart && !soldOut && (
                  <div className="flex items-center justify-between border-t border-slate-100 px-2 py-1.5">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        changeQty(product.id, inCart.qty - 1);
                      }}
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-lg font-bold text-slate-700 transition active:scale-95"
                      aria-label="Kurangi jumlah"
                    >
                      -
                    </button>
                    <span className="text-sm font-semibold text-slate-900">
                      {inCart.qty}
                    </span>
                    <button
                      type="button"
                      disabled={!canIncrease}
                      onClick={(e) => {
                        e.stopPropagation();
                        addToCart(product);
                      }}
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 text-lg font-bold text-white transition active:scale-95 disabled:opacity-40"
                      aria-label="Tambah jumlah"
                    >
                      +
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {cart.length > 0 && (
        <div className="fixed inset-x-0 bottom-[68px] z-40 md:bottom-4 md:left-64">
          <div className="mx-auto flex max-w-6xl items-center gap-3 border-t border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur md:justify-end md:rounded-2xl md:border md:pr-4">
            <div className="min-w-0 flex-1 md:flex-none md:text-right">
              <p className="text-xs text-slate-500">
                {cart.length} produk · {cartCount} unit
              </p>
              <p className="truncate text-lg font-bold text-slate-900">
                {formatRupiah(cartTotal)}
              </p>
            </div>
            <Button onClick={() => setCartOpen(true)}>
              <IconCart className="h-5 w-5" />
              Bayar
            </Button>
          </div>
        </div>
      )}

      <CartSheet
        open={cartOpen}
        items={cart}
        isOwner={isOwner}
        onClose={() => setCartOpen(false)}
        onChangeQty={changeQty}
        onRemove={removeItem}
        onSubmit={handleCheckout}
      />
    </div>
  );
}
