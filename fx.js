// Live USD → INR exchange rate with short TTL cache.
// Primary source: Yahoo Finance chart API (USDINR=X).
// Fallback: open.er-api.com (no API key needed).
// Node 22 global fetch is used; no external dependency.

const TTL = 60 * 1000;

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

let cache = null;
let cacheAt = 0;

async function fetchYahoo() {
  const res = await fetch(
    "https://query1.finance.yahoo.com/v8/finance/chart/USDINR=X?interval=1d&range=1d",
    { headers: { "User-Agent": UA, Accept: "application/json" } },
  );
  if (!res.ok) throw new Error("Yahoo HTTP " + res.status);
  const json = await res.json();
  const meta =
    json.chart &&
    json.chart.result &&
    json.chart.result[0] &&
    json.chart.result[0].meta;
  if (!meta) throw new Error("Yahoo returned no meta");
  const rate = +meta.regularMarketPrice || 0;
  const prev = +meta.chartPreviousClose || rate;
  if (!rate) throw new Error("Yahoo returned no rate");
  const change = rate - prev;
  return {
    base: "USD",
    quote: "INR",
    rate: +rate.toFixed(2),
    change: +change.toFixed(2),
    changePct: prev ? +((change / prev) * 100).toFixed(3) : 0,
  };
}

async function fetchOpenEr() {
  const res = await fetch("https://open.er-api.com/v6/latest/USD", {
    headers: { "User-Agent": UA, Accept: "application/json" },
  });
  if (!res.ok) throw new Error("er-api HTTP " + res.status);
  const json = await res.json();
  const rate = +(json.rates && json.rates.INR) || 0;
  if (!rate) throw new Error("er-api returned no INR rate");
  return { base: "USD", quote: "INR", rate: +rate.toFixed(2), change: 0, changePct: 0 };
}

async function getFx() {
  if (cache && Date.now() - cacheAt < TTL) return cache;
  let v;
  try {
    v = await fetchYahoo();
  } catch (e) {
    v = await fetchOpenEr();
  }
  cache = v;
  cacheAt = Date.now();
  return v;
}

module.exports = { getFx };