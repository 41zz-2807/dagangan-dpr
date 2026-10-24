import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { apiFetch } from "../lib/api";
import { useAuth } from "../lib/auth";
import { formatRupiah } from "../lib/format";
import type { ReportSummary } from "../types";
import { Alert, Card, Spinner } from "../components/ui";

function isoDate(offsetDays = 0): string {
  const date = new Date();
  date.setDate(date.getDate() - offsetDays);
  return date.toISOString().slice(0, 10);
}

export default function LaporanHarianPage() {
  const { isOwner } = useAuth();
  const [date, setDate] = useState(isoDate(0));

  const params = new URLSearchParams();
  params.set("from", date);
  params.set("to", date);
  const queryString = params.toString();

  const summaryQuery = useQuery({
    queryKey: ["reports", "summary", queryString],
    queryFn: () => apiFetch<ReportSummary>(`/reports/summary?${queryString}`),
  });

  const pengeluaranQuery = useQuery({
    queryKey: ["pengeluaran", "summary", queryString],
    queryFn: () => apiFetch<{ total: number; count: number }>(`/pengeluaran/summary?${queryString}`),
  });

  const loading = summaryQuery.isLoading || pengeluaranQuery.isLoading;
  const error = summaryQuery.error || pengeluaranQuery.error;

  const omset = Number(summaryQuery.data?.omset ?? 0);
  const pengeluaran = Number(pengeluaranQuery.data?.total ?? 0);
  const bersih = omset - pengeluaran;

  return (
    <div className="space-y-4 p-4">
      <h1 className="text-xl font-bold">Laporan Harian</h1>

      <Card className="flex items-center gap-3">
        <label className="text-sm font-medium">Tanggal</label>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="rounded border px-3 py-2"
        />
      </Card>

      {loading && <Spinner />}
      {error && <Alert variant="error">{String(error)}</Alert>}

      {!loading && !error && (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Card>
              <div className="text-sm text-gray-500">Omset</div>
              <div className="text-2xl font-bold text-green-600">{formatRupiah(omset)}</div>
              <div className="text-xs text-gray-400">{summaryQuery.data?.transaksi ?? 0} transaksi</div>
            </Card>
            <Card>
              <div className="text-sm text-gray-500">Pengeluaran</div>
              <div className="text-2xl font-bold text-red-600">{formatRupiah(pengeluaran)}</div>
              <div className="text-xs text-gray-400">{pengeluaranQuery.data?.count ?? 0} item</div>
            </Card>
            <Card>
              <div className="text-sm text-gray-500">Hasil Bersih</div>
              <div className={`text-2xl font-bold ${bersih >= 0 ? "text-blue-600" : "text-red-600"}`}>
                {formatRupiah(bersih)}
              </div>
            </Card>
          </div>

          <Card>
            <h2 className="mb-2 font-semibold">Rincian Omset per Metode</h2>
            <ul className="space-y-1 text-sm">
              {(summaryQuery.data?.by_method ?? []).map((m) => (
                <li key={m.method} className="flex justify-between">
                  <span>{m.method.toUpperCase()}</span>
                  <span>{formatRupiah(Number(m.amount))}</span>
                </li>
              ))}
            </ul>
          </Card>

          {isOwner && (
            <Card>
              <h2 className="mb-2 font-semibold">Rincian per Kasir</h2>
              <ul className="space-y-1 text-sm">
                {(summaryQuery.data?.by_cashier ?? []).map((c) => (
                  <li key={c.username} className="flex justify-between">
                    <span>{c.display_name}</span>
                    <span>{formatRupiah(Number(c.amount))}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
