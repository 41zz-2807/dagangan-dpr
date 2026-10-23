import { useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { useAuth } from "../lib/auth";
import { ApiError } from "../lib/api";
import { Alert } from "../components/ui";

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(username.trim(), password);
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from && from !== "/login" ? from : "/", { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Tidak dapat terhubung ke server.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-900 px-4">
      {/* Background image dengan blur, saturate, scale
          Atur di sini:
          - blur: "blur(20px)" s/d "blur(30px)" (makin besar makin buram)
          - saturate: "saturate(0.7)" s/d "saturate(0.9)" (makin kecil makin samar)
          - overlay: bg-black/35 (0.35) s/d bg-black/50 (0.5) */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: "url('/login-bg.jpg')",
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
          filter: "blur(24px) saturate(0.8)",
          transform: "scale(1.1)",
        }}
      />
      {/* Overlay gelap tipis */}
      <div className="absolute inset-0 bg-black/40" />
      <div className="relative z-10 w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <img
            src="/icon-512.png"
            alt="Warung DPR"
            className="mb-3 h-[94px] w-[94px] rounded-full object-cover shadow-lg ring-4 ring-white/30"
          />
          <h1 className="text-2xl font-bold text-white drop-shadow-md">Warung DPR</h1>
          <p className="mt-1 text-sm text-white/80 drop-shadow">(Dibawah Pohon Rindang)</p>
        </div>

        <form
          onSubmit={handleSubmit}
          method="post"
          className="space-y-4 rounded-3xl border border-white/35 bg-white/15 p-5 shadow-lg backdrop-blur-[16px] [backdrop-filter:blur(16px)_saturate(140%)] [-webkit-backdrop-filter:blur(16px)_saturate(140%)]"
          style={{
            background: "rgba(255,255,255,0.15)",
            backdropFilter: "blur(16px) saturate(140%)",
            WebkitBackdropFilter: "blur(16px) saturate(140%)",
            border: "1px solid rgba(255,255,255,0.35)",
            borderRadius: "24px",
            boxShadow: "0 8px 32px rgba(0,0,0,0.25)",
          }}
        >
          {error && <Alert variant="error">{error}</Alert>}

          <div className="space-y-1">
            <label className="block text-sm font-medium text-white" style={{ textShadow: "0 1px 2px rgba(0,0,0,0.5)" }}>
              Username
            </label>
            <input
              name="username"
              autoComplete="username"
              inputMode="text"
              placeholder="owner / kasir"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
              className="glass-input"
              style={{
                width: "100%",
                minHeight: "44px",
                borderRadius: "12px",
                border: "1px solid rgba(255,255,255,0.3)",
                background: "rgba(255,255,255,0.22)",
                color: "#fff",
                padding: "0 12px",
                fontSize: "16px",
                outline: "none",
              }}
            />
          </div>

          <div className="space-y-1">
            <label className="block text-sm font-medium text-white" style={{ textShadow: "0 1px 2px rgba(0,0,0,0.5)" }}>
              Password
            </label>
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              className="glass-input"
              style={{
                width: "100%",
                minHeight: "44px",
                borderRadius: "12px",
                border: "1px solid rgba(255,255,255,0.3)",
                background: "rgba(255,255,255,0.22)",
                color: "#fff",
                padding: "0 12px",
                fontSize: "16px",
                outline: "none",
              }}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="mt-2 w-full rounded-xl border border-white/30 bg-emerald-600/90 py-2.5 text-sm font-semibold text-white shadow-md transition hover:bg-emerald-600 disabled:opacity-60"
          >
            {loading ? "Memproses..." : "Masuk"}
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-white/80" style={{ textShadow: "0 1px 2px rgba(0,0,0,0.5)" }}>
          Gunakan akun yang diberikan owner toko.
        </p>
      </div>

      <style>{`
        .glass-input::placeholder {
          color: rgba(255,255,255,0.6);
        }
        .glass-input:focus {
          border-color: rgba(255,255,255,0.6) !important;
          box-shadow: 0 0 0 2px rgba(255,255,255,0.15);
        }
        /* Netralkan autofill kuning browser */
        .glass-input:-webkit-autofill,
        .glass-input:-webkit-autofill:hover,
        .glass-input:-webkit-autofill:focus,
        .glass-input:-webkit-autofill:active {
          -webkit-box-shadow: 0 0 0 30px rgba(255,255,255,0.22) inset !important;
          -webkit-text-fill-color: #fff !important;
          caret-color: #fff;
          transition: background-color 5000s ease-in-out 0s;
        }
      `}</style>
    </div>
  );
}
