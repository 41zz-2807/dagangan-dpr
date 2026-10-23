import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { apiFetch } from "../lib/api";
import { formatRupiah, formatTanggalPendek } from "../lib/format";
import type { Paginated, PaymentMethod, Sale, SaleStatus } from "../types";
import TransaksiDetailSheet from "../components/TransaksiDetailSheet";
import { Badge, Spinner } from "../components/ui";
import { IconSearch } from "../components/icons";

type RangeKey = "today" | "7d" | "30d" | "all";

const RANGES: { key: RangeKey; label: string; days: number }[] = [
  { key: "today", label: "Hari ini", days: 1 },
  { key: "7d", label: "7 hari", days: 7 },
  { key: "30d", label: "30 hari", days: 30 },
  { key: "all", label: "Semua", days: 0 },
];

function isoDate(offsetDays = 0): string {
  const date = new Date();
  date.setDate(date.getDate() - offsetDays);
  return date.toISOString().slice(0, 10);
}

export default function TransaksiPage() {
  const [range, setRange] = useState<RangeKey>("today");
  const [method, setMethod] = useState<"all" | PaymentMethod>("all");
  const [status, setStatus] = useState<"all" | SaleStatus>("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Sale | null>(null);

  const salesQuery = useQuery({
    queryKey: ["sales", range, method, status, search],
    queryFn: () => {
      const params = new URLSearchParams({ per_page: "50" });
      const days = RANGES.find((item) => item.key === range)?.days ?? 0;
      if (days > 0) {
        params.set("from", isoDate(days - 1));
        params.set("to", isoDate(0));
      }
      if (method !== "all") params.set("method", method);
      if (status !== "all") params.set("status", status);
      if (search.trim()) params.set("q", search.trim());
      return apiFetch<Paginated<Sale>>(`/sales?${params.toString()}`);
    },
  });

  const sales = salesQuery.data?.items ?? [];

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Transaksi</h1>
        <p className="text-sm text-slate-500">
          {salesQuery.data?.total ?? 0} transaksi
        </p>
      </div>

      <div className="relative">
        <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Cari nomor invoice atau nama produk..."
          className="min-h-[48px] w-full rounded-xl border border-slate-300 bg-white pl-10 pr-3 text-base"
        />
      </div>

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {RANGES.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setRange(item.key)}
            className={`min-h-[40px] shrink-0 rounded-full px-4 text-sm font-semibold ${
              range === item.key
                ? "bg-brand-600 text-white"
                : "bg-white text-slate-600 ring-1 ring-slate-200"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <select
          value={method}
          onChange={(event) =>
            setMethod(event.target.value as "all" | PaymentMethod)
          }
          className="min-h-[44px] flex-1 rounded-xl border border-slate-300 bg-white px-3 text-sm"
        >
          <option value="all">Semua metode</option>
          <option value="cash">Tunai</option>
          <option value="transfer">Transfer</option>
          <option value="qris">QRIS</option>
        </select>
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value as "all" | SaleStatus)}
          className="min-h-[44px] flex-1 rounded-xl border border-slate-300 bg-white px-3 text-sm"
        >
          <option value="all">Semua status</option>
          <option value="paid">Lunas</option>
          <option value="void">Dibatalkan</option>
        </select>
      </div>

      {salesQuery.isLoading ? (
        <Spinner label="Memuat transaksi..." />
      ) : sales.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          Belum ada transaksi pada rentang ini.
        </div>
      ) : (
        <ul className="space-y-2">
          {sales.map((sale) => (
            <li key={sale.id}>
              <button
                type="button"
                onClick={() => setSelected(sale)}
                className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 text-left shadow-sm active:scale-[0.99]"
              >
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-sm font-bold text-slate-900">
                    {sale.invoice_no}
                    {sale.status === "void" && <Badge tone="red">Void</Badge>}
                  </p>
                  <p className="text-xs text-slate-500">
                    {formatTanggalPendek(sale.created_at)} ·{" "}
                    {sale.cashier?.display_name ?? "-"}
                  </p>
                </div>
                <p className="shrink-0 text-sm font-bold text-slate-900">
                  {formatRupiah(sale.total)}
                </p>
              </button>
            </li>
          ))}
        </ul>
      )}

      {selected && (
        <TransaksiDetailSheet sale={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
