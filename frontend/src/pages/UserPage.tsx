import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiFetch, ApiError } from "../lib/api";
import { formatTanggalPendek } from "../lib/format";
import type { User } from "../types";
import BottomSheet from "../components/BottomSheet";
import { Alert, Badge, Button, Input, Spinner } from "../components/ui";
import { IconPlus } from "../components/icons";

interface FormState {
  username: string;
  password: string;
  fullName: string;
  role: "owner" | "kasir";
  isActive: boolean;
}

const emptyForm: FormState = {
  username: "",
  password: "",
  fullName: "",
  role: "kasir",
  isActive: true,
};

export default function UserPage() {
  const queryClient = useQueryClient();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [error, setError] = useState<string | null>(null);

  const usersQuery = useQuery({
    queryKey: ["users"],
    queryFn: () => apiFetch<{ items: User[] }>("/users"),
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (editing) {
        const body: Record<string, unknown> = {
          full_name: form.fullName.trim(),
          role: form.role,
          is_active: form.isActive,
        };
        if (form.password.trim()) body.password = form.password.trim();
        return apiFetch<{ user: User }>(`/users/${editing.id}`, {
          method: "PATCH",
          body,
        });
      }
      return apiFetch<{ user: User }>("/users", {
        method: "POST",
        body: {
          username: form.username.trim(),
          password: form.password,
          full_name: form.fullName.trim(),
          role: form.role,
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setSheetOpen(false);
      setError(null);
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : "Gagal menyimpan user.");
    },
  });

  const users = usersQuery.data?.items ?? [];

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setError(null);
    setSheetOpen(true);
  };

  const openEdit = (user: User) => {
    setEditing(user);
    setForm({
      username: user.username,
      password: "",
      fullName: user.full_name ?? "",
      role: user.role,
      isActive: user.is_active,
    });
    setError(null);
    setSheetOpen(true);
  };

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">User & Kasir</h1>
          <p className="text-sm text-slate-500">{users.length} akun</p>
        </div>
        <Button onClick={openCreate}>
          <IconPlus className="h-5 w-5" />
          Tambah
        </Button>
      </div>

      {usersQuery.isLoading ? (
        <Spinner label="Memuat user..." />
      ) : (
        <ul className="space-y-2">
          {users.map((user) => (
            <li key={user.id}>
              <button
                type="button"
                onClick={() => openEdit(user)}
                className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 text-left shadow-sm active:scale-[0.99]"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm font-bold text-brand-700">
                  {(user.display_name || user.username).slice(0, 1).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-slate-900">
                    {user.display_name || user.username}
                  </span>
                  <span className="block text-xs text-slate-500">
                    @{user.username} ·{" "}
                    {user.last_login_at
                      ? `login ${formatTanggalPendek(user.last_login_at)}`
                      : "belum pernah login"}
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <Badge tone={user.role === "owner" ? "green" : "slate"}>
                    {user.role}
                  </Badge>
                  {!user.is_active && <Badge tone="red">Nonaktif</Badge>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <BottomSheet
        open={sheetOpen}
        title={editing ? `Ubah ${editing.username}` : "User Baru"}
        subtitle={editing ? undefined : "Buat akun kasir baru"}
        onClose={() => setSheetOpen(false)}
        footer={
          <Button
            full
            loading={saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
          >
            Simpan
          </Button>
        }
      >
        <div className="space-y-3">
          {error && <Alert variant="error">{error}</Alert>}

          <Input
            label="Username"
            value={form.username}
            onChange={(event) => set("username", event.target.value)}
            placeholder="kasir3"
            autoCapitalize="none"
            disabled={Boolean(editing)}
          />

          <Input
            label={editing ? "Password baru (kosongkan bila tidak diubah)" : "Password"}
            value={form.password}
            onChange={(event) => set("password", event.target.value)}
            type="password"
            placeholder="Minimal 6 karakter"
            autoComplete="new-password"
          />

          <Input
            label="Nama lengkap"
            value={form.fullName}
            onChange={(event) => set("fullName", event.target.value)}
            placeholder="Nama yang tampil di aplikasi"
          />

          <div>
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Role</span>
            <div className="flex gap-2">
              {(["kasir", "owner"] as const).map((role) => (
                <button
                  key={role}
                  type="button"
                  onClick={() => set("role", role)}
                  className={`min-h-[44px] flex-1 rounded-xl text-sm font-semibold capitalize ${
                    form.role === role
                      ? "bg-brand-600 text-white"
                      : "bg-white text-slate-600 ring-1 ring-slate-200"
                  }`}
                >
                  {role}
                </button>
              ))}
            </div>
          </div>

          {editing && (
            <label className="flex min-h-[44px] items-center justify-between rounded-xl border border-slate-200 px-3">
              <span className="text-sm font-medium text-slate-700">Akun aktif</span>
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(event) => set("isActive", event.target.checked)}
                className="h-5 w-5 accent-emerald-600"
              />
            </label>
          )}
        </div>
      </BottomSheet>
    </div>
  );
}
