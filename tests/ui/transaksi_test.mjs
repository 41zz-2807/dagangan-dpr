/**
 * Uji UI end-to-end tahap 4: riwayat transaksi, detail, void (owner), struk publik.
 *
 * Pakai: OWNER_PASSWORD=... node transaksi_test.mjs
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

const stamp = Date.now();
const sku = `TRX-${stamp}`;
const productName = `Produk Transaksi ${stamp}`;
const consoleErrors = [];

async function cleanup(baselineSaleId, productId) {
  try {
    const { execFileSync } = await import("node:child_process");
    const repoRoot = new URL("../../", import.meta.url).pathname;
    const sql = `
DELETE FROM stock_movements WHERE sale_id IN (SELECT id FROM sales WHERE id > ${baselineSaleId});
DELETE FROM payments WHERE sale_id IN (SELECT id FROM sales WHERE id > ${baselineSaleId});
DELETE FROM sale_items WHERE sale_id IN (SELECT id FROM sales WHERE id > ${baselineSaleId});
DELETE FROM sales WHERE id > ${baselineSaleId};
DELETE FROM products WHERE name LIKE 'Produk Transaksi%';
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
  if (text.includes("401") || text.includes("409") || text.includes("cloudflareinsights")) return;
  consoleErrors.push(`console: ${text}`);
});

try {
  console.log("== 1. Login & siapkan data ==");
  await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });
  await page.fill('input[name="username"]', OWNER_USERNAME);
  await page.fill('input[name="password"]', OWNER_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15000 });
  check("berhasil login", true);

  const setup = await page.evaluate(
    async ({ productSku, name }) => {
      const csrf = document.cookie.match(/csrf_access_token=([^;]+)/)?.[1] ?? "";
      const headers = { "Content-Type": "application/json", "X-CSRF-TOKEN": csrf };
      const before = await fetch("/api/sales?per_page=1").then((r) => r.json());
      const baseline = before.items?.[0]?.id ?? 0;

      const product = await fetch("/api/products", {
        method: "POST",
        headers,
        body: JSON.stringify({
          sku: productSku,
          name,
          price_sale: "15000",
          price_purchase: "10000",
          stock: 20,
          min_stock: 2,
        }),
      }).then((r) => r.json());

      const sale = await fetch("/api/sales", {
        method: "POST",
        headers,
        body: JSON.stringify({
          items: [{ product_id: product.product.id, qty: 2 }],
          payments: [{ method: "cash", amount: "50000" }],
        }),
      }).then((r) => r.json());

      return {
        baseline,
        productId: product.product.id,
        saleId: sale.sale.id,
        invoice: sale.sale.invoice_no,
        token: sale.sale.receipt_token,
      };
    },
    { productSku: sku, name: productName },
  );
  check("produk & transaksi uji dibuat", Boolean(setup.saleId), JSON.stringify(setup).slice(0, 160));

  console.log("== 2. Halaman transaksi ==");
  await page.goto(`${BASE_URL}/transaksi`, { waitUntil: "networkidle" });
  await page.waitForSelector(`text=${setup.invoice}`, { timeout: 10000 });
  check("transaksi muncul di daftar", true);

  const listText = await page.textContent("body");
  check(
    "total transaksi tampil di daftar",
    listText.includes(rupiah(30000)),
    listText.slice(0, 160),
  );
  await page.screenshot({ path: `${SHOT_DIR}/transaksi-daftar.png`, fullPage: true });

  console.log("== 3. Detail transaksi ==");
  await page.click(`text=${setup.invoice}`);
  await page.waitForSelector("text=Kasir:", { timeout: 10000 });
  const detailText = await page.textContent("body");
  check("detail menampilkan item", detailText.includes(productName), detailText.slice(0, 200));
  check("detail menampilkan kembalian", detailText.includes(rupiah(20000)), detailText.slice(0, 200));
  check(
    "tombol batalkan tersedia untuk owner",
    await page.isVisible("button:has-text('Batalkan Transaksi')"),
  );
  await page.screenshot({ path: `${SHOT_DIR}/transaksi-detail.png`, fullPage: true });

  console.log("== 4. Batalkan transaksi ==");
  await page.getByLabel("Alasan pembatalan").fill("Pelanggan salah ambil barang");
  await page.click("button:has-text('Batalkan Transaksi')");
  await page.waitForSelector('[data-testid="sale-status"]:has-text("Dibatalkan")', {
    timeout: 10000,
  });
  const voidText = await page.textContent("body");
  check("status berubah menjadi Dibatalkan", voidText.includes("Dibatalkan"), voidText.slice(0, 200));
  check(
    "alasan pembatalan tampil",
    voidText.includes("Pelanggan salah ambil barang"),
    voidText.slice(0, 200),
  );

  const stockAfter = await page.evaluate(async (id) => {
    const data = await fetch(`/api/products/${id}`).then((r) => r.json());
    return data.product.stock;
  }, setup.productId);
  check("stok kembali ke 20 setelah void", stockAfter === 20, `stok=${stockAfter}`);

  console.log("== 5. Struk publik ==");
  const receipt = await context.newPage();
  const response = await receipt.goto(`${BASE_URL}/r/${setup.token}`, {
    waitUntil: "networkidle",
  });
  check("halaman struk publik terbuka", response?.status() === 200, String(response?.status()));
  const receiptText = await receipt.textContent("body");
  check(
    "struk publik menampilkan nomor invoice",
    receiptText.includes(setup.invoice),
    receiptText.slice(0, 200),
  );
  check(
    "struk publik menampilkan total",
    receiptText.includes(rupiah(30000)),
    receiptText.slice(0, 200),
  );
  await receipt.screenshot({ path: `${SHOT_DIR}/struk-publik.png`, fullPage: true });

  const pdfResponse = await page.request.get(`${BASE_URL}/r/${setup.token}/pdf`);
  check(
    "PDF struk publik tersedia",
    pdfResponse.status() === 200 &&
      pdfResponse.headers()["content-type"] === "application/pdf",
    `${pdfResponse.status()} ${pdfResponse.headers()["content-type"]}`,
  );

  console.log("== 6. Bersihkan ==");
  check("data uji dibersihkan", await cleanup(setup.baseline, setup.productId), "gagal");
} catch (error) {
  fail += 1;
  failures.push(`exception: ${error.message}`);
  console.log(`  ❌ exception: ${error.message}`);
  await page.screenshot({ path: `${SHOT_DIR}/transaksi-error.png`, fullPage: true }).catch(() => {});
} finally {
  check(
    "tidak ada error JavaScript di halaman",
    consoleErrors.length === 0,
    consoleErrors.join(" | "),
  );
  await browser.close();
}

console.log("");
console.log("================================");
console.log(` LULUS: ${pass}   GAGAL: ${fail}`);
if (failures.length) console.log(` Gagal: ${failures.join(" ; ")}`);
console.log("================================");
process.exit(fail === 0 ? 0 : 1);
