import { Link } from "react-router-dom";

export default function PlaceholderPage({
  title,
  description,
  stage,
}: {
  title: string;
  description: string;
  stage: string;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-900">{title}</h1>
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      </div>

      <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center">
        <p className="text-sm font-semibold text-slate-700">
          Halaman ini diisi pada {stage}.
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Kerangka navigasi, hak akses, dan API sudah siap.
        </p>
        <Link
          to="/"
          className="mt-4 inline-flex min-h-[44px] items-center rounded-xl bg-slate-100 px-4 text-sm font-semibold text-slate-700"
        >
          Kembali ke Beranda
        </Link>
      </div>
    </div>
  );
}
