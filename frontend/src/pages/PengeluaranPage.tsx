import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiFetch } from "../lib/api";
import { formatRupiah, formatTanggal } from "../lib/format";
import { Alert, Badge, Button, Spinner } from "../components/ui";

type Pengeluaran = {
  id: number;
  tanggal: string;
  kategori_id: number | null;
  kategori_nama: string | null;
  nominal: number;
  keterangan: string | null;
  metode_bayar: string;
  created_by?: { username: string; display_name: string };
  created_at: string;
};

type Kategori = { id: number; nama: string };

export default function PengeluaranPage() {
  const qc = useQueryClient();
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [kategoriFilter, setKategoriFilter] = useState("");

  const kategoriQuery = useQuery({
    queryKey: ["pengeluaran", "kategori"],
    queryFn: () => apiFetch<{ items: Kategori[] }>("/pengeluaran/kategori"),
  });

  const listQuery = useQuery({
    queryKey: ["pengeluaran", "list", dateFrom, dateTo, kategoriFilter],
    queryFn: () => {
      const params = new URLSearchParams({ per_page: "100" });
      if (dateFrom) params.set("from", dateFrom);
      if (dateTo) params.set("to", dateTo);
      if (kategoriFilter) params.set("kategori_id", kategoriFilter);
      return apiFetch<{ items: Pengeluaran[]; total: number }>("/pengeluaran?" + params.toString());
    },
  });

  const summaryQuery = useQuery({
    queryKey: ["pengeluaran", "summary", dateFrom, dateTo],
    queryFn: () => {
      const params = new URLSearchParams();
      if (dateFrom) params.set("from", dateFrom);
      if (dateTo) params.set("to", dateTo);
      return apiFetch<{ total: number; count: number }>("/pengeluaran/summary?" + params.toString());
    },
  });

  const [tanggal, setTanggal] = useState("");
  const [kategoriId, setKategoriId] = useState("");
  const [nominal, setNominal] = useState("");
  const [keterangan, setKeterangan] = useState("");
  const [metodeBayar, setMetodeBayar] = useState("tunai");

  const createMutation = useMutation({
    mutationFn: () =>
      apiFetch("/pengeluaran", {
        method: "POST",
        body: {
          tanggal,
          kategori_id: kategoriId ? Number(kategoriId) : null,
          nominal: Number(nominal),
          keterangan,
          metode_bayar: metodeBayar,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pengeluaran"] });
      setTanggal("");
      setKategoriId("");
      setNominal("");
      setKeterangan("");
      setMetodeBayar("tunai");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/pengeluaran/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pengeluaran"] }),
  });

  const items = listQuery.data?.items ?? [];
  const total = summaryQuery.data?.total ?? 0;
  const count = summaryQuery.data?.count ?? 0;

  const handleExport = (format: "xlsx" | "pdf") => {
    const params = new URLSearchParams({ format });
    if (dateFrom) params.set("from", dateFrom);
    if (dateTo) params.set("to", dateTo);
    if (kategoriFilter) params.set("kategori_id", kategoriFilter);
    window.open(`/api/pengeluaran/export?${params.toString()}`, "_blank");
  };

  if (listQuery.isLoading) return <Spinner label="Memuat pengeluaran..." />;

  return (
    <div className="space-y-4">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Pengeluaran</h1>
          <p className="text-sm text-slate-500">Kelola dan pantau pengeluaran toko</p>
        </div>
        <div className="flex gap-1">
          <Button variant="secondary" className="min-h-[40px] px-2 text-xs" onClick={() => handleExport("xlsx")}>
            Excel
          </Button>
          <Button variant="secondary" className="min-h-[40px] px-2 text-xs" onClick={() => handleExport("pdf")}>
            PDF
          </Button>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
        <h2 className="font-bold">Tambah Pengeluaran</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Tanggal</label>
            <input
              type="date"
              value={tanggal}
              onChange={(e) => setTanggal(e.target.value)}
              className="min-h-[38px] w-full rounded-xl border border-slate-300 px-2 text-sm"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Kategori</label>
            <select value={kategoriId} onChange={(e) => setKategoriId(e.target.value)} className="min-h-[38px] w-full rounded-xl border border-slate-300 px-2 text-sm">
              <option value="">Pilih kategori</option>
              {(kategoriQuery.data?.items || []).map((k) => (
                <option key={k.id} value={String(k.id)}>{k.nama}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Metode Bayar</label>
            <select value={metodeBayar} onChange={(e) => setMetodeBayar(e.target.value)} className="min-h-[38px] w-full rounded-xl border border-slate-300 px-2 text-sm">
              <option value="tunai">Tunai</option>
              <option value="transfer">Transfer</option>
            </select>
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Nominal</label>
            <input type="number" value={nominal} onChange={(e) => setNominal(e.target.value)} className="min-h-[38px] w-full rounded-xl border border-slate-300 px-2 text-sm" required placeholder="0" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Keterangan</label>
            <input type="text" value={keterangan} onChange={(e) => setKeterangan(e.target.value)} className="min-h-[38px] w-full rounded-xl border border-slate-300 px-2 text-sm" placeholder="Opsional" />
          </div>
        </div>
        <div className="flex justify-end">
          <Button onClick={() => createMutation.mutate()} loading={createMutation.isPending} className="mt-1">Simpan Pengeluaran</Button>
        </div>
        {createMutation.isError && <Alert variant="error">Gagal menyimpan pengeluaran.</Alert>}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          <div className="bg-slate-50 p-3 rounded-xl">
            <div className="text-xs text-slate-500">Total Pengeluaran</div>
            <div className="text-lg font-bold text-slate-900">{formatRupiah(total)}</div>
          </div>
          <div className="bg-slate-50 p-3 rounded-xl">
            <div className="text-xs text-slate-500">Jumlah Transaksi</div>
            <div className="text-lg font-bold text-slate-900">{count}</div>
          </div>
          <div className="bg-slate-50 p-3 rounded-xl">
            <div className="text-xs text-slate-500">Rata-rata</div>
            <div className="text-lg font-bold text-slate-900">
              {count > 0 ? formatRupiah(total / count) : "Rp 0"}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Dari Tanggal</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="min-h-[38px] w-full rounded-xl border border-slate-300 px-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Sampai Tanggal</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="min-h-[38px] w-full rounded-xl border border-slate-300 px-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Kategori</label>
            <select value={kategoriFilter} onChange={(e) => setKategoriFilter(e.target.value)} className="min-h-[38px] w-full rounded-xl border border-slate-300 px-2 text-sm">
              <option value="">Semua</option>
              {(kategoriQuery.data?.items || []).map((k) => (
                <option key={k.id} value={String(k.id)}>{k.nama}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-bold">Daftar Pengeluaran</h2>
        </div>
        <div className="divide-y divide-slate-100 max-h-[600px] overflow-auto">
          {items.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">Belum ada pengeluaran.</div>
          ) : (
            items.map((p) => (
              <div key={p.id} className="p-3">
                <div className="flex justify-between items-start">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-slate-900 truncate">{p.keterangan || "(tanpa keterangan)"}</p>
                    <p className="text-xs text-slate-500">
                      {formatTanggal(p.tanggal)} · {p.kategori_nama || "-"} · {p.metode_bayar}
                    </p>
                    {p.created_by && (
                      <p className="text-xs text-slate-400">Dibuat oleh: {p.created_by.display_name}</p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-slate-900">{formatRupiah(p.nominal)}</p>
                    <Badge tone={p.metode_bayar === "tunai" ? "green" : "slate"}>{p.metode_bayar}</Badge>
                    <Button
                      variant="secondary"
                      onClick={() => deleteMutation.mutate(p.id)}
                      className="mt-1 min-h-[32px] px-2 text-xs"
                    >
                      Hapus
                    </Button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}