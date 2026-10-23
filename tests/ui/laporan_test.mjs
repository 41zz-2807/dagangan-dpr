/**
 * Uji UI end-to-end tahap 5: omset/dashboard, halaman audit log, manajemen user.
 *
 * Pakai: OWNER_PASSWORD=... node laporan_test.mjs
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
const username = `kasir_ui_${stamp}`;
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
  check("berhasil login", true);

  console.log("== 2. Beranda menampilkan omset ==");
  await page.waitForSelector("text=/Omset hari ini|Omset Anda hari ini/", {
    timeout: 10000,
  });
  await page.waitForFunction(
    () => document.body.innerText.includes("Rp"),
    undefined,
    { timeout: 10000 },
  );
  const homeText = await page.textContent("body");
  check(
    "kartu omset tampil di beranda",
    homeText.includes("Omset hari ini") || homeText.includes("Omset Anda hari ini"),
  );
  check("kartu omset menampilkan nominal", homeText.includes("Rp"), homeText.slice(0, 160));

  console.log("== 3. Halaman omset ==");
  await page.goto(`${BASE_URL}/omset`, { waitUntil: "networkidle" });
  await page.waitForSelector("text=Total omset", { timeout: 10000 });
  const omsetText = await page.textContent("body");
  check("judul Total omset tampil", omsetText.includes("Total omset"));
  check("kartu produk terjual tampil", omsetText.includes("Produk terjual"));
  check("kartu rata-rata tampil", omsetText.includes("Rata-rata"));
  check(
    "filter rentang owner tampil",
    await page.isVisible("button:has-text('7 hari')"),
  );
  await page.screenshot({ path: `${SHOT_DIR}/omset.png`, fullPage: true });

  await page.click("button:has-text('7 hari')");
  await page.waitForTimeout(800);
  check("filter 7 hari berjalan", true);

  console.log("== 4. Halaman audit log ==");
  await page.goto(`${BASE_URL}/audit`, { waitUntil: "networkidle" });
  await page.waitForSelector("text=Audit Log", { timeout: 10000 });
  const auditText = await page.textContent("body");
  check("judul audit log tampil", auditText.includes("Audit Log"));
  check(
    "filter user tersedia",
    await page.isVisible("select:has(option:text-is('Semua user'))"),
  );
  await page.fill('input[placeholder*="Filter aksi"]', "auth.login");
  await page.waitForTimeout(900);
  const filteredText = await page.textContent("body");
  check(
    "filter aksi bekerja (hanya auth.login)",
    filteredText.includes("Login") && !filteredText.includes("Transaksi baru"),
    filteredText.slice(0, 200),
  );
  await page.screenshot({ path: `${SHOT_DIR}/audit.png`, fullPage: true });

  console.log("== 5. Manajemen user ==");
  await page.goto(`${BASE_URL}/user`, { waitUntil: "networkidle" });
  await page.waitForSelector("text=User & Kasir", { timeout: 10000 });
  const userText = await page.textContent("body");
  check("daftar user tampil", userText.includes(OWNER_USERNAME));

  await page.click("button:has-text('Tambah')");
  await page.waitForSelector("text=User Baru", { timeout: 10000 });
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill("rahasia123");
  await page.getByLabel("Nama lengkap").fill("Kasir UI Test");
  await page.click("button:has-text('Simpan')");
  await page.waitForSelector(`text=${username}`, { timeout: 10000 });
  const afterCreate = await page.textContent("body");
  check("user baru berhasil dibuat", afterCreate.includes(username), afterCreate.slice(0, 200));
  await page.screenshot({ path: `${SHOT_DIR}/user.png`, fullPage: true });

  console.log("== 6. Kasir baru tidak bisa buka halaman owner ==");
  const kasirContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: "id-ID",
  });
  const kasirPage = await kasirContext.newPage();
  await kasirPage.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });
  await kasirPage.fill('input[name="username"]', username);
  await kasirPage.fill('input[name="password"]', "rahasia123");
  await kasirPage.click('button[type="submit"]');
  await kasirPage.waitForURL((url) => !url.pathname.startsWith("/login"), {
    timeout: 15000,
  });
  const kasirOmset = await kasirPage.goto(`${BASE_URL}/omset`, {
    waitUntil: "networkidle",
  });
  check("kasir bisa buka halaman omset", kasirOmset?.status() === 200);
  const kasirOmsetText = await kasirPage.textContent("body");
  check(
    "kasir tidak melihat filter rentang",
    !(await kasirPage.isVisible("button:has-text('7 hari')")),
  );
  check(
    "kasir melihat omset harian",
    kasirOmsetText.includes("Penjualan Anda hari ini"),
    kasirOmsetText.slice(0, 160),
  );
  await kasirContext.close();

  console.log("== 7. Bersihkan ==");
  const removed = await page.evaluate(async (name) => {
    const csrf = document.cookie.match(/csrf_access_token=([^;]+)/)?.[1] ?? "";
    const list = await fetch("/api/users?q=" + name).then((r) => r.json());
    const target = list.items?.[0];
    if (!target) return false;
    const response = await fetch(`/api/users/${target.id}`, {
      method: "DELETE",
      headers: { "X-CSRF-TOKEN": csrf },
    });
    return response.status === 200;
  }, username);
  check("user uji dinonaktifkan", removed);
} catch (error) {
  fail += 1;
  failures.push(`exception: ${error.message}`);
  console.log(`  ❌ exception: ${error.message}`);
  await page.screenshot({ path: `${SHOT_DIR}/laporan-error.png`, fullPage: true }).catch(() => {});
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
