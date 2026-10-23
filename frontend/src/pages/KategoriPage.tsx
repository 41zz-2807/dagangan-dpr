import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiFetch, ApiError } from "../lib/api";
import type { Category } from "../types";
import BottomSheet from "../components/BottomSheet";
import { Alert, Badge, Button, Input, Spinner } from "../components/ui";
import { IconPlus, IconTrash } from "../components/icons";

type PengeluaranKategori = { id: number; nama: string };

export default function KategoriPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"produk" | "pengeluaran">("produk");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [pengeluaranNama, setPengeluaranNama] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pengeluaranError, setPengeluaranError] = useState<string | null>(null);

  const categoriesQuery = useQuery({
    queryKey: ["categories"],
    queryFn: () => apiFetch<{ items: Category[] }>("/categories"),
  });

  const pengeluaranKategoriQuery = useQuery({
    queryKey: ["pengeluaran", "kategori"],
    queryFn: () => apiFetch<{ items: PengeluaranKategori[] }>("/pengeluaran/kategori"),
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: name.trim(),
        description: description.trim() || null,
      };
      if (editing) {
        return apiFetch<{ category: Category }>(`/categories/${editing.id}`, {
          method: "PATCH",
          body: payload,
        });
      }
      return apiFetch<{ category: Category }>("/categories", {
        method: "POST",
        body: payload,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      setFormOpen(false);
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : "Gagal menyimpan kategori.");
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: async (id: number) =>
      apiFetch<{ category: Category }>(`/categories/${id}`, {
        method: "PATCH",
        body: { is_active: false },
      }),
    onSuccess: () => {
      setActionError(null);
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
    },
    onError: (err) => {
      setActionError(err instanceof ApiError ? err.message : "Gagal menonaktifkan.");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) =>
      apiFetch<{ deleted: boolean; id: number }>(`/categories/${id}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      setActionError(null);
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
    },
    onError: (err) => {
      setActionError(err instanceof ApiError ? err.message : "Gagal menghapus kategori.");
    },
  });

  const activateMutation = useMutation({
    mutationFn: async (id: number) =>
      apiFetch<{ category: Category }>(`/categories/${id}`, {
        method: "PATCH",
        body: { is_active: true },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : "Gagal mengaktifkan.");
    },
  });

  const createPengeluaranKategoriMutation = useMutation({
    mutationFn: async () =>
      apiFetch<{ kategori: PengeluaranKategori }>("/pengeluaran/kategori", {
        method: "POST",
        body: { nama: pengeluaranNama.trim() },
      }),
    onSuccess: () => {
      setPengeluaranNama("");
      setPengeluaranError(null);
      queryClient.invalidateQueries({ queryKey: ["pengeluaran", "kategori"] });
    },
    onError: (err) => {
      setPengeluaranError(err instanceof ApiError ? err.message : "Gagal menyimpan kategori.");
    },
  });

  const deletePengeluaranKategoriMutation = useMutation({
    mutationFn: async (id: number) =>
      apiFetch<{ message: string }>(`/pengeluaran/kategori/${id}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pengeluaran", "kategori"] });
    },
    onError: (err) => {
      setPengeluaranError(err instanceof ApiError ? err.message : "Gagal menghapus kategori.");
    },
  });

  const openCreate = () => {
    setEditing(null);
    setName("");
    setDescription("");
    setError(null);
    setFormOpen(true);
  };

  const openEdit = (category: Category) => {
    setEditing(category);
    setName(category.name);
    setDescription(category.description ?? "");
    setError(null);
    setFormOpen(true);
  };

  const categories = categoriesQuery.data?.items ?? [];
  const pengeluaranKategoris = pengeluaranKategoriQuery.data?.items ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Kategori</h1>
          <p className="text-sm text-slate-500">
            {tab === "produk" ? `${categories.length} kategori produk` : `${pengeluaranKategoris.length} kategori pengeluaran`}
          </p>
        </div>
        <Button onClick={openCreate}>
          <IconPlus className="h-5 w-5" />
          Tambah
        </Button>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setTab("produk")}
          className={`flex-1 rounded-xl px-3 py-2 text-sm font-semibold transition ${
            tab === "produk" ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          Kategori Produk
        </button>
        <button
          type="button"
          onClick={() => setTab("pengeluaran")}
          className={`flex-1 rounded-xl px-3 py-2 text-sm font-semibold transition ${
            tab === "pengeluaran" ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          Kategori Pengeluaran
        </button>
      </div>

      {actionError && <Alert variant="error">{actionError}</Alert>}
      {pengeluaranError && <Alert variant="error">{pengeluaranError}</Alert>}

      {tab === "produk" ? (
        <>
          {categoriesQuery.isLoading ? (
            <Spinner label="Memuat kategori..." />
          ) : categories.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
              <p className="text-sm font-semibold text-slate-700">Belum ada kategori produk</p>
              <p className="mt-1 text-xs text-slate-500">
                Kategori memudahkan pencarian produk di layar kasir.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {categories.map((category) => (
                <li
                  key={category.id}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm"
                >
                  <button
                    type="button"
                    onClick={() => openEdit(category)}
                    className="min-h-[44px] flex-1 text-left"
                  >
                    <p className="text-sm font-bold text-slate-900">{category.name}</p>
                    <p className="text-xs text-slate-500">
                      {category.active_product_count ?? 0} produk aktif
                      {category.description ? ` · ${category.description}` : ""}
                    </p>
                  </button>
                  <div className="flex items-center gap-2">
                    {!category.is_active && <Badge tone="amber">Nonaktif</Badge>}
                    {category.is_active ? (
                      <Button
                        variant="secondary"
                        className="min-h-[40px] px-3 text-xs"
                        loading={deactivateMutation.isPending}
                        onClick={() => {
                          setActionError(null);
                          deactivateMutation.mutate(category.id);
                        }}
                      >
                        Nonaktifkan
                      </Button>
                    ) : (
                      <Button
                        variant="secondary"
                        className="min-h-[40px] px-3 text-xs"
                        loading={activateMutation.isPending}
                        onClick={() => {
                          setActionError(null);
                          activateMutation.mutate(category.id);
                        }}
                      >
                        Aktifkan
                      </Button>
                    )}
                    <button
                      type="button"
                      title={`Hapus kategori ${category.name}`}
                      aria-label={`Hapus kategori ${category.name}`}
                      disabled={deleteMutation.isPending}
                      onClick={() => {
                        if (
                          !window.confirm(
                            `Hapus kategori "${category.name}" secara permanen?`,
                          )
                        )
                          return;
                        setActionError(null);
                        deleteMutation.mutate(category.id);
                      }}
                      className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                    >
                      <IconTrash className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <>
          {pengeluaranKategoriQuery.isLoading ? (
            <Spinner label="Memuat kategori pengeluaran..." />
          ) : pengeluaranKategoris.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
              <p className="text-sm font-semibold text-slate-700">Belum ada kategori pengeluaran</p>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {pengeluaranKategoris.map((k) => (
                <div
                  key={k.id}
                  className="flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 py-1 pl-3 pr-1"
                >
                  <span className="text-sm text-slate-700">{k.nama}</span>
                  <button
                    type="button"
                    title={`Hapus kategori ${k.nama}`}
                    aria-label={`Hapus kategori ${k.nama}`}
                    disabled={deletePengeluaranKategoriMutation.isPending}
                    onClick={() => {
                      if (!window.confirm(`Hapus kategori "${k.nama}"?`)) return;
                      setPengeluaranError(null);
                      deletePengeluaranKategoriMutation.mutate(k.id);
                    }}
                    className="flex h-7 w-7 items-center justify-center rounded-full text-slate-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                  >
                    <IconTrash className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
            <h2 className="font-bold">Tambah Kategori Pengeluaran</h2>
            <div className="flex gap-2">
              <input
                type="text"
                value={pengeluaranNama}
                onChange={(e) => setPengeluaranNama(e.target.value)}
                placeholder="Nama kategori"
                className="min-h-[38px] flex-1 rounded-xl border border-slate-300 px-2 text-sm"
              />
              <Button
                onClick={() => {
                  if (!pengeluaranNama.trim()) {
                    setPengeluaranError("Nama kategori wajib diisi.");
                    return;
                  }
                  setPengeluaranError(null);
                  createPengeluaranKategoriMutation.mutate();
                }}
                loading={createPengeluaranKategoriMutation.isPending}
              >
                Simpan
              </Button>
            </div>
            {pengeluaranError && <Alert variant="error">{pengeluaranError}</Alert>}
          </div>
        </>
      )}

      <BottomSheet
        open={formOpen && tab === "produk"}
        title={editing ? "Ubah Kategori" : "Kategori Baru"}
        onClose={() => setFormOpen(false)}
        footer={
          <div className="space-y-2">
            {error && <Alert variant="error">{error}</Alert>}
            <Button
              full
              loading={saveMutation.isPending}
              onClick={() => {
                setError(null);
                if (name.trim().length < 1) {
                  setError("Nama kategori wajib diisi.");
                  return;
                }
                saveMutation.mutate();
              }}
            >
              Simpan
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <Input
            label="Nama kategori"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setError(null);
            }}
            placeholder="Makanan"
          />
          <Input
            label="Keterangan"
            value={description}
            onChange={(event) => {
              setDescription(event.target.value);
              setError(null);
            }}
            placeholder="Opsional"
          />
        </div>
      </BottomSheet>
    </div>
  );
}
