import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiFetch } from "../lib/api";
import { formatTanggal } from "../lib/format";
import { Button, Spinner } from "../components/ui";

type OpnameItem = {
  id: number;
  product_id: number;
  product?: any;
  system_stock: number;
  physical_stock: number;
  difference: number;
  adjusted: boolean;
};

type Opname = {
  id: number;
  opname_no: string;
  user?: { username: string; display_name: string };
  status: string;
  notes: string | null;
  created_at: string;
  completed_at: string | null;
  items?: OpnameItem[];
  items_count: number;
};

export default function StokOpnamePage() {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [items, setItems] = useState<OpnameItem[]>([]);

  const listQuery = useQuery({
    queryKey: ["opname", "list"],
    queryFn: () => apiFetch<{ items: Opname[] }>("/opname"),
  });

  const detailQuery = useQuery({
    queryKey: ["opname", "detail", selectedId],
    queryFn: () => apiFetch<{ opname: Opname }>(`/opname/${selectedId}`),
    enabled: !!selectedId,
  });

  const createMutation = useMutation({
    mutationFn: () => apiFetch("/opname", { method: "POST", body: {} }),
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ["opname"] });
      if (data?.opname?.id) setSelectedId(data.opname.id);
    },
  });

  const saveMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/opname/${selectedId}/items`, {
        method: "PUT",
        body: { items },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["opname", "detail", selectedId] }),
  });

  const completeMutation = useMutation({
    mutationFn: () => apiFetch(`/opname/${selectedId}/complete`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["opname"] });
      qc.invalidateQueries({ queryKey: ["stock"] });
    },
  });

  const opname = detailQuery.data?.opname;

  useEffect(() => {
    if (detailQuery.data?.opname?.items) {
      setItems(detailQuery.data.opname.items);
    }
  }, [detailQuery.data]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Stok Opname</h1>
          <p className="text-sm text-slate-500">Hitung stok fisik vs sistem</p>
        </div>
        <Button onClick={() => createMutation.mutate()} loading={createMutation.isPending}>Buat Opname Baru</Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="p-4 border-b border-slate-100">
            <h2 className="font-bold">Riwayat Opname</h2>
          </div>
          <div className="divide-y divide-slate-100 max-h-[600px] overflow-auto">
            {(listQuery.data?.items || []).map((o) => (
              <button
                key={o.id}
                onClick={() => setSelectedId(o.id)}
                className={`w-full text-left p-4 hover:bg-slate-50 ${selectedId === o.id ? "bg-brand-50" : ""}`}
              >
                <div className="flex justify-between">
                  <span className="font-semibold">{o.opname_no}</span>
                  <span className={o.status === "completed" ? "text-green-600" : "text-amber-600"}>{o.status}</span>
                </div>
                <p className="text-sm text-slate-500">{formatTanggal(o.created_at)} · {o.items_count} produk</p>
                {o.user && <p className="text-xs text-slate-400">{o.user.display_name}</p>}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-bold">{opname ? opname.opname_no : "Pilih opname"}</h2>
            {opname?.status === "draft" && (
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => saveMutation.mutate()} loading={saveMutation.isPending}>Simpan</Button>
                <Button onClick={() => completeMutation.mutate()} loading={completeMutation.isPending}>Selesaikan & Adjust</Button>
              </div>
            )}
          </div>
          {detailQuery.isLoading && <div className="p-4"><Spinner label="Memuat..." /></div>}
          {opname?.status === "draft" && (
            <div className="max-h-[600px] overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="text-left p-2">Produk</th>
                    <th className="text-center p-2">Sistem</th>
                    <th className="text-center p-2">Fisik</th>
                    <th className="text-center p-2">Selisih</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, idx) => (
                    <tr key={it.id} className="border-t border-slate-100">
                      <td className="p-2">{it.product?.name}</td>
                      <td className="p-2 text-center">{it.system_stock}</td>
                      <td className="p-2">
                        <input
                          type="number"
                          className="w-20 mx-auto block text-center border rounded"
                          value={it.physical_stock}
                          onChange={(e) => {
                            const newItems = [...items];
                            const phys = parseInt(e.target.value) || 0;
                            newItems[idx].physical_stock = phys;
                            newItems[idx].difference = phys - newItems[idx].system_stock;
                            setItems(newItems);
                          }}
                        />
                      </td>
                      <td className={`p-2 text-center ${it.difference !== 0 ? (it.difference > 0 ? "text-green-600" : "text-red-600") : ""}`}>{it.difference > 0 ? `+${it.difference}` : it.difference}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {opname?.status === "completed" && (
            <div className="max-h-[600px] overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="text-left p-2">Produk</th>
                    <th className="text-center p-2">Sistem</th>
                    <th className="text-center p-2">Fisik</th>
                    <th className="text-center p-2">Selisih</th>
                    <th className="text-center p-2">Adjusted</th>
                  </tr>
                </thead>
                <tbody>
                  {(opname.items || []).map((it: any) => (
                    <tr key={it.id} className="border-t border-slate-100">
                      <td className="p-2">{it.product?.name}</td>
                      <td className="p-2 text-center">{it.system_stock}</td>
                      <td className="p-2 text-center">{it.physical_stock}</td>
                      <td className={`p-2 text-center ${it.difference !== 0 ? (it.difference > 0 ? "text-green-600" : "text-red-600") : ""}`}>{it.difference > 0 ? `+${it.difference}` : it.difference}</td>
                      <td className="p-2 text-center">{it.adjusted ? "Ya" : "Tidak"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
