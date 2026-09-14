// QuantFolio data layer
// Asset universe (Nifty 500-equivalent), 4-tier risk profiles,
// allocation engine with guardrails, and dynamic CAGR decay math.

const TYPES = { stock: "Stock", mf: "Mutual Fund", etf: "ETF", debt: "Debt" };

// ---------- Seeded RNG for a deterministic 500-stock universe ----------
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SECTORS = [
  {
    code: "IT",
    name: "IT",
    base: 11,
    pre: [
      "Nexa",
      "Orbit",
      "Blue",
      "Vayu",
      "Indus",
      "Zenith",
      "Cognia",
      "Stratum",
    ],
    suf: [
      "Systems",
      "Soft",
      "Digital",
      "Networks",
      "Tech",
      "Infotech",
      "Solutions",
      "Data",
    ],
  },
  {
    code: "BNK",
    name: "Banking",
    base: 12,
    pre: [
      "Apex",
      "City",
      "National",
      "Pioneer",
      "Union",
      "Himalaya",
      "Peak",
      "Axis",
    ],
    suf: [
      "Bank",
      "Housing Finance",
      "Credit",
      "Capital",
      "Trust",
      "Finance",
      "Banking",
      "Money",
    ],
  },
  {
    code: "FIN",
    name: "Financial Services",
    base: 12,
    pre: [
      "Alpha",
      "Meridian",
      "Crest",
      "Summit",
      "Pinnacle",
      "Vertex",
      "Fortuna",
      "Legacy",
    ],
    suf: [
      "Capital",
      "Wealth",
      "Ventures",
      "Markets",
      "Investments",
      "Advisory",
      "Financials",
      "Securities",
    ],
  },
  {
    code: "ENG",
    name: "Energy",
    base: 10,
    pre: [
      "Solaris",
      "Petro",
      "Vidyut",
      "Hydro",
      "Therma",
      "Urja",
      "Renew",
      "Powerline",
    ],
    suf: [
      "Energy",
      "Petroleum",
      "Power",
      "Gas",
      "Electric",
      "Fuels",
      "Renewables",
      "Oils",
    ],
  },
  {
    code: "AUT",
    name: "Auto",
    base: 12,
    pre: [
      "Motora",
      "Speed",
      "Gear",
      "Torque",
      "Drive",
      "Cruiser",
      "Aero",
      "Turbo",
    ],
    suf: [
      "Motors",
      "Auto",
      "Automotive",
      "Vehicles",
      "Engineering",
      "Components",
      "Industries",
      "Systems",
    ],
  },
  {
    code: "FMC",
    name: "FMCG",
    base: 9,
    pre: [
      "Daily",
      "Fresh",
      "Natura",
      "Taste",
      "Pure",
      "Home",
      "Essence",
      "Bloom",
    ],
    suf: [
      "Consumer",
      "Foods",
      "Household",
      "Beverages",
      "Personal Care",
      "Brands",
      "Essentials",
      "Products",
    ],
  },
  {
    code: "HLT",
    name: "Healthcare",
    base: 11,
    pre: ["Medi", "Care", "Vital", "Life", "Heal", "Nova", "Aura", "Sangam"],
    suf: [
      "Health",
      "Hospitals",
      "Diagnostics",
      "Labs",
      "Wellness",
      "Pharma",
      "Clinics",
      "Biotech",
    ],
  },
  {
    code: "INF",
    name: "Infra",
    base: 11,
    pre: [
      "Build",
      "Nirmiti",
      "Struct",
      "Highway",
      "Urban",
      "Cementro",
      "Concrete",
      "Karshaka",
    ],
    suf: [
      "Infra",
      "Construction",
      "Engineering",
      "Developers",
      "Roads",
      "Builders",
      "Cements",
      "Projects",
    ],
  },
  {
    code: "TEL",
    name: "Telecom",
    base: 10,
    pre: ["Com", "Net", "Wave", "Signal", "Sky", "Broad", "Radius", "Connect"],
    suf: [
      "Communications",
      "Telecom",
      "Broadband",
      "Mobile",
      "Networks",
      "Digital",
      "Satellite",
      "Voice",
    ],
  },
  {
    code: "MET",
    name: "Metals",
    base: 11,
    pre: [
      "Iron",
      "Steelco",
      "Alu",
      "Rashtriya",
      "Metal",
      "Ferro",
      "Mining",
      "Ore",
    ],
    suf: [
      "Steel",
      "Metals",
      "Aluminium",
      "Mining",
      "Alloys",
      "Industries",
      "Refineries",
      "Extractions",
    ],
  },
  {
    code: "CHM",
    name: "Chemicals",
    base: 10,
    pre: [
      "Chemi",
      "Poly",
      "Agro",
      "Special",
      "Elan",
      "Precise",
      "Bharat",
      "Suraksha",
    ],
    suf: [
      "Chemicals",
      "Polymers",
      "Agro",
      "Specialities",
      "Intermediates",
      "Compounds",
      "Organic",
      "Materials",
    ],
  },
  {
    code: "CON",
    name: "Consumer",
    base: 10,
    pre: [
      "Retail",
      "Urban",
      "Shopper",
      "Lifestyle",
      "Village",
      "Market",
      "Trend",
      "Nova",
    ],
    suf: [
      "Retail",
      "Stores",
      "Brands",
      "Malls",
      "Consumer",
      "Electronics",
      "Durables",
      "Lifestyle",
    ],
  },
  {
    code: "RLT",
    name: "Realty",
    base: 12,
    pre: [
      "Land",
      "Estate",
      "Skyline",
      "Paradise",
      "Nirman",
      "Sunrise",
      "Metro",
      "Green",
    ],
    suf: [
      "Realty",
      "Estates",
      "Developers",
      "Constructions",
      "Homes",
      "Properties",
      "Buildtech",
      "Infracity",
    ],
  },
  {
    code: "UTL",
    name: "Utilities",
    base: 9,
    pre: [
      "City",
      "River",
      "Powercorp",
      "Waters",
      "EnergyPlus",
      "Grid",
      "Utility",
      "Saral",
    ],
    suf: [
      "Utilities",
      "Water",
      "Energy",
      "Services",
      "Grids",
      "Networks",
      "Infra",
      "Systems",
    ],
  },
  {
    code: "PHA",
    name: "Pharma",
    base: 11,
    pre: ["Bio", "Geno", "Pharma", "MediCure", "Dr", "San", "Cura", "Remed"],
    suf: [
      "Pharma",
      "Life Sciences",
      "Remedies",
      "Biosciences",
      "Drugs",
      "Lab",
      "Formulations",
      "Research",
    ],
  },
];

const NAME_TAGS = [
  "Ltd",
  "India",
  "Industries",
  "Group",
  "Enterprises",
  "Technologies",
  "Global",
  "Ventures",
  "Corp",
  "Holdings",
];

// ---------- Curated quality assets ----------
const curated = [
  // ---- Large Cap Stocks ----
  {
    id: "RELIANCE",
    name: "Reliance Industries",
    symbol: "RELIANCE",
    type: "stock",
    cat: "equity",
    price: 2950,
    ret: 12,
    risk: 3,
    score: 92,
    min: 2950,
    sector: "Energy",
    cap: "large",
    mcap: 1900000,
    vol: 1600,
    kind: "direct",
  },
  {
    id: "TCS",
    name: "Tata Consultancy Services",
    symbol: "TCS",
    type: "stock",
    cat: "equity",
    price: 4150,
    ret: 11,
    risk: 2,
    score: 91,
    min: 4150,
    sector: "IT",
    cap: "large",
    mcap: 1300000,
    vol: 900,
    kind: "direct",
  },
  {
    id: "HDFCBANK",
    name: "HDFC Bank",
    symbol: "HDFCBANK",
    type: "stock",
    cat: "equity",
    price: 1620,
    ret: 12,
    risk: 3,
    score: 90,
    min: 1620,
    sector: "Banking",
    cap: "large",
    mcap: 1250000,
    vol: 1800,
    kind: "direct",
  },
  {
    id: "INFY",
    name: "Infosys",
    symbol: "INFY",
    type: "stock",
    cat: "equity",
    price: 1650,
    ret: 11,
    risk: 3,
    score: 88,
    min: 1650,
    sector: "IT",
    cap: "large",
    mcap: 750000,
    vol: 1100,
    kind: "direct",
  },
  {
    id: "ITC",
    name: "ITC Ltd",
    symbol: "ITC",
    type: "stock",
    cat: "equity",
    price: 470,
    ret: 10,
    risk: 2,
    score: 86,
    min: 470,
    sector: "FMCG",
    cap: "large",
    mcap: 560000,
    vol: 950,
    kind: "direct",
  },
  {
    id: "SBIN",
    name: "State Bank of India",
    symbol: "SBIN",
    type: "stock",
    cat: "equity",
    price: 830,
    ret: 13,
    risk: 4,
    score: 84,
    min: 830,
    sector: "Banking",
    cap: "large",
    mcap: 720000,
    vol: 2000,
    kind: "direct",
  },
  {
    id: "HINDUNILVR",
    name: "Hindustan Unilever",
    symbol: "HINDUNILVR",
    type: "stock",
    cat: "equity",
    price: 2450,
    ret: 9,
    risk: 2,
    score: 85,
    min: 2450,
    sector: "FMCG",
    cap: "large",
    mcap: 520000,
    vol: 750,
    kind: "direct",
  },
  {
    id: "LT",
    name: "Larsen & Toubro",
    symbol: "LT",
    type: "stock",
    cat: "equity",
    price: 3650,
    ret: 13,
    risk: 3,
    score: 87,
    min: 3650,
    sector: "Infra",
    cap: "large",
    mcap: 480000,
    vol: 850,
    kind: "direct",
  },
  {
    id: "AXISBANK",
    name: "Axis Bank",
    symbol: "AXISBANK",
    type: "stock",
    cat: "equity",
    price: 1150,
    ret: 13,
    risk: 4,
    score: 82,
    min: 1150,
    sector: "Banking",
    cap: "large",
    mcap: 360000,
    vol: 1300,
    kind: "direct",
  },
  {
    id: "BHARTIARTL",
    name: "Bharti Airtel",
    symbol: "BHARTIARTL",
    type: "stock",
    cat: "equity",
    price: 1600,
    ret: 12,
    risk: 3,
    score: 85,
    min: 1600,
    sector: "Telecom",
    cap: "large",
    mcap: 920000,
    vol: 1100,
    kind: "direct",
  },
  {
    id: "TITAN",
    name: "Titan Company",
    symbol: "TITAN",
    type: "stock",
    cat: "equity",
    price: 3550,
    ret: 12,
    risk: 3,
    score: 83,
    min: 3550,
    sector: "Consumer",
    cap: "large",
    mcap: 310000,
    vol: 550,
    kind: "direct",
  },
  {
    id: "TATAMOTORS",
    name: "Tata Motors",
    symbol: "TATAMOTORS",
    type: "stock",
    cat: "equity",
    price: 1050,
    ret: 14,
    risk: 4,
    score: 80,
    min: 1050,
    sector: "Auto",
    cap: "large",
    mcap: 340000,
    vol: 1250,
    kind: "direct",
  },
  {
    id: "MARUTI",
    name: "Maruti Suzuki",
    symbol: "MARUTI",
    type: "stock",
    cat: "equity",
    price: 12300,
    ret: 11,
    risk: 3,
    score: 84,
    min: 12300,
    sector: "Auto",
    cap: "large",
    mcap: 410000,
    vol: 520,
    kind: "direct",
  },
  {
    id: "WIPRO",
    name: "Wipro",
    symbol: "WIPRO",
    type: "stock",
    cat: "equity",
    price: 500,
    ret: 9,
    risk: 3,
    score: 76,
    min: 500,
    sector: "IT",
    cap: "large",
    mcap: 265000,
    vol: 620,
    kind: "direct",
  },
  {
    id: "SUNPHARMA",
    name: "Sun Pharmaceutical",
    symbol: "SUNPHARMA",
    type: "stock",
    cat: "equity",
    price: 1650,
    ret: 11,
    risk: 3,
    score: 83,
    min: 1650,
    sector: "Pharma",
    cap: "large",
    mcap: 380000,
    vol: 700,
    kind: "direct",
  },
  {
    id: "ASIANPAINT",
    name: "Asian Paints",
    symbol: "ASIANPAINT",
    type: "stock",
    cat: "equity",
    price: 2800,
    ret: 10,
    risk: 2,
    score: 85,
    min: 2800,
    sector: "Consumer",
    cap: "large",
    mcap: 280000,
    vol: 600,
    kind: "direct",
  },
  {
    id: "DMART",
    name: "Avenue Supermarts",
    symbol: "DMART",
    type: "stock",
    cat: "equity",
    price: 4200,
    ret: 11,
    risk: 3,
    score: 81,
    min: 4200,
    sector: "Consumer",
    cap: "large",
    mcap: 260000,
    vol: 500,
    kind: "direct",
  },
  {
    id: "BAJFINANCE",
    name: "Bajaj Finance",
    symbol: "BAJFINANCE",
    type: "stock",
    cat: "equity",
    price: 6800,
    ret: 14,
    risk: 4,
    score: 84,
    min: 6800,
    sector: "Financial Services",
    cap: "large",
    mcap: 650000,
    vol: 900,
    kind: "direct",
  },
  {
    id: "ICICIBANK",
    name: "ICICI Bank",
    symbol: "ICICIBANK",
    type: "stock",
    cat: "equity",
    price: 1150,
    ret: 12,
    risk: 3,
    score: 89,
    min: 1150,
    sector: "Banking",
    cap: "large",
    mcap: 1100000,
    vol: 1900,
    kind: "direct",
  },
  {
    id: "HCLTECH",
    name: "HCL Technologies",
    symbol: "HCLTECH",
    type: "stock",
    cat: "equity",
    price: 1520,
    ret: 10,
    risk: 3,
    score: 82,
    min: 1520,
    sector: "IT",
    cap: "large",
    mcap: 480000,
    vol: 750,
    kind: "direct",
  },

  // ---- Mutual Funds ----
  {
    id: "MF_UTI_N50",
    name: "UTI Nifty 50 Index Fund",
    symbol: "UTI-N50",
    type: "mf",
    cat: "equity",
    price: 105,
    ret: 12,
    risk: 3,
    score: 90,
    min: 500,
    sector: "Index",
    cap: "large",
    kind: "index",
  },
  {
    id: "MF_HDFC_SENSEX",
    name: "HDFC Index Fund - Sensex",
    symbol: "HDFC-SX",
    type: "mf",
    cat: "equity",
    price: 195,
    ret: 12,
    risk: 3,
    score: 88,
    min: 500,
    sector: "Index",
    cap: "large",
    kind: "index",
  },
  {
    id: "MF_PARAG",
    name: "Parag Parikh Flexi Cap Fund",
    symbol: "PPFCF",
    type: "mf",
    cat: "equity",
    price: 90,
    ret: 13,
    risk: 3,
    score: 93,
    min: 1000,
    sector: "Flexi Cap",
    cap: "flexi",
    kind: "active",
  },
  {
    id: "MF_MIRAE",
    name: "Mirae Asset Large Cap Fund",
    symbol: "MIRAE-LC",
    type: "mf",
    cat: "equity",
    price: 105,
    ret: 12,
    risk: 3,
    score: 89,
    min: 500,
    sector: "Large Cap",
    cap: "large",
    kind: "active",
  },
  {
    id: "MF_ICICI_BLUE",
    name: "ICICI Pru Bluechip Fund",
    symbol: "ICICI-BC",
    type: "mf",
    cat: "equity",
    price: 115,
    ret: 12,
    risk: 3,
    score: 87,
    min: 500,
    sector: "Large Cap",
    cap: "large",
    kind: "active",
  },
  {
    id: "MF_SBI_SMALL",
    name: "SBI Small Cap Fund",
    symbol: "SBI-SC",
    type: "mf",
    cat: "equity",
    price: 130,
    ret: 15,
    risk: 5,
    score: 81,
    min: 500,
    sector: "Small Cap",
    cap: "small",
    kind: "active",
  },
  {
    id: "MF_AXIS_ELSS",
    name: "Axis ELSS Tax Saver Fund",
    symbol: "AXIS-ELSS",
    type: "mf",
    cat: "equity",
    price: 72,
    ret: 13,
    risk: 4,
    score: 85,
    min: 500,
    sector: "ELSS",
    cap: "large",
    kind: "active",
  },
  {
    id: "MF_NIP_LARGE",
    name: "Nippon India Large Cap Fund",
    symbol: "NIP-LC",
    type: "mf",
    cat: "equity",
    price: 88,
    ret: 12,
    risk: 3,
    score: 86,
    min: 500,
    sector: "Large Cap",
    cap: "large",
    kind: "active",
  },
  {
    id: "MF_QUANT",
    name: "Quant Active Fund",
    symbol: "QUANT-A",
    type: "mf",
    cat: "equity",
    price: 650,
    ret: 14,
    risk: 4,
    score: 84,
    min: 5000,
    sector: "Flexi Cap",
    cap: "flexi",
    kind: "active",
  },
  {
    id: "MF_SBI_MID",
    name: "SBI Magnum Midcap Fund",
    symbol: "SBI-MID",
    type: "mf",
    cat: "equity",
    price: 210,
    ret: 15,
    risk: 4,
    score: 85,
    min: 500,
    sector: "Mid Cap",
    cap: "mid",
    kind: "active",
  },
  {
    id: "MF_UTI_MID_IDX",
    name: "UTI Nifty Midcap 150 Index Fund",
    symbol: "UTI-MID150",
    type: "mf",
    cat: "equity",
    price: 135,
    ret: 13,
    risk: 4,
    score: 84,
    min: 500,
    sector: "Mid Cap",
    cap: "mid",
    kind: "index",
  },
  {
    id: "MF_NIFTY_SMALL_IDX",
    name: "Nifty Smallcap 250 Index Fund",
    symbol: "NIFTY-SC250",
    type: "mf",
    cat: "equity",
    price: 95,
    ret: 15,
    risk: 5,
    score: 80,
    min: 500,
    sector: "Small Cap",
    cap: "small",
    kind: "index",
  },
  {
    id: "MF_ICICI_SMALL",
    name: "ICICI Pru Smallcap Fund",
    symbol: "ICICI-SC",
    type: "mf",
    cat: "equity",
    price: 160,
    ret: 16,
    risk: 5,
    score: 82,
    min: 500,
    sector: "Small Cap",
    cap: "small",
    kind: "active",
  },

  // ---- ETFs ----
  {
    id: "ETF_NIFTYBEES",
    name: "Nippon India ETF Nifty 50 BEES",
    symbol: "NIFTYBEES",
    type: "etf",
    cat: "equity",
    price: 275,
    ret: 12,
    risk: 3,
    score: 91,
    min: 275,
    sector: "Index ETF",
    cap: "large",
    kind: "index",
  },
  {
    id: "ETF_SENSEX",
    name: "HDFC Sensex ETF",
    symbol: "HDFCSENX",
    type: "etf",
    cat: "equity",
    price: 730,
    ret: 12,
    risk: 3,
    score: 89,
    min: 730,
    sector: "Index ETF",
    cap: "large",
    kind: "index",
  },
  {
    id: "ETF_BANK",
    name: "Kotak Nifty Bank ETF",
    symbol: "BANKBEES",
    type: "etf",
    cat: "equity",
    price: 520,
    ret: 13,
    risk: 4,
    score: 84,
    min: 520,
    sector: "Sector ETF",
    cap: "large",
    kind: "index",
  },
  {
    id: "ETF_JRBEES",
    name: "Nippon India Jr BeES (Midcap)",
    symbol: "JRBEES",
    type: "etf",
    cat: "equity",
    price: 415,
    ret: 14,
    risk: 4,
    score: 82,
    min: 415,
    sector: "Midcap ETF",
    cap: "mid",
    kind: "index",
  },
  {
    id: "ETF_IT",
    name: "Nippon India IT ETF",
    symbol: "ITBEES",
    type: "etf",
    cat: "equity",
    price: 355,
    ret: 13,
    risk: 4,
    score: 80,
    min: 355,
    sector: "Sector ETF",
    cap: "large",
    kind: "index",
  },
  {
    id: "ETF_MID150",
    name: "Mirae Asset Nifty Midcap 150 ETF",
    symbol: "MID150BEES",
    type: "etf",
    cat: "equity",
    price: 145,
    ret: 14,
    risk: 4,
    score: 83,
    min: 145,
    sector: "Midcap ETF",
    cap: "mid",
    kind: "index",
  },

  // ---- Gold ----
  {
    id: "GOLD_SBI",
    name: "SBI Gold ETF",
    symbol: "GOLDBEES",
    type: "etf",
    cat: "gold",
    price: 620,
    ret: 8,
    risk: 2,
    score: 85,
    min: 620,
    sector: "Gold",
  },
  {
    id: "GOLD_ICICI",
    name: "ICICI Gold ETF",
    symbol: "ICICIGOLD",
    type: "etf",
    cat: "gold",
    price: 650,
    ret: 8,
    risk: 2,
    score: 84,
    min: 650,
    sector: "Gold",
  },

  // ---- Debt / Fixed ----
  {
    id: "DEBT_LIQUID",
    name: "Liquid Fund",
    symbol: "LIQUID",
    type: "debt",
    cat: "debt",
    price: 1,
    ret: 6.5,
    risk: 1,
    score: 90,
    min: 500,
    sector: "Debt",
  },
  {
    id: "DEBT_PPF",
    name: "PPF (Public Provident Fund)",
    symbol: "PPF",
    type: "debt",
    cat: "debt",
    price: 1,
    ret: 7.1,
    risk: 1,
    score: 92,
    min: 500,
    sector: "Debt",
  },
  {
    id: "DEBT_BHARAT",
    name: "Bharat Bond ETF",
    symbol: "BHARATBOND",
    type: "etf",
    cat: "debt",
    price: 1,
    ret: 6.9,
    risk: 1,
    score: 86,
    min: 100,
    sector: "Debt",
  },
  {
    id: "DEBT_INDEX",
    name: "Debt Index Fund",
    symbol: "DEBTIDX",
    type: "debt",
    cat: "debt",
    price: 1,
    ret: 6.8,
    risk: 1,
    score: 87,
    min: 500,
    sector: "Debt",
  },
  {
    id: "DEBT_MMF",
    name: "Money Market Fund",
    symbol: "MMF",
    type: "debt",
    cat: "debt",
    price: 1,
    ret: 6.6,
    risk: 1,
    score: 89,
    min: 500,
    sector: "Debt",
  },
  {
    id: "DEBT_GILT",
    name: "G-Sec Bond Fund (Gilt)",
    symbol: "GSEC",
    type: "debt",
    cat: "debt",
    price: 1,
    ret: 7,
    risk: 1,
    score: 85,
    min: 500,
    sector: "Debt",
  },
];

// ---------- Nifty 500-equivalent universe generation ----------
const TARGET_STOCKS = 501;
const usedNames = new Set();

function generateUniverse() {
  const rng = mulberry32(20260805);
  const out = [];
  const need = TARGET_STOCKS - curated.filter((a) => a.type === "stock").length;
  let global = 0;
  let guard = 0;
  while (out.length < need && guard < 100000) {
    guard++;
    for (let si = 0; si < SECTORS.length && out.length < need; si++) {
      const s = SECTORS[si];
      const tier = rng();
      const mcap =
        tier < 0.4
          ? Math.round(20000 + (700000 - 20000) * Math.pow(rng(), 0.7))
          : tier < 0.7
            ? Math.round(5000 + (20000 - 5000) * rng())
            : Math.round(1200 + (5000 - 1200) * rng());
      const cap = mcap >= 20000 ? "large" : mcap >= 5000 ? "mid" : "small";
      const price = Math.max(15, Math.round(15 + 4500 * rng() * rng()));
      const capPrem = cap === "small" ? 4.5 : cap === "mid" ? 2.5 : 0.5;
      const ret = Math.min(18, Math.max(7, s.base + capPrem + (rng() * 2 - 1)));
      const risk = Math.min(
        5,
        Math.max(
          1,
          Math.round(
            cap === "small"
              ? 4 + rng() * 1.5
              : cap === "mid"
                ? 3 + rng() * 1.5
                : 1.5 + rng() * 2,
          ),
        ),
      );
      const score = Math.max(
        58,
        Math.min(
          92,
          Math.round(50 + Math.log10(mcap) * 7.5 + (rng() * 2 - 1) * 5),
        ),
      );
      const vol = Math.max(
        1,
        Math.round(mcap * (0.004 + rng() * 0.03) * 10) / 10,
      );
      const symbol = s.code + (1000 + global);
      const tag =
        NAME_TAGS[Math.floor(global / SECTORS.length) % NAME_TAGS.length];
      const pre = s.pre[global % s.pre.length];
      const suf = s.suf[(global * 5 + si) % s.suf.length];
      let name = `${pre} ${suf} ${tag}`;
      let k = 2;
      while (usedNames.has(name)) {
        name = `${pre} ${suf} ${tag} ${k}`;
        k++;
      }
      usedNames.add(name);
      out.push({
        id: symbol,
        name,
        symbol,
        type: "stock",
        cat: "equity",
        price,
        ret: +ret.toFixed(1),
        risk,
        score,
        min: price,
        sector: s.name,
        cap,
        mcap,
        vol,
        kind: "direct",
      });
      global++;
    }
  }
  return out;
}

const assets = curated.concat(generateUniverse());
const stocks = assets.filter((a) => a.type === "stock");
const equityFunds = assets.filter(
  (a) => a.cat === "equity" && (a.type === "mf" || a.type === "etf"),
);
const isBroadIndex = (a) => a.sector === "Index" || a.sector === "Index ETF";

// ---------- 4-tier risk framework ----------
const PROFILES = {
  conservative: {
    id: "conservative",
    label: "Conservative",
    maxCAGR: [8, 10],
    baseCAGR: 9,
    buckets: { equity: 25, debt: 70, gold: 5 },
    equityRange: [15, 35],
    debtMin: 60,
    allowDirect: false,
    roles: [{ role: "index", caps: ["large"], share: 100 }],
  },
  balanced: {
    id: "balanced",
    label: "Balanced",
    maxCAGR: [11, 14],
    baseCAGR: 12.5,
    buckets: { equity: 55, debt: 35, gold: 10 },
    equityRange: [40, 65],
    debtMin: 15,
    allowDirect: true,
    directBias: false,
    constraints: { directCapPct: 15, midCapPct: 20, debtMinPct: 15 },
    roles: [
      { role: "flexi", caps: ["flexi"], share: 35 },
      { role: "index", caps: ["large"], share: 20 },
      { role: "mid", caps: ["mid"], share: 20 },
      { role: "direct", caps: ["large"], share: 25 },
    ],
  },
  aggressive: {
    id: "aggressive",
    label: "Aggressive",
    maxCAGR: [15, 18],
    baseCAGR: 16.5,
    buckets: { equity: 75, debt: 15, gold: 10 },
    equityRange: [60, 82],
    debtMin: 10,
    allowDirect: true,
    directBias: true,
    constraints: { sectorCapPct: 25 },
    roles: [
      { role: "flexi", caps: ["flexi"], share: 25 },
      { role: "mid", caps: ["mid"], share: 20 },
      { role: "small", caps: ["small"], share: 20 },
      { role: "direct", caps: ["large", "mid"], share: 35 },
    ],
  },
  growth: {
    id: "growth",
    label: "High Growth",
    maxCAGR: [18, 22],
    baseCAGR: 20,
    buckets: { equity: 82, debt: 8, gold: 10 },
    equityRange: [70, 90],
    debtMin: 5,
    allowDirect: true,
    directBias: true,
    constraints: { sectorCapPct: 25, mcapMin: 1000, volMin: 5 },
    roles: [
      { role: "small", caps: ["small"], share: 25 },
      { role: "mid", caps: ["mid"], share: 25 },
      { role: "direct", caps: ["large", "mid", "small"], share: 50 },
    ],
  },
};

// ---------- Allocation engine ----------

// 2D equity allocation matrix: EQUITY_MATRIX[profile][year] = equity%
// Rows = risk profiles (conservative → growth)
// Columns = horizon years (1 → 20)
// Values follow capital-preservation rules: short horizons → low equity,
// long horizons → profile ceiling.
// Max per profile: conservative ≤95 (gold=5), balanced ≤90 (gold=10),
// aggressive ≤90 (gold=10), growth ≤90 (gold=10).
// No interpolation — deterministic lookup.
const EQUITY_MATRIX = {
  conservative: [10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 29, 30, 31, 32, 33, 33, 34, 34, 35, 35],
  balanced:     [25, 28, 31, 34, 37, 40, 43, 46, 49, 52, 55, 57, 59, 61, 62, 63, 64, 64, 65, 65],
  aggressive:   [40, 43, 46, 49, 52, 55, 58, 61, 64, 67, 70, 73, 75, 77, 79, 80, 80, 80, 80, 80],
  growth:       [50, 53, 56, 59, 62, 65, 68, 71, 74, 77, 80, 82, 84, 85, 85, 85, 85, 85, 85, 85],
};

function bucketsFor(prof, years) {
  const gold = prof.buckets.gold;
  const y = Math.min(20, Math.max(1, Math.round(years)));
  const row = EQUITY_MATRIX[prof.id] || EQUITY_MATRIX.balanced;
  const e = row[y - 1];
  const d = Math.max(prof.debtMin, 100 - e - gold);
  return { equity: 100 - d - gold, debt: d, gold };
}

// Horizon-aware candidate shortlist. Longer timeframes tilt the ranking
// toward higher expected returns (more compounding runway = more risk capacity).
function candidatesFor(prof, r, years) {
  const timeTilt = 1 + (years - 5) / 20;
  if (r.role === "direct") {
    let list = stocks.filter((s) => r.caps.includes(s.cap) && s.price >= 3000);
    if (prof.constraints && prof.constraints.mcapMin)
      list = list.filter((s) => s.mcap > prof.constraints.mcapMin);
    if (prof.constraints && prof.constraints.volMin)
      list = list.filter((s) => s.vol >= prof.constraints.volMin);
    const rank = (a) =>
      (prof.directBias ? a.score * 0.5 + (a.ret - 6) * 5 : a.score) * timeTilt;
    return list.sort((x, y) => rank(y) - rank(x)).slice(0, 40);
  }
  const kind = r.role === "index" ? "index" : "active";
  return equityFunds
    .filter(
      (f) =>
        f.kind === kind &&
        r.caps.includes(f.cap) &&
        (r.role !== "index" || isBroadIndex(f)),
    )
    .sort(
      (x, y) =>
        y.score - x.score + (y.ret - x.ret) * 2 * timeTilt,
    )
    .slice(0, 12);
}

// Capital-aware, weight-spread allocation.
// Pass 1 diversifies: budget is spread across the top candidates in proportion
// to their quality score (only where the proportional slice clears the minimum
// ticket). Pass 2 is the concentration tail: leftover capital flows to the
// best affordable names. The number of positions scales with the ticket pool:
// bigger capital, longer horizon and higher-risk profiles all widen the basket.
function invest(cands, budget, opts) {
  const picksMap = new Map();
  const { sectorCapAmt, sectorW, applyCap } = opts;
  const weight = opts.weight || ((a) => a.score);
  const maxPicks = opts.maxPicks || 8;
  let remaining = budget;

  const grid = (a, raw) =>
    raw < 1
      ? 0
      : a.type === "mf"
        ? Math.round((raw / a.price).toFixed(2) * a.price)
        : Math.floor(raw / a.price) * a.price;

  const roomFor = (a, amt) =>
    !applyCap ||
    !Number.isFinite(sectorCapAmt) ||
    (sectorW[a.sector] || 0) + amt <= sectorCapAmt;

  const addOr = (a, amt) => {
    if (amt < a.min || amt < 1) return false;
    if (amt > remaining) amt = remaining;
    if (amt < a.min) return false;
    if (!roomFor(a, amt)) return false;
    const units =
      a.type === "mf"
        ? +(amt / a.price).toFixed(2)
        : Math.floor(amt / a.price);
    if (!(units > 0)) return false;
    const ex = picksMap.get(a.id);
    if (ex) {
      ex.units = +(+ex.units + units).toFixed(2);
      ex.amount += amt;
    } else {
      picksMap.set(a.id, {
        id: a.id,
        name: a.name,
        symbol: a.symbol,
        type: a.type,
        cat: a.cat,
        price: a.price,
        ret: a.ret,
        risk: a.risk,
        sector: a.sector,
        cap: a.cap,
        mcap: a.mcap,
        vol: a.vol,
        units,
        amount: amt,
      });
    }
    remaining -= amt;
    if (applyCap && Number.isFinite(sectorCapAmt))
      sectorW[a.sector] = (sectorW[a.sector] || 0) + amt;
    return true;
  };

  const ranked = [...cands]
    .filter((a) => budget >= a.min)
    .sort((x, y) => weight(y) - weight(x));
  if (!ranked.length) return [];

  // Average ticket size of the best candidates drives how many positions a
  // given budget can realistically hold.
  const mins = ranked.slice(0, 6).map((a) => a.min);
  const perUnit = mins.reduce((s, m) => s + m, 0) / Math.max(1, mins.length);
  const target = Math.min(
    ranked.length,
    Math.max(2, Math.floor(budget / (perUnit * 1.6))),
    maxPicks,
  );
  const chosen = ranked.slice(0, target);
  const totalW = chosen.reduce((s, a) => s + weight(a), 0) || 1;

  for (const a of chosen) {
    let want = (budget * weight(a)) / totalW;
    if (want < a.min) continue;
    want = Math.min(want, remaining);
    const amt = grid(a, want);
    if (amt >= a.min) addOr(a, amt);
  }

  for (const a of ranked) {
    if (remaining < 1) break;
    if (remaining < a.min) continue;
    const amt = grid(a, remaining);
    if (amt < a.min) continue;
    addOr(a, amt);
    if (picksMap.size >= maxPicks * 1.5 && remaining < perUnit) break;
  }

  return [...picksMap.values()];
}

function investWeighted(cands, budget) {
  const picks = [];
  const ssum = cands.reduce((s, a) => s + a.score, 0) || 1;
  for (const a of cands) {
    const want = Math.round((budget * a.score) / ssum);
    if (want < a.min) continue;
    const units = +(want / a.price).toFixed(2);
    const amt = Math.round(units * a.price);
    if (amt > 0)
      picks.push({
        id: a.id,
        name: a.name,
        symbol: a.symbol,
        type: a.type,
        cat: a.cat,
        price: a.price,
        ret: a.ret,
        risk: a.risk,
        sector: a.sector,
        cap: a.cap,
        mcap: a.mcap,
        vol: a.vol,
        units,
        amount: amt,
      });
  }
  return picks;
}

// ---------- Deterministic hash seed ----------
function hashSeed(...parts) {
  let h = 2166136261 >>> 0;
  const s = parts.join("|");
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// ---------- Box-Muller transform ----------
// Converts a pair of uniform [0,1) variates into two independent
// standard-normal variates Z ~ N(0,1).  Consumed in pairs from Mulberry32.
function boxMuller(rng) {
  const u1 = rng() || 1e-10;
  const u2 = rng();
  const r = Math.sqrt(-2 * Math.log(u1));
  return [r * Math.cos(2 * Math.PI * u2), r * Math.sin(2 * Math.PI * u2)];
}

// ---------- Monte Carlo GBM projection ----------
// Runs N_PATHS geometric Brownian-motion paths seeded deterministically
// by (profile, amount, horizon).  Each path compounds:
//   S(t+1) = S(t) * exp((μ - σ²/2)·1 + σ·Z)    Z ~ N(0,1)
// Paths are clamped to [profile.min, profile.max] at each step so the
// terminal distribution stays inside the profile band.
// Returns { median[], low[] (P10), high[] (P90) } — per-year corpus values.
const N_PATHS = 500;

function monteCarloGBM(seed, years, prof) {
  const [bandLo, bandHi] = prof.maxCAGR;
  const mu = Math.log(1 + prof.baseCAGR / 100);
  const sigma = ((bandHi - bandLo) / 2) / 100;

  const rng = mulberry32(seed);

  // Precompute cumulative clamp bounds per year:
  // at year y, multiplier must stay in [(1+lo)^y, (1+hi)^y]
  const loMult = [];
  const hiMult = [];
  for (let y = 0; y <= years; y++) {
    loMult.push(Math.pow(1 + bandLo / 100, y));
    hiMult.push(Math.pow(1 + bandHi / 100, y));
  }

  // Each path: array of (years+1) corpus multipliers starting at 1
  const paths = [];
  for (let p = 0; p < N_PATHS; p++) {
    const path = [1];
    let s = 1;
    for (let y = 0; y < years; y++) {
      const [z1] = boxMuller(rng);
      const drift = mu - sigma * sigma / 2;
      s *= Math.exp(drift + sigma * z1);
      s = Math.max(loMult[y + 1], Math.min(hiMult[y + 1], s));
      path.push(s);
    }
    paths.push(path);
  }

  // Extract percentiles at each year
  const median = [];
  const low = [];
  const high = [];
  for (let y = 0; y <= years; y++) {
    const col = paths.map((p) => p[y]).sort((a, b) => a - b);
    const p10 = Math.floor(N_PATHS * 0.10);
    const p50 = Math.floor(N_PATHS * 0.50);
    const p90 = Math.floor(N_PATHS * 0.90);
    low.push(+col[p10].toFixed(4));
    median.push(+col[p50].toFixed(4));
    high.push(+col[p90].toFixed(4));
  }

  return { median, low, high };
}

function buildPlan({
  riskProfile = "balanced",
  amount = 50000,
  horizon = 5,
} = {}) {
  const years = Math.min(30, Math.max(1, Math.round(horizon || 5)));
  const amt = Math.max(1000, Math.round(amount) || 50000);
  const prof = PROFILES[riskProfile] || PROFILES.balanced;

  const b = bucketsFor(prof, years);
  const sectorW = {};
  let directSpent = 0;
  let picks = [];

  const sectorCapAmt =
    prof.constraints && prof.constraints.sectorCapPct
      ? (amt * prof.constraints.sectorCapPct) / 100
      : Infinity;

  for (const r of prof.roles) {
    let budget = (amt * ((r.share * b.equity) / 100)) / 100;
    if (
      prof.constraints &&
      prof.constraints.directCapPct &&
      r.role === "direct"
    ) {
      budget = Math.min(
        budget,
        (amt * prof.constraints.directCapPct) / 100 - directSpent,
      );
    }
    if (prof.constraints && prof.constraints.midCapPct && r.role === "mid") {
      budget = Math.min(budget, (amt * prof.constraints.midCapPct) / 100);
    }
    if (budget < 1) continue;
    const cands = candidatesFor(prof, r, years);
    const chosen = invest(cands, budget, {
      sectorCapAmt,
      sectorW,
      applyCap: r.role === "direct",
      weight:
        r.role === "direct"
          ? (a) =>
              prof.directBias ? a.score * 0.5 + (a.ret - 6) * 5 : a.score
          : (a) => a.score,
      maxPicks: r.role === "direct" ? 10 : 10,
    });
    if (r.role === "direct")
      directSpent += chosen.reduce((s, p) => s + p.amount, 0);
    picks = picks.concat(chosen);
  }

  for (const cat of ["debt", "gold"]) {
    const budget = (amt * b[cat]) / 100;
    if (budget < 1) continue;
    const cands = assets
      .filter((a) => a.cat === cat && budget >= a.min)
      .sort((x, y) => y.score - x.score)
      .slice(0, 5);
    picks = picks.concat(investWeighted(cands, budget));
  }

  // Deploy any equity slice that could not clear a minimum ticket earlier
  // (common with small lump-sums) into low-minimum broad index funds.
  const eqTarget = (amt * b.equity) / 100;
  const eqSpent = picks.reduce(
    (s, p) => s + (p.cat === "equity" ? p.amount : 0),
    0,
  );
  const leftover = Math.floor(eqTarget - eqSpent);
  if (leftover >= 500) {
    const cands = equityFunds
      .filter((f) => f.kind === "index" && f.type === "mf" && leftover >= f.min)
      .sort((x, y) => y.score - x.score)
      .slice(0, 4);
    if (cands.length)
      picks = picks.concat(
        invest(cands, leftover, { weight: (a) => a.score, maxPicks: 4 }),
      );
  }

  const mc = monteCarloGBM(hashSeed(prof.id, amt, years), years, prof);
  const proj = [{ year: 0, base: amt, low: amt, high: amt }];
  for (let y = 1; y <= years; y++) {
    proj.push({
      year: y,
      base: Math.round(amt * mc.median[y]),
      low: Math.round(amt * mc.low[y]),
      high: Math.round(amt * mc.high[y]),
    });
  }
  const final = proj[proj.length - 1].base;
  const annual = +((Math.pow(final / amt, 1 / years) - 1) * 100).toFixed(1);

  return {
    riskProfile: prof.id,
    profileLabel: prof.label,
    horizon: years,
    amount: amt,
    maxCAGR: prof.maxCAGR,
    annual,
    baseAnnual: +prof.baseCAGR.toFixed(1),
    buckets: b,
    picks,
    final,
    projection: proj,
    constraints: {
      allowDirect: prof.allowDirect,
      sectorCapPct: prof.constraints ? prof.constraints.sectorCapPct : null,
      directCapPct: prof.constraints ? prof.constraints.directCapPct : null,
      midCapPct: prof.constraints ? prof.constraints.midCapPct : null,
      mcapMin: prof.constraints ? prof.constraints.mcapMin : null,
      volMin: prof.constraints ? prof.constraints.volMin : null,
    },
  };
}

module.exports = { assets, stocks, equityFunds, TYPES, PROFILES, buildPlan };
