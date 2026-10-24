import { useEffect, useState, type ReactNode } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";

import { useAuth } from "../lib/auth";
import {
  IconBox,
  IconCart,
  IconChart,
  IconClipboard,
  IconClock,
  IconClose,
  IconHome,
  IconLogout,
  IconMenu,
  IconMoney,
  IconReceipt,
  IconShield,
  IconTag,
  IconUsers,
} from "./icons";
import { Badge } from "./ui";

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  ownerOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { to: "/", label: "Beranda", icon: <IconHome className="h-6 w-6" /> },
  { to: "/kasir", label: "Kasir", icon: <IconCart className="h-6 w-6" /> },
  { to: "/shift", label: "Shift", icon: <IconClock className="h-6 w-6" /> },
  { to: "/transaksi", label: "Transaksi", icon: <IconReceipt className="h-6 w-6" /> },
  { to: "/stok", label: "Stok", icon: <IconBox className="h-6 w-6" /> },
  { to: "/stok/opname", label: "Stok Opname", icon: <IconClipboard className="h-6 w-6" />, ownerOnly: true },
  { to: "/omset", label: "Omset", icon: <IconChart className="h-6 w-6" />, ownerOnly: true },
  { to: "/laporan-harian", label: "Laporan Harian", icon: <IconChart className="h-6 w-6" />, ownerOnly: true },
  { to: "/pengeluaran", label: "Pengeluaran", icon: <IconMoney className="h-6 w-6" /> },
  { to: "/produk", label: "Produk", icon: <IconTag className="h-6 w-6" />, ownerOnly: true },
  {
    to: "/kategori",
    label: "Kategori",
    icon: <IconTag className="h-6 w-6" />,
    ownerOnly: true,
  },
  { to: "/user", label: "User", icon: <IconUsers className="h-6 w-6" />, ownerOnly: true },
  { to: "/audit", label: "Audit", icon: <IconShield className="h-6 w-6" />, ownerOnly: true },
];

export default function AppShell({ children }: { children: ReactNode }) {
  const { user, logout, isOwner } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  const items = NAV_ITEMS.filter((item) => !item.ownerOnly || isOwner);
  const bottomItems = items.slice(0, 5);

  const handleLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="-ml-2 inline-flex h-11 w-11 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100 md:hidden"
              aria-label="Buka menu"
            >
              <IconMenu className="h-6 w-6" />
            </button>
            <img
              src="/icon-192.png"
              alt="Warung DPR"
              className="h-9 w-9 rounded-full object-cover"
            />
            <div className="leading-tight">
              <p className="text-base font-bold text-slate-900">Warung DPR</p>
              <p className="text-[11px] font-medium text-slate-500">(Dibawah Pohon Rindang)</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-semibold text-slate-800">
                {user?.display_name ?? "-"}
              </p>
              <Badge tone={isOwner ? "green" : "slate"}>
                {isOwner ? "Owner" : "Kasir"}
              </Badge>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100"
              aria-label="Keluar"
            >
              <IconLogout className="h-6 w-6" />
            </button>
          </div>
        </div>
      </header>

      {/* Sidebar desktop */}
      <aside className="fixed inset-y-16 left-0 z-20 hidden w-60 border-r border-slate-200 bg-white md:block">
        <nav className="space-y-1 p-3">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                `flex min-h-[44px] items-center gap-3 rounded-xl px-3 text-sm font-semibold transition ${
                  isActive
                    ? "bg-brand-50 text-brand-700"
                    : "text-slate-600 hover:bg-slate-100"
                }`
              }
            >
              {item.icon}
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* Drawer mobile */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0 bg-slate-900/50"
            onClick={() => setDrawerOpen(false)}
          />
          <nav className="absolute inset-y-0 left-0 w-72 max-w-[85%] bg-white p-4 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-lg font-bold text-slate-900">Menu</p>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100"
                aria-label="Tutup menu"
              >
                <IconClose className="h-6 w-6" />
              </button>
            </div>
            <div className="space-y-1">
              {items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === "/"}
                  className={({ isActive }) =>
                    `flex min-h-[48px] items-center gap-3 rounded-xl px-3 text-sm font-semibold transition ${
                      isActive
                        ? "bg-brand-50 text-brand-700"
                        : "text-slate-700 hover:bg-slate-100"
                    }`
                  }
                >
                  {item.icon}
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </div>
          </nav>
        </div>
      )}

      <main className="mx-auto max-w-6xl px-4 pb-28 pt-4 md:pb-10 md:pl-64">
        {children}
      </main>

      {/* Bottom navigation mobile */}
      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white md:hidden">
        <div className="mx-auto flex max-w-lg">
          {bottomItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                `flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-semibold ${
                  isActive ? "text-brand-700" : "text-slate-500"
                }`
              }
            >
              {item.icon}
              <span>{item.label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
