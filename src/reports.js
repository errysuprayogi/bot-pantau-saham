const { escHtml, num, compact, idr, idrShort, pct, price, sessionDate, wibDateTime } = require("./format");

const MAX_BLOCK = 3800;
const LIST_N = 5;
const NEWS_N = 5;
const WATCHLIST_NAME = "Porto";
const WL_MOVERS_N = 5;

const harga = (x) => num(x, 0);

function section(title, lines) {
  return [`<b>${title}</b>`, ...lines].join("\n");
}

function noteEmpty() {
  return ["Tidak ada data untuk disebut (market libur atau feed masih kosong)."];
}

function moversLine(i, row) {
  return `${i}. ${escHtml(row.symbol)} ${escHtml(row.name)}  ${harga(row.price)}  (${pct(row.changePercent)})`;
}

function accdistLabel(accdist) {
  const map = {
    "Big Acc": "Akum Besar",
    "Normal Acc": "Akum Normal",
    "Small Acc": "Akum Kecil",
    "Neutral": "Netral",
    "Dist": "Dist",
    "Normal Dist": "Dist Normal",
    "Big Dist": "Dist Besar",
    "Small Dist": "Dist Kecil"
  };
  return map[accdist] || accdist || "n/a";
}

function verdictEmoji(v) {
  const s = String(v).toLowerCase();
  if (s.startsWith("akum")) return "🟢";
  if (s.startsWith("dist")) return "🔴";
  return "🟡";
}

async function getMovers(client, view, limit) {
  const res = await client.call("market_movers", { view, limit });
  return {
    rows: (res && res.rows) || [],
    session: (res && res.foreign && res.foreign.sessionDate) || null
  };
}

async function getNews(client, limit) {
  const res = await client.call("news", { limit });
  const items = (res && res.items) || [];
  return items.map((it) => {
    const raw = it.raw || {};
    const content = String(it.content || "").replace(/\s+/g, " ").trim();
    return {
      title: raw.title || content.split(".")[0] || "(tanpa judul)",
      source: (raw.news_feed && raw.news_feed.label) || "stockbit",
      time: raw.created_display || it.createdAt || "",
      url: raw.title_url || null,
      snippet: content.slice(0, 130)
    };
  });
}

async function getIhsg(client) {
  const res = await client.call("quote", { symbol: "IHSG" });
  return {
    price: Number(res.price),
    change: Number(res.change),
    changePercent: Number(res.percentage)
  };
}

async function getBandarDetail(client, symbol) {
  const res = await client.call("broker_summary", {
    symbol,
    resolve_names: true,
    limit: 20
  });
  const brokers = [...(res.buyers || []), ...(res.sellers || [])]
    .map((b) => ({
      code: String(b.code || ""),
      name: String(b.name || ""),
      investorType: String(b.investorType || ""),
      netValueIdr: Number(b.netValueIdr) || 0
    }))
    .filter((b) => b.netValueIdr !== 0)
    .sort((a, b) => Math.abs(b.netValueIdr) - Math.abs(a.netValueIdr))
    .slice(0, 12);
  const det = res.bandarDetector || {};
  const accdist =
    (det.avg && det.avg.accdist) ||
    det.broker_accdist ||
    null;
  return {
    verdict: accdist ? accdistLabel(accdist) : "n/a",
    brokerCount: Math.abs(det.number_broker_buysell || 0),
    brokers,
    session: `${res.from || "?"} s/d ${res.to || "?"}`
  };
}

function signedIdr(x) {
  const n = Number(x);
  if (!Number.isFinite(n)) return "n/a";
  return `${n >= 0 ? "+" : "-"}${idrShort(Math.abs(n))}`;
}

function brokerGroupLines(d) {
  const groups = [
    { key: "Asing", emoji: "👽" },
    { key: "Pemerintah", emoji: "🏛️" },
    { key: "Lokal", emoji: "🇮🇩" }
  ];
  const lines = [];
  for (const g of groups) {
    const grp = d.brokers.filter((b) => b.investorType === g.key).slice(0, 4);
    if (!grp.length) continue;
    const net = grp.reduce((s, b) => s + b.netValueIdr, 0);
    lines.push(`${g.emoji} ${g.key} (net ${signedIdr(net)}): ` +
      grp.map((b) => `${b.code || b.name} ${signedIdr(b.netValueIdr)}`).join(", "));
  }
  const sisa = d.brokers
    .filter((b) => !groups.some((g) => b.investorType === g.key))
    .slice(0, 3);
  if (sisa.length) {
    lines.push("🔹 Lainnya: " + sisa.map((b) => `${b.code || b.name} ${signedIdr(b.netValueIdr)}`).join(", "));
  }
  return lines;
}

function isWaran(row) {
  return /waran/i.test(String(row.name || ""));
}

function volCompact(x) {
  const n = Number(x);
  if (!Number.isFinite(n) || n <= 0) return "-";
  if (n >= 1e12) return `${compact(n / 1e12)} T`;
  if (n >= 1e9) return `${compact(n / 1e9)} M`;
  if (n >= 1e6) return `${compact(n / 1e6)} jt`;
  if (n >= 1e3) return `${compact(n / 1e3)} rb`;
  return String(Math.round(n));
}

async function getPreOpen(client, symbol) {
  const res = await client.call("orderbook", { symbol });
  const block = (res && res.iepiev) || {};
  const iep = Number((block.iep || {}).raw);
  const iev = Number((block.iev || {}).raw);
  if (!Number.isFinite(iep) || iep <= 0) return null;
  const wirePct = Number(((block.iep_changes || {}).percentage || {}).raw);
  const previous = Number(res.previous);
  const pctVsPrev = Number.isFinite(wirePct) && block.status !== "STATUS_UNSPECIFIED"
    ? wirePct
    : Number.isFinite(previous) && previous > 0
      ? ((iep - previous) / previous) * 100
      : null;
  return { symbol, iep, iev, pctVsPrev };
}

async function preOpenBlock(wl, client) {
  const title = `⏳ PRE-OPENING WATCHLIST — ${escHtml(wl.name || WATCHLIST_NAME)}`;
  if (!wl.rows.length) return section(title, noteEmpty());
  const rows = await Promise.all(
    wl.rows.map((r) => getPreOpen(client, r.symbol).catch(() => null))
  );
  const lines = rows
    .filter((p) => p !== null)
    .map((p, i) => {
      const pctS = p.pctVsPrev === null ? "n/a" : pctPlain(p.pctVsPrev);
      return `${i + 1}. ${escHtml(p.symbol)}  IEP ${harga(p.iep)}  (${pctS})  IEV ${volCompact(p.iev)}`;
    });
  return section(title, lines.length ? lines : noteEmpty());
}

async function getWatchlist(client) {
  const listsRes = await client.call("watchlist", {});
  const lists = (listsRes && listsRes.data && listsRes.data.watchlists) || (listsRes && listsRes.watchlists) || [];
  let list = lists.find((l) => l.name === WATCHLIST_NAME);
  if (!list) list = lists.find((l) => l.isDefault);
  if (!list) return { name: null, rows: [] };
  const res = await client.call("watchlist", { id: list.id });
  const members = (res && res.data && res.data.members) || (res && res.members) || [];
  const rows = members
    .map((m) => ({
      symbol: String(m.symbol || ""),
      name: String(m.name || ""),
      price: Number(m.last),
      changePercent: Number(m.percentChange)
    }))
    .filter((r) => r.symbol && Number.isFinite(r.price) && Number.isFinite(r.changePercent));
  rows.sort((a, b) => b.changePercent - a.changePercent);
  return { name: list.name, rows };
}

async function getBrokerFlow(client, symbol) {
  const res = await client.call("broker_summary", { symbol, limit: 20 });
  const byType = (rows) => (rows || []).reduce(
    (acc, b) => {
      const t = String(b.investorType || "");
      if (t === "Asing" || t === "Lokal" || t === "BUMN" || t === "Pemerintah") {
        const key = t === "Pemerintah" ? "BUMN" : t;
        acc[key] += Math.abs(Number(b.netValueIdr) || 0);
      }
      return acc;
    },
    { Asing: 0, Lokal: 0, BUMN: 0 }
  );
  const ranked = (rows) => (rows || [])
    .map((b) => ({ code: String(b.code || ""), v: Math.abs(Number(b.netValueIdr) || 0) }))
    .filter((b) => b.v > 0)
    .sort((a, b) => b.v - a.v)
    .slice(0, 2)
    .map((b) => `${b.code} ${idrShort(b.v)}`);
  const buyNet = (res.buyers || []).reduce((a, b) => a + (Number(b.netValueIdr) || 0), 0);
  const sellNet = Math.abs((res.sellers || []).reduce((a, b) => a + (Number(b.netValueIdr) || 0), 0));
  if (buyNet === 0 && sellNet === 0) return null;
  let label = null;
  let dir = null;
  let type = null;
  let codes = [];
  let netIdr = 0;
  if (buyNet !== sellNet) {
    dir = buyNet > sellNet ? "Diborong" : "Dijual";
    const dominantSide = buyNet > sellNet ? "buyers" : "sellers";
    netIdr = buyNet > sellNet ? buyNet : sellNet;
    const by = byType(res[dominantSide]);
    if (by.Asing + by.Lokal + by.BUMN > 0) {
      type = by.Asing >= by.Lokal && by.Asing >= by.BUMN ? "asing"
        : (by.Lokal >= by.BUMN ? "lokal" : "bumn");
      codes = ranked(res[dominantSide]);
      label = `${dir} ${type}${codes.length ? ` (${codes.join(", ")})` : ""}`;
    }
  }
  const det = res.bandarDetector || {};
  const accdist =
    (det.avg && det.avg.accdist) ||
    det.broker_accdist ||
    null;
  return {
    label,
    dir,
    type,
    codes,
    netIdr,
    verdict: accdist ? accdistLabel(accdist) : "n/a",
    brokerCount: Math.abs(det.number_broker_buysell || 0)
  };
}

async function watchlistBlock(wl, client) {
  const title = `👀 WATCHLIST — ${escHtml(wl.name || WATCHLIST_NAME)}`;
  if (!wl.rows.length) return section(title, noteEmpty());
  const flowBySymbol = new Map();
  const flows = await Promise.all(wl.rows.map((r) => getBrokerFlow(client, r.symbol)));
  wl.rows.forEach((r, i) => flowBySymbol.set(r.symbol, flows[i]));
  const naik = wl.rows.filter((r) => r.changePercent > 0);
  const datar = wl.rows.filter((r) => r.changePercent === 0);
  const turun = wl.rows.filter((r) => r.changePercent < 0);
  const raw = wl.rows.length <= 10
    ? [...naik, ...datar, ...turun]
    : [...naik.slice(0, WL_MOVERS_N), ...turun.slice(0, WL_MOVERS_N)];
  const lines = raw.map((r, i) => {
    const panah = r.changePercent > 0 ? "⬆" : (r.changePercent < 0 ? "⬇" : "➖");
    const pr = r.changePercent === 0 ? "0%" : pct(r.changePercent);
    const base = `${i + 1}. ${escHtml(r.symbol)}  ${harga(r.price)}  (${pr}) ${panah}`;
    const flow = flowBySymbol.get(r.symbol);
    if (!flow) return base;
    const verdict = flow.verdict === "n/a" && !flow.brokerCount
      ? ""
      : `${verdictEmoji(flow.verdict)} ${flow.verdict}${flow.brokerCount ? ` (${flow.brokerCount} broker)` : ""}`;
    const label = flow.label ? `${flow.label}` : "";
    return `${base}${verdict ? `\n${verdict}` : ""}${label ? `\n${label}` : ""}`;
  });
  return section(title, lines);
}

function pctPlain(x) {
  const v = Number(x);
  if (!Number.isFinite(v)) return "n/a";
  return `${v > 0 ? "+" : ""}${v.toFixed(2).replace(".", ",")}%`;
}

async function watchlistReview(wl, client) {
  const title = `📝 REVIEW WATCHLIST — ${escHtml(wl.name || WATCHLIST_NAME)}`;
  if (!wl.rows.length) return null;
  const detail = await Promise.all(wl.rows.map(async (r) => {
    try {
      return { row: r, f: await getBrokerFlow(client, r.symbol) };
    } catch (e) {
      return { row: r, f: null };
    }
  }));
  const by = (pred) => detail.filter((x) => pred(x.row));
  const naik = by((r) => r.changePercent > 0);
  const datar = by((r) => r.changePercent === 0);
  const turun = by((r) => r.changePercent < 0);
  const sentences = [];

  const ringkas = (x) => {
    const { row, f } = x;
    if (!f || !f.dir) return `${row.symbol} ${pctPlain(row.changePercent)}`;
    return `${row.symbol} ${pctPlain(row.changePercent)} (${f.dir.toLowerCase()} ${f.type})`;
  };

  sentences.push(
    `Dari ${detail.length} saham di watchlist ${wl.name || WATCHLIST_NAME}, ${naik.length} menguat, ${turun.length} melemah, dan ${datar.length} tanpa perubahan.`
  );
  if (naik.length) {
    sentences.push(`Saham yang menguat: ${naik.map(ringkas).join("; ")}.`);
  }
  if (turun.length) {
    sentences.push(`Sedangkan yang melemah: ${turun.map(ringkas).join("; ")}.`);
  }
  if (datar.length) {
    sentences.push(`Yang flat: ${datar.map((x) => `${x.row.symbol} ${pctPlain(x.row.changePercent)}`).join(", ")}.`);
  }
  const voiced = detail.filter((x) => x.f && x.f.dir);
  if (voiced.length) {
    const notable = voiced.slice().sort((a, b) => Math.abs(b.f.netIdr) - Math.abs(a.f.netIdr))[0];
    sentences.push(
      `Aktivitas broker paling besar di ${notable.row.symbol}: ${notable.f.dir.toLowerCase()} ${notable.f.type} sekitar ${idrShort(Math.abs(notable.f.netIdr))} ` +
      `(${notable.f.codes.map((c) => c.split(" ")[0]).join(", ")}).`
    );
  }
  return section(title, sentences);
}

function readPct(x) {
  if (x === null || x === undefined || x === "") return null;
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

function moverPct(row) {
  const c = readPct(row.changePercent);
  if (c !== null) return pct(c);
  const p = readPct(row.iepIev && row.iepIev.iepChangePrev);
  if (p !== null) return pct(p);
  return "n/a";
}

function foreignSellLine(i, row) {
  return `${i}. ${escHtml(row.symbol)}  ${harga(row.price)}  (${moverPct(row)})  ${idrShort(row.netForeignSell)}`;
}

function foreignBuyLine(i, row) {
  return `${i}. ${escHtml(row.symbol)}  ${harga(row.price)}  (${moverPct(row)})  ${idrShort(row.netForeignBuy)}`;
}

function bigMoneyLine(i, row) {
  const v = Number(row.bigMoneyNetValue);
  const arah = v >= 0 ? "🟢 akum" : "🔴 dist";
  return `${i}. ${escHtml(row.symbol)}  ${harga(row.price)}  (${moverPct(row)})  ${arah} ${idrShort(Math.abs(v))}`;
}

function indeksBlock(ihsg) {
  const tri = ihsg.change >= 0 ? "🔺" : "🔻";
  return section("📊 INDEKS", [
    `IHSG  ${price(ihsg.price)}  ${tri} ${num(Math.abs(ihsg.change))}  (${pct(ihsg.changePercent)})`
  ]);
}

function newsBlock(items) {
  const lines = items.map((it, i) => {
    const t = escHtml(it.title);
    const meta = [
      it.source ? escHtml(it.source) : null,
      it.time ? escHtml(it.time) : null
    ].filter(Boolean).join(" | ");
    const head = it.url
      ? `${i + 1}. <a href="${escHtml(it.url)}">${t}</a>`
      : `${i + 1}. ${t}`;
    return [head, meta, it.snippet ? "   " + escHtml(it.snippet) : null].filter(Boolean).join("\n");
  });
  if (!lines.length) return section("📰 BERITA UTAMA", noteEmpty());
  return section(`📰 BERITA UTAMA (${items.length})`, lines);
}

function footer(session) {
  const lines = [];
  lines.push(`Data Stockbit${session ? ` — sesi ${sessionDate(session)}` : ""}.`);
  lines.push("Informasi, bukan rekomendasi investasi.");
  return lines.join("\n");
}

function toMessages(blocks) {
  const messages = [];
  let cur = "";
  for (const b of blocks) {
    if (cur && cur.length + b.length + 2 > MAX_BLOCK) {
      messages.push(cur);
      cur = b;
    } else {
      cur = cur ? `${cur}\n\n${b}` : b;
    }
  }
  if (cur) messages.push(cur);
  return messages;
}

function kv(fn) {
  return (row, i) => fn(i + 1, row);
}

async function buildMorning(client) {
  const dateStr = wibDateTime(new Date());
  const [ihsg, aku, jual, big, news, wl] = await Promise.all([
    getIhsg(client),
    getMovers(client, "netForeignBuy", LIST_N),
    getMovers(client, "netForeignSell", LIST_N),
    getMovers(client, "bigMoneyNetValue", LIST_N),
    getNews(client, NEWS_N),
    getWatchlist(client)
  ]);

  const session = aku.session || jual.session || big.session;
  const header = [
    "<b>🌅 PRE-MARKET BRIEFING — IDX</b>",
    dateStr,
    session ? `<b>📅 Data sesi terakhir: ${sessionDate(session)}</b>` : ""
  ].filter(Boolean).join("\n");

  const blocks = [header];

  blocks.push(indeksBlock(ihsg));

  blocks.push(await preOpenBlock(wl, client));

  blocks.push(section("🟢 AKUMULASI ASING (NET BUY)", aku.rows.length
    ? aku.rows.map(kv(foreignBuyLine))
    : noteEmpty()));

  blocks.push(section("🔴 JUAL BERSIH ASING (NET SELL)", jual.rows.length
    ? jual.rows.map(kv(foreignSellLine))
    : noteEmpty()));

  blocks.push(section("🏦 RADAR MODAL BESAR / BANDAR", big.rows.length
    ? big.rows.slice(0, LIST_N).map(kv(bigMoneyLine))
    : noteEmpty()));

  blocks.push(newsBlock(news));

  blocks.push(section("🧾 CATATAN", [footer(session)]));

  return toMessages(blocks);
}

async function buildEvening(client) {
  const [ihsg, gainers, losers, aku, jual, big, news, wl] = await Promise.all([
    getIhsg(client),
    getMovers(client, "topGainer", 25),
    getMovers(client, "topLoser", 25),
    getMovers(client, "netForeignBuy", LIST_N),
    getMovers(client, "netForeignSell", LIST_N),
    getMovers(client, "bigMoneyNetValue", LIST_N),
    getNews(client, NEWS_N),
    getWatchlist(client)
  ]);

  const session = aku.session || jual.session || big.session;
  const header = [
    `<b>🌆 RECAP HARIAN IDX${session ? " — " + sessionDate(session) : ""}</b>`,
    wibDateTime(new Date())
  ].join("\n");

  const blocks = [header];

  blocks.push(indeksBlock(ihsg));

  const gainerRows = gainers.rows.filter((r) => !isWaran(r)).slice(0, LIST_N);
  const loserRows = losers.rows.filter((r) => !isWaran(r)).slice(0, LIST_N);

  blocks.push(section("🚀 TOP GAINER", gainerRows.length
    ? gainerRows.map(kv(moversLine))
    : noteEmpty()));

  blocks.push(section("📉 TOP LOSER", loserRows.length
    ? loserRows.map(kv(moversLine))
    : noteEmpty()));

  blocks.push(section("🟢 AKUMULASI ASING (NET BUY)", aku.rows.length
    ? aku.rows.map(kv(foreignBuyLine))
    : noteEmpty()));

  blocks.push(section("🔴 JUAL BERSIH ASING (NET SELL)", jual.rows.length
    ? jual.rows.map(kv(foreignSellLine))
    : noteEmpty()));

  blocks.push(await radarBlockSep("🏦 RADAR BANDAR", big, client));

  blocks.push(await watchlistBlock(wl, client));

  const review = await watchlistReview(wl, client);
  if (review) blocks.push(review);

  blocks.push(newsBlock(news));

  blocks.push(section("🧾 CATATAN", [footer(session)]));

  return toMessages(blocks);
}

async function radarBlockSep(title, big, client) {
  const lines = [];
  if (!big.rows.length) {
    return section(title, noteEmpty());
  }
  for (const row of big.rows.slice(0, 3)) {
    const v = Number(row.bigMoneyNetValue);
const arah = v >= 0 ? "🟢 akum" : "🔴 dist";
    lines.push(`${escHtml(row.symbol)}  ${harga(row.price)}  (${pct(row.changePercent)})  ${arah} ${idrShort(Math.abs(v))}`);
    try {
      const d = await getBandarDetail(client, row.symbol);
      lines.push(`🔎 ${verdictEmoji(d.verdict)} ${d.verdict}${d.brokerCount ? ` (${d.brokerCount} broker)` : ""}`);
      lines.push(...brokerGroupLines(d));
      lines.push("");
    } catch (e) {
      lines.push("   (detail broker tidak tersedia)");
      lines.push("");
    }
  }
  return section(title, lines);
}

module.exports = { buildMorning, buildEvening };