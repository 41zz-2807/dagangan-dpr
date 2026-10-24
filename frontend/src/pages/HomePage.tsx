import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { apiFetch } from "../lib/api";
import { useAuth } from "../lib/auth";
import { formatRupiah, formatTanggal } from "../lib/format";
import type { ReportSummary } from "../types";
import { Card } from "../components/ui";

interface HealthPayload {
  status: string;
  database: string;
  version: string;
  time: string;
}

export default function HomePage() {
  const { user, isOwner } = useAuth();

  const health = useQuery({
    queryKey: ["health"],
    queryFn: () => apiFetch<HealthPayload>("/health"),
    refetchInterval: 60_000,
  });

  const summaryQuery = useQuery({
    queryKey: ["reports", "summary", "home"],
    queryFn: () => apiFetch<ReportSummary>("/reports/summary"),
  });

  const shortcuts = [
    { to: "/kasir", label: "Buka Kasir", desc: "Mulai transaksi baru" },
    { to: "/transaksi", label: "Riwayat", desc: "Cek transaksi" },
    { to: "/stok", label: "Stok", desc: "Cek & adjust stok" },
    { to: "/omset", label: "Omset", desc: "Laporan penjualan" },
  ];

  const summary = summaryQuery.data;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-900">
          Halo, {user?.display_name ?? "Pengguna"}
        </h1>
        <p className="text-sm text-slate-500">
          {formatTanggal(new Date().toISOString())} · {isOwner ? "Owner" : "Kasir"}
        </p>
      </div>

      <Link
        to="/omset"
        className="uiverse-card block shadow-sm transition active:scale-[0.99]"
      >
        <div className="uiverse-card-inner text-center">
          <p className="text-sm text-emerald-50">
            {isOwner ? "Omset hari ini" : "Omset Anda hari ini"}
          </p>
          <p className="mt-1 text-3xl font-bold">
            {summaryQuery.isLoading ? "..." : formatRupiah(summary?.omset ?? 0)}
          </p>
          <p className="mt-1 text-xs text-emerald-50">
            {summary?.transaksi ?? 0} transaksi ·{" "}
            {summary?.produk_terjual ?? 0} produk terjual
          </p>
        </div>
      </Link>

      <div className="grid grid-cols-2 gap-3">
        {shortcuts.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className="uiverse-card block transition active:scale-[0.99]"
          >
            <div className="uiverse-card-inner text-center">
              <span className="text-sm font-bold text-white">{item.label}</span>
              <span className="mt-0.5 block text-xs text-slate-300">{item.desc}</span>
            </div>
          </Link>
        ))}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-2 text-sm font-bold text-slate-900">Download Aplikasi Android</h2>
        <p className="mb-3 text-xs text-slate-500">
          Versi 1.0.0 · Build 24 Okt 2026
        </p>
        <a
          href="/apk/warung-dpr.apk"
          download
          className="inline-flex items-center rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition active:scale-[0.99]"
        >
          Download APK
        </a>
      </div>

      <Card>
        <p className="mb-2 text-sm font-bold text-slate-800">Status aplikasi</p>
        {health.isLoading ? (
          <p className="text-sm text-slate-500">Memeriksa...</p>
        ) : health.isError ? (
          <p className="text-sm font-medium text-rose-600">
            Tidak dapat menghubungi server.
          </p>
        ) : (
          <dl className="space-y-1.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-500">Server</dt>
              <dd className="font-semibold text-emerald-600">
                {health.data?.status === "ok" ? "Normal" : health.data?.status}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Database</dt>
              <dd className="font-semibold text-slate-700">{health.data?.database}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Versi</dt>
              <dd className="font-semibold text-slate-700">{health.data?.version}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Waktu server</dt>
              <dd className="font-semibold text-slate-700">
                {formatTanggal(health.data?.time)}
              </dd>
            </div>
          </dl>
        )}
      </Card>
    </div>
  );
}
