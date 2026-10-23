import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { apiFetch } from "../lib/api";
import { useAuth } from "../lib/auth";
import { formatRupiah, formatTanggalPendek } from "../lib/format";
import type { DailyReport, ReportSummary, TopProduct } from "../types";
import { Alert, Badge, Card, Spinner } from "../components/ui";

type RangeKey = "today" | "7d" | "30d" | "custom";

const METHOD_LABEL: Record<string, string> = {
  cash: "Tunai",
  transfer: "Transfer",
  qris: "QRIS",
};

function isoDate(offsetDays = 0): string {
  const date = new Date();
  date.setDate(date.getDate() - offsetDays);
  return date.toISOString().slice(0, 10);
}

export default function OmsetPage() {
  const { isOwner } = useAuth();
  const [range, setRange] = useState<RangeKey>("today");
  const [from, setFrom] = useState(() => isoDate(0));
  const [to, setTo] = useState(() => isoDate(0));

  const params = new URLSearchParams();
  if (isOwner) {
    if (range === "today") {
      params.set("from", isoDate(0));
      params.set("to", isoDate(0));
    } else if (range === "7d") {
      params.set("from", isoDate(6));
      params.set("to", isoDate(0));
    } else if (range === "30d") {
      params.set("from", isoDate(29));
      params.set("to", isoDate(0));
    } else {
      const customFrom = from || isoDate(0);
      const customTo = to || isoDate(0);
      params.set("from", customFrom);
      params.set("to", customTo);
    }
  }
  const queryString = params.toString();

  const summaryQuery = useQuery({
    queryKey: ["reports", "summary", queryString],
    queryFn: () => apiFetch<ReportSummary>(`/reports/summary?${queryString}`),
  });

  const dailyQuery = useQuery({
    queryKey: ["reports", "daily", queryString],
    queryFn: () => apiFetch<DailyReport>(`/reports/daily?${queryString}`),
  });

  const topQuery = useQuery({
    queryKey: ["reports", "top", queryString],
    queryFn: () =>
      apiFetch<{ items: TopProduct[] }>(`/reports/top-products?${queryString}`),
  });

  const summary = summaryQuery.data;
  const daily = dailyQuery.data?.items ?? [];
  const top = topQuery.data?.items ?? [];
  const maxAmount = Math.max(...daily.map((item) => Number(item.amount)), 1);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Omset</h1>
        <p className="text-sm text-slate-500">
          {isOwner
            ? "Laporan penjualan toko"
            : "Penjualan Anda hari ini"}
        </p>
      </div>

      {isOwner && (
        <div className="space-y-2">
          <div className="flex gap-2">
            {(
              [
                { key: "today", label: "Hari ini" },
                { key: "7d", label: "7 hari" },
                { key: "30d", label: "30 hari" },
                { key: "custom", label: "Rentang" },
              ] as { key: RangeKey; label: string }[]
            ).map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setRange(item.key)}
                className={`min-h-[40px] flex-1 rounded-xl text-xs font-semibold ${
                  range === item.key
                    ? "bg-brand-600 text-white"
                    : "bg-white text-slate-600 ring-1 ring-slate-200"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
          {range === "custom" && (
            <div className="flex gap-2">
              <input
                type="date"
                value={from}
                max={to}
                onChange={(event) => setFrom(event.target.value)}
                className="min-h-[44px] flex-1 rounded-xl border border-slate-300 bg-white px-3 text-sm"
              />
              <input
                type="date"
                value={to}
                min={from}
                onChange={(event) => setTo(event.target.value)}
                className="min-h-[44px] flex-1 rounded-xl border border-slate-300 bg-white px-3 text-sm"
              />
            </div>
          )}
        </div>
      )}

      {summaryQuery.isError ? (
        <Alert variant="error">Gagal memuat laporan omset.</Alert>
      ) : summaryQuery.isLoading ? (
        <Spinner label="Menghitung omset..." />
      ) : (
        <>
          <div className="rounded-2xl bg-brand-600 p-5 text-white shadow-sm">
            <p className="text-sm text-emerald-50">Total omset</p>
            <p className="mt-1 text-3xl font-bold">
              {formatRupiah(summary?.omset ?? 0)}
            </p>
            <p className="mt-1 text-xs text-emerald-50">
              {summary?.range.from} s/d {summary?.range.to} ·{" "}
              {summary?.transaksi ?? 0} transaksi
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Card>
              <p className="text-xs text-slate-500">Produk terjual</p>
              <p className="text-lg font-bold text-slate-900">
                {summary?.produk_terjual ?? 0}
              </p>
            </Card>
            <Card>
              <p className="text-xs text-slate-500">Rata-rata / transaksi</p>
              <p className="text-lg font-bold text-slate-900">
                {formatRupiah(summary?.rata_rata ?? 0)}
              </p>
            </Card>
            <Card>
              <p className="text-xs text-slate-500">Diskon</p>
              <p className="text-lg font-bold text-slate-900">
                {formatRupiah(summary?.diskon ?? 0)}
              </p>
            </Card>
            <Card>
              <p className="text-xs text-slate-500">Stok menipis</p>
              <p className="text-lg font-bold text-amber-600">
                {summary?.low_stock_count ?? 0}
              </p>
            </Card>
          </div>
        </>
      )}

      {daily.length > 0 && (
        <Card>
          <p className="mb-3 text-sm font-bold text-slate-800">Omset harian</p>
          <ul className="space-y-2">
            {daily.map((item) => (
              <li key={item.date} className="flex items-center gap-3">
                <span className="w-20 shrink-0 text-xs text-slate-500">
                  {formatTanggalPendek(item.date)}
                </span>
                <span className="h-6 flex-1 overflow-hidden rounded bg-slate-100">
                  <span
                    className="block h-full rounded bg-brand-500"
                    style={{
                      width: `${Math.max(4, (Number(item.amount) / maxAmount) * 100)}%`,
                    }}
                  />
                </span>
                <span className="w-24 shrink-0 text-right text-xs font-bold text-slate-900">
                  {formatRupiah(item.amount)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {summary && summary.by_method.length > 0 && (
        <Card>
          <p className="mb-3 text-sm font-bold text-slate-800">Metode pembayaran</p>
          <ul className="space-y-2">
            {summary.by_method.map((item) => (
              <li
                key={item.method}
                className="flex items-center justify-between text-sm"
              >
                <span className="flex items-center gap-2">
                  <Badge tone="slate">
                    {METHOD_LABEL[item.method] ?? item.method}
                  </Badge>
                  <span className="text-xs text-slate-500">{item.count}×</span>
                </span>
                <span className="font-bold text-slate-900">
                  {formatRupiah(item.amount)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {isOwner && summary && summary.by_cashier.length > 0 && (
        <Card>
          <p className="mb-3 text-sm font-bold text-slate-800">Per kasir</p>
          <ul className="space-y-2">
            {summary.by_cashier.map((item) => (
              <li
                key={item.username}
                className="flex items-center justify-between text-sm"
              >
                <span>
                  {item.display_name}
                  <span className="ml-2 text-xs text-slate-500">
                    {item.count}×
                  </span>
                </span>
                <span className="font-bold text-slate-900">
                  {formatRupiah(item.amount)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {top.length > 0 && (
        <Card>
          <p className="mb-3 text-sm font-bold text-slate-800">Produk terlaris</p>
          <ul className="space-y-2">
            {top.map((item, index) => (
              <li
                key={`${item.product_id ?? item.product_name}-${index}`}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">
                    {index + 1}
                  </span>
                  <span className="truncate">{item.product_name}</span>
                </span>
                <span className="shrink-0 text-xs text-slate-500">
                  {item.qty} · {formatRupiah(item.amount)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
