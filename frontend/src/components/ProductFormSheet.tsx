import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiFetch, ApiError } from "../lib/api";
import type { Category, Product } from "../types";
import BottomSheet from "./BottomSheet";
import ImageInput from "./ImageInput";
import { Alert, Button, Input } from "./ui";

interface Props {
  open: boolean;
  product: Product | null;
  categories: Category[];
  onClose: () => void;
}

interface FormState {
  name: string;
  categoryId: string;
  priceSale: string;
  pricePurchase: string;
  stock: string;
  minStock: string;
  unit: string;
  description: string;
  imagePath: string;
  isActive: boolean;
}

const emptyForm: FormState = {
  name: "",
  categoryId: "",
  priceSale: "",
  pricePurchase: "",
  stock: "",
  minStock: "",
  unit: "pcs",
  description: "",
  imagePath: "",
  isActive: true,
};

function toNumber(value: string): number {
  const parsed = Number(value.replace(",", ".").trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function toMoney(value: string): string {
  const parsed = toNumber(value);
  return parsed.toFixed(2);
}

export default function ProductFormSheet({ open, product, categories, onClose }: Props) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (product) {
      setForm({
        name: product.name,
        categoryId: product.category ? String(product.category.id) : "",
        priceSale: String(Math.round(Number(product.price_sale))),
        pricePurchase: product.price_purchase != null ? String(Math.round(Number(product.price_purchase))) : "",
        stock: String(product.stock),
        minStock: product.min_stock != null ? String(product.min_stock) : "",
        unit: product.unit,
        description: product.description ?? "",
        imagePath: product.image_path ?? "",
        isActive: product.is_active,
      });
    } else {
      setForm(emptyForm);
    }
  }, [open, product]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name.trim(),
        category_id: form.categoryId ? Number(form.categoryId) : null,
        price_sale: toMoney(form.priceSale),
        price_purchase: toMoney(form.pricePurchase),
        min_stock: Math.max(0, Math.trunc(toNumber(form.minStock) || 0)),
        unit: form.unit.trim() || "pcs",
        description: form.description.trim() || null,
        image_path: form.imagePath || null,
        is_active: form.isActive,
      };

      if (product) {
        return apiFetch<{ product: Product }>(`/products/${product.id}`, {
          method: "PATCH",
          body: payload,
        });
      }
      return apiFetch<{ product: Product }>("/products", {
        method: "POST",
        body: { ...payload, stock: Math.max(0, Math.trunc(toNumber(form.stock) || 0)) },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["stock"] });
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      onClose();
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : "Gagal menyimpan produk.");
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: async () => {
      if (!product) return;
      await apiFetch<{ product: Product }>(`/products/${product.id}`, {
        method: "PATCH",
        body: { is_active: false },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["stock"] });
      onClose();
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : "Gagal menonaktifkan produk.");
    },
  });

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  return (
    <BottomSheet
      open={open}
      title={product ? "Ubah Produk" : "Produk Baru"}
      subtitle={product ? product.name : "Isi data produk, harga, dan stok awal"}
      onClose={onClose}
      footer={
        <div className="space-y-2">
          {error && <Alert variant="error">{error}</Alert>}
          <div className="flex gap-2">
            {product && (
              <Button
                type="button"
                variant="danger"
                onClick={() => {
                  setError(null);
                  deactivateMutation.mutate();
                }}
                loading={deactivateMutation.isPending}
              >
                Nonaktifkan
              </Button>
            )}
            <Button
              type="button"
              full
              loading={saveMutation.isPending}
              onClick={() => {
                setError(null);
                if (!form.name.trim()) {
                  setError("Nama produk wajib diisi.");
                  return;
                }
                if (form.priceSale.trim() === "" || Number.isNaN(toNumber(form.priceSale))) {
                  setError("Harga jual wajib diisi.");
                  return;
                }
                if (toNumber(form.priceSale) < 0) {
                  setError("Harga jual tidak boleh negatif.");
                  return;
                }
                if (form.pricePurchase.trim() !== "" && (Number.isNaN(toNumber(form.pricePurchase)) || toNumber(form.pricePurchase) < 0)) {
                  setError("Harga beli tidak valid.");
                  return;
                }
                if (form.minStock.trim() !== "" && (Number.isNaN(toNumber(form.minStock)) || toNumber(form.minStock) < 0)) {
                  setError("Stok minimum tidak valid.");
                  return;
                }
                if (!product) {
                  if (form.stock.trim() !== "" && (Number.isNaN(toNumber(form.stock)) || toNumber(form.stock) < 0)) {
                    setError("Stok awal tidak valid.");
                    return;
                  }
                }
                saveMutation.mutate();
              }}
            >
              {product ? "Simpan Perubahan" : "Simpan Produk"}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-3">
        {error && <Alert variant="error">{error}</Alert>}

        <ImageInput
          value={form.imagePath ? `/api/uploads/${form.imagePath}` : null}
          onUploaded={(image) => set("imagePath", image.image_path)}
        />

        <Input
          label="Nama produk"
          value={form.name}
          onChange={(e) => set("name", e.target.value)}
          placeholder="Indomie Goreng"
        />

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-slate-700">
            Kategori
          </span>
          <select
            value={form.categoryId}
            onChange={(e) => set("categoryId", e.target.value)}
            className="min-h-[48px] w-full rounded-xl border border-slate-300 bg-white px-3 text-base"
          >
            <option value="">Tanpa kategori</option>
            {categories
              .filter((c) => c.is_active || (product?.category && String(product.category.id) === String(c.id)))
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}{!c.is_active ? " (Nonaktif)" : ""}
                </option>
              ))}
          </select>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Harga jual"
            value={form.priceSale ? Number(form.priceSale).toLocaleString("id-ID") : ""}
            onChange={(e) => set("priceSale", e.target.value.replace(/[^0-9]/g, ""))}
            inputMode="numeric"
            placeholder="15.000"
            hint="Masukkan angka, tanpa Rp"
          />
          <Input
            label="Harga beli"
            value={form.pricePurchase ? Number(form.pricePurchase).toLocaleString("id-ID") : ""}
            onChange={(e) => set("pricePurchase", e.target.value.replace(/[^0-9]/g, ""))}
            inputMode="numeric"
            placeholder="10.000"
          />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Input
            label={product ? "Stok" : "Stok awal"}
            value={form.stock}
            onChange={(e) => set("stock", e.target.value.replace(/[^0-9-]/g, ""))}
            inputMode="numeric"
            placeholder={product ? "" : ""}
          />
          <Input
            label="Stok minimum"
            value={form.minStock}
            onChange={(e) => set("minStock", e.target.value.replace(/[^0-9]/g, ""))}
            inputMode="numeric"
            placeholder=""
          />
          <Input
            label="Satuan"
            value={form.unit}
            onChange={(e) => set("unit", e.target.value)}
            placeholder="pcs"
          />
        </div>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-slate-700">
            Catatan
          </span>
          <textarea
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
            rows={2}
            className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-base"
            placeholder="Keterangan produk (opsional)"
          />
        </label>

        {product && (
          <label className="flex min-h-[44px] items-center justify-between rounded-xl border border-slate-200 px-3">
            <span className="text-sm font-medium text-slate-700">Produk aktif</span>
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => set("isActive", e.target.checked)}
              className="h-5 w-5 accent-emerald-600"
            />
          </label>
        )}
      </div>
    </BottomSheet>
  );
}
