import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";

import { useAuth } from "../lib/auth";
import { Spinner } from "./ui";

export default function ProtectedRoute({
  children,
  ownerOnly = false,
}: {
  children: ReactNode;
  ownerOnly?: boolean;
}) {
  const { user, isLoading, isOwner } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <Spinner label="Memuat data..." />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  if (ownerOnly && !isOwner) {
    return (
      <div className="mx-auto max-w-lg p-4">
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm font-medium text-rose-700">
          Halaman ini hanya bisa diakses oleh owner.
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
