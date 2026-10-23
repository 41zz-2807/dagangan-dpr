/**
 * Uji UI end-to-end alur kasir (tahap 3) memakai Playwright + Chromium.
 *
 * Pakai:
 *   cd tests/ui && npm install && npx playwright install chromium
 *   OWNER_PASSWORD=... node ui_test.mjs
 *
 * Environment:
 *   BASE_URL        default http://localhost:8787
 *   OWNER_USERNAME  default owner
 *   OWNER_PASSWORD  wajib
 *   HEADLESS        default true (set "false" untuk melihat browser)
 */
import { chromium } from "playwright";

const BASE_URL = process.env.BASE_URL || "http://localhost:8787";
const OWNER_USERNAME = process.env.OWNER_USERNAME || "owner";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD;
const HEADLESS = process.env.HEADLESS !== "false";
const SHOT_DIR = process.env.SHOT_DIR || "/tmp/d-about-ui";

let pass = 0;
let fail = 0;
const failures = [];

function check(label, condition, detail = "") {
  if (condition) {
    pass += 1;
    console.log(`  ✅ ${label}`);
  } else {
    fail += 1;
    failures.push(label);
    console.log(`  ❌ ${label} ${detail}`);
  }
}

function rupiah(value) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

if (!OWNER_PASSWORD) {
  console.error("OWNER_PASSWORD belum diset.");
  process.exit(1);
}

/** Hapus transaksi & produk uji (butuh docker compose di repo). */
async function cleanup(baselineSaleId, productId) {
  try {
    const { execFileSync } = await import("node:child_process");
    const repoRoot = new URL("../../", import.meta.url).pathname;
    const sql = `
DELETE FROM stock_movements WHERE sale_id IN (SELECT id FROM sales WHERE id > ${baselineSaleId});
DELETE FROM payments WHERE sale_id IN (SELECT id FROM sales WHERE id > ${baselineSaleId});
DELETE FROM sale_items WHERE sale_id IN (SELECT id FROM sales WHERE id > ${baselineSaleId});
DELETE FROM sales WHERE id > ${baselineSaleId};
DELETE FROM products WHERE name LIKE 'Produk UI Test%';
`;
    execFileSync(
      "docker",
      [
        "compose",
        "-f",
        `${repoRoot}docker-compose.yml`,
        "exec",
        "-T",
        "dagang-db",
        "psql",
        "-U",
        "dagang",
        "-d",
        "dagang",
        "-q",
        "-c",
        sql,
      ],
      { stdio: "ignore" },
    );
    return true;
  } catch {
    return false;
  }
}

const stamp = Date.now();
const sku = `UIT-${stamp}`;
const productName = `Produk UI Test ${stamp}`;
const consoleErrors = [];

const browser = await chromium.launch({ headless: HEADLESS });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  locale: "id-ID",
  timezoneId: "Asia/Jakarta",
});
const page = await context.newPage();

page.on("pageerror", (error) => consoleErrors.push(`pageerror: ${error.message}`));
page.on("console", (message) => {
  if (message.type() !== "error") return;
  const text = message.text();
  // Diabaikan: 401 /auth/me sebelum login, dan beacon Cloudflare yang diblokir CSP.
  if (text.includes("401") || text.includes("409") || text.includes("cloudflareinsights")) return;
  consoleErrors.push(`console: ${text}`);
});

try {
  console.log("== 1. Login ==");
  await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });
  await page.fill('input[name="username"]', OWNER_USERNAME);
  await page.fill('input[name="password"]', OWNER_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15000 });
  check("berhasil login", !page.url().includes("/login"), page.url());

  console.log("== 2. Siapkan produk uji ==");
  const baseline = await page.evaluate(async () => {
    const response = await fetch("/api/sales?per_page=1");
    const data = await response.json();
    return data.items?.[0]?.id ?? 0;
  });
  const created = await page.evaluate(
    async ({ productSku, name }) => {
      const csrf = document.cookie.match(/csrf_access_token=([^;]+)/)?.[1] ?? "";
      const response = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-TOKEN": csrf },
        body: JSON.stringify({
          sku: productSku,
          name,
          price_sale: "12000",
          price_purchase: "9000",
          stock: 30,
          min_stock: 3,
        }),
      });
      const data = await response.json();
      return { status: response.status, product: data.product ?? null };
    },
    { productSku: sku, name: productName },
  );
  check("produk uji dibuat via API", created.status === 201, JSON.stringify(created).slice(0, 160));
  const productId = created.product?.id;

  console.log("== 3. Layar kasir ==");
  await page.goto(`${BASE_URL}/kasir`, { waitUntil: "networkidle" });
  await page.waitForSelector(`text=${productName}`, { timeout: 10000 });
  check("produk tampil di grid kasir", true);

  await page.click(`text=${productName}`);
  await page.waitForSelector("text=/1 unit/", { timeout: 10000 });
  const barText = await page.textContent("body");
  check(
    "bilah keranjang muncul dengan total benar",
    barText.includes(rupiah(12000)),
    barText.slice(0, 120),
  );

  console.log("== 4. Tambah jumlah & buka keranjang ==");
  await page.click(`text=${productName}`);
  await page.waitForSelector("text=/2 unit/", { timeout: 10000 });
  check("qty bertambah jadi 2 unit", true);

  await page.click("button:has-text('Bayar')");
  await page.waitForSelector("text=Keranjang", { timeout: 10000 });
  const sheetText = await page.textContent("body");
  check(
    "sheet keranjang menampilkan total 24.000",
    sheetText.includes(rupiah(24000)),
    sheetText.slice(0, 160),
  );

  console.log("== 5. Pembayaran tunai ==");
  await page.click("button:has-text('Tunai')");
  await page.getByLabel("Uang diterima").fill("50000");
  await page.waitForSelector("text=Kembalian", { timeout: 10000 });
  const cashText = await page.textContent("body");
  check(
    "kembalian 26.000 dihitung di UI",
    cashText.includes(rupiah(26000)),
    cashText.slice(0, 160),
  );
  await page.screenshot({ path: `${SHOT_DIR}/kasir-cart.png`, fullPage: true });

  console.log("== 6. Simpan transaksi ==");
  await page.locator("button:has-text('Bayar')").last().click();
  await page.waitForSelector("text=Transaksi Berhasil", { timeout: 15000 });
  const successText = await page.textContent("body");
  check("layar sukses tampil", successText.includes("Transaksi Berhasil"));
  const invoiceMatch = successText.match(/TRX-\d{8}-\d{5}/);
  check("nomor invoice tampil", Boolean(invoiceMatch), successText.slice(0, 160));
  check(
    "total transaksi tampil benar",
    successText.includes(rupiah(24000)),
    successText.slice(0, 160),
  );
  await page.screenshot({ path: `${SHOT_DIR}/kasir-sukses.png`, fullPage: true });

  console.log("== 7. Stok berkurang & transaksi tercatat ==");
  const verify = await page.evaluate(async (id) => {
    const [product, sales] = await Promise.all([
      fetch(`/api/products/${id}`).then((r) => r.json()),
      fetch("/api/sales?per_page=5").then((r) => r.json()),
    ]);
    return {
      id,
      stock: product.product?.stock,
      total: sales.total,
      items: sales.items,
      detail: sales.items[0] ? await fetch(`/api/sales/${sales.items[0].id}`).then((r) => r.json()) : null,
    };
  }, productId);
  console.log(
    `   debug: produk=${verify.id} stok=${verify.stock} item_sale=${JSON.stringify(
      verify.detail?.sale?.items?.map((i) => `${i.product_id}x${i.qty}`),
    )}`,
  );
  check("stok produk 30 -> 28", verify.stock === 28, `stok=${verify.stock}`);
  check("transaksi tercatat di daftar", verify.total >= 1, `total=${verify.total}`);
  check(
    "transaksi terbaru berstatus paid",
    verify.items[0]?.status === "paid",
    JSON.stringify(verify.items[0]?.status),
  );

  console.log("== 8. Transaksi baru ==");
  await page.click("button:has-text('Transaksi Baru')");
  await page.waitForSelector("text=Pilih produk atau pindai barcode", { timeout: 10000 });
  const afterText = await page.textContent("body");
  check("keranjang dikosongkan setelah bayar", !afterText.includes("Bayar"), "");

  console.log("== 9. Error stok di UI ==");
  const oversell = await page.evaluate(async (id) => {
    const csrf = document.cookie.match(/csrf_access_token=([^;]+)/)?.[1] ?? "";
    const response = await fetch("/api/sales", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CSRF-TOKEN": csrf },
      body: JSON.stringify({
        items: [{ product_id: id, qty: 9999 }],
        payments: [{ method: "cash", amount: "99999999" }],
      }),
    });
    return { status: response.status, body: await response.json() };
  }, productId);
  check("stok kurang ditolak 409", oversell.status === 409, JSON.stringify(oversell.body).slice(0, 160));
  check(
    "pesan error berbahasa Indonesia",
    String(oversell.body?.error?.message ?? "").includes("Stok"),
    JSON.stringify(oversell.body?.error?.message),
  );

  console.log("== 10. Bersihkan data uji ==");
  const cleaned = await cleanup(baseline, productId);
  check("data uji dibersihkan", cleaned, "gagal membersihkan (lewati bila docker tidak tersedia)");
} catch (error) {
  fail += 1;
  failures.push(`exception: ${error.message}`);
  console.log(`  ❌ exception: ${error.message}`);
  await page.screenshot({ path: `${SHOT_DIR}/error.png`, fullPage: true }).catch(() => {});
} finally {
  check("tidak ada error JavaScript di halaman", consoleErrors.length === 0, consoleErrors.join(" | "));
  await browser.close();
}

console.log("");
console.log("================================");
console.log(` LULUS: ${pass}   GAGAL: ${fail}`);
if (failures.length) console.log(` Gagal: ${failures.join(" ; ")}`);
console.log("================================");
process.exit(fail === 0 ? 0 : 1);
