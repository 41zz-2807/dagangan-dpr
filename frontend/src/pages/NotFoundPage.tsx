import { Link } from "react-router-dom";

export default function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-100 px-4 text-center">
      <p className="text-5xl font-black text-brand-600">404</p>
      <p className="text-sm text-slate-600">
        Halaman yang Anda cari tidak ditemukan.
      </p>
      <Link
        to="/"
        className="inline-flex min-h-[44px] items-center rounded-xl bg-brand-600 px-5 text-sm font-semibold text-white"
      >
        Kembali ke Beranda
      </Link>
    </div>
  );
}
