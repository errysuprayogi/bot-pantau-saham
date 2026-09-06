const NF = new Intl.NumberFormat("id-ID");

function escHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function num(x, dec = 0) {
  const n = Number(x);
  if (!Number.isFinite(n)) return "n/a";
  return new Intl.NumberFormat("id-ID", {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec
  }).format(n);
}

function compact(x, dec = 1) {
  const n = Number(x);
  if (!Number.isFinite(n)) return "n/a";
  return new Intl.NumberFormat("id-ID", {
    maximumFractionDigits: dec
  }).format(n);
}

function idr(x) {
  const n = Number(x);
  if (!Number.isFinite(n)) return "n/a";
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  if (abs >= 1e12) return `${sign}Rp${compact(abs / 1e12)} triliun`;
  if (abs >= 1e9) return `${sign}Rp${compact(abs / 1e9)} miliar`;
  if (abs >= 1e6) return `${sign}Rp${compact(abs / 1e6, 0)} juta`;
  return `${sign}Rp${NF.format(abs)}`;
}

function idrShort(x) {
  const n = Number(x);
  if (!Number.isFinite(n)) return "n/a";
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  if (abs >= 1e12) return `${sign}Rp${compact(abs / 1e12)} T`;
  if (abs >= 1e9) return `${sign}Rp${compact(abs / 1e9)} M`;
  if (abs >= 1e6) return `${sign}Rp${compact(abs / 1e6, 0)} jt`;
  return `${sign}Rp${NF.format(abs)}`;
}

function pct(x, signed = true) {
  const n = Number(x);
  if (!Number.isFinite(n)) return "n/a";
  const s = compact(Math.abs(n), 2);
  if (n >= 0) return `${signed ? "+" : ""}${s}%`;
  return `-${s}%`;
}

function price(x) {
  return num(x, 2);
}

function sessionDate(iso) {
  if (!iso) return "n/a";
  const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number);
  if (!y) return iso;
  const nama = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
  return `${d} ${nama[m - 1]} ${y}`;
}

function wibDateTime(dateObj) {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "numeric",
    month: "short",
    year: "numeric",
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit"
  }).format(dateObj);
}

module.exports = { escHtml, num, compact, idr, idrShort, pct, price, sessionDate, wibDateTime };