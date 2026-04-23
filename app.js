window.supabaseClient = window.supabase.createClient(...)
  "https://cebieleodpdxqevfvrlf.supabase.co",
  "sb_publishable_3XWErEMgohJ1rSZF4AxCmQ_6EMyFTrK"
);

const STORAGE_KEY = "net-worth-navigator-v1";

let state = structuredClone(defaultState);
let currentSupabaseRowId = null;

async function initializeApp() {
  wireEvents();

  const loadedState = await loadAppState();

  state = loadedState;
  render();

  scheduleEquityRefresh();
  void refreshEquityQuotes();
  void refreshEquityNews();
}

async function loadAppState() {
  try {
    const { data, error } = await window.supabaseClient
      .from("net_worth")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("Supabase load error:", error);
      return loadStateFromLocalFallback();
    }

    if (!data) {
      console.log("No Supabase row found, using local/default state");
      return loadStateFromLocalFallback();
    }

    currentSupabaseRowId = data.id || null;

    const rawState = data.data ?? data;
    const normalized = normalizeLoadedState(rawState);

    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    return normalized;
  } catch (error) {
    console.error("Unexpected Supabase load failure:", error);
    return loadStateFromLocalFallback();
  }
}

function loadStateFromLocalFallback() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);

    if (!stored) {
      return structuredClone(defaultState);
    }

    return normalizeLoadedState(JSON.parse(stored));
  } catch (error) {
    console.error("Local fallback load failed:", error);
    return structuredClone(defaultState);
  }
}

function normalizeLoadedState(parsed) {
  const defaultClone = structuredClone(defaultState);
  const parsedAssets = Array.isArray(parsed.assets) ? parsed.assets : [];
  const assets = shouldReplaceSeedAssets(parsedAssets) ? defaultClone.assets : parsedAssets;
  const spending = Array.isArray(parsed.spending) ? parsed.spending : defaultClone.spending;
  const equities = Array.isArray(parsed.equities)
    ? normalizeEquities(parsed.equities)
    : defaultClone.equities;
  const parsedCashflow = parsed.cashflow || {};

  return {
    ...defaultClone,
    ...parsed,
    assets,
    equities,
    spending,
    cashflow: normalizeCashflow(parsedCashflow, spending),
    history: normalizeHistory(
      Array.isArray(parsed.history) ? parsed.history : defaultClone.history
    ),
    projection: normalizeProjection({
      ...defaultClone.projection,
      ...(parsed.projection || {}),
    }),
  };
}

async function saveToSupabase() {
  const payload = {
    data: state,
    updated_at: new Date().toISOString(),
  };

  try {
    if (currentSupabaseRowId) {
      const { error } = await supabase
        .from("net_worth")
        .update(payload)
        .eq("id", currentSupabaseRowId);

      if (error) {
        throw error;
      }
    } else {
      const { data, error } = await supabase
        .from("net_worth")
        .insert(payload)
        .select("id")
        .single();

      if (error) {
        throw error;
      }

      currentSupabaseRowId = data.id;
    }
  } catch (error) {
    console.error("Supabase save failed:", error);
  }
}

function persistAndRender() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  void saveToSupabase();
  render();
}
const EQUITY_REFRESH_INTERVAL_MS = 60000;
const QUOTE_PROXY_BASE_URL = "https://corsproxy.io/?url=";
const QUOTE_PROXY_FALLBACK_BASE_URL = "https://api.allorigins.win/raw?url=";
const EQUITY_BATCH_SIZE = 25;
const EQUITY_NEWS_LOOKBACK_DAYS = 7;
const LOCKED_STARTING_SNAPSHOT = {
  id: "locked-starting-net-worth-2025-12-31",
  date: "2025-12-31",
  note: "Locked starting net worth",
  assetsTotal: 2548679,
  liabilitiesTotal: 0,
  netWorth: 2548679,
  locked: true,
};

const defaultState = {
  assets: [
    {
      id: crypto.randomUUID(),
      name: "Checkings - Cash",
      category: "Cash",
      access: "Liquid",
      value: 28043,
      monthlyContribution: 0,
      annualGrowth: 1.5,
    },
    {
      id: crypto.randomUUID(),
      name: "Merryl Lynch - Cash",
      category: "Cash",
      access: "Liquid",
      value: 4258,
      monthlyContribution: 0,
      annualGrowth: 1.5,
    },
    {
      id: crypto.randomUUID(),
      name: "Merryl Lynch - Invested (Equities)",
      category: "Equities",
      access: "Liquid",
      value: 478769,
      monthlyContribution: 0,
      annualGrowth: 6.5,
    },
    {
      id: crypto.randomUUID(),
      name: "Apple Savings - Cash",
      category: "Cash",
      access: "Liquid",
      value: 159176,
      monthlyContribution: 0,
      annualGrowth: 3.5,
    },
    {
      id: crypto.randomUUID(),
      name: "Individual Schwab (TWLO Shares)",
      category: "Equities",
      access: "Liquid",
      value: 67818,
      monthlyContribution: 0,
      annualGrowth: 7,
    },
    {
      id: crypto.randomUUID(),
      name: "e*Trade (CRM Shares)",
      category: "Equities",
      access: "Liquid",
      value: 22025,
      monthlyContribution: 0,
      annualGrowth: 7,
    },
    {
      id: crypto.randomUUID(),
      name: "Vanguard VMFXX - Qualified Exit",
      category: "Cash / Fund",
      access: "Liquid",
      value: 780000,
      monthlyContribution: 0,
      annualGrowth: 4.2,
    },
    {
      id: crypto.randomUUID(),
      name: "Fidelity 401k - Twilio",
      category: "Retirement",
      access: "Retirement Locked",
      value: 329807,
      monthlyContribution: 0,
      annualGrowth: 6.5,
    },
    {
      id: crypto.randomUUID(),
      name: "Big Spring Capital (Credit Fund - Real Estate - 401k)",
      category: "Retirement / Alternatives",
      access: "Retirement Locked",
      value: 100000,
      monthlyContribution: 0,
      annualGrowth: 5.5,
    },
    {
      id: crypto.randomUUID(),
      name: "Betterment (401k) - Qualified",
      category: "Retirement",
      access: "Retirement Locked",
      value: 99622,
      monthlyContribution: 0,
      annualGrowth: 6.5,
    },
    {
      id: crypto.randomUUID(),
      name: "AMP SuperAnnuation",
      category: "Retirement",
      access: "Retirement Locked",
      value: 102765,
      monthlyContribution: 0,
      annualGrowth: 6,
    },
    {
      id: crypto.randomUUID(),
      name: "Big Spring Capital (Upstream Fund - Oil)",
      category: "Alternatives",
      access: "Illiquid",
      value: 101000,
      monthlyContribution: 0,
      annualGrowth: 5,
    },
    {
      id: crypto.randomUUID(),
      name: "Blackthorn Options - LOI Received",
      category: "Private Equity",
      access: "Illiquid",
      value: 250000,
      monthlyContribution: 0,
      annualGrowth: 8,
    },
    {
      id: crypto.randomUUID(),
      name: "headcount365 Options - Invested",
      category: "Private Equity",
      access: "Illiquid",
      value: 25000,
      monthlyContribution: 0,
      annualGrowth: 8,
    },
    {
      id: crypto.randomUUID(),
      name: "GTM Operators Network - Invested",
      category: "Alternatives",
      access: "Illiquid",
      value: 20000,
      monthlyContribution: 0,
      annualGrowth: 6,
    },
    {
      id: crypto.randomUUID(),
      name: "Share of Parent's House",
      category: "Real Estate",
      access: "Illiquid",
      value: 208534,
      monthlyContribution: 0,
      annualGrowth: 3.5,
    },
    {
      id: crypto.randomUUID(),
      name: "Jankow Companies - Real Estate Fund",
      category: "Real Estate",
      access: "Illiquid",
      value: 150000,
      monthlyContribution: 0,
      annualGrowth: 5,
    },
    {
      id: crypto.randomUUID(),
      name: "Alvin Loan ($21.1k AUD)",
      category: "Private Loan",
      access: "Illiquid",
      value: 14820,
      monthlyContribution: 0,
      annualGrowth: 3.1,
    },
    {
      id: crypto.randomUUID(),
      name: "House Additional Value",
      category: "Real Estate",
      access: "Illiquid",
      value: 568339,
      monthlyContribution: 0,
      annualGrowth: 3.5,
    },
  ],
  spending: [
    {
      id: crypto.randomUUID(),
      name: "Housing",
      frequency: "monthly",
      amount: 4500,
    },
    {
      id: crypto.randomUUID(),
      name: "Travel",
      frequency: "annual",
      amount: 18000,
    },
  ],
  equities: [],
  history: [
    LOCKED_STARTING_SNAPSHOT,
  ],
  cashflow: {
    filingStatus: "single",
    annualIncome: 0,
    annualPortfolioAddition: 0,
  },
  projection: {
    years: 10,
    assetGrowthShift: 0,
    portfolioAdditionTarget: "separate",
    inflationRate: 2.5,
  },
};

let draggedSpendId = null;
let draggedAssetId = null;
let equityRefreshTimer = null;
let equityNewsItems = [];
let equityNewsIndex = 0;

const elements = {
  heroNetWorth: document.querySelector("#hero-net-worth"),
  heroTrend: document.querySelector("#hero-trend"),
  totalAssets: document.querySelector("#total-assets"),
  netWorth: document.querySelector("#net-worth"),
  annualPortfolioAdditionMetric: document.querySelector("#annual-portfolio-addition-metric"),
  assetsTableBody: document.querySelector("#assetsTableBody"),
  equitiesStatus: document.querySelector("#equitiesStatus"),
  equitiesAdviceSummary: document.querySelector("#equitiesAdviceSummary"),
  equitiesAdviceList: document.querySelector("#equitiesAdviceList"),
  equitiesNewsStatus: document.querySelector("#equitiesNewsStatus"),
  equitiesNewsCard: document.querySelector("#equitiesNewsCard"),
  previousEquityNewsButton: document.querySelector("#previousEquityNewsButton"),
  nextEquityNewsButton: document.querySelector("#nextEquityNewsButton"),
  merrillEquitiesTableBody: document.querySelector("#merrillEquitiesTableBody"),
  schwabEquitiesTableBody: document.querySelector("#schwabEquitiesTableBody"),
  etradeEquitiesTableBody: document.querySelector("#etradeEquitiesTableBody"),
  merrillEquitiesTotalValue: document.querySelector("#merrillEquitiesTotalValue"),
  merrillEquitiesTotalDayChange: document.querySelector("#merrillEquitiesTotalDayChange"),
  merrillEquitiesTotalGainLoss: document.querySelector("#merrillEquitiesTotalGainLoss"),
  merrillEquitiesTotalCostBasis: document.querySelector("#merrillEquitiesTotalCostBasis"),
  schwabEquitiesTotalValue: document.querySelector("#schwabEquitiesTotalValue"),
  schwabEquitiesTotalDayChange: document.querySelector("#schwabEquitiesTotalDayChange"),
  schwabEquitiesTotalGainLoss: document.querySelector("#schwabEquitiesTotalGainLoss"),
  schwabEquitiesTotalCostBasis: document.querySelector("#schwabEquitiesTotalCostBasis"),
  etradeEquitiesTotalValue: document.querySelector("#etradeEquitiesTotalValue"),
  etradeEquitiesTotalDayChange: document.querySelector("#etradeEquitiesTotalDayChange"),
  etradeEquitiesTotalGainLoss: document.querySelector("#etradeEquitiesTotalGainLoss"),
  etradeEquitiesTotalCostBasis: document.querySelector("#etradeEquitiesTotalCostBasis"),
  spendTableBody: document.querySelector("#spendTableBody"),
  historyList: document.querySelector("#historyList"),
  historyChart: document.querySelector("#historyChart"),
  projectionChart: document.querySelector("#projectionChart"),
  captureSnapshotButton: document.querySelector("#captureSnapshotButton"),
  addAssetButton: document.querySelector("#addAssetButton"),
  addMerrillEquityButton: document.querySelector("#addMerrillEquityButton"),
  addSchwabEquityButton: document.querySelector("#addSchwabEquityButton"),
  addEtradeEquityButton: document.querySelector("#addEtradeEquityButton"),
  refreshEquitiesButton: document.querySelector("#refreshEquitiesButton"),
  addSpendItemButton: document.querySelector("#addSpendItemButton"),
  snapshotNote: document.querySelector("#snapshotNote"),
  filingStatus: document.querySelector("#filingStatus"),
  annualIncome: document.querySelector("#annualIncome"),
  annualPortfolioAddition: document.querySelector("#annualPortfolioAddition"),
  estimatedFederalTax: document.querySelector("#estimatedFederalTax"),
  estimatedFicaTax: document.querySelector("#estimatedFicaTax"),
  estimatedPostTaxIncome: document.querySelector("#estimatedPostTaxIncome"),
  annualSpend: document.querySelector("#annualSpend"),
  annualDelta: document.querySelector("#annualDelta"),
  annualUnallocated: document.querySelector("#annualUnallocated"),
  projectedNetWorth: document.querySelector("#projectedNetWorth"),
  inflationAdjustedNetWorth: document.querySelector("#inflationAdjustedNetWorth"),
  projectionDelta: document.querySelector("#projectionDelta"),
  projectionBreakdownBody: document.querySelector("#projectionBreakdownBody"),
  projectionBreakdownTotal: document.querySelector("#projectionBreakdownTotal"),
  annualPortfolioAdditionProjection: document.querySelector("#annualPortfolioAdditionProjection"),
  portfolioAdditionTarget: document.querySelector("#portfolioAdditionTarget"),
  recalculateProjectionButton: document.querySelector("#recalculateProjectionButton"),
  projectionForm: document.querySelector("#projectionForm"),
};

const projectionInputs = {
  years: document.querySelector("#projectionYears"),
  assetGrowthShift: document.querySelector("#assetGrowthShift"),
  inflationRate: document.querySelector("#inflationRate"),
};

initializeApp();

function wireEvents() {
  elements.addAssetButton.addEventListener("click", () => {
    state.assets.push({
      id: crypto.randomUUID(),
      name: "New asset",
      category: "Other",
      access: "Liquid",
      value: 0,
      monthlyContribution: 0,
      annualGrowth: 0,
    });
    persistAndRender();
  });

  elements.addSpendItemButton.addEventListener("click", () => {
    state.spending.push({
      id: crypto.randomUUID(),
      name: "New spend item",
      frequency: "monthly",
      amount: 0,
    });
    persistAndRender();
  });

  elements.addMerrillEquityButton.addEventListener("click", () => addEquityToBroker("merrill"));
  elements.addSchwabEquityButton.addEventListener("click", () => addEquityToBroker("schwab"));
  elements.addEtradeEquityButton.addEventListener("click", () => addEquityToBroker("etrade"));

  elements.refreshEquitiesButton.addEventListener("click", () => {
    void refreshEquityQuotes(true);
    void refreshEquityNews(true);
  });

  elements.previousEquityNewsButton.addEventListener("click", () => {
    if (!equityNewsItems.length) {
      return;
    }

    equityNewsIndex = (equityNewsIndex - 1 + equityNewsItems.length) % equityNewsItems.length;
    renderEquityNewsCarousel();
  });

  elements.nextEquityNewsButton.addEventListener("click", () => {
    if (!equityNewsItems.length) {
      return;
    }

    equityNewsIndex = (equityNewsIndex + 1) % equityNewsItems.length;
    renderEquityNewsCarousel();
  });

  elements.captureSnapshotButton.addEventListener("click", captureSnapshot);

  elements.filingStatus.addEventListener("change", (event) => {
    state.cashflow.filingStatus = event.target.value;
    persistAndRender();
  });

  elements.annualIncome.addEventListener("input", (event) => {
    state.cashflow.annualIncome = parseNumber(event.target.value);
    persistAndRender();
  });

  elements.annualPortfolioAddition.addEventListener("input", (event) => {
    state.cashflow.annualPortfolioAddition = parseNumber(event.target.value);
    persistAndRender();
  });

  elements.projectionForm.addEventListener("input", (event) => {
    const input = event.target;
    const field = input.dataset.projectionField;

    if (!field) {
      return;
    }

    state.projection[field] =
      field === "years" ? clamp(parseInt(input.value, 10) || 1, 1, 50) : parseNumber(input.value);

    persistAndRender();
  });

  elements.portfolioAdditionTarget.addEventListener("change", (event) => {
    state.projection.portfolioAdditionTarget = event.target.value;
    persistAndRender();
  });

  elements.recalculateProjectionButton.addEventListener("click", () => {
    syncFocusedFieldBeforeRecalculate();
    persistAndRender();
  });
}

function render() {
  syncBrokerAssetTotals();
  syncProjectionInputs();

  const totals = getCurrentTotals();
  const cashflow = getCashflowTotals();
  const taxEstimate = estimateTaxes(state.cashflow.annualIncome, state.cashflow.filingStatus);
  const latestHistory = getLatestHistoryEntry();

  elements.totalAssets.textContent = currency(totals.assets);
  elements.netWorth.textContent = currency(totals.netWorth);
  elements.annualPortfolioAdditionMetric.textContent = currency(state.cashflow.annualPortfolioAddition);
  elements.heroNetWorth.textContent = currency(totals.netWorth);
  elements.heroTrend.textContent = latestHistory
    ? trendLabel(totals.netWorth - latestHistory.netWorth, latestHistory.date)
    : "Capture your first snapshot to start a trend line.";
  elements.filingStatus.value = state.cashflow.filingStatus;
  elements.annualIncome.value = state.cashflow.annualIncome;
  elements.annualPortfolioAddition.value = state.cashflow.annualPortfolioAddition;
  elements.estimatedFederalTax.textContent = currency(taxEstimate.federalIncomeTax);
  elements.estimatedFicaTax.textContent = currency(taxEstimate.ficaTax);
  elements.estimatedPostTaxIncome.textContent = currency(taxEstimate.postTaxIncome);
  elements.annualSpend.textContent = currency(cashflow.annualSpend);
  elements.annualDelta.textContent = currency(cashflow.postTaxDelta);
  elements.annualUnallocated.textContent = currency(cashflow.postTaxDelta - state.cashflow.annualPortfolioAddition);
  elements.annualPortfolioAdditionProjection.value = state.cashflow.annualPortfolioAddition;

  renderAssetsTable();
  renderEquitiesTable();
  renderEquitiesAdvice();
  renderEquityNewsCarousel();
  renderSpendTable();
  renderHistory();

  const historySeries = buildHistorySeries(totals);
  renderLineChart(elements.historyChart, historySeries, "Snapshots and current position", {
    stroke: "#1f7a5f",
    fill: "rgba(31, 122, 95, 0.14)",
    yearlyOnly: true,
    yAxisFormatter: formatMillions,
    pointLabelFormatter: formatMillions,
  });

  const projection = buildProjection(totals);
  renderProjectionSummary(totals.netWorth, projection);
  renderProjectionBreakdown(projection.breakdown);
  renderLineChart(elements.projectionChart, projection.series, "Projected net worth", {
    stroke: "#c48a2e",
    fill: "rgba(196, 138, 46, 0.16)",
    yearlyOnly: true,
    yAxisFormatter: formatMillions,
    pointLabelFormatter: formatMillions,
  });
}

function renderAssetsTable() {
  elements.assetsTableBody.innerHTML = "";

  state.assets.forEach((asset) => {
    const row = document.createElement("tr");
    row.draggable = true;
    row.dataset.assetId = asset.id;
    row.className = "asset-row";
    const isBrokerSyncedAsset = isBrokerLinkedAsset(asset);
    row.innerHTML = `
      <td class="drag-cell"><button class="drag-handle" type="button" aria-label="Drag to reorder" tabindex="-1">::</button></td>
      <td><input data-type="assets" data-id="${asset.id}" data-field="name" value="${escapeHtml(asset.name)}" /></td>
      <td><input data-type="assets" data-id="${asset.id}" data-field="category" value="${escapeHtml(asset.category)}" /></td>
      <td><input data-type="assets" data-id="${asset.id}" data-field="access" value="${escapeHtml(asset.access || "Liquid")}" /></td>
      <td><input data-type="assets" data-id="${asset.id}" data-field="value" inputmode="numeric" value="${currency(asset.value)}" ${isBrokerSyncedAsset ? "disabled" : ""} /></td>
      <td><input data-type="assets" data-id="${asset.id}" data-field="monthlyContribution" type="number" step="50" value="${asset.monthlyContribution}" /></td>
      <td><input data-type="assets" data-id="${asset.id}" data-field="annualGrowth" type="number" step="0.1" value="${asset.annualGrowth}" /></td>
      <td><button class="button delete-button" data-action="delete" data-type="assets" data-id="${asset.id}">Delete</button></td>
    `;
    elements.assetsTableBody.appendChild(row);
  });

  bindTableInputs("assets");
  bindAssetDragAndDrop();
}

function renderSpendTable() {
  elements.spendTableBody.innerHTML = "";

  state.spending.forEach((item) => {
    const row = document.createElement("tr");
    row.draggable = true;
    row.dataset.spendId = item.id;
    row.className = "spend-row";
    row.innerHTML = `
      <td class="drag-cell"><button class="drag-handle" type="button" aria-label="Drag to reorder" tabindex="-1">::</button></td>
      <td><input data-type="spending" data-id="${item.id}" data-field="name" value="${escapeHtml(item.name)}" /></td>
      <td>
        <select data-type="spending" data-id="${item.id}" data-field="frequency">
          <option value="monthly" ${item.frequency === "monthly" ? "selected" : ""}>Monthly</option>
          <option value="annual" ${item.frequency === "annual" ? "selected" : ""}>Annual</option>
        </select>
      </td>
      <td><input data-type="spending" data-id="${item.id}" data-field="amount" type="number" step="100" value="${item.amount}" /></td>
      <td>${currency(toAnnualAmount(item))}</td>
      <td><button class="button delete-button" data-action="delete" data-type="spending" data-id="${item.id}">Delete</button></td>
    `;
    elements.spendTableBody.appendChild(row);
  });

  bindTableInputs("spending");
  bindSpendDragAndDrop();
}

function renderEquitiesTable() {
  renderEquityBrokerTable("merrill", elements.merrillEquitiesTableBody, {
    value: elements.merrillEquitiesTotalValue,
    dayValueChange: elements.merrillEquitiesTotalDayChange,
    gainLoss: elements.merrillEquitiesTotalGainLoss,
    costBasis: elements.merrillEquitiesTotalCostBasis,
  });
  renderEquityBrokerTable("schwab", elements.schwabEquitiesTableBody, {
    value: elements.schwabEquitiesTotalValue,
    dayValueChange: elements.schwabEquitiesTotalDayChange,
    gainLoss: elements.schwabEquitiesTotalGainLoss,
    costBasis: elements.schwabEquitiesTotalCostBasis,
  });
  renderEquityBrokerTable("etrade", elements.etradeEquitiesTableBody, {
    value: elements.etradeEquitiesTotalValue,
    dayValueChange: elements.etradeEquitiesTotalDayChange,
    gainLoss: elements.etradeEquitiesTotalGainLoss,
    costBasis: elements.etradeEquitiesTotalCostBasis,
  });

  bindTableInputs("equities");
}

function renderEquitiesAdvice() {
  const positions = getEquityPositionsForAdvice();
  const totalValue = positions.reduce((total, equity) => total + equity.position.value, 0);

  if (!positions.length || !totalValue) {
    elements.equitiesAdviceSummary.textContent =
      "Add equity quantities and live prices to generate portfolio diagnostics.";
    elements.equitiesAdviceList.innerHTML = "";
    return;
  }

  const topPosition = positions[0];
  const topPositionWeight = topPosition.position.value / totalValue;
  const topFiveWeight =
    positions.slice(0, 5).reduce((total, equity) => total + equity.position.value, 0) / totalValue;
  const concentratedPositions = positions.filter((equity) => equity.position.value / totalValue >= 0.1);
  const losingPositions = positions.filter((equity) => equity.position.unrealizedGainLoss < 0);
  const taxableGain = positions.reduce(
    (total, equity) => total + Math.max(equity.position.unrealizedGainLoss, 0),
    0
  );

  elements.equitiesAdviceSummary.textContent =
    `This diagnostic looks at ${positions.length} equity position${positions.length === 1 ? "" : "s"} worth ${currency(totalValue)}. ` +
    `Largest holding: ${topPosition.symbol} at ${(topPositionWeight * 100).toFixed(1)}% of live equities.`;

  const adviceCards = [
    buildAdviceCard(
      "Concentration check",
      topPositionWeight >= 0.2
        ? `${topPosition.symbol} is above 20% of live equities. Consider reducing single-name risk over time with new contributions, staged trims, or a written target band.`
        : topPositionWeight >= 0.1
          ? `${topPosition.symbol} is above 10% of live equities. Consider setting a max position target and reviewing it when it drifts above that band.`
          : "No single live equity is above 10%, which is a healthier starting point for single-stock risk."
    ),
    buildAdviceCard(
      "Breadth check",
      positions.length < 15
        ? `You currently have ${positions.length} live equity position${positions.length === 1 ? "" : "s"}. Broad-market ETFs or funds can diversify faster than adding individual stocks one at a time.`
        : `You have ${positions.length} live positions. Next review whether they overlap by sector, employer exposure, or mega-cap concentration.`
    ),
    buildAdviceCard(
      "Top-five weight",
      topFiveWeight >= 0.6
        ? `Top five positions are ${(topFiveWeight * 100).toFixed(1)}% of live equities. That is a concentration flag; consider directing new buys toward underrepresented broad exposure.`
        : `Top five positions are ${(topFiveWeight * 100).toFixed(1)}% of live equities. Keep monitoring this as winners grow.`
    ),
    buildAdviceCard(
      "Tax-aware sequencing",
      taxableGain > 0
        ? `There are about ${currency(taxableGain)} of unrealized gains in live equities. Before selling winners, compare capital-gains taxes, holding period, and whether new cash can rebalance with less tax friction.`
        : "If some positions are below cost, review whether tax-loss harvesting could improve after-tax outcomes while avoiding wash-sale issues."
    ),
    buildAdviceCard(
      "Watch list",
      concentratedPositions.length
        ? `Positions at or above 10%: ${concentratedPositions.map((equity) => equity.symbol).join(", ")}. Review these first for risk, tax lots, and rebalancing bands.`
        : losingPositions.length
          ? `Positions currently below cost: ${losingPositions.map((equity) => equity.symbol).join(", ")}. Recheck whether each still deserves capital.`
          : "No obvious 10%+ concentration or unrealized-loss watch item from the live data."
    ),
  ];

  elements.equitiesAdviceList.innerHTML = adviceCards.join("");
}

function getEquityPositionsForAdvice() {
  return state.equities
    .map((equity) => ({
      ...equity,
      position: computeEquityPosition(equity),
    }))
    .filter((equity) => equity.symbol && equity.position.value > 0)
    .sort((left, right) => right.position.value - left.position.value);
}

function buildAdviceCard(title, body) {
  return `
    <article class="advice-card">
      <strong>${escapeHtml(title)}</strong>
      <p>${escapeHtml(body)}</p>
    </article>
  `;
}

function renderEquityBrokerTable(broker, tableBody, totalElements) {
  tableBody.innerHTML = "";

  const brokerEquities = state.equities.filter((equity) => (equity.broker || "merrill") === broker);

  brokerEquities.forEach((equity) => {
    const row = document.createElement("tr");
    const totals = computeEquityPosition(equity);
    const dayChangeClass = totals.dayValueChange >= 0 ? "quote-positive" : "quote-negative";
    const gainLossClass = totals.unrealizedGainLoss >= 0 ? "quote-positive" : "quote-negative";
    const priceChangeClass = parseNumber(equity.priceChange) >= 0 ? "quote-positive" : "quote-negative";

    row.innerHTML = `
      <td class="security-cell">
        <input data-type="equities" data-id="${equity.id}" data-field="symbol" value="${escapeHtml(equity.symbol)}" placeholder="Ticker" />
        <div class="security-name">${escapeHtml(equity.securityName || "No live quote yet")}</div>
      </td>
      <td><input data-type="equities" data-id="${equity.id}" data-field="quantity" type="number" step="0.0001" value="${equity.quantity}" /></td>
      <td>${equity.lastPrice ? currencyWithCents(equity.lastPrice) : "—"}</td>
      <td class="${priceChangeClass}">${equity.lastPrice ? formatPriceChange(equity.priceChange, equity.priceChangePercent) : "—"}</td>
      <td>${totals.value ? currency(totals.value) : "—"}</td>
      <td class="${dayChangeClass}">${equity.lastPrice ? currency(totals.dayValueChange) : "—"}</td>
      <td class="${gainLossClass}">${formatGainLoss(totals.unrealizedGainLoss, totals.costBasis)}</td>
      <td><input data-type="equities" data-id="${equity.id}" data-field="unitCost" type="number" step="0.01" value="${equity.unitCost}" /></td>
      <td>${currency(totals.costBasis)}</td>
      <td><button class="button delete-button" data-action="delete" data-type="equities" data-id="${equity.id}">Delete</button></td>
    `;
    tableBody.appendChild(row);
  });

  const totals = brokerEquities.reduce(
    (accumulator, equity) => {
      const position = computeEquityPosition(equity);
      return {
        value: accumulator.value + position.value,
        dayValueChange: accumulator.dayValueChange + position.dayValueChange,
        unrealizedGainLoss: accumulator.unrealizedGainLoss + position.unrealizedGainLoss,
        costBasis: accumulator.costBasis + position.costBasis,
      };
    },
    { value: 0, dayValueChange: 0, unrealizedGainLoss: 0, costBasis: 0 }
  );

  totalElements.value.textContent = currency(totals.value);
  totalElements.dayValueChange.textContent = currency(totals.dayValueChange);
  totalElements.gainLoss.textContent = formatGainLoss(totals.unrealizedGainLoss, totals.costBasis);
  totalElements.costBasis.textContent = currency(totals.costBasis);
}

function bindTableInputs(type) {
  document.querySelectorAll(`input[data-type="${type}"]`).forEach((input) => {
    input.addEventListener("change", handleRowUpdate);
  });

  document.querySelectorAll(`select[data-type="${type}"]`).forEach((select) => {
    select.addEventListener("change", handleRowUpdate);
  });

  document.querySelectorAll(`button[data-action="delete"][data-type="${type}"]`).forEach((button) => {
    button.addEventListener("click", () => {
      const collection = state[type];
      const index = collection.findIndex((item) => item.id === button.dataset.id);
      if (index >= 0) {
        collection.splice(index, 1);
        persistAndRender();
      }
    });
  });

}

function bindAssetDragAndDrop() {
  document.querySelectorAll(".asset-row").forEach((row) => {
    row.addEventListener("dragstart", () => {
      draggedAssetId = row.dataset.assetId;
      row.classList.add("dragging");
    });

    row.addEventListener("dragend", () => {
      draggedAssetId = null;
      row.classList.remove("dragging");
      document.querySelectorAll(".asset-row").forEach((currentRow) => {
        currentRow.classList.remove("drop-before", "drop-after");
      });
    });

    row.addEventListener("dragover", (event) => {
      event.preventDefault();

      if (!draggedAssetId || draggedAssetId === row.dataset.assetId) {
        return;
      }

      const rect = row.getBoundingClientRect();
      const insertAfter = event.clientY > rect.top + rect.height / 2;

      row.classList.toggle("drop-after", insertAfter);
      row.classList.toggle("drop-before", !insertAfter);
    });

    row.addEventListener("dragleave", () => {
      row.classList.remove("drop-before", "drop-after");
    });

    row.addEventListener("drop", (event) => {
      event.preventDefault();
      row.classList.remove("drop-before", "drop-after");

      if (!draggedAssetId || draggedAssetId === row.dataset.assetId) {
        return;
      }

      const sourceIndex = state.assets.findIndex((item) => item.id === draggedAssetId);
      const targetIndex = state.assets.findIndex((item) => item.id === row.dataset.assetId);

      if (sourceIndex < 0 || targetIndex < 0) {
        return;
      }

      const rect = row.getBoundingClientRect();
      const insertAfter = event.clientY > rect.top + rect.height / 2;
      const nextIndex = insertAfter
        ? targetIndex + (sourceIndex < targetIndex ? 0 : 1)
        : targetIndex - (sourceIndex < targetIndex ? 1 : 0);

      moveAssetToIndex(draggedAssetId, nextIndex);
    });
  });
}

function handleRowUpdate(event) {
  const input = event.target;
  const { type, id, field } = input.dataset;
  const collection = state[type];
  const record = collection.find((item) => item.id === id);

  if (!record) {
    return;
  }

  const numericFields = new Set([
    "value",
    "monthlyContribution",
    "annualGrowth",
    "amount",
    "quantity",
    "unitCost",
  ]);

  if (numericFields.has(field)) {
    record[field] = field === "value" ? Math.round(parseNumber(input.value)) : parseNumber(input.value);
  } else if (type === "equities" && field === "symbol") {
    record[field] = input.value.toUpperCase();
  } else {
    record[field] = input.value;
  }
  persistAndRender();

  if (type === "equities" && field === "symbol" && record.symbol) {
    void refreshEquityQuotes();
  }
}

function syncFocusedFieldBeforeRecalculate() {
  const activeElement = document.activeElement;

  if (!(activeElement instanceof HTMLInputElement || activeElement instanceof HTMLSelectElement)) {
    return;
  }

  if (!activeElement.dataset.type || !activeElement.dataset.id || !activeElement.dataset.field) {
    return;
  }

  handleRowUpdate({ target: activeElement });
}

function captureSnapshot() {
  const totals = getCurrentTotals();
  const note = elements.snapshotNote.value.trim();

  state.history.unshift({
    id: crypto.randomUUID(),
    date: new Date().toISOString().slice(0, 10),
    note: note || "Locked snapshot",
    assetsTotal: totals.assets,
    liabilitiesTotal: 0,
    netWorth: totals.netWorth,
    locked: true,
  });

  elements.snapshotNote.value = "";
  persistAndRender();
}

function renderHistory() {
  const template = document.querySelector("#historyItemTemplate");
  elements.historyList.innerHTML = "";

  if (!state.history.length) {
    elements.historyList.innerHTML = `<div class="empty-state">No snapshots yet. Capture one after you update your accounts.</div>`;
    return;
  }

  state.history
    .slice()
    .sort((left, right) => right.date.localeCompare(left.date))
    .forEach((entry) => {
      const fragment = template.content.cloneNode(true);
      fragment.querySelector(".history-date").textContent = formatDate(entry.date);
      fragment.querySelector(".history-note").textContent = entry.note || "No note added";
      fragment.querySelector(".history-value").textContent = currency(entry.netWorth);
      const deleteButton = fragment.querySelector(".history-delete");
      deleteButton.dataset.id = entry.id;
      deleteButton.hidden = Boolean(entry.locked && entry.id === LOCKED_STARTING_SNAPSHOT.id);
      elements.historyList.appendChild(fragment);
    });

  document.querySelectorAll(".history-delete").forEach((button) => {
    button.addEventListener("click", () => {
      state.history = state.history.filter(
        (entry) => entry.id !== button.dataset.id || entry.id === LOCKED_STARTING_SNAPSHOT.id
      );
      persistAndRender();
    });
  });
}

function renderProjectionSummary(currentNetWorth, projection) {
  const finalPoint = projection.series.at(-1);

  if (!finalPoint) {
    elements.projectedNetWorth.textContent = currency(currentNetWorth);
    elements.inflationAdjustedNetWorth.textContent = currency(currentNetWorth);
    elements.projectionDelta.textContent = currency(0);
    return;
  }

  elements.projectedNetWorth.textContent = currency(finalPoint.value);
  elements.inflationAdjustedNetWorth.textContent = currency(finalPoint.realValue);
  elements.projectionDelta.textContent = currency(finalPoint.value - currentNetWorth);
}

function renderProjectionBreakdown(breakdown) {
  elements.projectionBreakdownBody.innerHTML = "";

  breakdown
    .slice()
    .sort((left, right) => right.value - left.value)
    .forEach((asset) => {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${escapeHtml(asset.name)}</td>
        <td>${escapeHtml(asset.category)}</td>
        <td>${escapeHtml(asset.access)}</td>
        <td>${currency(asset.value)}</td>
      `;
      elements.projectionBreakdownBody.appendChild(row);
    });

  elements.projectionBreakdownTotal.textContent = currency(
    breakdown.reduce((total, asset) => total + asset.value, 0)
  );
}

function buildProjection(totals) {
  const years = clamp(Math.round(state.projection.years), 1, 50);
  const months = years * 12;
  const assetShift = state.projection.assetGrowthShift;
  const inflationRate = state.projection.inflationRate;
  const annualPortfolioAddition = state.cashflow.annualPortfolioAddition;
  const additionTarget = state.projection.portfolioAdditionTarget || "separate";

  let assets = state.assets.map((asset) => ({ ...asset }));
  let futurePortfolioAdditions = 0;

  const series = [
    {
      label: "Today",
      value: totals.netWorth,
      realValue: totals.netWorth,
    },
  ];

  for (let month = 1; month <= months; month += 1) {
    assets = assets.map((asset) => {
      const monthlyGrowth = toMonthlyGrowthRate(asset.annualGrowth + assetShift);
      const nextValue = asset.value * (1 + monthlyGrowth) + asset.monthlyContribution;
      return { ...asset, value: Math.max(nextValue, 0) };
    });

    if (month % 12 === 0 && annualPortfolioAddition > 0) {
      if (additionTarget === "separate") {
        futurePortfolioAdditions += annualPortfolioAddition;
      } else {
        assets = assets.map((asset) =>
          asset.id === additionTarget
            ? { ...asset, value: asset.value + annualPortfolioAddition }
            : asset
        );
      }
    }

    const assetTotal = sumBy(assets, "value");
    const netWorth = assetTotal + futurePortfolioAdditions;
    const inflationFactor = (1 + toMonthlyGrowthRate(inflationRate)) ** month;

    series.push({
      label: month % 12 === 0 ? `Year ${month / 12}` : "",
      value: netWorth,
      realValue: netWorth / inflationFactor,
    });
  }

  return {
    series,
    breakdown: [
      ...assets.map((asset) => ({
        name: asset.name,
        category: asset.category,
        access: asset.access || "Liquid",
        value: asset.value,
      })),
      ...(futurePortfolioAdditions
        ? [
            {
              name: "Future portfolio additions",
              category: "Projected contributions",
              access: "Future cash flow",
              value: futurePortfolioAdditions,
            },
          ]
        : []),
    ],
  };
}

function buildHistorySeries(totals) {
  const sortedHistory = state.history
    .slice()
    .sort((left, right) => left.date.localeCompare(right.date))
    .map((entry) => ({
      label: formatDate(entry.date),
      value: entry.netWorth,
    }));

  sortedHistory.push({
    label: "Today",
    value: totals.netWorth,
  });

  return sortedHistory;
}

function renderLineChart(container, series, title, palette) {
  if (!series.length) {
    container.innerHTML = `<div class="empty-state">Nothing to chart yet.</div>`;
    return;
  }

  const width = 760;
  const height = 260;
  const padding = { top: 20, right: 18, bottom: 32, left: 18 };
  const values = series.map((point) => point.value);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const spread = maxValue - minValue || Math.max(Math.abs(maxValue), 1);
  const xStep = series.length === 1 ? 0 : (width - padding.left - padding.right) / (series.length - 1);

  const coords = series.map((point, index) => {
    const x = padding.left + xStep * index;
    const y =
      height - padding.bottom - ((point.value - minValue) / spread) * (height - padding.top - padding.bottom);
    return { ...point, x, y };
  });

  const path = coords
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
    .join(" ");

  const area = `${path} L ${coords.at(-1).x.toFixed(1)} ${height - padding.bottom} L ${coords[0].x.toFixed(
    1
  )} ${height - padding.bottom} Z`;

  const firstLabel = coords[0]?.label || "";
  const lastLabel = coords.at(-1)?.label || "";
  const yAxisFormatter = palette.yAxisFormatter || currency;
  const pointLabelFormatter = palette.pointLabelFormatter || currency;
  const plottedCoords = palette.yearlyOnly
    ? coords.filter((point) => point.label)
    : coords;

  container.innerHTML = `
    <p class="chart-title">${title}</p>
    <svg class="chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${title}">
      <line x1="${padding.left}" y1="${height - padding.bottom}" x2="${width - padding.right}" y2="${
    height - padding.bottom
  }" stroke="rgba(31,29,26,0.1)" />
      <path d="${area}" fill="${palette.fill}" />
      <path d="${path}" fill="none" stroke="${palette.stroke}" stroke-width="4" stroke-linecap="round" />
      ${plottedCoords
        .map(
          (point) => `
            <circle cx="${point.x}" cy="${point.y}" r="4.5" fill="${palette.stroke}" />
          `
        )
        .join("")}
      ${palette.yearlyOnly
        ? plottedCoords
            .filter((point) => point.label !== "Today")
            .map(
              (point) => `
                <text x="${point.x}" y="${point.y - 12}" fill="${palette.stroke}" font-size="11" text-anchor="middle">
                  ${pointLabelFormatter(point.value)}
                </text>
              `
            )
            .join("")
        : ""}
      <text x="${padding.left}" y="${height - 8}" fill="#6f655b" font-size="12">${firstLabel}</text>
      <text x="${width - padding.right}" y="${height - 8}" fill="#6f655b" font-size="12" text-anchor="end">${lastLabel}</text>
      <text x="${padding.left}" y="${padding.top - 2}" fill="#6f655b" font-size="12">${yAxisFormatter(maxValue)}</text>
      <text x="${padding.left}" y="${height - padding.bottom + 16}" fill="#6f655b" font-size="12">${yAxisFormatter(minValue)}</text>
    </svg>
  `;
}

function getCurrentTotals() {
  const assets = sumBy(state.assets, "value");
  return {
    assets,
    liabilities: 0,
    netWorth: assets,
  };
}

function getLatestHistoryEntry() {
  return state.history
    .slice()
    .sort((left, right) => right.date.localeCompare(left.date))[0];
}

function persistAndRender() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  render();
}

function loadState() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return structuredClone(defaultState);
    }

    const parsed = JSON.parse(stored);
    const defaultClone = structuredClone(defaultState);
    const parsedAssets = Array.isArray(parsed.assets) ? parsed.assets : [];
    const assets = shouldReplaceSeedAssets(parsedAssets) ? defaultClone.assets : parsedAssets;
    const spending = Array.isArray(parsed.spending) ? parsed.spending : defaultClone.spending;
    const equities = Array.isArray(parsed.equities) ? normalizeEquities(parsed.equities) : defaultClone.equities;
    const parsedCashflow = parsed.cashflow || {};

    return {
      ...defaultClone,
      ...parsed,
      assets,
      equities,
      spending,
      cashflow: normalizeCashflow(parsedCashflow, spending),
      history: normalizeHistory(Array.isArray(parsed.history) ? parsed.history : defaultClone.history),
      projection: normalizeProjection({
        ...defaultClone.projection,
        ...(parsed.projection || {}),
      }),
    };
  } catch (error) {
    console.error("Unable to load saved data", error);
    return structuredClone(defaultState);
  }
}

function sumBy(collection, field) {
  return collection.reduce((total, item) => total + parseNumber(item[field]), 0);
}

function parseNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function toMonthlyGrowthRate(annualPercent) {
  return (1 + annualPercent / 100) ** (1 / 12) - 1;
}

function formatDate(value) {
  return new Date(`${value}T00:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function currency(value) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function currencyWithCents(value) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatPriceChange(change, percentChange) {
  const prefix = change >= 0 ? "+" : "";
  return `${prefix}${currencyWithCents(change)} (${prefix}${percentChange.toFixed(2)}%)`;
}

function formatGainLoss(gainLoss, costBasis) {
  if (!costBasis) {
    return currency(gainLoss);
  }

  const percent = (gainLoss / costBasis) * 100;
  const prefix = gainLoss >= 0 ? "+" : "";
  return `${currency(gainLoss)} (${prefix}${percent.toFixed(2)}%)`;
}

function formatMillions(value) {
  return `$${(value / 1000000).toFixed(1)}M`;
}

function trendLabel(delta, comparisonDate) {
  const direction = delta >= 0 ? "up" : "down";
  return `${direction} ${currency(Math.abs(delta))} vs ${formatDate(comparisonDate)}`;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function syncProjectionInputs() {
  syncPortfolioAdditionTargetOptions();
  projectionInputs.years.value = state.projection.years;
  projectionInputs.assetGrowthShift.value = state.projection.assetGrowthShift;
  projectionInputs.inflationRate.value = state.projection.inflationRate;
}

function syncPortfolioAdditionTargetOptions() {
  const currentValue = state.projection.portfolioAdditionTarget || "separate";
  const options = [
    `<option value="separate">Separate future contribution line</option>`,
    ...state.assets.map(
      (asset) =>
        `<option value="${asset.id}">${escapeHtml(asset.name)}</option>`
    ),
  ];

  elements.portfolioAdditionTarget.innerHTML = options.join("");
  elements.portfolioAdditionTarget.value = state.assets.some((asset) => asset.id === currentValue)
    ? currentValue
    : "separate";
  state.projection.portfolioAdditionTarget = elements.portfolioAdditionTarget.value;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function shouldReplaceSeedAssets(assets) {
  if (!assets.length) {
    return true;
  }

  const legacySeedNames = new Set(["Brokerage", "Cash Reserve", "Home Equity"]);
  return assets.length === legacySeedNames.size && assets.every((asset) => legacySeedNames.has(asset.name));
}

function normalizeProjection(projection) {
  const years =
    projection.years ??
    (Number.isFinite(projection.months) && projection.months > 0
      ? Math.max(1, Math.round(projection.months / 12))
      : defaultState.projection.years);

  return {
    ...projection,
    years: clamp(parseInt(years, 10) || 1, 1, 50),
  };
}

function getCashflowTotals() {
  const annualSpend = state.spending.reduce((total, item) => total + toAnnualAmount(item), 0);
  const taxEstimate = estimateTaxes(state.cashflow.annualIncome, state.cashflow.filingStatus);
  return {
    annualSpend,
    annualDelta: state.cashflow.annualIncome - annualSpend,
    postTaxIncome: taxEstimate.postTaxIncome,
    postTaxDelta: taxEstimate.postTaxIncome - annualSpend,
  };
}

function toAnnualAmount(item) {
  return item.frequency === "monthly" ? parseNumber(item.amount) * 12 : parseNumber(item.amount);
}

function normalizeCashflow(cashflow, spending) {
  const annualSpend = spending.reduce((total, item) => total + toAnnualAmount(item), 0);
  const annualIncome = parseNumber(cashflow.annualIncome);
  const defaultAddition = Math.max(annualIncome - annualSpend, 0);
  const hasSavedAddition = Object.prototype.hasOwnProperty.call(cashflow, "annualPortfolioAddition");

  return {
    filingStatus: normalizeFilingStatus(cashflow.filingStatus),
    annualIncome,
    annualPortfolioAddition: hasSavedAddition
      ? parseNumber(cashflow.annualPortfolioAddition)
      : defaultAddition,
  };
}

function createEquityRow() {
  return {
    id: crypto.randomUUID(),
    broker: "merrill",
    symbol: "",
    securityName: "",
    quantity: 0,
    lastPrice: 0,
    priceChange: 0,
    priceChangePercent: 0,
    unitCost: 0,
    lastUpdated: "",
  };
}

function addEquityToBroker(broker) {
  state.equities.push({
    ...createEquityRow(),
    broker,
  });
  persistAndRender();
}

function computeEquityPosition(equity) {
  const quantity = parseNumber(equity.quantity);
  const lastPrice = parseNumber(equity.lastPrice);
  const unitCost = parseNumber(equity.unitCost);
  const value = quantity * lastPrice;
  const costBasis = quantity * unitCost;

  return {
    value,
    costBasis,
    dayValueChange: quantity * parseNumber(equity.priceChange),
    unrealizedGainLoss: value - costBasis,
  };
}

function moveAssetToIndex(id, targetIndex) {
  const index = state.assets.findIndex((item) => item.id === id);

  if (index < 0 || targetIndex < 0 || targetIndex >= state.assets.length || index === targetIndex) {
    return;
  }

  const [movedItem] = state.assets.splice(index, 1);
  state.assets.splice(targetIndex, 0, movedItem);
  persistAndRender();
}

function syncBrokerAssetTotals() {
  const brokerTotals = {
    merrill: getBrokerEquityTotals("merrill").value,
    schwab: getBrokerEquityTotals("schwab").value,
    etrade: getBrokerEquityTotals("etrade").value,
  };

  upsertBrokerLinkedAsset(
    ["Merryl Lynch - Invested (Equities)", "Merrill Lynch - Invested (Equities)"],
    "Merrill Lynch - Invested (Equities)",
    "Equities",
    "Liquid",
    brokerTotals.merrill
  );
  upsertBrokerLinkedAsset(
    ["Individual Schwab (TWLO Shares)", "Schwab Equities"],
    "Individual Schwab (TWLO Shares)",
    "Equities",
    "Liquid",
    brokerTotals.schwab
  );
  upsertBrokerLinkedAsset(
    ["e*Trade (CRM Shares)", "e*Trade Equities"],
    "e*Trade (CRM Shares)",
    "Equities",
    "Liquid",
    brokerTotals.etrade
  );
}

function getBrokerEquityTotals(broker) {
  return state.equities
    .filter((equity) => (equity.broker || "merrill") === broker)
    .reduce(
      (accumulator, equity) => {
        const position = computeEquityPosition(equity);
        return {
          value: accumulator.value + position.value,
          dayValueChange: accumulator.dayValueChange + position.dayValueChange,
          unrealizedGainLoss: accumulator.unrealizedGainLoss + position.unrealizedGainLoss,
          costBasis: accumulator.costBasis + position.costBasis,
        };
      },
      { value: 0, dayValueChange: 0, unrealizedGainLoss: 0, costBasis: 0 }
    );
}

function upsertBrokerLinkedAsset(nameCandidates, canonicalName, category, access, value) {
  const asset = state.assets.find((item) => nameCandidates.includes(item.name));

  if (asset) {
    asset.name = canonicalName;
    asset.category = category;
    asset.access = access;
    asset.value = value;
    return;
  }

  state.assets.push({
    id: crypto.randomUUID(),
    name: canonicalName,
    category,
    access,
    value,
    monthlyContribution: 0,
    annualGrowth: 0,
  });
}

function isBrokerLinkedAsset(asset) {
  return [
    "Merrill Lynch - Invested (Equities)",
    "Merryl Lynch - Invested (Equities)",
    "Individual Schwab (TWLO Shares)",
    "e*Trade (CRM Shares)",
  ].includes(asset.name);
}

async function refreshEquityQuotes(fromManualRefresh = false) {
  const symbols = state.equities
    .map((equity) => equity.symbol.trim().toUpperCase())
    .filter(Boolean);

  if (!symbols.length) {
    elements.equitiesStatus.textContent = "Add ticker symbols to pull live quotes.";
    return;
  }

  elements.refreshEquitiesButton.disabled = true;
  elements.equitiesStatus.textContent = fromManualRefresh ? "Refreshing quotes..." : "Loading live quotes...";
  try {
    const batchQuotes = await fetchEquityQuotesBatch(symbols);
    const quoteResults = await Promise.all(
      state.equities.map(async (equity) => {
        const cleanedSymbol = equity.symbol.trim().toUpperCase();

        if (!cleanedSymbol) {
          return equity;
        }

        const liveQuote =
          batchQuotes.get(cleanedSymbol) ||
          (await fetchEquityQuote(cleanedSymbol)) ||
          {
            securityName: equity.securityName || cleanedSymbol,
            lastPrice: equity.lastPrice,
            priceChange: equity.priceChange,
            priceChangePercent: equity.priceChangePercent,
          };
        return {
          ...equity,
          ...liveQuote,
          symbol: cleanedSymbol,
          lastUpdated: new Date().toISOString(),
        };
      })
    );

    state.equities = quoteResults;
    persistAndRender();

    const successfulQuotes = quoteResults.filter((equity) => equity.lastPrice > 0).length;
    elements.equitiesStatus.textContent = successfulQuotes
      ? `Last updated ${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} for ${successfulQuotes} ticker${successfulQuotes === 1 ? "" : "s"}. Closed markets use the latest close.`
      : "Quotes unavailable right now. Double-check ticker symbols or try refreshing again.";
  } catch (error) {
    console.error("Unable to refresh equity quotes", error);
    elements.equitiesStatus.textContent = "Quote refresh failed. Try again in a moment.";
  } finally {
    elements.refreshEquitiesButton.disabled = false;
  }
}

async function refreshEquityNews(fromManualRefresh = false) {
  const symbols = [...new Set(state.equities.map((equity) => equity.symbol.trim().toUpperCase()).filter(Boolean))];

  if (!symbols.length) {
    equityNewsItems = [];
    equityNewsIndex = 0;
    elements.equitiesNewsStatus.textContent = "Add equity tickers to load recent articles.";
    renderEquityNewsCarousel();
    return;
  }

  elements.equitiesNewsStatus.textContent = fromManualRefresh
    ? "Refreshing recent equity news..."
    : "Loading recent equity news...";

  const articleGroups = await Promise.all(symbols.map((symbol) => fetchEquityNewsForSymbol(symbol)));
  const cutoff = Date.now() - EQUITY_NEWS_LOOKBACK_DAYS * 24 * 60 * 60 * 1000;
  const articleMap = new Map();

  articleGroups.flat().forEach((article) => {
    if (!article.publishedAt || article.publishedAt.getTime() < cutoff) {
      return;
    }

    const key = article.link || `${article.symbol}-${article.title}`;
    if (!articleMap.has(key)) {
      articleMap.set(key, article);
    }
  });

  equityNewsItems = [...articleMap.values()].sort((left, right) => right.publishedAt - left.publishedAt);
  equityNewsIndex = Math.min(equityNewsIndex, Math.max(equityNewsItems.length - 1, 0));
  elements.equitiesNewsStatus.textContent = equityNewsItems.length
    ? `${equityNewsItems.length} recent article${equityNewsItems.length === 1 ? "" : "s"} from the last ${EQUITY_NEWS_LOOKBACK_DAYS} days.`
    : `No recent Yahoo Finance RSS articles found from the last ${EQUITY_NEWS_LOOKBACK_DAYS} days.`;
  renderEquityNewsCarousel();
}

async function fetchEquityNewsForSymbol(symbol) {
  const feedUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(`${symbol} stock when:${EQUITY_NEWS_LOOKBACK_DAYS}d`)}&hl=en-US&gl=US&ceid=US:en`;
  const candidates = [
    `${QUOTE_PROXY_FALLBACK_BASE_URL}${encodeURIComponent(feedUrl)}`,
    `${QUOTE_PROXY_BASE_URL}${encodeURIComponent(feedUrl)}`,
  ];

  for (const candidateUrl of candidates) {
    try {
      const response = await fetch(candidateUrl);
      if (!response.ok) {
        continue;
      }

      const xmlText = await response.text();
      const parsedFeed = new DOMParser().parseFromString(xmlText, "text/xml");
      const items = [...parsedFeed.querySelectorAll("item")];

      if (!items.length) {
        continue;
      }

      return items.map((item) => ({
        symbol,
        title: getXmlText(item, "title"),
        link: getXmlText(item, "link"),
        source: getXmlText(item, "source") || "Google News",
        description: stripHtml(getXmlText(item, "description")),
        publishedAt: new Date(getXmlText(item, "pubDate")),
      }));
    } catch (error) {
      console.error(`Unable to fetch news for ${symbol}`, error);
    }
  }

  return [];
}

function renderEquityNewsCarousel() {
  elements.previousEquityNewsButton.disabled = equityNewsItems.length <= 1;
  elements.nextEquityNewsButton.disabled = equityNewsItems.length <= 1;

  if (!equityNewsItems.length) {
    const symbols = [...new Set(state.equities.map((equity) => equity.symbol.trim().toUpperCase()).filter(Boolean))];
    elements.equitiesNewsCard.innerHTML = symbols.length
      ? `No articles were returned for ${escapeHtml(symbols.join(", "))} in the last ${EQUITY_NEWS_LOOKBACK_DAYS} days. Try Refresh quotes/news again, or the Yahoo RSS feed may be blocking browser access right now.`
      : "Add equity tickers to load recent articles.";
    return;
  }

  const article = equityNewsItems[equityNewsIndex];
  elements.equitiesNewsCard.innerHTML = `
    <div class="news-meta">${escapeHtml(article.symbol)} · ${escapeHtml(article.source)} · ${formatDate(article.publishedAt.toISOString().slice(0, 10))} · ${equityNewsIndex + 1}/${equityNewsItems.length}</div>
    <h3><a href="${escapeHtml(article.link)}" target="_blank" rel="noreferrer">${escapeHtml(article.title)}</a></h3>
    <p>${escapeHtml(article.description || "Open the article for details.")}</p>
  `;
}

function getXmlText(node, selector) {
  return (
    node.querySelector(selector)?.textContent?.trim() ||
    [...node.children].find((child) => child.tagName.toLowerCase().endsWith(`:${selector}`))?.textContent?.trim() ||
    ""
  );
}

function stripHtml(value) {
  const template = document.createElement("template");
  template.innerHTML = value;
  return template.content.textContent?.trim() || "";
}

async function fetchEquityQuote(symbol) {
  try {
    const chartQuote = await fetchEquityQuoteFromChart(symbol);
    if (chartQuote?.lastPrice) {
      return chartQuote;
    }

    const quoteApiQuote = await fetchEquityQuoteFromQuoteApi(symbol);
    if (quoteApiQuote?.lastPrice) {
      return quoteApiQuote;
    }

    const pageQuote = await fetchEquityQuoteFromPage(symbol);
    if (pageQuote?.lastPrice) {
      return pageQuote;
    }

    return null;
  } catch (error) {
    console.error(`Unable to refresh quote for ${symbol}`, error);
    return null;
  }
}

async function fetchEquityQuotesBatch(symbols) {
  const uniqueSymbols = [...new Set(symbols.filter(Boolean))];
  const quotes = new Map();

  for (let index = 0; index < uniqueSymbols.length; index += EQUITY_BATCH_SIZE) {
    const batch = uniqueSymbols.slice(index, index + EQUITY_BATCH_SIZE);
    const targetUrl = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(batch.join(","))}`;

    try {
      const data = await fetchQuotePayload(targetUrl);
      const results = data?.quoteResponse?.result || [];

      results.forEach((quote) => {
        const symbol = (quote.symbol || "").toUpperCase();
        const marketState = String(quote.marketState || "").toUpperCase();
        const regularMarketPrice = parseNumber(quote.regularMarketPrice);
        const regularMarketPreviousClose = parseNumber(quote.regularMarketPreviousClose || quote.previousClose);
        const useClosingPrice = marketState && marketState !== "REGULAR";
        const lastPrice = useClosingPrice
          ? parseNumber(quote.regularMarketPreviousClose || quote.regularMarketPrice)
          : regularMarketPrice;
        const priceChange = useClosingPrice
          ? lastPrice - regularMarketPreviousClose
          : parseNumber(quote.regularMarketChange);
        const priceChangePercent = regularMarketPreviousClose > 0
          ? (priceChange / regularMarketPreviousClose) * 100
          : parseNumber(quote.regularMarketChangePercent);

        if (!symbol || !lastPrice) {
          return;
        }

        quotes.set(symbol, {
          securityName: quote.longName || quote.shortName || symbol,
          lastPrice,
          priceChange,
          priceChangePercent,
          marketState,
        });
      });
    } catch (error) {
      console.error("Batch equity quote refresh failed", batch, error);
    }
  }

  return quotes;
}

async function fetchEquityQuoteFromChart(symbol) {
  const targetUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d&includePrePost=false`;
  const data = await fetchQuotePayload(targetUrl);
  const result = data?.chart?.result?.[0];
  const meta = result?.meta;
  const closes = (result?.indicators?.quote?.[0]?.close || []).filter((value) => Number.isFinite(value));
  const lastClose = parseNumber(closes.at(-1) || meta?.regularMarketPrice || meta?.previousClose);
  const previousClose = parseNumber(closes.at(-2) || meta?.chartPreviousClose || meta?.previousClose);
  const marketPrice = parseNumber(meta?.regularMarketPrice);
  const marketState = String(meta?.marketState || "").toUpperCase();
  const useClosingPrice = ["CLOSED", "POST", "PREPRE", "POSTPOST"].includes(marketState) || !marketPrice;
  const lastPrice = useClosingPrice ? lastClose : marketPrice;
  const priceChange = lastPrice - previousClose;
  const priceChangePercent = previousClose > 0 ? (priceChange / previousClose) * 100 : 0;

  if (!lastPrice) {
    return null;
  }

  return {
    securityName: meta?.longName || meta?.shortName || symbol,
    lastPrice,
    priceChange,
    priceChangePercent,
  };
}

async function fetchEquityQuoteFromQuoteApi(symbol) {
  const targetUrl = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbol)}`;
  const data = await fetchQuotePayload(targetUrl);
  const quote = data?.quoteResponse?.result?.[0];

  if (!quote) {
    return null;
  }

  const marketState = String(quote.marketState || "").toUpperCase();
  const regularMarketPrice = parseNumber(quote.regularMarketPrice);
  const previousClose = parseNumber(quote.regularMarketPreviousClose || quote.previousClose);
  const useClosingPrice = marketState && marketState !== "REGULAR";
  const lastPrice = useClosingPrice
    ? parseNumber(quote.regularMarketPreviousClose || quote.regularMarketPrice)
    : regularMarketPrice;
  const priceChange = useClosingPrice
    ? lastPrice - previousClose
    : parseNumber(quote.regularMarketChange);
  const priceChangePercent = previousClose > 0
    ? (priceChange / previousClose) * 100
    : parseNumber(quote.regularMarketChangePercent);

  if (!lastPrice) {
    return null;
  }

  return {
    securityName: quote.longName || quote.shortName || symbol,
    lastPrice,
    priceChange,
    priceChangePercent,
  };
}

async function fetchQuotePayload(targetUrl) {
  const candidates = [
    `${QUOTE_PROXY_FALLBACK_BASE_URL}${encodeURIComponent(targetUrl)}`,
    `${QUOTE_PROXY_BASE_URL}${encodeURIComponent(targetUrl)}`,
  ];

  let lastError = null;

  for (const candidateUrl of candidates) {
    try {
      const response = await fetch(candidateUrl, {
        headers: {
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("Quote request failed");
}

async function fetchEquityQuoteFromPage(symbol) {
  const targetUrl = `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}`;
  const candidates = [
    `${QUOTE_PROXY_FALLBACK_BASE_URL}${encodeURIComponent(targetUrl)}`,
    `${QUOTE_PROXY_BASE_URL}${encodeURIComponent(targetUrl)}`,
  ];

  let html = "";

  for (const candidateUrl of candidates) {
    try {
      const response = await fetch(candidateUrl);
      if (!response.ok) {
        continue;
      }

      html = await response.text();
      if (html) {
        break;
      }
    } catch (error) {
      console.error(`Unable to fetch quote page for ${symbol}`, error);
    }
  }

  if (!html) {
    return null;
  }

  const price = extractNumberFromHtml(html, [
    /"regularMarketPrice":\{"raw":([\d.]+)/,
    /"currentPrice":\{"raw":([\d.]+)/,
  ]);
  const previousClose = extractNumberFromHtml(html, [
    /"regularMarketPreviousClose":\{"raw":([\d.]+)/,
    /"previousClose":\{"raw":([\d.]+)/,
  ]);
  const shortNameMatch = html.match(/"shortName":"([^"]+)"/);
  const longNameMatch = html.match(/"longName":"([^"]+)"/);

  if (!price) {
    return null;
  }

  const priceChange = previousClose ? price - previousClose : 0;
  const priceChangePercent = previousClose ? (priceChange / previousClose) * 100 : 0;

  return {
    securityName: decodeHtmlText(longNameMatch?.[1] || shortNameMatch?.[1] || symbol),
    lastPrice: price,
    priceChange,
    priceChangePercent,
  };
}

function extractNumberFromHtml(html, patterns) {
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      return parseNumber(match[1]);
    }
  }

  return 0;
}

function decodeHtmlText(value) {
  return String(value)
    .replaceAll("\\u002F", "/")
    .replaceAll("\\u0026", "&")
    .replaceAll('\\"', '"');
}

function normalizeEquities(equities) {
  return equities.map((equity) => ({
    ...createEquityRow(),
    ...equity,
    broker: ["merrill", "schwab", "etrade"].includes(equity.broker) ? equity.broker : "merrill",
  }));
}

function normalizeHistory(history) {
  const withoutDemoOrDuplicateStart = history.filter((entry) => {
    const isDemoSnapshot = ["Year-end checkpoint", "Q1 review"].includes(entry.note);
    const isStartingSnapshot = entry.date === LOCKED_STARTING_SNAPSHOT.date;
    return !isDemoSnapshot && !isStartingSnapshot;
  });

  return [LOCKED_STARTING_SNAPSHOT, ...withoutDemoOrDuplicateStart].sort((left, right) =>
    right.date.localeCompare(left.date)
  );
}

function scheduleEquityRefresh() {
  if (equityRefreshTimer) {
    clearInterval(equityRefreshTimer);
  }

  equityRefreshTimer = window.setInterval(() => {
    void refreshEquityQuotes();
  }, EQUITY_REFRESH_INTERVAL_MS);
}

function moveSpendItemToIndex(id, targetIndex) {
  const index = state.spending.findIndex((item) => item.id === id);

  if (index < 0 || targetIndex < 0 || targetIndex >= state.spending.length || index === targetIndex) {
    return;
  }

  const [movedItem] = state.spending.splice(index, 1);
  state.spending.splice(targetIndex, 0, movedItem);
  persistAndRender();
}

function bindSpendDragAndDrop() {
  document.querySelectorAll(".spend-row").forEach((row) => {
    row.addEventListener("dragstart", () => {
      draggedSpendId = row.dataset.spendId;
      row.classList.add("dragging");
    });

    row.addEventListener("dragend", () => {
      draggedSpendId = null;
      row.classList.remove("dragging");
      document.querySelectorAll(".spend-row").forEach((currentRow) => {
        currentRow.classList.remove("drop-before", "drop-after");
      });
    });

    row.addEventListener("dragover", (event) => {
      event.preventDefault();

      if (!draggedSpendId || draggedSpendId === row.dataset.spendId) {
        return;
      }

      const rect = row.getBoundingClientRect();
      const insertAfter = event.clientY > rect.top + rect.height / 2;

      row.classList.toggle("drop-after", insertAfter);
      row.classList.toggle("drop-before", !insertAfter);
    });

    row.addEventListener("dragleave", () => {
      row.classList.remove("drop-before", "drop-after");
    });

    row.addEventListener("drop", (event) => {
      event.preventDefault();
      row.classList.remove("drop-before", "drop-after");

      if (!draggedSpendId || draggedSpendId === row.dataset.spendId) {
        return;
      }

      const sourceIndex = state.spending.findIndex((item) => item.id === draggedSpendId);
      const targetIndex = state.spending.findIndex((item) => item.id === row.dataset.spendId);

      if (sourceIndex < 0 || targetIndex < 0) {
        return;
      }

      const rect = row.getBoundingClientRect();
      const insertAfter = event.clientY > rect.top + rect.height / 2;
      const nextIndex = insertAfter
        ? targetIndex + (sourceIndex < targetIndex ? 0 : 1)
        : targetIndex - (sourceIndex < targetIndex ? 1 : 0);

      moveSpendItemToIndex(draggedSpendId, nextIndex);
    });
  });
}

function normalizeFilingStatus(value) {
  return ["single", "married", "head"].includes(value) ? value : "single";
}

function estimateTaxes(income, filingStatus) {
  const grossIncome = parseNumber(income);
  const standardDeduction = {
    single: 16100,
    married: 32200,
    head: 24150,
  }[filingStatus] || 16100;

  const brackets = {
    single: [
      [12400, 0.1],
      [50400, 0.12],
      [105700, 0.22],
      [201775, 0.24],
      [256225, 0.32],
      [640600, 0.35],
      [Infinity, 0.37],
    ],
    married: [
      [24800, 0.1],
      [100800, 0.12],
      [211400, 0.22],
      [403550, 0.24],
      [512450, 0.32],
      [768700, 0.35],
      [Infinity, 0.37],
    ],
    head: [
      [17700, 0.1],
      [67550, 0.12],
      [105700, 0.22],
      [201775, 0.24],
      [256200, 0.32],
      [640600, 0.35],
      [Infinity, 0.37],
    ],
  }[filingStatus] || [];

  const taxableIncome = Math.max(grossIncome - standardDeduction, 0);
  let federalIncomeTax = 0;
  let previousLimit = 0;

  brackets.forEach(([limit, rate]) => {
    if (taxableIncome <= previousLimit) {
      return;
    }

    const amountInBracket = Math.min(taxableIncome, limit) - previousLimit;
    federalIncomeTax += amountInBracket * rate;
    previousLimit = limit;
  });

  const socialSecurityTax = Math.min(grossIncome, 184500) * 0.062;
  const medicareBaseTax = grossIncome * 0.0145;
  const additionalMedicareThreshold = {
    single: 200000,
    married: 250000,
    head: 200000,
  }[filingStatus] || 200000;
  const additionalMedicareTax = Math.max(grossIncome - additionalMedicareThreshold, 0) * 0.009;
  const ficaTax = socialSecurityTax + medicareBaseTax + additionalMedicareTax;

  return {
    federalIncomeTax,
    ficaTax,
    postTaxIncome: grossIncome - federalIncomeTax - ficaTax,
  };
}
