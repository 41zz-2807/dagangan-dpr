import type { ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import AppShell from "./components/AppShell";
import ProtectedRoute from "./components/ProtectedRoute";
import AuditPage from "./pages/AuditPage";
import HomePage from "./pages/HomePage";
import KategoriPage from "./pages/KategoriPage";
import KasirPage from "./pages/KasirPage";
import LoginPage from "./pages/LoginPage";
import NotFoundPage from "./pages/NotFoundPage";
import OmsetPage from "./pages/OmsetPage";
import ProdukPage from "./pages/ProdukPage";
import PengeluaranPage from "./pages/PengeluaranPage";
import ShiftPage from "./pages/ShiftPage";
import StokOpnamePage from "./pages/StokOpnamePage";
import StokPage from "./pages/StokPage";
import TransaksiPage from "./pages/TransaksiPage";
import UserPage from "./pages/UserPage";
import { useAuth } from "./lib/auth";
import { Spinner } from "./components/ui";

function Shell({ children, ownerOnly = false }: { children: ReactNode; ownerOnly?: boolean }) {
  return (
    <ProtectedRoute ownerOnly={ownerOnly}>
      <AppShell>{children}</AppShell>
    </ProtectedRoute>
  );
}

export default function App() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <Spinner label="Memuat aplikasi..." />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <div className="flex-1">
        <Routes>
          <Route
            path="/login"
            element={user ? <Navigate to="/" replace /> : <LoginPage />}
          />
          <Route
            path="/"
            element={
              <Shell>
                <HomePage />
              </Shell>
            }
          />
          <Route
            path="/kasir"
            element={
              <Shell>
                <KasirPage />
              </Shell>
            }
          />
          <Route
            path="/shift"
            element={
              <Shell>
                <ShiftPage />
              </Shell>
            }
          />
          <Route
            path="/transaksi"
            element={
              <Shell>
                <TransaksiPage />
              </Shell>
            }
          />
          <Route
            path="/stok"
            element={
              <Shell>
                <StokPage />
              </Shell>
            }
          />
          <Route
            path="/stok/opname"
            element={
              <Shell ownerOnly>
                <StokOpnamePage />
              </Shell>
            }
          />
          <Route
            path="/omset"
            element={
              <Shell>
                <OmsetPage />
              </Shell>
            }
          />
          <Route
            path="/pengeluaran"
            element={
              <Shell>
                <PengeluaranPage />
              </Shell>
            }
          />
          <Route
            path="/produk"
            element={
              <Shell ownerOnly>
                <ProdukPage />
              </Shell>
            }
          />
          <Route
            path="/kategori"
            element={
              <Shell ownerOnly>
                <KategoriPage />
              </Shell>
            }
          />
          <Route
            path="/user"
            element={
              <Shell ownerOnly>
                <UserPage />
              </Shell>
            }
          />
          <Route
            path="/audit"
            element={
              <Shell ownerOnly>
                <AuditPage />
              </Shell>
            }
          />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </div>
      <footer className="py-4 text-center text-xs text-slate-400">
        Powered By Smart-Plus.id 2026
      </footer>
    </div>
  );
}
