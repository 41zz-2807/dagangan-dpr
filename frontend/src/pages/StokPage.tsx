import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiFetch, ApiError } from "../lib/api";
import { formatRupiah, formatTanggal } from "../lib/format";
import type { Paginated, Product, StockMovement, StockSummary } from "../types";
import BottomSheet from "../components/BottomSheet";
import { Alert, Badge, Button, Input, Spinner } from "../components/ui";
import { IconSearch } from "../components/icons";

type Tab = "stok" | "pergerakan";

export default function StokPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("stok");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Product | null>(null);
  const [mode, setMode] = useState<"delta" | "set">("delta");
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [movFrom, setMovFrom] = useState("");
  const [movTo, setMovTo] = useState("");

  const summaryQuery = useQuery({
    queryKey: ["stock", "summary"],
    queryFn: () => apiFetch<StockSummary>("/stock/summary"),
  });

  const productsQuery = useQuery({
    queryKey: ["stock", "products", search],
    queryFn: () => {
      const params = new URLSearchParams({ per_page: "100" });
      if (search.trim()) params.set("q", search.trim());
      return apiFetch<Paginated<Product>>(`/products?${params.toString()}`);
    },
  });

  const movementsQuery = useQuery({
    queryKey: ["stock", "movements", movFrom, movTo],
    queryFn: () => {
      const params = new URLSearchParams({ per_page: "100" });
      if (movFrom) params.set("from", movFrom);
      if (movTo) params.set("to", movTo);
      return apiFetch<Paginated<StockMovement>>(`/stock/movements?${params.toString()}`);
    },
  });

  const adjustMutation = useMutation({
    mutationFn: async () => {
      if (!selected) return;
      return apiFetch<{ product: Product; message: string }>("/stock/adjust", {
        method: "POST",
        body: {
          product_id: selected.id,
          mode,
          qty: Number(qty),
          reason: reason.trim(),
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stock"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      setSelected(null);
      setQty("");
      setReason("");
      setError(null);
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : "Gagal mengubah stok.");
    },
  });

  const openAdjust = (product: Product) => {
    setSelected(product);
    setMode("delta");
    setQty("");
    setReason("");
    setError(null);
  };

  const products = productsQuery.data?.items ?? [];
  const movements = movementsQuery.data?.items ?? [];
  const summary = summaryQuery.data;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Stok</h1>
        <p className="text-sm text-slate-500">Cek dan sesuaikan stok produk</p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-3 text-center shadow-sm">
          <p className="text-lg font-bold text-slate-900">
            {summary?.total_products ?? "-"}
          </p>
          <p className="text-[11px] text-slate-500">Produk</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-3 text-center shadow-sm">
          <p className="text-lg font-bold text-slate-900">
            {summary?.total_units ?? "-"}
          </p>
          <p className="text-[11px] text-slate-500">Unit</p>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-center shadow-sm">
          <p className="text-lg font-bold text-amber-700">
            {summary?.low_stock_count ?? "-"}
          </p>
          <p className="text-[11px] text-amber-700">Stok menipis</p>
        </div>
      </div>

      <div className="flex gap-2 rounded-xl bg-slate-200/60 p-1">
        {(
          [
            { key: "stok", label: "Stok Produk" },
            { key: "pergerakan", label: "Pergerakan" },
          ] as { key: Tab; label: string }[]
        ).map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setTab(item.key)}
            className={`min-h-[40px] flex-1 rounded-lg text-sm font-semibold transition ${
              tab === item.key
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-600"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "stok" ? (
        <>
          <div className="relative">
            <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Cari produk..."
              className="min-h-[48px] w-full rounded-xl border border-slate-300 bg-white pl-10 pr-3 text-base"
            />
          </div>

          {productsQuery.isLoading ? (
            <Spinner label="Memuat stok..." />
          ) : products.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
              Belum ada produk.
            </div>
          ) : (
            <ul className="space-y-2">
              {products.map((product) => (
                <li
                  key={product.id}
                  className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"
                >
                  <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-slate-100">
                    {product.thumb_url && (
                      <img
                        src={product.thumb_url}
                        alt={product.name}
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-slate-900">
                      {product.name}
                    </p>
                    <p className="text-xs text-slate-500">
                      {formatRupiah(product.price_sale)} · min {product.min_stock}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    <Badge tone={product.is_low_stock ? "red" : "slate"}>
                      {product.stock} {product.unit}
                    </Badge>
                    <Button
                      variant="secondary"
                      className="min-h-[38px] px-3 text-xs"
                      onClick={() => openAdjust(product)}
                    >
                      Adjust
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <>
          <div className="flex gap-2">
            <input
              type="date"
              value={movFrom}
              onChange={(e) => setMovFrom(e.target.value)}
              className="min-h-[40px] flex-1 rounded-xl border border-slate-300 px-2 text-sm"
            />
            <input
              type="date"
              value={movTo}
              onChange={(e) => setMovTo(e.target.value)}
              className="min-h-[40px] flex-1 rounded-xl border border-slate-300 px-2 text-sm"
            />
          </div>
          {movementsQuery.isLoading ? (
            <Spinner label="Memuat pergerakan..." />
          ) : movements.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
              Belum ada pergerakan stok.
            </div>
          ) : (
            <ul className="space-y-2">
              {movements.map((movement) => (
                <li
                  key={movement.id}
                  className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-slate-900">
                        {movement.product_name ?? `Produk #${movement.product_id}`}
                      </p>
                      <p className="text-xs text-slate-500">
                        {formatTanggal(movement.created_at)} ·{" "}
                        {movement.username ?? "-"}
                      </p>
                    </div>
                    <Badge
                      tone={
                        movement.qty > 0
                          ? "green"
                          : movement.movement_type === "void"
                            ? "amber"
                            : "red"
                      }
                    >
                      {movement.qty > 0 ? "+" : ""}
                      {movement.qty}
                    </Badge>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <Badge tone="slate">{movement.movement_type}</Badge>
                    {movement.reason && (
                      <span className="text-xs text-slate-600">{movement.reason}</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <BottomSheet
        open={Boolean(selected)}
        title="Sesuaikan Stok"
        subtitle={selected?.name}
        onClose={() => setSelected(null)}
        footer={
          <div className="space-y-2">
            {error && <Alert variant="error">{error}</Alert>}
            <Button
              full
              loading={adjustMutation.isPending}
              onClick={() => {
                setError(null);
                if (qty === "" || Number.isNaN(Number(qty))) {
                  setError("Jumlah harus diisi.");
                  return;
                }
                const qtyNum = Number(qty);
                if (reason.trim().length < 3) {
                  setError("Alasan wajib diisi minimal 3 karakter.");
                  return;
                }
                if (mode === "delta" && qtyNum === 0) {
                  setError("Jumlah perubahan tidak boleh nol.");
                  return;
                }
                adjustMutation.mutate();
              }}
            >
              Simpan Perubahan
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          {selected && (
            <div className="rounded-xl bg-slate-50 p-3 text-sm">
              <p className="text-slate-500">Stok saat ini</p>
              <p className="text-lg font-bold text-slate-900">
                {selected.stock} {selected.unit}
              </p>
            </div>
          )}

          <div>
            <span className="mb-1.5 block text-sm font-medium text-slate-700">
              Metode
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setMode("delta");
                  setError(null);
                }}
                className={`min-h-[44px] flex-1 rounded-xl text-sm font-semibold ${
                  mode === "delta"
                    ? "bg-brand-600 text-white"
                    : "bg-white text-slate-600 ring-1 ring-slate-200"
                }`}
              >
                Tambah / Kurang
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode("set");
                  setError(null);
                }}
                className={`min-h-[44px] flex-1 rounded-xl text-sm font-semibold ${
                  mode === "set"
                    ? "bg-brand-600 text-white"
                    : "bg-white text-slate-600 ring-1 ring-slate-200"
                }`}
              >
                Set Nilai
              </button>
            </div>
          </div>

          <Input
            label={mode === "delta" ? "Jumlah perubahan (+/-)" : "Stok baru"}
            value={qty}
            onChange={(event) => {
              setQty(event.target.value.replace(/[^0-9-]/g, ""));
              setError(null);
            }}
            inputMode="numeric"
            placeholder={mode === "delta" ? "-3" : ""}
          />

          <Input
            label="Alasan (wajib)"
            value={reason}
            onChange={(event) => {
              setReason(event.target.value);
              setError(null);
            }}
            placeholder="Contoh: Rusak / kedaluwarsa / hasil opname"
          />
        </div>
      </BottomSheet>
    </div>
  );
}
