// QuantFolio — Accuracy tracking module
// Tracks predicted vs actual returns, computes error metrics.

"use strict";

const Database = require("better-sqlite3");
const path = require("path");

const db = new Database(path.join(__dirname, "quantfolio.db"));
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS predictions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    asset_id TEXT NOT NULL,
    predicted_ret REAL NOT NULL,
    predicted_price REAL NOT NULL,
    actual_price_at_pred REAL NOT NULL,
    risk_profile TEXT,
    horizon INTEGER,
    amount REAL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS actual_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    asset_id TEXT NOT NULL,
    price REAL NOT NULL,
    ret1y REAL,
    snapshot_at TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_pred_asset ON predictions(asset_id);
  CREATE INDEX IF NOT EXISTS idx_pred_date ON predictions(created_at);
  CREATE INDEX IF NOT EXISTS idx_snap_date ON actual_snapshots(snapshot_at);
`);

// Snapshots are only ever read as "latest price per asset", so collapse the
// table to one row per asset. Without this it grows unbounded (one row per
// asset per save) and the latest-price lookup degrades badly.
db.exec(`
  DELETE FROM actual_snapshots
  WHERE id NOT IN (SELECT MAX(id) FROM actual_snapshots GROUP BY asset_id);
  DROP INDEX IF EXISTS idx_snap_asset;
  CREATE UNIQUE INDEX IF NOT EXISTS idx_snap_asset ON actual_snapshots(asset_id);
`);

const insertPrediction = db.prepare(`
  INSERT INTO predictions(asset_id, predicted_ret, predicted_price, actual_price_at_pred, risk_profile, horizon, amount)
  VALUES(?, ?, ?, ?, ?, ?, ?)
`);

const insertSnapshot = db.prepare(`
  INSERT INTO actual_snapshots(asset_id, price, ret1y) VALUES(?, ?, ?)
  ON CONFLICT(asset_id) DO UPDATE SET price = excluded.price, ret1y = excluded.ret1y, snapshot_at = datetime('now')`);

const getPredictions = db.prepare(`
  SELECT * FROM predictions ORDER BY created_at DESC LIMIT ?`);

const getPredictionsByAsset = db.prepare(`
  SELECT * FROM predictions WHERE asset_id = ? ORDER BY created_at DESC`);

const getPredictionsSince = db.prepare(`
  SELECT * FROM predictions WHERE created_at >= ? ORDER BY created_at ASC
`);

const getSnapshotsSince = db.prepare(`
  SELECT * FROM actual_snapshots WHERE asset_id = ? AND snapshot_at >= ? ORDER BY snapshot_at ASC
`);

const getLatestSnapshot = db.prepare(`
  SELECT * FROM actual_snapshots WHERE asset_id = ? ORDER BY snapshot_at DESC LIMIT 1`);

const countPredictions = db.prepare(`SELECT COUNT(*) as cnt FROM predictions`);

// Does a prediction for this asset+profile+horizon already exist today?
const hasToday = db.prepare(`
  SELECT COUNT(*) AS c FROM predictions
  WHERE asset_id = ? AND ifnull(risk_profile,'') = ? AND ifnull(horizon,0) = ? AND date(created_at) = date('now')
`);

// Latest persisted snapshot price per asset (one row per asset, see schema)
const latestSnapAll = db.prepare(`
  SELECT asset_id, price FROM actual_snapshots
`);

const MIN_AGE_MS = 24 * 60 * 60 * 1000; // predictions must be 24h old before counting

const utcDate = (s) => new Date(String(s || "").replace(" ", "T") + "Z");

// Save a snapshot of current live prices for all assets
function saveSnapshots(assets) {
  const txn = db.transaction((list) => {
    for (const a of list) {
      if (a.price > 0) {
        insertSnapshot.run(a.id, a.price, a.ret1y != null ? a.ret1y : null);
      }
    }
  });
  txn(assets);
}

// Log predictions when a plan is generated.
// Deduplicates: at most one row per (asset, risk profile, horizon) per day,
// so repeated plan requests don't flood the table with 0%-return rows.
function logPlanPredictions(plan) {
  if (!plan || !Array.isArray(plan.picks)) return;
  const txn = db.transaction((picks) => {
    for (const p of picks) {
      const dup = hasToday.get(p.id, plan.riskProfile || "", plan.horizon || 0);
      if (dup.c > 0) continue;
      insertPrediction.run(
        p.id,
        p.ret || 0,
        p.price,
        p.price,
        plan.riskProfile || null,
        plan.horizon || null,
        plan.amount || null
      );
    }
  });
  txn(plan.picks);
}

// Evaluate a single prediction: compare predicted return vs actual price movement.
// The logged prediction is an annualised CAGR target; the actual figure is the
// price move observed so far. Comparing the two directly would always look like a
// huge over-prediction, so the prediction is first scaled to the elapsed window.
function evaluatePrediction(pred, currentPrice, now) {
  const actualReturn = ((currentPrice - pred.actual_price_at_pred) / pred.actual_price_at_pred) * 100;
  const ageMs = now - utcDate(pred.created_at);
  const ageDays = ageMs / (24 * 60 * 60 * 1000);
  const elapsedYears = Math.max(0, ageMs) / (365 * 24 * 60 * 60 * 1000);
  const predictedPeriod = (Math.pow(1 + pred.predicted_ret / 100, elapsedYears) - 1) * 100;
  const error = predictedPeriod - actualReturn;
  const absError = Math.abs(error);
  const pctError = predictedPeriod !== 0
    ? Math.abs(error / predictedPeriod) * 100
    : (actualReturn !== 0 ? 100 : 0);
  const directionCorrect =
    (predictedPeriod >= 0 && actualReturn >= 0) ||
    (predictedPeriod < 0 && actualReturn < 0);

  return {
    asset_id: pred.asset_id,
    predicted_ret: +pred.predicted_ret.toFixed(2),
    predicted_period: +predictedPeriod.toFixed(2),
    actual_return: +actualReturn.toFixed(2),
    error: +error.toFixed(2),
    abs_error: +absError.toFixed(2),
    pct_error: +pctError.toFixed(2),
    direction_correct: directionCorrect,
    age_days: +ageDays.toFixed(1),
    age_hours: +Math.max(0, ageMs / (60 * 60 * 1000)).toFixed(1),
    predicted_price: pred.predicted_price,
    actual_price_at_pred: pred.actual_price_at_pred,
    current_price: currentPrice,
    created_at: pred.created_at,
    risk_profile: pred.risk_profile,
    horizon: pred.horizon,
  };
}

// Build a map of asset_id -> latest persisted snapshot price
function latestPrices() {
  const map = {};
  for (const r of latestSnapAll.all()) map[r.asset_id] = r.price;
  return map;
}

// Split predictions into those aged past MIN_AGE and those still too fresh
function splitByAge(preds, minAgeMs) {
  const now = Date.now();
  const aged = [];
  const fresh = [];
  for (const pred of preds) {
    if (now - utcDate(pred.created_at).getTime() >= minAgeMs) aged.push(pred);
    else fresh.push(pred);
  }
  return { aged, fresh, now };
}

// Get all evaluations for predictions since a given date.
// Only predictions older than minAgeHrs are evaluated; the rest are reported
// as "awaiting age" so brand-new predictions never show a misleading 0%.
function getEvaluations(sinceDate, assets, minAgeHrs) {
  const preds = sinceDate
    ? getPredictionsSince.all(sinceDate)
    : getPredictions.all(1000);

  if (!preds.length) return { evaluations: [], tooFresh: 0, metrics: null };

  const minAgeMs = (minAgeHrs != null ? +minAgeHrs : 24) * 60 * 60 * 1000;
  const { aged, fresh, now } = splitByAge(preds, minAgeMs);
  const prices = latestPrices();

  const evaluations = [];
  for (const pred of aged) {
    const asset = assets.find((a) => a.id === pred.asset_id);
    const currentPrice = prices[pred.asset_id] != null ? prices[pred.asset_id] : (asset ? asset.price : null);
    if (currentPrice == null || currentPrice <= 0) continue;
    evaluations.push(evaluatePrediction(pred, currentPrice, now));
  }

  const metrics = computeMetrics(evaluations);
  return { evaluations, tooFresh: fresh.length, metrics };
}

// Compute aggregate accuracy metrics
function computeMetrics(evaluations) {
  if (!evaluations.length) return null;

  const n = evaluations.length;
  const errors = evaluations.map((e) => e.error);
  const absErrors = evaluations.map((e) => e.abs_error);
  const pctErrors = evaluations.map((e) => e.pct_error);
  const predicted = evaluations.map((e) => e.predicted_period);
  const actual = evaluations.map((e) => e.actual_return);

  const mae = absErrors.reduce((s, e) => s + e, 0) / n;
  const mape = pctErrors.reduce((s, e) => s + e, 0) / n;
  const mse = errors.reduce((s, e) => s + e * e, 0) / n;
  const rmse = Math.sqrt(mse);
  const bias = errors.reduce((s, e) => s + e, 0) / n;

  const directionCorrect = evaluations.filter((e) => e.direction_correct).length;
  const directionAccuracy = (directionCorrect / n) * 100;

  const meanPred = predicted.reduce((s, v) => s + v, 0) / n;
  const meanActual = actual.reduce((s, v) => s + v, 0) / n;

  let ssRes = 0;
  let ssTot = 0;
  for (let i = 0; i < n; i++) {
    ssRes += (actual[i] - predicted[i]) ** 2;
    ssTot += (actual[i] - meanActual) ** 2;
  }
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : null;

  const within5 = evaluations.filter((e) => e.abs_error <= 5).length;
  const within10 = evaluations.filter((e) => e.abs_error <= 10).length;

  return {
    total_predictions: n,
    mae: +mae.toFixed(2),
    mape: +mape.toFixed(2),
    rmse: +rmse.toFixed(2),
    bias: +bias.toFixed(2),
    direction_accuracy: +directionAccuracy.toFixed(1),
    r_squared: r2 != null ? +r2.toFixed(4) : null,
    within_5pct: +((within5 / n) * 100).toFixed(1),
    within_10pct: +((within10 / n) * 100).toFixed(1),
    mean_predicted: +meanPred.toFixed(2),
    mean_actual: +meanActual.toFixed(2),
    best_pred: evaluations.reduce((best, e) => e.abs_error < best.abs_error ? e : best),
    worst_pred: evaluations.reduce((worst, e) => e.abs_error > worst.abs_error ? e : worst),
  };
}

// Accuracy by risk profile
function metricsByProfile(sinceDate, assets, minAgeHrs) {
  const preds = sinceDate
    ? getPredictionsSince.all(sinceDate)
    : getPredictions.all(1000);

  const minAgeMs = (minAgeHrs != null ? +minAgeHrs : 24) * 60 * 60 * 1000;
  const { aged, now } = splitByAge(preds, minAgeMs);
  const prices = latestPrices();

  const grouped = {};
  for (const pred of aged) {
    const profile = pred.risk_profile || "unknown";
    if (!grouped[profile]) grouped[profile] = [];
    const asset = assets.find((a) => a.id === pred.asset_id);
    const currentPrice = prices[pred.asset_id] != null ? prices[pred.asset_id] : (asset ? asset.price : null);
    if (currentPrice == null || currentPrice <= 0) continue;
    grouped[profile].push(evaluatePrediction(pred, currentPrice, now));
  }

  const result = {};
  for (const [profile, evals] of Object.entries(grouped)) {
    result[profile] = computeMetrics(evals);
  }
  return result;
}

// Accuracy by asset type (stock, mf, etf, debt)
function metricsByType(sinceDate, assets, minAgeHrs) {
  const preds = sinceDate
    ? getPredictionsSince.all(sinceDate)
    : getPredictions.all(1000);

  const minAgeMs = (minAgeHrs != null ? +minAgeHrs : 24) * 60 * 60 * 1000;
  const { aged, now } = splitByAge(preds, minAgeMs);
  const prices = latestPrices();

  const grouped = {};
  for (const pred of aged) {
    const asset = assets.find((a) => a.id === pred.asset_id);
    if (!asset || asset.price <= 0) continue;
    const type = asset.type || "unknown";
    if (!grouped[type]) grouped[type] = [];
    const currentPrice = prices[pred.asset_id] != null ? prices[pred.asset_id] : asset.price;
    grouped[type].push(evaluatePrediction(pred, currentPrice, now));
  }

  const result = {};
  for (const [type, evals] of Object.entries(grouped)) {
    result[type] = computeMetrics(evals);
  }
  return result;
}

// Summary: overall + by profile + by type
function fullAccuracyReport(assets, minAgeHrs) {
  const total = countPredictions.get();
  const { evaluations, tooFresh, metrics } = getEvaluations(null, assets, minAgeHrs);
  const byProfile = metricsByProfile(null, assets, minAgeHrs);
  const byType = metricsByType(null, assets, minAgeHrs);

  return {
    total_predictions_stored: total.cnt,
    total_evaluable: evaluations.length,
    awaiting_age: tooFresh,
    min_age_hours: minAgeHrs != null ? +minAgeHrs : 24,
    overall: metrics,
    by_profile: byProfile,
    by_type: byType,
  };
}

module.exports = {
  saveSnapshots,
  logPlanPredictions,
  getEvaluations,
  computeMetrics,
  metricsByProfile,
  metricsByType,
  fullAccuracyReport,
};
