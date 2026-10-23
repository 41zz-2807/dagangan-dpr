import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiFetch, ApiError } from "../lib/api";
import { formatRupiah } from "../lib/format";
import type { Category, Paginated, Product } from "../types";
import ProductFormSheet from "../components/ProductFormSheet";
import { Alert, Badge, Button, Spinner } from "../components/ui";
import { IconPlus, IconSearch, IconTrash } from "../components/icons";

export default function ProdukPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [error, setError] = useState<string | null>(null);

  const categoriesQuery = useQuery({
    queryKey: ["categories"],
    queryFn: () => apiFetch<{ items: Category[] }>("/categories"),
  });

  const productsQuery = useQuery({
    queryKey: ["products", search, categoryId],
    queryFn: () => {
      const params = new URLSearchParams({ per_page: "100" });
      if (search.trim()) params.set("q", search.trim());
      if (categoryId) params.set("category_id", String(categoryId));
      return apiFetch<Paginated<Product>>(`/products?${params.toString()}`);
    },
  });

  const categories = categoriesQuery.data?.items ?? [];
  const products = productsQuery.data?.items ?? [];

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      apiFetch<{ deleted: boolean; id: number }>(`/products/${id}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["stock"] });
      queryClient.invalidateQueries({ queryKey: ["categories"] });
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : "Gagal menghapus produk.");
    },
  });

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (product: Product) => {
    setEditing(product);
    setFormOpen(true);
  };

  return (
    <div className="space-y-4 pb-20">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Produk</h1>
          <p className="text-sm text-slate-500">
            {productsQuery.data?.total ?? 0} produk
          </p>
        </div>
        <Button onClick={openCreate}>
          <IconPlus className="h-5 w-5" />
          Tambah
        </Button>
      </div>

      {error && <Alert variant="error">{error}</Alert>}

      <div className="relative">
        <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Cari nama produk..."
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
          {categories
            .filter((category) => category.is_active)
            .map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
        </select>
      </div>

      {productsQuery.isLoading ? (
        <Spinner label="Memuat produk..." />
      ) : products.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <p className="text-sm font-semibold text-slate-700">Belum ada produk</p>
          <p className="mt-1 text-xs text-slate-500">
            Tekan tombol Tambah untuk membuat produk pertama.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
          {products.map((product) => (
            <div
              key={product.id}
              className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
            >
              <button
                type="button"
                onClick={() => openEdit(product)}
                className="w-full text-left transition active:scale-[0.99]"
              >
                <div className="aspect-square w-full overflow-hidden bg-slate-100">
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
                </div>
                <div className="p-3">
                  <p className="line-clamp-2 text-sm font-semibold text-slate-900">
                    {product.name}
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-400">
                    {product.category?.name ?? "Tanpa kategori"}
                  </p>
                  <p className="mt-1.5 text-sm font-bold text-brand-700">
                    {formatRupiah(product.price_sale)}
                  </p>
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <Badge tone={product.is_low_stock ? "red" : "slate"}>
                      Stok {product.stock}
                    </Badge>
                    {!product.is_active && <Badge tone="amber">Nonaktif</Badge>}
                  </div>
                </div>
              </button>
              <button
                type="button"
                title={`Hapus produk ${product.name}`}
                aria-label={`Hapus produk ${product.name}`}
                disabled={deleteMutation.isPending}
                onClick={() => {
                  if (
                    !window.confirm(
                      `Hapus produk "${product.name}" secara permanen? Riwayat transaksi tetap tersimpan.`,
                    )
                  )
                    return;
                  setError(null);
                  deleteMutation.mutate(product.id);
                }}
                className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-lg bg-white/90 text-slate-500 shadow-sm backdrop-blur transition hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
              >
                <IconTrash className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      <ProductFormSheet
        open={formOpen}
        product={editing}
        categories={categories}
        onClose={() => setFormOpen(false)}
      />
    </div>
  );
}
