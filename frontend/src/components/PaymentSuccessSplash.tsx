import { formatRupiah } from "../lib/format";

interface Props {
  amount: string;
  change?: number;
}

export default function PaymentSuccessSplash({ amount, change = 0 }: Props) {
  return (
    <div
      className="splash-overlay fixed inset-0 z-[70] flex flex-col items-center justify-center overflow-hidden bg-gradient-to-b from-emerald-500 via-emerald-600 to-emerald-800 px-6 text-center text-white"
      role="status"
      aria-live="polite"
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-25"
        style={{
          backgroundImage:
            "radial-gradient(circle at 50% 28%, rgba(255,255,255,0.95), transparent 52%)",
        }}
      />

      <div className="relative flex flex-col items-center">
        <div className="relative h-36 w-40">
          <span className="splash-coin absolute left-4 top-3 h-3.5 w-3.5 rounded-full bg-amber-300 ring-2 ring-amber-500/50" />
          <span className="splash-coin absolute right-5 top-6 h-3 w-3 rounded-full bg-amber-200 ring-2 ring-amber-500/40" />
          <span className="splash-coin absolute left-8 top-16 h-2.5 w-2.5 rounded-full bg-amber-300 ring-2 ring-amber-500/40" />
          <span className="splash-coin absolute right-7 top-20 h-3.5 w-3.5 rounded-full bg-amber-200 ring-2 ring-amber-500/50" />

          <div className="splash-bill absolute left-1/2 top-1 z-0 -translate-x-1/2">
            <svg width="104" height="60" viewBox="0 0 104 60" fill="none" aria-hidden="true">
              <rect
                x="2"
                y="2"
                width="100"
                height="56"
                rx="9"
                fill="#d1fae5"
                stroke="#065f46"
                strokeWidth="2.5"
              />
              <rect
                x="10"
                y="10"
                width="84"
                height="40"
                rx="6"
                stroke="#6ee7b7"
                strokeWidth="1.5"
              />
              <circle cx="52" cy="30" r="13" fill="#34d399" stroke="#065f46" strokeWidth="2" />
              <text
                x="52"
                y="35"
                textAnchor="middle"
                fontSize="13"
                fontWeight="700"
                fill="#064e3b"
              >
                Rp
              </text>
              <circle cx="20" cy="20" r="2.5" fill="#10b981" />
              <circle cx="84" cy="40" r="2.5" fill="#10b981" />
            </svg>
          </div>

          <div className="splash-wallet absolute bottom-0 left-1/2 z-10 -translate-x-1/2">
            <svg width="128" height="74" viewBox="0 0 128 74" fill="none" aria-hidden="true">
              <rect x="12" y="22" width="104" height="44" rx="11" fill="#064e3b" />
              <rect x="12" y="12" width="104" height="22" rx="9" fill="#065f46" />
              <rect x="84" y="34" width="26" height="18" rx="6" fill="#fbbf24" />
              <circle cx="97" cy="43" r="2.6" fill="#92400e" />
              <path d="M24 33h34" stroke="#34d399" strokeWidth="3" strokeLinecap="round" />
            </svg>
          </div>
        </div>

        <div className="splash-check mt-2 flex h-16 w-16 items-center justify-center rounded-full bg-white text-emerald-600 shadow-lg shadow-emerald-900/30">
          <svg
            width="34"
            height="34"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="m5 12.5 4.5 4.5L19 7.5" />
          </svg>
        </div>

        <p className="splash-amount mt-4 text-sm font-medium tracking-wide text-emerald-100">
          Pembayaran diterima
        </p>
        <p className="splash-amount mt-1 text-3xl font-extrabold tracking-tight">
          {formatRupiah(Number(amount))}
        </p>
        {change > 0 && (
          <p className="splash-amount mt-2 rounded-full bg-white/15 px-4 py-1.5 text-sm font-semibold text-white">
            Kembalian {formatRupiah(change)}
          </p>
        )}
      </div>
    </div>
  );
}
