// 3-year (and shorter) chart data helper for QuantFolio explorer.
"use strict";

const { assets } = require("./data");

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const YA = { "User-Agent": UA, Accept: "application/json" };

const RANGES = {
  "1d": { interval: "5m", yahooRange: "1d", days: 2 },
  "1w": { interval: "1h", yahooRange: "5d", days: 6 },
  "1m": { interval: "1d", yahooRange: "1mo", days: 22 },
  "1y": { interval: "1wk", yahooRange: "1y", days: 252 },
  "3y": { interval: "1mo", yahooRange: "3y", days: 756 }
};

const YAHOO = {
  RELIANCE: "RELIANCE.NS", TCS: "TCS.NS", HDFCBANK: "HDFCBANK.NS", INFY: "INFY.NS",
  ITC: "ITC.NS", SBIN: "SBIN.NS", HINDUNILVR: "HINDUNILVR.NS", LT: "LT.NS", AXISBANK: "AXISBANK.NS",
  BHARTIARTL: "BHARTIARTL.NS", TITAN: "TITAN.NS", TATAMOTORS: "TMCV.NS", MARUTI: "MARUTI.NS",
  WIPRO: "WIPRO.NS", SUNPHARMA: "SUNPHARMA.NS", ASIANPAINT: "ASIANPAINT.NS", DMART: "DMART.NS",
  BAJFINANCE: "BAJFINANCE.NS", ICICIBANK: "ICICIBANK.NS", HCLTECH: "HCLTECH.NS",
  ETF_NIFTYBEES: "NIFTYBEES.NS", ETF_SENSEX: "HDFCSENSEX.NS", ETF_BANK: "BANKBEES.NS",
  ETF_JRBEES: "JUNIORBEES.NS", ETF_IT: "ITBEES.NS", ETF_MID150: "MID150BEES.NS",
  GOLD_SBI: "GOLDBEES.NS", GOLD_ICICI: "GOLDETF.NS",
};

const MF_PHRASES = {
  MF_UTI_N50: ["uti nifty 50 index"], MF_HDFC_SENSEX: ["hdfc", "sensex"], MF_PARAG: ["parag parikh flexi"],
  MF_MIRAE: ["mirae asset large cap fund"], MF_ICICI_BLUE: ["icici", "bluechip"], MF_SBI_SMALL: ["sbi", "small cap"],
  MF_AXIS_ELSS: ["axis", "elss"], MF_NIP_LARGE: ["nippon", "large cap"], MF_QUANT: ["quant flexi cap"],
  MF_SBI_MID: ["sbi midcap fund"], MF_UTI_MID_IDX: ["uti nifty midcap 150 index"],
  MF_NIFTY_SMALL_IDX: ["nifty smallcap 250 index"], MF_ICICI_SMALL: ["icici prudential small cap fund"],
};

function hashInt(str) { let h = 2166136261 >>> 0; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function mulberry32(a) { return function () { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

const cache = new Map();
const TTL = 15 * 60 * 1000;

function businessDaysBack(n) {
  const out = [];
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  while (out.length < n) {
    if (d.getDay() !== 0 && d.getDay() !== 6) out.unshift(new Date(d));
    d.setDate(d.getDate() - 1);
  }
  return out;
}

function syntheticSeries(asset, range) {
  const days = (RANGES[range] || RANGES["3y"]).days;
  const n = days;
  const rand = mulberry32(hashInt(asset.id));
  const mu = ((asset.ret || 10) / 100);
  const sigma = 0.018;
  const dt = 1 / 252;
  const dates = businessDaysBack(n + 1);
  const closes = [];
  let price = asset.price / Math.exp(mu * dt * n);
  for (let i = 0; i < dates.length; i++) {
    const z = (rand() + rand() + rand() + rand() - 2) / Math.sqrt(4 / 3);
    price = price * Math.exp((mu - 0.5 * sigma * sigma) * dt + sigma * Math.sqrt(dt) * z);
    price = Math.max(1, +price.toFixed(2));
    closes.push(price);
  }
  const labels = dates.map((dt2) => {
    if (range === "1d") return dt2.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
    if (range === "1w") return dt2.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
    return dt2.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "2-digit" });
  });
  return { labels, closes };
}

async function yahooSeries(symbol, range) {
  const cfg = RANGES[range] || RANGES["3y"];
  const url = "https://query1.finance.yahoo.com/v8/finance/chart/" + encodeURIComponent(symbol) + "?interval=" + cfg.interval + "&range=" + cfg.yahooRange;
  const r = await fetch(url, { headers: YA, redirect: "follow" });
  if (!r.ok) throw new Error("yahoo " + r.status);
  const json = await r.json();
  const res = json.chart && json.chart.result && json.chart.result[0];
  if (!res || !res.timestamp) throw new Error("bad yahoo");
  const closes = (res.indicators && res.indicators.quote && res.indicators.quote[0] && res.indicators.quote[0].close) || [];
  const labels = []; const data = [];
  res.timestamp.forEach((ts, i) => {
    const c = closes[i];
    if (c == null || !isFinite(c) || c <= 0) return;
    const dt = new Date(ts * 1000);
    let label;
    if (range === "1d") label = dt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
    else if (range === "1w") label = dt.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
    else if (range === "1m") label = dt.toLocaleString("en-IN", { day: "2-digit", month: "short" });
    else if (range === "1y") label = dt.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "2-digit" });
    else label = dt.toLocaleString("en-IN", { month: "short", year: "2-digit" });
    labels.push(label);
    data.push(+ (+c).toFixed(2));
  });
  if (data.length < 2) throw new Error("no yahoo data");
  return { labels, data };
}

let mfCodes = null;
async function getMfCodes() {
  if (mfCodes) return mfCodes;
  const found = new Map();
  const r = await fetch("https://api.mfapi.in/mf", { headers: YA });
  if (!r.ok) throw new Error("mfapi meta " + r.status);
  const all = await r.json();
  const list = (Array.isArray(all) ? all : []).map((s) => ({ name: String(s.schemeName || "").toLowerCase(), code: +s.schemeCode }));
  function match(tokens) {
    const hits = list.filter((s) => tokens.every((t) => s.name.includes(t)));
    if (!hits.length) return null;
    const direct = hits.filter((s) => s.name.includes("direct plan") && s.name.includes("growth"));
    const pool2 = direct.length ? direct : hits; pool2.sort((a, b) => b.name.length - a.name.length);
    return pool2[0];
  }
  for (const id of Object.keys(MF_PHRASES)) {
    const m = match(MF_PHRASES[id]);
    if (m) found.set(id, { code: m.code, name: m.name });
  }
  mfCodes = found;
  return found;
}

async function mfSeries(asset, range) {
  const codes = await getMfCodes();
  const c = codes.get(asset.id);
  if (!c) throw new Error("no mf code");
  const r = await fetch("https://api.mfapi.in/mf/" + c.code, { headers: YA });
  if (!r.ok) throw new Error("mfapi " + r.status);
  const json = await r.json();
  const rows = (json.data || []).filter((d) => +d.nav > 0).map((d) => ({
    date: new Date(d.date.split("-").reverse().join("-")),
    nav: +d.nav
  })).filter((x) => !isNaN(x.date)).sort((a, b) => a.date - b.date);
  if (!rows.length) throw new Error("no nav");

  const cutoffDays = (RANGES[range] || RANGES["3y"]).days;
  const cutoff = new Date(Date.now() - cutoffDays * 86400000 * 1.35);
  let filtered = rows.filter((x) => x.date >= cutoff);
  if (filtered.length < 2) filtered = rows.slice(-Math.max(2, filtered.length || 2));

  if (range === "3y") {
    const byMonth = new Map();
    for (const x of filtered) {
      const key = x.date.getFullYear() + "-" + String(x.date.getMonth() + 1).padStart(2, "0");
      byMonth.set(key, x.nav);
    }
    const keys = Array.from(byMonth.keys()).sort();
    const labels = keys.map((k) => { const [y, m] = k.split("-"); return new Date(+y, +m - 1, 1).toLocaleString("en-IN", { month: "short", year: "2-digit" }); });
    const data = keys.map((k) => +byMonth.get(k).toFixed(4));
    return { labels, data };
  }

  const labels = filtered.map((x) => x.date.toLocaleString("en-IN", { day: "2-digit", month: "short", year: range === "1y" ? "2-digit" : undefined }).trim());
  const data = filtered.map((x) => +x.nav.toFixed(4));
  return { labels, data };
}

function retCalc(data) {
  const s = data[0], e = data[data.length - 1];
  return s > 0 ? +((e / s - 1) * 100).toFixed(1) : null;
}

async function getChart(asset, range = "3y") {
  const r = (RANGES[range] ? range : "3y");
  const key = asset.id + ":" + r;
  const c = cache.get(key);
  if (c && Date.now() - c.at < TTL) return c.value;

  let result;
  try {
    if (asset.type === "stock" || asset.type === "etf") {
      const sym = YAHOO[asset.id];
      if (sym) {
        const s = await yahooSeries(sym, r);
        result = { id: asset.id, range: r, labels: s.labels, prices: s.data, ret: retCalc(s.data), source: "yahoo" };
      } else {
        const s = syntheticSeries(asset, r);
        result = { id: asset.id, range: r, labels: s.labels, prices: s.closes, ret: retCalc(s.closes), source: "synthetic" };
      }
    } else if (asset.type === "mf") {
      const s = await mfSeries(asset, r);
      result = { id: asset.id, range: r, labels: s.labels, prices: s.data, ret: retCalc(s.data), source: "mfapi" };
    } else {
      const s = syntheticSeries(asset, r);
      result = { id: asset.id, range: r, labels: s.labels, prices: s.closes, ret: retCalc(s.closes), source: "synthetic" };
    }
  } catch (e) {
    const s = syntheticSeries(asset, r);
    result = { id: asset.id, range: r, labels: s.labels, prices: s.closes, ret: retCalc(s.closes), source: "synthetic", warning: e.message };
  }

  const normalized = {
    id: result.id, range: result.range, interval: (RANGES[result.range] || {}).interval,
    labels: result.labels, prices: result.prices, ret3y: result.ret, ret: result.ret,
    source: result.source, warning: result.warning
  };
  cache.set(key, { at: Date.now(), value: normalized });
  return normalized;
}

module.exports = { getChart };
