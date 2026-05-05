import { fetchReefData, initReefData } from "./api.js";

const TAB_IDS = ["overview", "reef-health", "economy", "conservation"];
const ALL_FILTER = "all";
const NOAA_FILTER = "noaa";
const RESTORATION_FILTER = "restoration";

const NEWS_ITEMS = [
  {
    source: "NOAA Fisheries",
    date: "Apr 2026",
    tag: "Restoration",
    title: "Next-Generation Coral Restoration Expands Across Florida Keys",
    desc: "NOAA and partners deploy heat-resilient coral genotypes at Mission: Iconic Reefs sites following post-2023 mortality assessment.",
    url: "https://fisheries.noaa.gov",
  },
  {
    source: "Florida Aquarium",
    date: "Jan 2026",
    tag: "Restoration",
    title: "9,000 Lab-Grown Coral Juveniles Transferred to Reef Partners",
    desc: "Largest single statewide deployment of land-grown juvenile corals transferred to Reef Renewal USA and The Reef Institute.",
    url: "https://flaquarium.org",
  },
  {
    source: "NOAA Coral Reef Watch",
    date: "Dec 2025",
    tag: "Monitoring",
    title: "2025 Bleaching Season: Moderate Stress, Recovery Ongoing",
    desc: "Florida Keys experienced Alert Level 1-2 bleaching in late summer 2025, significantly less severe than the catastrophic 2023 season.",
    url: "https://coralreefwatch.noaa.gov",
  },
  {
    source: "Mote Marine Laboratory",
    date: "Dec 2025",
    tag: "Science",
    title: "BleachWatch 2025 Annual Report Released",
    desc: "Citizen science monitoring documents moderate bleaching in Keys and paling in Miami area during the 2025 bleaching season.",
    url: "https://mote.org",
  },
  {
    source: "Florida Governor's Office",
    date: "Dec 2025",
    tag: "Funding",
    title: "$9.5M Awarded for 11 Florida Coral Restoration Projects",
    desc: "FCR3 Initiative funding awarded for coral restoration projects statewide alongside $20M for Biscayne Bay water quality improvements.",
    url: "https://flgov.com",
  },
  {
    source: "Science Journal",
    date: "Oct 2025",
    tag: "Research",
    title: "Caribbean Acropora Corals Declared Functionally Extinct on Florida Reef",
    desc: "Landmark study documents 97.8-100% mortality of staghorn and elkhorn corals across Florida Keys following the 2023 marine heatwave.",
    url: "https://coralreef.noaa.gov",
  },
  {
    source: "NOAA AOML",
    date: "2024",
    tag: "Research",
    title: "70% of Florida Coral Reefs Now in Net Erosion State",
    desc: "NCRMP survey data across 723 sites shows majority of Florida Reef Tract losing structural complexity faster than it can rebuild.",
    url: "https://aoml.noaa.gov",
  },
  {
    source: "WUSF Public Media",
    date: "Mar 2026",
    tag: "Policy",
    title: "Florida Reef Restoration Funding Gap Emerges for 2026",
    desc: "FCR3 Phase 2 funding reportedly omitted from Florida's proposed 2026 legislative budget, raising concerns about restoration commitments.",
    url: "https://wusf.org",
  },
];

let reefDataInitialized = false;
let activeNewsFilter = ALL_FILTER;
let newsSearchTerm = "";
let reefChartsInitialized = false;
let reefCharts = {
  sst: null,
  bleaching: null,
  coralCover: null,
};
let economyChartInitialized = false;

const SST_DATASETS = {
  decades: {
    labels: ["1985", "1990", "1995", "2000", "2005", "2010", "2015", "2020", "2023", "2024", "2025"],
    data: [26.1, 26.3, 26.5, 26.8, 27.0, 27.2, 27.5, 27.9, 29.4, 27.8, 28.2],
  },
  years: {
    labels: ["2019", "2020", "2021", "2022", "2023", "2024", "2025"],
    data: [28.1, 27.6, 27.9, 28.3, 29.4, 27.8, 28.2],
  },
  months: {
    labels: ["May 25", "Jun 25", "Jul 25", "Aug 25", "Sep 25", "Oct 25", "Nov 25", "Dec 25", "Jan 26", "Feb 26", "Mar 26", "Apr 26"],
    data: [27.8, 28.9, 29.8, 30.1, 29.6, 28.4, 27.2, 26.8, 26.4, 26.2, 26.8, 27.4],
  },
};

const BLEACHING_DATASETS = {
  years: {
    labels: ["2019", "2020", "2021", "2022", "2023", "2024", "2025"],
    data: [2.1, 0.8, 1.9, 3.2, 22.0, 1.4, 4.8],
  },
  months: {
    labels: ["May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov"],
    data: [0.1, 0.4, 1.8, 4.2, 3.8, 1.2, 0.3],
  },
};

const CORAL_COVER_DATA = {
  labels: ["1970s", "1980s", "1990s", "2000s", "2010s", "2015", "2018", "2020", "2022", "2024"],
  data: [32, 28, 20, 14, 9, 7, 5, 4, 3, 2],
};

function getById(...ids) {
  for (const id of ids) {
    const el = document.getElementById(id);
    if (el) return el;
  }
  return null;
}

function createChartOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: "#0b1b2d",
        borderColor: "rgba(41, 212, 197, 0.75)",
        borderWidth: 1,
        titleColor: "#e8f8f6",
        bodyColor: "#e8f8f6",
      },
    },
    scales: {
      x: {
        grid: { color: "rgba(255,255,255,0.05)" },
        ticks: { color: "rgba(232,248,246,0.5)", font: { size: 11 } },
      },
      y: {
        grid: { color: "rgba(255,255,255,0.05)" },
        ticks: { color: "rgba(232,248,246,0.5)", font: { size: 11 } },
      },
    },
  };
}

function createEconomyChartOptions() {
  const base = createChartOptions();
  return {
    ...base,
    scales: {
      ...base.scales,
      y: {
        ...base.scales.y,
        title: {
          display: true,
          text: "Value ($ Millions)",
          color: "rgba(232,248,246,0.5)",
          font: { size: 11 },
        },
        ticks: {
          ...base.scales.y.ticks,
          callback(value) {
            return "$" + value.toLocaleString();
          },
        },
      },
    },
    plugins: {
      ...base.plugins,
      tooltip: {
        ...base.plugins.tooltip,
        callbacks: {
          label(context) {
            return " $" + context.parsed.y.toLocaleString() + "M";
          },
        },
      },
    },
  };
}

function getBleachingBarColor(value) {
  if (value < 2) return "#3ddc84";
  if (value < 4) return "#ffd166";
  if (value < 8) return "#f4845f";
  return "#ff4444";
}

function setActiveChartToggle(chartName, activeRange) {
  const buttons = document.querySelectorAll(`.chart-toggle-btn[data-chart="${chartName}"]`);
  buttons.forEach((button) => {
    const isActive = button.dataset.range === activeRange;
    button.classList.toggle("chart-toggle-btn--active", isActive);
  });
}

function updateSstChart(range) {
  if (!reefCharts.sst) return;
  const dataset = SST_DATASETS[range];
  if (!dataset) return;
  reefCharts.sst.data.labels = dataset.labels;
  reefCharts.sst.data.datasets[0].data = dataset.data;
  reefCharts.sst.update();
  setActiveChartToggle("sst", range);
}

function updateBleachingChart(range) {
  if (!reefCharts.bleaching) return;
  const dataset = BLEACHING_DATASETS[range];
  if (!dataset) return;
  reefCharts.bleaching.data.labels = dataset.labels;
  reefCharts.bleaching.data.datasets[0].data = dataset.data;
  reefCharts.bleaching.data.datasets[0].backgroundColor = dataset.data.map(getBleachingBarColor);
  reefCharts.bleaching.update();
  setActiveChartToggle("bleaching", range);
}

function initChartToggles() {
  const sstButtons = document.querySelectorAll('.chart-toggle-btn[data-chart="sst"]');
  sstButtons.forEach((button) => {
    button.addEventListener("click", () => updateSstChart(button.dataset.range));
  });

  const bleachingButtons = document.querySelectorAll('.chart-toggle-btn[data-chart="bleaching"]');
  bleachingButtons.forEach((button) => {
    button.addEventListener("click", () => updateBleachingChart(button.dataset.range));
  });
}

function initReefCharts() {
  if (reefChartsInitialized || typeof Chart === "undefined") return;

  const sstCanvas = getById("sst-chart");
  const bleachingCanvas = getById("bleaching-chart");
  const coralCanvas = getById("coral-cover-chart");
  if (!sstCanvas || !bleachingCanvas || !coralCanvas) return;

  const sstThresholdPlugin = {
    id: "sstThresholdLine",
    afterDraw(chart) {
      const { ctx, chartArea, scales } = chart;
      if (!chartArea || !scales.y) return;
      const y = scales.y.getPixelForValue(29.0);
      ctx.save();
      ctx.strokeStyle = "#ff6b6b";
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(chartArea.left, y);
      ctx.lineTo(chartArea.right, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "#ff6b6b";
      ctx.font = "11px Source Sans 3, sans-serif";
      ctx.fillText("Bleaching threshold", chartArea.left + 8, y - 6);
      ctx.restore();
    },
  };

  const coralAnnotationPlugin = {
    id: "coralDeclineAnnotation",
    afterDraw(chart) {
      const { ctx, chartArea } = chart;
      if (!chartArea) return;
      ctx.save();
      ctx.fillStyle = "rgba(255, 107, 107, 0.9)";
      ctx.font = "bold 12px Source Sans 3, sans-serif";
      ctx.fillText("90% decline since 1970s", chartArea.left + 10, chartArea.top + 18);
      ctx.restore();
    },
  };

  const sstGradient = sstCanvas.getContext("2d").createLinearGradient(0, 0, 0, 220);
  sstGradient.addColorStop(0, "rgba(41, 212, 197, 0.35)");
  sstGradient.addColorStop(1, "rgba(41, 212, 197, 0.02)");

  const coralGradient = coralCanvas.getContext("2d").createLinearGradient(0, 0, 0, 240);
  coralGradient.addColorStop(0, "rgba(255, 107, 107, 0.35)");
  coralGradient.addColorStop(1, "rgba(255, 107, 107, 0.02)");

  reefCharts.sst = new Chart(sstCanvas, {
    type: "line",
    data: {
      labels: SST_DATASETS.decades.labels,
      datasets: [
        {
          data: SST_DATASETS.decades.data,
          borderColor: "#29d4c5",
          backgroundColor: sstGradient,
          fill: true,
          tension: 0.4,
          pointRadius: 0,
          pointHoverRadius: 4,
        },
      ],
    },
    options: createChartOptions(),
    plugins: [sstThresholdPlugin],
  });

  reefCharts.bleaching = new Chart(bleachingCanvas, {
    type: "bar",
    data: {
      labels: BLEACHING_DATASETS.years.labels,
      datasets: [
        {
          data: BLEACHING_DATASETS.years.data,
          backgroundColor: BLEACHING_DATASETS.years.data.map(getBleachingBarColor),
          borderRadius: 4,
        },
      ],
    },
    options: createChartOptions(),
  });

  reefCharts.coralCover = new Chart(coralCanvas, {
    type: "line",
    data: {
      labels: CORAL_COVER_DATA.labels,
      datasets: [
        {
          data: CORAL_COVER_DATA.data,
          borderColor: "#ff6b6b",
          backgroundColor: coralGradient,
          fill: true,
          tension: 0.3,
          pointRadius: 0,
          pointHoverRadius: 4,
        },
      ],
    },
    options: createChartOptions(),
    plugins: [coralAnnotationPlugin],
  });

  initChartToggles();
  reefChartsInitialized = true;
}

function initEconomyChart() {
  if (economyChartInitialized || typeof Chart === "undefined") return;
  const canvas = getById("economy-risk-chart");
  if (!canvas) return;

  new Chart(canvas, {
    type: "bar",
    data: {
      labels: ["Tourism & Sales", "Employment Income", "Flood Protection", "Property Values", "Fisheries"],
      datasets: [
        {
          data: [4400, 2000, 675, 2900, 385],
          backgroundColor: ["#29d4c5", "#ffd166", "#f4845f", "#ff6b6b", "#a78bfa"],
          borderRadius: 4,
        },
      ],
    },
    options: createEconomyChartOptions(),
  });

  economyChartInitialized = true;
}

function closeMobileNav() {
  const nav = document.querySelector(".site-nav");
  const toggle = getById("nav-menu-toggle");
  if (nav) nav.classList.remove("site-nav--open");
  if (toggle) {
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-label", "Open dashboard menu");
  }
}

function openMobileNav() {
  const nav = document.querySelector(".site-nav");
  const toggle = getById("nav-menu-toggle");
  if (nav) nav.classList.add("site-nav--open");
  if (toggle) {
    toggle.setAttribute("aria-expanded", "true");
    toggle.setAttribute("aria-label", "Close dashboard menu");
  }
}

function initNavMenu() {
  const toggle = getById("nav-menu-toggle");
  const nav = document.querySelector(".site-nav");
  if (!toggle || !nav) return;

  toggle.addEventListener("click", () => {
    if (nav.classList.contains("site-nav--open")) {
      closeMobileNav();
    } else {
      openMobileNav();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeMobileNav();
  });

  document.addEventListener("click", (event) => {
    if (!nav.contains(event.target)) closeMobileNav();
  });
}

function resolveTabName(tabButton) {
  const dataTab = tabButton.getAttribute("data-tab");
  if (dataTab) return dataTab;

  const ariaControls = tabButton.getAttribute("aria-controls");
  if (!ariaControls) return "";

  return ariaControls
    .replace(/^panel-/, "")
    .replace(/^tab-/, "")
    .replace("climate-trends", "economy")
    .replace(/^climate$/, "economy");
}

function resolvePanelByTab(tabName) {
  const exactId = getById(tabName);
  if (exactId) return exactId;

  return getById(`panel-${tabName}`);
}

function showPanel(panel, shouldShow) {
  if (!panel) return;
  if (shouldShow) {
    panel.style.removeProperty("display");
    panel.removeAttribute("hidden");
  } else {
    panel.style.display = "none";
    panel.setAttribute("hidden", "");
  }
}

async function onTabActivated(tabName) {
  if (tabName === "reef-health") {
    initReefCharts();
    if (!reefDataInitialized) {
      reefDataInitialized = true;
      await initReefData();
    } else {
      await fetchReefData();
    }
  } else if (tabName === "economy") {
    initEconomyChart();
  } else if (tabName === "conservation") {
    initNewsFeed();
  }
}

async function activateTab(tabButton) {
  const tabName = resolveTabName(tabButton);
  if (!tabName) return;

  const allTabButtons = document.querySelectorAll(".nav-tab, [data-tab]");
  allTabButtons.forEach((button) => {
    const isActive = button === tabButton;
    button.classList.toggle("active", isActive);
    button.classList.toggle("nav-tab--active", isActive);
    button.setAttribute("aria-selected", isActive ? "true" : "false");
  });

  TAB_IDS.forEach((id) => showPanel(resolvePanelByTab(id), false));
  showPanel(resolvePanelByTab(tabName), true);

  closeMobileNav();
  await onTabActivated(tabName);
}

function createNewsCard(newsItem) {
  const card = document.createElement("article");
  card.className = "news-card";
  card.dataset.source = newsItem.source;
  card.dataset.tag = newsItem.tag;
  card.dataset.title = newsItem.title;
  card.dataset.desc = newsItem.desc;

  card.innerHTML = `
    <div class="news-card__meta">
      <span class="news-card__source">${newsItem.source}</span>
      <span class="news-card__date">${newsItem.date}</span>
      <span class="news-card__tag">${newsItem.tag}</span>
    </div>
    <h3 class="news-card__title">${newsItem.title}</h3>
    <p class="news-card__desc">${newsItem.desc}</p>
    <a class="news-card__link" href="${newsItem.url}" target="_blank" rel="noopener noreferrer">Read more →</a>
  `;

  return card;
}

function cardMatchesFilter(card, filterValue) {
  const source = (card.dataset.source || "").toLowerCase();
  const tag = (card.dataset.tag || "").toLowerCase();

  if (filterValue === NOAA_FILTER) {
    return source.includes("noaa");
  }
  if (filterValue === RESTORATION_FILTER) {
    return tag === "restoration";
  }
  return true;
}

function cardMatchesSearch(card, term) {
  if (!term) return true;
  const haystack = [
    card.dataset.title || "",
    card.dataset.desc || "",
    card.dataset.source || "",
    card.dataset.tag || "",
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(term);
}

function applyNewsFilters() {
  const cards = document.querySelectorAll("#news-feed .news-card");
  cards.forEach((card) => {
    const matches =
      cardMatchesFilter(card, activeNewsFilter) &&
      cardMatchesSearch(card, newsSearchTerm);
    card.style.display = matches ? "block" : "none";
  });
}

function setActiveFilterButton(activeId) {
  const buttons = [
    getById("filter-all", "news-filter-all"),
    getById("filter-noaa", "news-filter-noaa"),
    getById("filter-restoration", "news-filter-restoration"),
  ].filter(Boolean);

  buttons.forEach((button) => {
    const isActive = button.id === activeId;
    button.classList.toggle("filter-active", isActive);
    button.classList.toggle("news-filter-btn--active", isActive);
  });
}

function initNewsSearch() {
  const searchInput = getById("news-search");
  if (!searchInput) return;

  searchInput.addEventListener("input", (event) => {
    newsSearchTerm = (event.target.value || "").trim().toLowerCase();
    applyNewsFilters();
  });
}

function initNewsFilterButtons() {
  const allBtn = getById("filter-all", "news-filter-all");
  const noaaBtn = getById("filter-noaa", "news-filter-noaa");
  const restorationBtn = getById("filter-restoration", "news-filter-restoration");

  if (allBtn) {
    allBtn.addEventListener("click", () => {
      activeNewsFilter = ALL_FILTER;
      setActiveFilterButton(allBtn.id);
      applyNewsFilters();
    });
  }

  if (noaaBtn) {
    noaaBtn.addEventListener("click", () => {
      activeNewsFilter = NOAA_FILTER;
      setActiveFilterButton(noaaBtn.id);
      applyNewsFilters();
    });
  }

  if (restorationBtn) {
    restorationBtn.addEventListener("click", () => {
      activeNewsFilter = RESTORATION_FILTER;
      setActiveFilterButton(restorationBtn.id);
      applyNewsFilters();
    });
  }
}

export function initNewsFeed() {
  const newsFeed = getById("news-feed");
  const loading = getById("news-loading");
  if (!newsFeed) return;

  newsFeed.innerHTML = "";
  NEWS_ITEMS.forEach((item) => {
    newsFeed.appendChild(createNewsCard(item));
  });
  newsFeed.setAttribute("aria-busy", "false");
  if (loading) loading.style.display = "none";

  applyNewsFilters();
}

function initTabs() {
  const tabButtons = document.querySelectorAll(".nav-tab, [data-tab]");
  tabButtons.forEach((button) => {
    button.addEventListener("click", () => {
      activateTab(button);
    });
  });

  const logo = getById("nav-logo");
  const overviewButton = getById("tab-overview");
  if (logo && overviewButton) {
    logo.addEventListener("click", (event) => {
      event.preventDefault();
      activateTab(overviewButton);
    });
  }

  if (overviewButton) {
    activateTab(overviewButton);
  } else {
    const overviewPanel = resolvePanelByTab("overview");
    TAB_IDS.forEach((id) => showPanel(resolvePanelByTab(id), false));
    showPanel(overviewPanel, true);
  }
}

function initApp() {
  initNewsSearch();
  initNewsFilterButtons();
  initNewsFeed();
  initTabs();
  initNavMenu();
}

document.addEventListener("DOMContentLoaded", () => {
  initApp();
});
