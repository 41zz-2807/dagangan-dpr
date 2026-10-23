import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { apiFetch } from "../lib/api";
import { formatTanggal } from "../lib/format";
import type { AuditEntry, Paginated, User } from "../types";
import { Alert, Badge, Button, Spinner } from "../components/ui";
import { IconSearch } from "../components/icons";

const ACTION_LABEL: Record<string, string> = {
  "auth.login": "Login",
  "auth.login_failed": "Login gagal",
  "auth.login_blocked": "Login diblokir",
  "auth.logout": "Logout",
  "auth.change_password": "Ganti password",
  "user.create": "Buat user",
  "user.update": "Ubah user",
  "user.deactivate": "Nonaktifkan user",
  "category.create": "Buat kategori",
  "category.update": "Ubah kategori",
  "category.deactivate": "Nonaktifkan kategori",
  "product.create": "Buat produk",
  "product.update": "Ubah produk",
  "product.deactivate": "Nonaktifkan produk",
  "product.price_change": "Ubah harga",
  "product.image_upload": "Upload gambar",
  "upload.product_image": "Upload file",
  "stock.adjust": "Adjust stok",
  "sale.create": "Transaksi baru",
  "sale.void": "Batalkan transaksi",
};

export default function AuditPage() {
  const [search, setSearch] = useState("");
  const [userId, setUserId] = useState<string>("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);

  const usersQuery = useQuery({
    queryKey: ["users"],
    queryFn: () => apiFetch<{ items: User[] }>("/users"),
  });

  const auditQuery = useQuery({
    queryKey: ["audit", search, userId, from, to, page],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), per_page: "50" });
      if (search.trim()) params.set("action", search.trim());
      if (userId) params.set("user_id", userId);
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      return apiFetch<Paginated<AuditEntry>>(`/audit?${params.toString()}`);
    },
  });

  const entries = auditQuery.data?.items ?? [];
  const total = auditQuery.data?.total ?? 0;
  const pages = auditQuery.data?.pages ?? 1;

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Audit Log</h1>
        <p className="text-sm text-slate-500">{total} aktivitas tercatat</p>
      </div>

      <div className="relative">
        <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
        <input
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
          placeholder="Filter aksi, mis. sale.create..."
          className="min-h-[48px] w-full rounded-xl border border-slate-300 bg-white pl-10 pr-3 text-base"
        />
      </div>

      <div className="flex gap-2">
        <select
          value={userId}
          onChange={(event) => {
            setUserId(event.target.value);
            setPage(1);
          }}
          className="min-h-[44px] w-0 min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-2 text-sm"
        >
          <option value="">Semua user</option>
          {(usersQuery.data?.items ?? []).map((user) => (
            <option key={user.id} value={user.id}>
              {user.display_name}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={from}
          onChange={(event) => {
            setFrom(event.target.value);
            setPage(1);
          }}
          aria-label="Dari tanggal"
          className="min-h-[44px] w-0 min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-1.5 text-xs"
        />
        <input
          type="date"
          value={to}
          onChange={(event) => {
            setTo(event.target.value);
            setPage(1);
          }}
          aria-label="Sampai tanggal"
          className="min-h-[44px] w-0 min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-1.5 text-xs"
        />
      </div>

      {auditQuery.isLoading ? (
        <Spinner label="Memuat audit log..." />
      ) : auditQuery.isError ? (
        <Alert variant="error">Gagal memuat audit log.</Alert>
      ) : entries.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          Tidak ada aktivitas yang cocok.
        </div>
      ) : (
        <ul className="space-y-2">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-900">
                    {ACTION_LABEL[entry.action] ?? entry.action}
                  </p>
                  <p className="text-xs text-slate-500">
                    {entry.username ?? "-"} · {formatTanggal(entry.created_at)}
                  </p>
                </div>
                <Badge tone="slate">{entry.entity ?? "-"}</Badge>
              </div>
              {entry.entity_id && (
                <p className="mt-1 font-mono text-[11px] text-slate-400">
                  id: {entry.entity_id}
                  {entry.ip ? ` · ${entry.ip}` : ""}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      {pages > 1 && (
        <div className="flex items-center justify-between gap-2 pt-1">
          <Button
            variant="secondary"
            className="min-h-[40px] px-3 text-xs"
            disabled={page <= 1}
            onClick={() => setPage((value) => Math.max(1, value - 1))}
          >
            Sebelumnya
          </Button>
          <span className="text-xs text-slate-500">
            Halaman {page} / {pages}
          </span>
          <Button
            variant="secondary"
            className="min-h-[40px] px-3 text-xs"
            disabled={page >= pages}
            onClick={() => setPage((value) => Math.min(pages, value + 1))}
          >
            Berikutnya
          </Button>
        </div>
      )}
    </div>
  );
}
