import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiFetch } from "../lib/api";
import { formatRupiah, formatTanggal } from "../lib/format";
import { Button, Input, Spinner, Alert } from "../components/ui";

type Shift = {
  id: number;
  cashier_id: number;
  cashier?: { id: number; username: string; display_name: string };
  opened_at: string;
  closed_at: string | null;
  opening_balance: string;
  closing_balance: string | null;
  cash_sales: string;
  expected_cash: string | null;
  cash_in_drawer: string | null;
  difference: string | null;
  notes: string | null;
  status: string;
};

export default function ShiftPage() {
  const qc = useQueryClient();
  const [openBalance, setOpenBalance] = useState("0");
  const [cashDrawer, setCashDrawer] = useState("");
  const [notes, setNotes] = useState("");

  const currentQuery = useQuery({
    queryKey: ["shift", "current"],
    queryFn: () => apiFetch<{ shift: Shift | null }>("/shifts/current"),
  });

  const historyQuery = useQuery({
    queryKey: ["shift", "history"],
    queryFn: () => apiFetch<{ items: Shift[] }>("/shifts/history"),
  });

  const openMutation = useMutation({
    mutationFn: () =>
      apiFetch("/shifts/open", {
        method: "POST",
        body: { opening_balance: openBalance },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shift"] });
    },
  });

  const closeMutation = useMutation({
    mutationFn: () =>
      apiFetch("/shifts/close", {
        method: "POST",
        body: { cash_in_drawer: cashDrawer, notes },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shift"] });
      setCashDrawer("");
      setNotes("");
    },
  });

  const shift = currentQuery.data?.shift;

  if (currentQuery.isLoading) return <Spinner label="Memuat shift..." />;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Shift Kasir</h1>
        <p className="text-sm text-slate-500">Buka/tutup shift dan lihat riwayat</p>
      </div>

      {!shift ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
          <h2 className="font-bold">Buka Shift</h2>
          <Input label="Saldo Awal (Tunai)" value={openBalance} onChange={(e) => setOpenBalance(e.target.value)} inputMode="numeric" />
          <Button onClick={() => openMutation.mutate()} loading={openMutation.isPending}>Buka Shift</Button>
          {openMutation.isError && <Alert variant="error">Gagal membuka shift</Alert>}
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
          <h2 className="font-bold">Shift Aktif</h2>
          <div className="text-sm text-slate-600 space-y-1">
            <p>Kasir: {shift.cashier?.display_name || shift.cashier?.username}</p>
            <p>Dibuka: {formatTanggal(shift.opened_at)}</p>
            <p>Saldo Awal: {formatRupiah(shift.opening_balance)}</p>
          </div>
          <h3 className="font-semibold">Tutup Shift</h3>
          <Input label="Uang Fisik di Laci" value={cashDrawer} onChange={(e) => setCashDrawer(e.target.value)} inputMode="numeric" placeholder="Masukkan jumlah uang tunai" />
          <Input label="Catatan (opsional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
          <Button onClick={() => closeMutation.mutate()} loading={closeMutation.isPending}>Tutup Shift</Button>
          {closeMutation.isError && <Alert variant="error">Gagal menutup shift</Alert>}
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="p-4 border-b border-slate-100">
          <h2 className="font-bold">Riwayat Shift</h2>
        </div>
        <div className="divide-y divide-slate-100">
          {(historyQuery.data?.items || []).map((s) => (
            <div key={s.id} className="p-4 space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="font-semibold">{s.cashier?.display_name || s.cashier?.username}</span>
                <span className={s.status === "open" ? "text-green-600" : "text-slate-500"}>{s.status === "open" ? "AKTIF" : "DITUTUP"}</span>
              </div>
              <p className="text-slate-500">Buka: {formatTanggal(s.opened_at)} {s.closed_at && `| Tutup: ${formatTanggal(s.closed_at)}`}</p>
              <p>Penjualan Tunai (netto): {formatRupiah(s.cash_sales)}{s.expected_cash !== null && ` | Seharusnya: ${formatRupiah(s.expected_cash)}`}</p>
              <p>Saldo Awal: {formatRupiah(s.opening_balance)} | Uang Fisik: {s.cash_in_drawer ? formatRupiah(s.cash_in_drawer) : "-"}</p>
              {s.difference !== null && <p>Selisih: <span className={Number(s.difference) === 0 ? "text-green-600" : "text-red-600"}>{formatRupiah(s.difference)}</span></p>}
              {s.notes && <p className="text-slate-500">Catatan: {s.notes}</p>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
