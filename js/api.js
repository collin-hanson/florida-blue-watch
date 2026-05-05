const API_BASE_URL = "https://api.coral.tsr.lol/stations/";
const CORS_PROXY_URL = "https://corsproxy.io/?";

const STATIONS = {
  floridaKeys: {
    id: "florida_keys",
    selectors: {
      alert: "#keys-bleaching",
      alertDot: "#fk-alert-dot",
      sst: "#keys-sst",
      sstDot: "#fk-sst-dot",
      dhw: "#keys-dhw",
      dhwDot: "#fk-dhw-dot",
      coralCover: "#keys-coral-cover",
      ph: "#keys-ph",
    },
    staticValues: {
      coralCover: "~2% (CREMP 2024)",
      ph: "~8.04 (acidifying)",
    },
  },
  southeastFlorida: {
    id: "southeast_florida",
    selectors: {
      alert: "#sefl-bleaching",
      alertDot: "#se-alert-dot",
      sst: "#sefl-sst",
      sstDot: "#se-sst-dot",
      dhw: "#sefl-dhw",
      dhwDot: "#se-dhw-dot",
      coralCover: "#sefl-coral-cover",
      ph: "#sefl-ph",
    },
    staticValues: {
      coralCover: "<1% (CREMP 2024)",
      ph: "~8.06 (acidifying)",
    },
  },
};

const ALERT_CLASSES = [
  "status-none",
  "status-watch",
  "status-warn",
  "status-alert1",
  "status-alert2",
  "status-alert3",
];

function getElement(selector) {
  return document.querySelector(selector);
}

function setFieldText(selector, value) {
  const el = getElement(selector);
  if (el) el.textContent = value;
}

function setDotColor(selector, color) {
  const el = getElement(selector);
  if (el) el.style.backgroundColor = color;
}

function setAlertField(selector, label, className) {
  const el = getElement(selector);
  if (!el) return;

  el.textContent = label;
  el.classList.remove(...ALERT_CLASSES);
  if (className) el.classList.add(className);
}

function cToF(celsius) {
  return (celsius * 9) / 5 + 32;
}

function toNumber(value) {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : null;
}

function formatDate(dateString) {
  if (!dateString) return "--";
  const parsed = new Date(dateString);
  if (Number.isNaN(parsed.getTime())) return dateString;
  return parsed.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function getAlertFromStressLevel(stressLevel) {
  if (stressLevel === null || stressLevel < 0) {
    return { text: "Data unavailable", className: "" };
  }
  if (stressLevel === 0) {
    return { text: "No Stress", className: "status-none" };
  }
  if (stressLevel === 1) {
    return { text: "Bleaching Watch", className: "status-watch" };
  }
  if (stressLevel === 2) {
    return { text: "Bleaching Warning", className: "status-warn" };
  }
  if (stressLevel === 3) {
    return { text: "Alert Level 1", className: "status-alert1" };
  }
  if (stressLevel === 4) {
    return { text: "Alert Level 2", className: "status-alert2" };
  }
  return { text: "Alert Level 3", className: "status-alert3" };
}

function getAlertDotColor(alertText) {
  if (alertText === "No Stress") return "#3ddc84";
  if (alertText === "Bleaching Watch") return "#ffd166";
  if (alertText === "Bleaching Warning") return "#f4845f";
  if (alertText === "Alert Level 1") return "#ff6b6b";
  return "#cc3333";
}

function getSstDotColor(sst) {
  if (sst < 28) return "#3ddc84";
  if (sst < 29) return "#ffd166";
  if (sst < 30) return "#f4845f";
  return "#ff6b6b";
}

function getDhwDotColor(dhw) {
  if (dhw === 0) return "#3ddc84";
  if (dhw > 0 && dhw < 1) return "#ffd166";
  if (dhw >= 1 && dhw < 4) return "#f4845f";
  return "#ff6b6b";
}

async function fetchStationData(stationId) {
  const stationUrl = `${API_BASE_URL}${stationId}/current`;
  const proxiedUrl = `${CORS_PROXY_URL}${stationUrl}`;
  const response = await fetch(proxiedUrl);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} while loading station ${stationId}`);
  }

  const payload = await response.json();
  const current = payload.current ?? {};
  const sst = toNumber(current.sst_max);
  const dhw = toNumber(current.dhw);
  const stressLevel = toNumber(current.stress_level);
  const baa7DayMax = toNumber(current.baa_7day_max);

  return {
    date: current.date ?? payload.date ?? "",
    sst,
    dhw,
    stressLevel: stressLevel ?? baa7DayMax,
  };
}

function renderStaticFields(selectors, staticValues) {
  setFieldText(selectors.coralCover, staticValues.coralCover);
  setFieldText(selectors.ph, staticValues.ph);
}

function renderUnavailable(selectors, staticValues) {
  setAlertField(selectors.alert, "Data unavailable", "");
  setFieldText(selectors.sst, "Data unavailable");
  setFieldText(selectors.dhw, "Data unavailable");
  setDotColor(selectors.alertDot, "#9fb3d0");
  setDotColor(selectors.sstDot, "#9fb3d0");
  setDotColor(selectors.dhwDot, "#9fb3d0");
  renderStaticFields(selectors, staticValues);
}

function renderStation(selectors, staticValues, stationData) {
  if (
    !stationData ||
    stationData.sst === null ||
    stationData.dhw === null ||
    stationData.stressLevel === null
  ) {
    renderUnavailable(selectors, staticValues);
    return;
  }

  const alert = getAlertFromStressLevel(stationData.stressLevel);
  const fahrenheit = cToF(stationData.sst);

  setAlertField(selectors.alert, alert.text, alert.className);
  setFieldText(selectors.sst, `${stationData.sst.toFixed(1)}°C / ${fahrenheit.toFixed(1)}°F`);
  setFieldText(selectors.dhw, `${stationData.dhw.toFixed(1)} DHW`);
  setDotColor(selectors.alertDot, getAlertDotColor(alert.text));
  setDotColor(selectors.sstDot, getSstDotColor(stationData.sst));
  setDotColor(selectors.dhwDot, getDhwDotColor(stationData.dhw));
  renderStaticFields(selectors, staticValues);
}

function setLoadingState() {
  const allSelectors = [
    STATIONS.floridaKeys.selectors,
    STATIONS.southeastFlorida.selectors,
  ];

  allSelectors.forEach((selectors) => {
    setAlertField(selectors.alert, "Loading...", "");
    setFieldText(selectors.sst, "Loading...");
    setFieldText(selectors.dhw, "Loading...");
    setFieldText(selectors.coralCover, "Loading...");
    setFieldText(selectors.ph, "Loading...");
    setDotColor(selectors.alertDot, "#9fb3d0");
    setDotColor(selectors.sstDot, "#9fb3d0");
    setDotColor(selectors.dhwDot, "#9fb3d0");
  });
}

export async function fetchReefData() {
  const [fkData, seData] = await Promise.all([
    fetchStationData(STATIONS.floridaKeys.id).catch((error) => {
      console.error("Failed to fetch Florida Keys reef data:", error);
      return null;
    }),
    fetchStationData(STATIONS.southeastFlorida.id).catch((error) => {
      console.error("Failed to fetch Southeast Florida reef data:", error);
      return null;
    }),
  ]);

  renderStation(STATIONS.floridaKeys.selectors, STATIONS.floridaKeys.staticValues, fkData);
  renderStation(
    STATIONS.southeastFlorida.selectors,
    STATIONS.southeastFlorida.staticValues,
    seData
  );

  const lastUpdated = getElement("#last-updated");
  if (lastUpdated) {
    const rawDate = fkData?.date || seData?.date || "";
    lastUpdated.textContent = `Last updated: ${formatDate(rawDate)}`;
  }
}

export async function initReefData() {
  setLoadingState();
  await fetchReefData();
}
