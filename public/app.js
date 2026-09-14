/* QuantFolio — frontend logic */
"use strict";

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

const INTL0 = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const INTL1 = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1 });
const inr = (n) => "\u20B9" + INTL0.format(Math.round(n));
const inr0 = (n) => INTL0.format(Math.round(n));

const CLASS_OF = (a) =>
  a.cat === "gold"
    ? "Gold"
    : a.cat === "debt"
      ? "Debt"
      : a.type === "stock"
        ? "Share"
        : a.type === "mf"
          ? "Mutual Fund"
          : "ETF";

const CAT_META = {
  equity: { label: "Equity", color: "#2563eb" },
  gold: { label: "Gold", color: "#d97706" },
  debt: { label: "Debt", color: "#0891b2" },
};

const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );

const state = {
  amount: 50000,
  profile: "balanced",
  horizon: 7,
  plan: null,
  timer: null,
};

/* Charts */

const TOOLTIP_BASE = {
  backgroundColor: "#111827",
  titleColor: "#9ca3af",
  bodyColor: "#f3f4f6",
  padding: 10,
  cornerRadius: 4,
  displayColors: false,
  titleFont: { family: "Inter, sans-serif", size: 11, weight: "500" },
  bodyFont: { family: "'DM Mono', monospace", size: 12, weight: "500" },
  callbacks: { label: (c) => `${c.label}: ${inr(c.parsed)}` },
};

const centerText = {
  id: "centerText",
  afterDraw(chart) {
    if (chart.config.type !== "doughnut") return;
    const { ctx, chartArea } = chart;
    const cx = (chartArea.left + chartArea.right) / 2;
    const cy = (chartArea.top + chartArea.bottom) / 2;
    ctx.save();
    ctx.textAlign = "center";
    ctx.fillStyle = "#9ca3af";
    ctx.font = "500 10px Inter, sans-serif";
    ctx.fillText("DEPLOYED", cx, cy - 10);
    ctx.fillStyle = "#111827";
    ctx.font = "500 18px 'DM Mono', monospace";
    ctx.fillText(state.plan ? inr0(state.plan.amount) : "\u2014", cx, cy + 10);
    ctx.restore();
  },
};

const allocationChart = new Chart($("#allocationChart"), {
  type: "doughnut",
  data: {
    labels: [],
    datasets: [
      {
        data: [],
        backgroundColor: [],
        borderColor: "#ffffff",
        borderWidth: 2,
        hoverOffset: 4,
      },
    ],
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    cutout: "70%",
    plugins: {
      legend: { display: false },
      tooltip: TOOLTIP_BASE,
    },
  },
  plugins: [centerText],
});

const growAxisLabel = (v) => {
  const abs = Math.abs(v);
  if (abs >= 1e7) return `\u20B9${(v / 1e7).toFixed(1)}Cr`;
  if (abs >= 1e5) return `\u20B9${(v / 1e5).toFixed(1)}L`;
  if (abs >= 1e3) return `\u20B9${(v / 1e3).toFixed(0)}K`;
  return `\u20B9${Math.round(v)}`;
};

const growthChart = new Chart($("#growthChart"), {
  type: "line",
  data: {
    labels: [],
    datasets: [
      {
        label: "Low (P10)",
        data: [],
        borderColor: "rgba(37, 99, 235, 0.4)",
        borderDash: [5, 5],
        borderWidth: 1.5,
        pointRadius: 0,
        fill: false,
      },
      {
        label: "High (P90)",
        data: [],
        borderColor: "rgba(37, 99, 235, 0.4)",
        borderDash: [5, 5],
        borderWidth: 1.5,
        pointRadius: 0,
        backgroundColor: "rgba(37, 99, 235, 0.07)",
        fill: 0,
      },
      {
        label: "Expected",
        data: [],
        borderColor: "#2563eb",
        borderWidth: 3,
        tension: 0.35,
        pointRadius: 3,
        pointBackgroundColor: "#ffffff",
        pointBorderColor: "#2563eb",
        pointBorderWidth: 2,
        fill: false,
      },
    ],
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        ...TOOLTIP_BASE,
        callbacks: {
          title: (items) => (items.length ? items[0].label : ""),
          label: (c) => `${c.dataset.label}: ${inr(c.parsed.y)}`,
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        border: { display: false },
        ticks: {
          color: "#8b93a1",
          font: { family: "Inter, sans-serif", size: 11 },
          maxRotation: 0,
          autoSkipPadding: 12,
        },
      },
      y: {
        grid: { color: "rgba(19, 23, 34, 0.06)" },
        border: { display: false },
        ticks: {
          color: "#8b93a1",
          font: { family: "'DM Mono', monospace", size: 11 },
          callback: (v) => growAxisLabel(v),
        },
      },
    },
  },
});

function renderGrowth(p) {
  const labels = p.projection.map((r) =>
    r.year === 0 ? "Today" : `Year ${r.year}`,
  );
  growthChart.data.labels = labels;
  growthChart.data.datasets[0].data = p.projection.map((r) => r.low);
  growthChart.data.datasets[1].data = p.projection.map((r) => r.high);
  growthChart.data.datasets[2].data = p.projection.map((r) => r.base);
  growthChart.update("none");

  const last = p.projection[p.projection.length - 1];
  const doubled = p.projection.find((r) => r.base >= 2 * p.amount);
  let note =
    `Year ${last.year} corpus: expected ${inr(last.base)} \u00B7 range ${inr(last.low)} \u2013 ${inr(last.high)}.`;
  if (doubled) note += ` Projected to double around year ${doubled.year}.`;
  $("#growthSummary").textContent = note;
}

function verifyProjection(plan) {
  const projected = plan.amount * Math.pow(1 + plan.annual / 100, plan.horizon);
  const dev = Math.abs(projected - plan.final) / Math.max(1, plan.final);
  return { projected, dev, ok: dev < 0.01 };
}

/* Plan fetch */

async function loadPlan() {
  const q = new URLSearchParams({
    amount: state.amount,
    riskProfile: state.profile,
    horizon: state.horizon,
  });
  try {
    const res = await fetch(`/api/recommend?${q}`);
    const plan = await res.json();
    if (!res.ok || plan.error)
      throw new Error(plan.error || `HTTP ${res.status}`);
    state.plan = plan;
    renderPlan(plan);
  } catch (e) {
    toast(`Plan engine error: ${e.message}`);
  }
}

function debouncedLoad() {
  clearTimeout(state.timer);
  state.timer = setTimeout(loadPlan, 260);
}

/* Render: plan */

function renderPlan(p) {
  $("#metricCapital").textContent = inr(p.amount);
  $("#metricCapitalSub").textContent = `${p.horizon}yr horizon \u00B7 lump-sum`;

  $("#metricCagr").textContent = `${p.annual}%`;
  $("#metricCagrSub").textContent =
    `${p.maxCAGR[0]}\u2013${p.maxCAGR[1]}% profile band`;

  const v = verifyProjection(p);
  $("#metricFinal").textContent = inr(p.final);
  $("#metricFinalSub").textContent = v.ok
    ? "\u2713 formula verified"
    : `deviation ${(v.dev * 100).toFixed(1)}%`;

  $("#metricRisk").textContent = `${p.buckets.equity}% EQ`;
  $("#metricRiskSub").textContent =
    `${p.maxCAGR[0]}\u2013${p.maxCAGR[1]}% band \u00B7 ${p.buckets.debt}% debt`;

  renderDonut(p);
  renderSpectrum(p);
  renderGrowth(p);
  renderHoldings(p);
}

function renderDonut(p) {
  const labels = Object.keys(CAT_META).filter((k) => p.buckets[k] > 0);
  allocationChart.data.labels = labels.map((k) => CAT_META[k].label);
  allocationChart.data.datasets[0].data = labels.map((k) => p.buckets[k]);
  allocationChart.data.datasets[0].backgroundColor = labels.map(
    (k) => CAT_META[k].color,
  );
  allocationChart.update();

  $("#allocLegend").innerHTML = labels
    .map(
      (k) =>
        `<div class="legend-row">
       <span class="legend-swatch" style="background:${CAT_META[k].color}"></span>
       <span class="legend-name">${CAT_META[k].label}</span>
       <span class="legend-pct">${p.buckets[k]}%</span>
       <span class="legend-val">${inr((p.amount * p.buckets[k]) / 100)}</span>
     </div>`,
    )
    .join("");
}

function renderSpectrum(p) {
  const last = p.projection[p.projection.length - 1];
  const cells = [
    {
      label: "Low",
      val: last.low,
      delta: (last.low / p.final - 1) * 100,
      color: "#dc2626",
      cls: "neg",
    },
    {
      label: "Expected",
      val: last.base,
      delta: 0,
      color: "#16a34a",
      cls: "pos",
    },
    {
      label: "High",
      val: last.high,
      delta: (last.high / p.final - 1) * 100,
      color: "#2563eb",
      cls: "pos",
    },
  ];
  $("#spectrum").innerHTML = cells
    .map(
      (c) =>
        `<div class="sc-card" style="--sc:${c.color}">
       <div class="sc-label">${c.label}</div>
       <div class="sc-val">${inr(c.val)}</div>
       <div class="sc-delta ${c.cls}">${c.delta >= 0 ? "+" : ""}${c.delta.toFixed(1)}%</div>
     </div>`,
    )
    .join("");
}

function renderHoldings(p) {
  const total = p.picks.reduce((s, x) => s + x.amount, 0) || 1;
  if (!p.picks.length) {
    $("#holdingsBody").innerHTML =
      `<tr><td colspan="6" class="empty">No instruments eligible at this capital level.</td></tr>`;
    return;
  }
  $("#holdingsBody").innerHTML = p.picks
    .map((x) => {
      const w = (x.amount / total) * 100;
      const cls =
        x.cat === "gold" ? "gold" : x.cat === "debt" ? "debt" : "equity";
      return `<tr>
      <td>
        <div class="asset-cell">
          <div class="name">${esc(x.name)}</div>
          <div class="sym">${esc(x.symbol)}</div>
        </div>
      </td>
      <td><span class="badge ${cls}">${CLASS_OF(x)}</span></td>
      <td>${esc(x.sector)}</td>
      <td class="num">
        <div class="weight-bar">
          <span>${w.toFixed(1)}%</span>
          <span class="bar"><span style="width:${Math.min(100, w)}%"></span></span>
        </div>
      </td>
      <td class="num">${inr(x.amount)}</td>
      <td class="num"><button class="btn-sm" data-add="${esc(x.id)}">Hold</button></td>
    </tr>`;
    })
    .join("");

  $$("#holdingsBody .btn-sm").forEach((b) =>
    b.addEventListener("click", () => quickAdd(b.dataset.add)),
  );
}

/* Portfolio */

async function quickAdd(id) {
  const a =
    state.plan?.picks.find((x) => x.id === id) ||
    window.ALL_ASSETS?.find((x) => x.id === id);
  const units = a ? Math.max(1, Math.floor(a.amount / a.price)) : undefined;
  try {
    const res = await fetch("/api/portfolio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ asset_id: id, units }),
    });
    if (!res.ok) throw new Error("failed to add");
    toast(`${esc(a.name)} added to portfolio`);
    loadPortfolio();
  } catch (e) {
    toast(`Add failed: ${e.message}`);
  }
}

async function loadPortfolio() {
  try {
    const rows = await (await fetch("/api/portfolio")).json();
    const invested = rows.reduce((s, r) => s + r.invested, 0);
    const current = rows.reduce((s, r) => s + r.units * r.asset.price, 0);
    const pnl = current - invested;

    $("#portInvested").textContent = inr(invested);
    $("#portCurrent").textContent = inr(current);
    $("#portPnl").textContent = (pnl >= 0 ? "+" : "") + inr(pnl);
    $("#portPnl").style.color = pnl >= 0 ? "var(--green)" : "var(--red)";
    $("#portPnlSub").textContent =
      `${pnl >= 0 ? "profit" : "loss"} vs invested`;
    $("#portCount").textContent = INTL0.format(rows.length);

    $("#portfolioBody").innerHTML = rows.length
      ? rows
          .map((r) => {
            const val = r.units * r.asset.price;
            const pl = val - r.invested;
            const cls =
              r.asset.cat === "gold"
                ? "gold"
                : r.asset.cat === "debt"
                  ? "debt"
                  : "equity";
            return `<tr>
        <td>
          <div class="asset-cell">
            <div class="name">${esc(r.asset.name)}</div>
            <div class="sym">${esc(r.asset.symbol)}</div>
          </div>
        </td>
        <td><span class="badge ${cls}">${CLASS_OF(r.asset)}</span></td>
        <td class="num">${INTL1.format(r.units)}</td>
        <td class="num">${inr(r.invested)}</td>
        <td class="num">${inr(val)}</td>
        <td class="num" style="color:${pl >= 0 ? "var(--green)" : "var(--red)"}">${pl >= 0 ? "+" : ""}${inr(pl)}</td>
        <td class="num"><button class="btn-sm danger" data-rm="${r.id}">Remove</button></td>
      </tr>`;
          })
          .join("")
      : `<tr><td colspan="7" class="empty">No holdings deployed yet. Add from the Planner or Explorer.</td></tr>`;

    $$("#portfolioBody .btn-sm.danger").forEach((b) =>
      b.addEventListener("click", () => removeHolding(+b.dataset.rm)),
    );
  } catch (e) {
    toast(`Portfolio load failed: ${e.message}`);
  }
}

async function removeHolding(id) {
  await fetch("/api/portfolio/" + id, { method: "DELETE" });
  loadPortfolio();
}

/* Explorer */

async function loadLibrary() {
  try {
    window.ALL_ASSETS = await (await fetch("/api/assets")).json();
    const types = ["all", ...new Set(window.ALL_ASSETS.map((a) => a.type))];
    $("#typeFilter").innerHTML = types
      .map(
        (t) =>
          `<button class="filter-btn ${t === "all" ? "active" : ""}" data-type="${t}">${t === "all" ? "All" : CLASS_OF({ type: t, cat: t === "etf" ? "equity" : t })}</button>`,
      )
      .join("");
    $$("#typeFilter .filter-btn").forEach((b) =>
      b.addEventListener("click", () => {
        $$("#typeFilter .filter-btn").forEach((x) =>
          x.classList.remove("active"),
        );
        b.classList.add("active");
        renderLibrary();
      }),
    );
    renderLibrary();
  } catch (e) {
    toast(`Asset library load failed: ${e.message}`);
  }
}

function currentType() {
  return $(".filter-btn.active")?.dataset.type || "all";
}

function renderLibrary() {
  const q = $("#search").value.toLowerCase();
  const t = currentType();
  const list = window.ALL_ASSETS.filter(
    (a) =>
      (t === "all" || a.type === t) &&
      (a.name + a.symbol).toLowerCase().includes(q) &&
      (a.type !== "stock" || a.price >= 3000),
  );
  if (!list.length) {
    $("#libraryList").innerHTML =
      `<div class="card empty">No instruments match "${esc($("#search").value)}".</div>`;
    return;
  }
  $("#libraryList").innerHTML = list
    .map((a) => {
      const cls =
        a.cat === "gold" ? "gold" : a.cat === "debt" ? "debt" : "equity";
      return `<div class="asset-card">
      <div>
        <div class="a-name">${esc(a.name)}</div>
        <div class="a-sub">${esc(a.symbol)} \u00B7 ${esc(a.sector)}</div>
      </div>
      <div class="a-side">
        <div class="a-price">
          <div class="p">${inr(a.price)}</div>
          <div class="r">${a.ret}%/yr \u00B7 <span class="badge ${cls}">${CLASS_OF(a)}</span></div>
        </div>
        <button class="btn-sm" data-add="${esc(a.id)}">+ Add</button>
      </div>
    </div>`;
    })
    .join("");

  $$("#libraryList .btn-sm").forEach((b) =>
    b.addEventListener("click", () => quickAdd(b.dataset.add)),
  );
}

/* Indices tape */

function fmtPts(n) {
  return INTL1.format(n);
}

async function loadIndices() {
  const el = $("#tapeContent");
  try {
    const idx = await (await fetch("/api/indices")).json();
    if (!Array.isArray(idx) || !idx.length) throw new Error("empty");
    const items = idx
      .map((i) => {
        const up = i.change >= 0;
        const arrow = up ? "\u25B2" : "\u25BC";
        const cls = up ? "up" : "down";
        const sign = up ? "+" : "";
        return `<span class="tape-item">
        <span class="name">${esc(i.name)}</span>
        <span class="val">${fmtPts(i.last)}</span>
        <span class="chg ${cls}">${arrow} ${sign}${fmtPts(i.change)} (${sign}${i.changePct.toFixed(2)}%)</span>
      </span>`;
      })
      .join("");
    el.innerHTML = items + items;
  } catch (e) {
    el.innerHTML = `<span class="tape-fallback">Live feed unavailable</span>`;
    el.style.animation = "none";
  }
}

/* FX (USD → INR) */

async function loadFx() {
  const el = $("#fxRate");
  if (!el) return;
  try {
    const fx = await (await fetch("/api/fx")).json();
    if (!fx || !Number.isFinite(fx.rate)) throw new Error("no rate");
    $("#fxValue").textContent = INTL1.format(fx.rate);
    const chg = $("#fxChange");
    if (chg) {
      const up = fx.change >= 0;
      chg.classList.toggle("up", up);
      chg.classList.toggle("down", !up);
      chg.textContent =
        `${up ? "+" : ""}${fmtPts(fx.change)} (${up ? "+" : ""}${(fx.changePct || 0).toFixed(2)}%)`;
      chg.style.display = "";
    }
    $("#fxSub").textContent = "USD/INR";
  } catch (e) {
    $("#fxValue").textContent = "\u2014";
  }
}

/* Horizon */

function horizonNote(y) {
  if (y <= 3) return "Short horizon. Conservative allocation per profile rules.";
  if (y <= 5) return "Medium term. Balanced equity-debt mix.";
  if (y <= 10) return "Growth window. Higher equity allocation.";
  return "Long runway. Maximum equity exposure for the profile.";
}

/* Tabs */

function switchView(name) {
  $$(".tab").forEach((t) =>
    t.classList.toggle("active", t.dataset.view === name),
  );
  $$(".view").forEach((v) =>
    v.classList.toggle("active", v.id === "view-" + name),
  );
}

/* Toast */

let toastTimer = null;
function toast(msg) {
  let t = $(".toast");
  if (!t) {
    t = document.createElement("div");
    t.className = "toast";
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 3000);
}

/* Events */

function initEvents() {
  $$(".tab").forEach((t) =>
    t.addEventListener("click", () => switchView(t.dataset.view)),
  );

  const capital = $("#capitalInput");
  capital.addEventListener("focus", (e) => e.target.select());
  capital.addEventListener("input", (e) => {
    const digits = e.target.value.replace(/[^\d]/g, "").slice(0, 8);
    e.target.value = digits;
    const raw = +digits || 0;
    const n = Math.min(10000000, Math.max(1000, raw));
    state.amount = n;
    $$("#presetRow .preset").forEach((b) =>
      b.classList.toggle("active", +b.dataset.amount === n),
    );
    debouncedLoad();
  });
  capital.addEventListener("blur", () => {
    capital.value = INTL0.format(state.amount);
  });

  $$("#presetRow .preset").forEach((b) =>
    b.addEventListener("click", () => {
      const n = +b.dataset.amount;
      state.amount = n;
      $("#capitalInput").value = INTL0.format(n);
      $$("#presetRow .preset").forEach((x) =>
        x.classList.toggle("active", x === b),
      );
      loadPlan();
    }),
  );

  $$("#riskProfileGroup .risk-btn").forEach((c) =>
    c.addEventListener("click", () => {
      $$("#riskProfileGroup .risk-btn").forEach((x) =>
        x.classList.remove("selected"),
      );
      c.classList.add("selected");
      state.profile = c.dataset.profile;
      loadPlan();
    }),
  );

  const slider = $("#horizonSlider");
  slider.addEventListener("input", () => {
    state.horizon = +slider.value;
    $("#horizonValue").textContent = state.horizon;
    $("#horizonNote").textContent = horizonNote(state.horizon);
    debouncedLoad();
  });

  $("#search").addEventListener("input", renderLibrary);
  $("#refreshPortfolio").addEventListener("click", loadPortfolio);

  document.addEventListener("keydown", (e) => {
    if (e.key === "1" || e.key === "2" || e.key === "3")
      switchView(["planner", "portfolio", "explorer"][+e.key - 1]);
  });
}

/* Init */

function init() {
  initEvents();
  $("#horizonNote").textContent = horizonNote(state.horizon);
  loadPlan();
  loadPortfolio();
  loadIndices();
  setInterval(loadIndices, 30000);
  loadFx();
  setInterval(loadFx, 60000);
  loadLibrary();
}

document.addEventListener("DOMContentLoaded", init);
