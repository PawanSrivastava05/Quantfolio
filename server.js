const express = require('express');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { assets, PROFILES, buildPlan } = require('./data');
const { getLiveIndices } = require('./indices');
const { getFx } = require('./fx');

const PORT_HTTP = 5173, PORT_HTTPS = 8443;
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---------- Database (SQLite) ----------
const db = new Database(path.join(__dirname, 'quantfolio.db'));
db.pragma('journal_mode = WAL');
db.exec(`CREATE TABLE IF NOT EXISTS holdings(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_id TEXT NOT NULL,
  units REAL NOT NULL,
  invested REAL NOT NULL,
  created_at TEXT DEFAULT (datetime('now')))`);
const findAsset = id => assets.find(a => a.id === id);

// ---------- Request parsing ----------
const PROFILE_IDS = Object.keys(PROFILES);
const LEGACY_RISK = { low: 'conservative', medium: 'balanced', high: 'aggressive' };

function parseRiskProfile(v) {
  const x = String(v || '').toLowerCase();
  if (PROFILE_IDS.includes(x)) return x;
  return LEGACY_RISK[x] || 'balanced';
}

function parseAmount(v) {
  const n = +v;
  if (!Number.isFinite(n)) return 50000;
  return Math.min(10000000, Math.max(1000, Math.round(n)));
}

function parseHorizon(v) {
  const n = Math.round(+v);
  if (!Number.isFinite(n)) return 5;
  return Math.min(30, Math.max(1, n));
}

// ---------- Response payload validation ----------
function validatePlan(plan) {
  if (!plan || typeof plan !== 'object') return { valid: false, error: 'plan generation failed' };
  const { riskProfile, buckets, picks, projection, annual, final, maxCAGR, horizon } = plan;
  if (!PROFILES[riskProfile]) return { valid: false, error: 'invalid risk profile' };
  if (!buckets || Math.abs(buckets.equity + buckets.debt + buckets.gold - 100) > 1) return { valid: false, error: 'allocation buckets do not sum to 100' };
  if (!Array.isArray(picks)) return { valid: false, error: 'picks missing' };
  for (const p of picks) {
    if (!p || !p.id || !(p.price > 0) || !(p.units > 0) || !(p.amount > 0)) return { valid: false, error: `invalid pick: ${p && p.id}` };
  }
  if (!Number.isFinite(annual) || annual <= 0 || annual > maxCAGR[1] + 0.01) return { valid: false, error: 'annual CAGR outside profile bounds' };
  if (!Array.isArray(projection) || projection.length !== horizon + 1) return { valid: false, error: 'projection length mismatch' };
  for (const row of projection) {
    if (!row || !Number.isFinite(row.base) || !Number.isFinite(row.low) || !Number.isFinite(row.high)) return { valid: false, error: 'projection values invalid' };
  }
  if (!Number.isFinite(final) || final <= 0) return { valid: false, error: 'final value invalid' };
  return { valid: true };
}

// ---------- API ----------
app.get('/api/assets', (req, res) => res.json(assets));

app.get('/api/indices', async (req, res) => {
  try {
    res.json(await getLiveIndices());
  } catch (e) {
    res.status(502).json({ error: 'Live indices unavailable', detail: e.message });
  }
});

app.get('/api/fx', async (req, res) => {
  try {
    res.json(await getFx());
  } catch (e) {
    res.status(502).json({ error: 'FX rate unavailable', detail: e.message });
  }
});

const planHandler = (req, res) => {
  const riskProfile = parseRiskProfile(req.query.riskProfile != null ? req.query.riskProfile : req.query.risk);
  const amount = parseAmount(req.query.amount);
  const horizon = parseHorizon(req.query.horizon != null ? req.query.horizon : req.query.years);
  const plan = buildPlan({ riskProfile, amount, horizon });
  const v = validatePlan(plan);
  if (!v.valid) return res.status(500).json({ error: v.error });
  res.json(plan);
};
app.get('/api/plan', planHandler);
app.get('/api/recommend', planHandler);

app.get('/api/portfolio', (req, res) => {
  res.json(db.prepare('SELECT * FROM holdings').all().map(r => ({ ...r, asset: findAsset(r.asset_id) })));
});

app.post('/api/portfolio', (req, res) => {
  const a = findAsset(req.body.asset_id);
  if (!a) return res.status(400).json({ error: 'unknown asset' });
  const units = req.body.units == null ? +(a.min / a.price) : +req.body.units;
  if (!Number.isFinite(units) || units <= 0) return res.status(400).json({ error: 'invalid units' });
  const info = db.prepare('INSERT INTO holdings(asset_id, units, invested) VALUES(?,?,?)').run(a.id, units, Math.round(units * a.price));
  res.json({ id: info.lastInsertRowid });
});

app.delete('/api/portfolio/:id', (req, res) => {
  db.prepare('DELETE FROM holdings WHERE id=?').run(+req.params.id);
  res.json({ ok: true });
});

// ---------- HTTP (primary, http://localhost:5173) ----------
app.listen(PORT_HTTP, () => console.log(`QuantFolio running on http://localhost:${PORT_HTTP}`));

// ---------- HTTP -> HTTP redirect (legacy 8080) ----------
http.createServer((req, res) => { res.writeHead(301, { Location: `http://localhost:${PORT_HTTP}${req.url}` }); res.end(); }).listen(8080);

// ---------- HTTPS (optional, self-signed) ----------
const key = path.join(__dirname, 'key.pem'), cert = path.join(__dirname, 'cert.pem');
if (fs.existsSync(key) && fs.existsSync(cert)) {
  https.createServer({ key: fs.readFileSync(key), cert: fs.readFileSync(cert) }, app).listen(PORT_HTTPS, () =>
    console.log(`QuantFolio running on HTTPS: https://localhost:${PORT_HTTPS}`));
} else {
  console.log('HTTPS certs missing. Run: npm run cert  (then npm start)');
}
