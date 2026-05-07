import { fetchFloridaKeysSstObservationsLast12, fetchReefData, initReefData } from "./api.js";

const TAB_IDS = ["overview", "reef-health", "economy", "conservation"];
const ALL_FILTER = "all";
const NOAA_FILTER = "noaa";
const RESTORATION_FILTER = "restoration";

const RESTORATION_KEYWORD_RE = /restoration|restore|reef renewal|iconic reefs|nursery|outplant/i;

/** Fetched in-browser via CORS proxy + XML parse (avoids rss2json 422 / API limits). */
const NEWS_RSS_URLS = [
  "https://www.fisheries.noaa.gov/rss/all-topics.rss",
  "https://www.coralrestoration.org/feed/",
];

const NEWS_FALLBACK = [
  {
    source: "NOAA Coral Reef Watch",
    date: "Dec 2025",
    tag: "Monitoring",
    title: "2025 Bleaching Season: Moderate Stress, Recovery Ongoing",
    desc: "Florida Keys experienced Alert Level 1-2 bleaching in late summer 2025, significantly less severe than the catastrophic 2023 season.",
    url: "https://coralreefwatch.noaa.gov",
  },
  {
    source: "Coral Restoration Foundation",
    date: "Jan 2026",
    tag: "Restoration",
    title: "Reef Restoration and Nursery Updates",
    desc: "Partners continue outplanting resilient corals across Florida Keys restoration sites with expanded monitoring.",
    url: "https://www.coralrestoration.org",
  },
  {
    source: "NOAA Fisheries",
    date: "Apr 2026",
    tag: "Restoration",
    title: "Next-Generation Coral Restoration Expands Across Florida Keys",
    desc: "NOAA and partners deploy heat-resilient coral genotypes at Mission: Iconic Reefs sites following post-2023 mortality assessment.",
    url: "https://www.fisheries.noaa.gov",
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
let sstMonthsLiveCache = null;
let cachedFloridaKeysDhw = null;

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

function applyLiveDhwToBleachingYearsChart(floridaKeysDhw) {
  if (!reefCharts.bleaching) return;
  const labels = reefCharts.bleaching.data.labels;
  const idx = labels.indexOf("2025");
  if (idx === -1) return;

  const ds = reefCharts.bleaching.data.datasets[0];
  const next = [...ds.data];
  if (floridaKeysDhw == null || !Number.isFinite(floridaKeysDhw)) {
    next[idx] = BLEACHING_DATASETS.years.data[idx];
  } else {
    next[idx] = floridaKeysDhw === 0 ? 0.1 : floridaKeysDhw;
  }
  ds.data = next;
  ds.backgroundColor = next.map(getBleachingBarColor);
  reefCharts.bleaching.update();
}

async function updateSstChart(range) {
  if (!reefCharts.sst) return;

  if (range === "months") {
    try {
      if (!sstMonthsLiveCache) {
        sstMonthsLiveCache = await fetchFloridaKeysSstObservationsLast12();
      }
      reefCharts.sst.data.labels = sstMonthsLiveCache.labels;
      reefCharts.sst.data.datasets[0].data = sstMonthsLiveCache.data;
    } catch (err) {
      console.error("SST months live data failed, using fallback:", err);
      const fallback = SST_DATASETS.months;
      reefCharts.sst.data.labels = fallback.labels;
      reefCharts.sst.data.datasets[0].data = fallback.data;
    }
  } else {
    const dataset = SST_DATASETS[range];
    if (!dataset) return;
    reefCharts.sst.data.labels = dataset.labels;
    reefCharts.sst.data.datasets[0].data = dataset.data;
  }

  reefCharts.sst.update();
  setActiveChartToggle("sst", range);
}

function updateBleachingChart(range) {
  if (!reefCharts.bleaching) return;
  const dataset = BLEACHING_DATASETS[range];
  if (!dataset) return;
  reefCharts.bleaching.data.labels = dataset.labels;
  reefCharts.bleaching.data.datasets[0].data = [...dataset.data];
  reefCharts.bleaching.data.datasets[0].backgroundColor = dataset.data.map(getBleachingBarColor);
  reefCharts.bleaching.update();
  setActiveChartToggle("bleaching", range);
  if (range === "years") {
    applyLiveDhwToBleachingYearsChart(cachedFloridaKeysDhw);
  }
}

function initChartToggles() {
  const sstButtons = document.querySelectorAll('.chart-toggle-btn[data-chart="sst"]');
  sstButtons.forEach((button) => {
    button.addEventListener("click", () => {
      void updateSstChart(button.dataset.range);
    });
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
    let result;
    if (!reefDataInitialized) {
      reefDataInitialized = true;
      result = await initReefData();
    } else {
      result = await fetchReefData();
    }
    cachedFloridaKeysDhw = result?.floridaKeysDhw ?? null;
    applyLiveDhwToBleachingYearsChart(cachedFloridaKeysDhw);
  } else if (tabName === "economy") {
    initEconomyChart();
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

function stripHtml(html) {
  if (!html) return "";
  const d = document.createElement("div");
  d.innerHTML = html;
  return (d.textContent || d.innerText || "").replace(/\s+/g, " ").trim();
}

function truncateText(str, maxLen) {
  const t = (str || "").trim();
  if (t.length <= maxLen) return t;
  return `${t.slice(0, maxLen).trim()}…`;
}

function formatRssPubDate(pubDate) {
  if (!pubDate) return "—";
  const d = new Date(pubDate);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

function inferNewsTag(title, description, sourceName) {
  const blob = `${title} ${description} ${sourceName}`.toLowerCase();
  if (RESTORATION_KEYWORD_RE.test(blob)) return "restoration";
  return "news";
}

function safeArticleUrl(href) {
  try {
    const u = new URL(href, "https://example.invalid");
    if (u.protocol === "http:" || u.protocol === "https:") return u.href;
  } catch {
    /* ignore */
  }
  return "#";
}

function normalizeRssItem(item, feedTitle) {
  const rawTitle = stripHtml(item.title || "");
  const rawDescFull = stripHtml(item.description || item.content || "");
  const source = stripHtml(feedTitle || "News");
  const title = rawTitle || "Untitled";
  const desc = truncateText(rawDescFull, 150);
  const url = item.link || "";
  const date = formatRssPubDate(item.pubDate);
  const tag = inferNewsTag(title, rawDescFull, source);
  return { source, date, title, desc, url, tag };
}

const ALLORIGINS_RAW = "https://api.allorigins.win/raw?url=";

async function fetchRssXmlText(rssUrl) {
  const res = await fetch(`${ALLORIGINS_RAW}${encodeURIComponent(rssUrl)}`);
  if (!res.ok) throw new Error(`RSS proxy HTTP ${res.status}`);
  return res.text();
}

function rssItemLinkFromElement(itemEl) {
  const link = itemEl.querySelector(":scope > link");
  if (!link) return "";
  const href = link.getAttribute("href");
  if (href) return href.trim();
  return (link.textContent || "").trim();
}

function rssItemDescriptionFromElement(itemEl) {
  const desc = itemEl.querySelector(":scope > description");
  if (desc?.textContent) return desc.textContent;
  for (const child of itemEl.children) {
    const name = child.tagName.toLowerCase();
    if (name === "content:encoded" || name.endsWith(":encoded")) {
      return child.textContent || "";
    }
  }
  return "";
}

function parseRss2Feed(doc) {
  const channel = doc.querySelector("channel");
  if (!channel) return null;
  const feedTitle = channel.querySelector(":scope > title")?.textContent?.trim() || "News";
  const items = [...channel.querySelectorAll(":scope > item")].map((itemEl) => ({
    title: itemEl.querySelector(":scope > title")?.textContent?.trim() || "",
    link: rssItemLinkFromElement(itemEl),
    pubDate: itemEl.querySelector(":scope > pubDate")?.textContent?.trim() || "",
    description: rssItemDescriptionFromElement(itemEl),
    content: "",
  }));
  return { feedTitle, items };
}

function parseAtomFeed(doc) {
  const feed = doc.querySelector("feed");
  if (!feed) return null;
  const feedTitle = feed.querySelector(":scope > title")?.textContent?.trim() || "News";
  const items = [...feed.querySelectorAll(":scope > entry")].map((entry) => {
    const linkEl =
      entry.querySelector(':scope > link[rel="alternate"]') || entry.querySelector(":scope > link");
    const href = linkEl?.getAttribute("href")?.trim() || "";
    const title = entry.querySelector(":scope > title")?.textContent?.trim() || "";
    const pubDate =
      entry.querySelector(":scope > published")?.textContent?.trim() ||
      entry.querySelector(":scope > updated")?.textContent?.trim() ||
      "";
    const description =
      entry.querySelector(":scope > summary")?.textContent?.trim() ||
      entry.querySelector(":scope > content")?.textContent?.trim() ||
      "";
    return { title, link: href, pubDate, description, content: "" };
  });
  return { feedTitle, items };
}

async function fetchArticlesFromRssUrl(rssUrl, maxItems) {
  const xml = await fetchRssXmlText(rssUrl);
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  if (doc.querySelector("parsererror")) {
    throw new Error("Invalid RSS/XML");
  }
  const parsed = parseRss2Feed(doc) || parseAtomFeed(doc);
  if (!parsed?.items?.length) throw new Error("No items in feed");
  return parsed.items
    .slice(0, maxItems)
    .map((row) => normalizeRssItem(row, parsed.feedTitle));
}

async function fetchNewsFromRss() {
  const maxPerFeed = 4;
  const batches = await Promise.all(
    NEWS_RSS_URLS.map((url) =>
      fetchArticlesFromRssUrl(url, maxPerFeed).catch((err) => {
        console.warn("RSS feed failed:", url, err);
        return [];
      })
    )
  );
  return batches.flat();
}

function createNewsCard(newsItem) {
  const card = document.createElement("article");
  card.className = "news-card";
  card.dataset.source = newsItem.source;
  card.dataset.tag = newsItem.tag;
  card.dataset.title = newsItem.title;
  card.dataset.desc = newsItem.desc;

  const meta = document.createElement("div");
  meta.className = "news-card__meta";

  const sourceEl = document.createElement("span");
  sourceEl.className = "news-card__source";
  sourceEl.textContent = newsItem.source;

  const dateEl = document.createElement("span");
  dateEl.className = "news-card__date";
  dateEl.textContent = newsItem.date;

  meta.append(sourceEl, dateEl);

  const titleEl = document.createElement("h3");
  titleEl.className = "news-card__title";
  titleEl.textContent = newsItem.title;

  const descEl = document.createElement("p");
  descEl.className = "news-card__desc";
  descEl.textContent = newsItem.desc;

  const link = document.createElement("a");
  link.className = "news-card__link";
  link.href = safeArticleUrl(newsItem.url);
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = "Read more →";

  card.append(meta, titleEl, descEl, link);
  return card;
}

function cardMatchesFilter(card, filterValue) {
  const source = (card.dataset.source || "").toLowerCase();
  const tag = (card.dataset.tag || "").toLowerCase();
  const title = (card.dataset.title || "").toLowerCase();
  const desc = (card.dataset.desc || "").toLowerCase();

  if (filterValue === NOAA_FILTER) {
    return source.includes("noaa");
  }
  if (filterValue === RESTORATION_FILTER) {
    return tag === "restoration" || RESTORATION_KEYWORD_RE.test(`${title} ${desc}`);
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

export async function initNewsFeed() {
  const newsFeed = getById("news-feed");
  const loading = getById("news-loading");
  if (!newsFeed) return;

  newsFeed.innerHTML = "";
  if (loading) {
    loading.style.display = "block";
    loading.textContent = "Loading news…";
  }
  newsFeed.setAttribute("aria-busy", "true");

  let list;
  try {
    const articles = await fetchNewsFromRss();
    list = articles.length > 0 ? articles : NEWS_FALLBACK;
  } catch (err) {
    console.error("News RSS fetch failed:", err);
    list = NEWS_FALLBACK;
  }

  list.forEach((item) => {
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
  void initNewsFeed();
  initTabs();
  initNavMenu();
}

document.addEventListener("DOMContentLoaded", () => {
  initApp();
});
