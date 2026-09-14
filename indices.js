// Live NSE & BSE index fetcher with short TTL cache.
// Primary source: NSE allIndices API. Fallback: Yahoo Finance chart API.
// Node 22 global fetch is used; no external dependency.

const TTL = 60 * 1000;

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const NSE_MAP = {
  "NIFTY 50": "NIFTY",
  "NIFTY BANK": "BANKNIFTY",
  "NIFTY MIDCAP 50": "MIDCAPNIFTY",
  "NIFTY IT": "NIFTYIT",
};

let cache = null;
let cacheAt = 0;

async function nseCookies() {
  const res = await fetch("https://www.nseindia.com/", {
    headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml" },
    redirect: "follow",
  });
  const set =
    typeof res.headers.getSetCookie === "function"
      ? res.headers.getSetCookie()
      : [res.headers.get("set-cookie") || ""];
  return set
    .filter(Boolean)
    .map((c) => c.split(";")[0])
    .join("; ");
}

async function fetchNse(cookie) {
  const res = await fetch("https://www.nseindia.com/api/allIndices", {
    headers: {
      "User-Agent": UA,
      Accept: "*/*",
      "Accept-Language": "en-US,en;q=0.9",
      "Accept-Encoding": "gzip, deflate",
      Referer: "https://www.nseindia.com/",
      Cookie: cookie,
    },
  });
  if (!res.ok) throw new Error("NSE HTTP " + res.status);
  const json = await res.json();
  const rows = (json.data || []).filter((d) => NSE_MAP[d.index]);
  if (!rows.length) throw new Error("NSE returned no index rows");
  return rows.map((d) => {
    const last = +d.last || 0;
    const change = +(d.change ?? d.variation ?? 0) || 0;
    const pct = +(d.percentChange ?? d.pChange ?? 0) || 0;
    return {
      code: NSE_MAP[d.index],
      name: d.index,
      last: +last.toFixed(2),
      change: +change.toFixed(2),
      changePct: +pct.toFixed(2),
    };
  });
}

async function fetchYahoo(symbol, name, code) {
  const res = await fetch(
    `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`,
    {
      headers: { "User-Agent": UA, Accept: "application/json" },
    },
  );
  if (!res.ok) throw new Error("Yahoo HTTP " + res.status);
  const json = await res.json();
  const meta =
    json.chart &&
    json.chart.result &&
    json.chart.result[0] &&
    json.chart.result[0].meta;
  if (!meta) throw new Error("Yahoo returned no meta");
  const last = +meta.regularMarketPrice || 0;
  const prev = +meta.chartPreviousClose || last;
  const change = last - prev;
  return {
    code,
    name,
    last: +last.toFixed(2),
    change: +change.toFixed(2),
    changePct: prev ? +((change / prev) * 100).toFixed(2) : 0,
  };
}

async function getLiveIndices() {
  if (cache && Date.now() - cacheAt < TTL) return cache;

  const out = [];
  let cookie = "";
  try {
    cookie = await nseCookies();
  } catch (e) {
    /* fall through */
  }
  try {
    out.push(...(await fetchNse(cookie)));
  } catch (e) {
    /* fall back */
  }
  try {
    out.push(await fetchYahoo("%5EBSESN", "SENSEX", "SENSEX"));
  } catch (e) {
    /* optional */
  }
  if (!out.length) {
    try {
      out.push(await fetchYahoo("%5ENSEI", "NIFTY 50", "NIFTY"));
    } catch (e) {
      /* optional */
    }
  }
  if (!out.length) throw new Error("No index provider reachable");
  cache = out;
  cacheAt = Date.now();
  return out;
}

module.exports = { getLiveIndices };
