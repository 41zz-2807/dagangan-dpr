import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiFetch, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { formatRupiah, formatTanggal } from "../lib/format";
import type { PaymentMethod, Sale } from "../types";
import BottomSheet from "./BottomSheet";
import { Alert, Badge, Button, Input, Spinner } from "./ui";

interface Props {
  sale: Sale | null;
  onClose: () => void;
}

const METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: "Tunai",
  transfer: "Transfer",
  qris: "QRIS",
};

export default function TransaksiDetailSheet({ sale, onClose }: Props) {
  const queryClient = useQueryClient();
  const { isOwner } = useAuth();
  const [voidReason, setVoidReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [shareNote, setShareNote] = useState<string | null>(null);

  const detailQuery = useQuery({
    queryKey: ["sales", "detail", sale?.id],
    queryFn: () => apiFetch<{ sale: Sale }>(`/sales/${sale?.id}`),
    enabled: Boolean(sale?.id),
  });

  const voidMutation = useMutation({
    mutationFn: async () => {
      if (!sale) return;
      return apiFetch<{ sale: Sale }>(`/sales/${sale.id}/void`, {
        method: "POST",
        body: { reason: voidReason.trim() },
      });
    },
    onSuccess: () => {
      setVoidReason("");
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      queryClient.invalidateQueries({ queryKey: ["stock"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : "Gagal membatalkan transaksi.");
    },
  });

  const data = detailQuery.data?.sale ?? sale;
  if (!data) return null;

  const receiptUrl = `${window.location.origin}/r/${data.receipt_token}`;
  const payment = data.payments?.[0];

  const handlePrint = () => {
    window.open(`/api/sales/${data.id}/receipt.pdf`, "_blank", "noopener");
  };

  const handleShare = async () => {
    const text = `Struk ${data.invoice_no} — ${formatRupiah(data.total)}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: `Struk ${data.invoice_no}`, text, url: receiptUrl });
        return;
      } catch {
        /* pengguna membatalkan */
      }
    }
    try {
      await navigator.clipboard.writeText(receiptUrl);
      setShareNote("Link struk disalin ke clipboard.");
    } catch {
      window.open(
        `https://wa.me/?text=${encodeURIComponent(`${text} ${receiptUrl}`)}`,
        "_blank",
        "noopener",
      );
    }
  };

  const handleVoid = async () => {
    if (voidReason.trim().length < 3) {
      setError("Alasan pembatalan minimal 3 karakter.");
      return;
    }
    setError(null);
    try {
      await voidMutation.mutateAsync();
    } catch {
      /* pesan error tampil dari onError */
    }
  };

  return (
    <BottomSheet
      open
      title={data.invoice_no}
      subtitle={formatTanggal(data.created_at)}
      onClose={onClose}
      footer={
        <div className="space-y-2">
          <div className="flex gap-2">
            <Button variant="secondary" full onClick={handlePrint}>
              Cetak PDF
            </Button>
            <Button variant="secondary" full onClick={() => void handleShare()}>
              Bagikan
            </Button>
          </div>
          {isOwner && data.status === "paid" && (
            <Button
              variant="danger"
              full
              loading={voidMutation.isPending}
              onClick={() => void handleVoid()}
            >
              Batalkan Transaksi
            </Button>
          )}
        </div>
      }
    >
      <div className="space-y-3">
        {error && <Alert variant="error">{error}</Alert>}
        {shareNote && <Alert variant="info">{shareNote}</Alert>}

        {detailQuery.isLoading ? (
          <Spinner label="Memuat detail..." />
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={data.status === "paid" ? "green" : "red"}>
                <span data-testid="sale-status">
                  {data.status === "paid" ? "Lunas" : "Dibatalkan"}
                </span>
              </Badge>
              {payment && (
                <Badge tone="slate">
                  {METHOD_LABEL[payment.method] ?? payment.method}
                </Badge>
              )}
              <span className="text-xs text-slate-500">
                Kasir: {data.cashier?.display_name ?? "-"}
              </span>
            </div>

            {data.status === "void" && data.void_reason && (
              <Alert variant="error">
                Dibatalkan{data.voided_at ? ` (${formatTanggal(data.voided_at)})` : ""}:{" "}
                {data.void_reason}
              </Alert>
            )}

            <ul className="space-y-2">
              {(data.items ?? []).map((item) => (
                <li
                  key={item.id}
                  className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">
                      {item.product_name}
                    </p>
                    <p className="text-xs text-slate-500">
                      {item.qty} x {formatRupiah(item.unit_price)}
                    </p>
                  </div>
                  <p className="text-sm font-bold text-slate-900">
                    {formatRupiah(item.subtotal)}
                  </p>
                </li>
              ))}
            </ul>

            <div className="space-y-1 border-t border-slate-100 pt-3 text-sm">
              <div className="flex justify-between text-slate-500">
                <span>Subtotal</span>
                <span>{formatRupiah(data.subtotal)}</span>
              </div>
              {Number(data.discount) > 0 && (
                <div className="flex justify-between text-emerald-600">
                  <span>Diskon</span>
                  <span>-{formatRupiah(data.discount)}</span>
                </div>
              )}
              <div className="flex justify-between text-base font-bold text-slate-900">
                <span>Total</span>
                <span>{formatRupiah(data.total)}</span>
              </div>
              {payment && (
                <>
                  <div className="flex justify-between text-slate-500">
                    <span>{METHOD_LABEL[payment.method] ?? payment.method}</span>
                    <span>{formatRupiah(payment.amount)}</span>
                  </div>
                  {Number(payment.change_amount) > 0 && (
                    <div className="flex justify-between text-emerald-600">
                      <span>Kembalian</span>
                      <span>{formatRupiah(payment.change_amount)}</span>
                    </div>
                  )}
                </>
              )}
            </div>

            <a
              href={receiptUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-center text-xs text-brand-700 underline"
            >
              Buka link struk publik
            </a>

            {isOwner && data.status === "paid" && (
              <div className="space-y-2 border-t border-slate-100 pt-3">
                <Input
                  label="Alasan pembatalan"
                  value={voidReason}
                  onChange={(event) => setVoidReason(event.target.value)}
                  placeholder="Contoh: pelanggan membatalkan"
                />
                <p className="text-xs text-slate-500">
                  Stok produk akan dikembalikan otomatis.
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </BottomSheet>
  );
}
