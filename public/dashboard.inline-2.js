console.log("JS 已啟動");

const API_BASE = window.location.origin;
let dashboardTimer = null;
let selectedProducts = [];
let latestDashboardList = [];
let latestTrendProducts = [];
let lastMachineRankingLoadTime = 0;

const YIELD_ALERT_DEFAULTS = {
  yieldThreshold: 90,
  minSamples: 5,
  consecutiveNg: 3
};

let lastYieldAlertSignature = "";
let lastYieldAlertTime = 0;

function getYieldAlertStoragePrefix(){
  const tenantId = getCurrentTenantId?.() || sessionStorage.getItem("tenant_id") || "defaultTenant";
  const systemId = getCurrentSystemId?.() || sessionStorage.getItem("system_id") || "defaultSystem";
  return `yieldAlert_${tenantId}_${systemId}`;
}

function getYieldAlertSettingsKey(){
  return `${getYieldAlertStoragePrefix()}_settings`;
}

function getYieldAlertLogsKey(){
  return `${getYieldAlertStoragePrefix()}_logs`;
}

function clampNumber(value, min, max, fallback){
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  if (typeof max === "number") return Math.min(Math.max(n, min), max);
  return Math.max(n, min);
}

function loadYieldAlertSettings(){
  try {
    const raw = localStorage.getItem(getYieldAlertSettingsKey());
    const saved = raw ? JSON.parse(raw) : {};

    return {
      yieldThreshold: clampNumber(saved.yieldThreshold, 0, 100, YIELD_ALERT_DEFAULTS.yieldThreshold),
      minSamples: Math.round(clampNumber(saved.minSamples, 1, null, YIELD_ALERT_DEFAULTS.minSamples)),
      consecutiveNg: Math.round(clampNumber(saved.consecutiveNg, 1, null, YIELD_ALERT_DEFAULTS.consecutiveNg))
    };
  } catch (e) {
    return { ...YIELD_ALERT_DEFAULTS };
  }
}

function renderYieldAlertSettings(){
  const settings = loadYieldAlertSettings();

  const thresholdInput = document.getElementById("alertYieldThreshold");
  const minSamplesInput = document.getElementById("alertMinSamples");
  const consecutiveInput = document.getElementById("alertConsecutiveNg");

  if (thresholdInput) thresholdInput.value = settings.yieldThreshold;
  if (minSamplesInput) minSamplesInput.value = settings.minSamples;
  if (consecutiveInput) consecutiveInput.value = settings.consecutiveNg;

  renderYieldAlertLogs();
}

function saveYieldAlertSettingsFromUI(){
  const settings = {
    yieldThreshold: clampNumber(document.getElementById("alertYieldThreshold")?.value, 0, 100, YIELD_ALERT_DEFAULTS.yieldThreshold),
    minSamples: Math.round(clampNumber(document.getElementById("alertMinSamples")?.value, 1, null, YIELD_ALERT_DEFAULTS.minSamples)),
    consecutiveNg: Math.round(clampNumber(document.getElementById("alertConsecutiveNg")?.value, 1, null, YIELD_ALERT_DEFAULTS.consecutiveNg))
  };

  localStorage.setItem(getYieldAlertSettingsKey(), JSON.stringify(settings));
  renderYieldAlertSettings();

  alert(`已儲存警報設定：良率低於 ${settings.yieldThreshold}%、至少 ${settings.minSamples} 筆、連續 NG ${settings.consecutiveNg} 件。`);
  window.refreshDashboard?.();
}

async function requestBrowserNotification(){
  if (!("Notification" in window)) {
    alert("這個瀏覽器不支援通知功能");
    return;
  }

  const permission = await Notification.requestPermission();
  if (permission === "granted") {
    alert("已允許瀏覽器通知");
  } else {
    alert("尚未允許通知，之後仍可從瀏覽器設定開啟");
  }
}

function getYieldAlertLogs(){
  try {
    const raw = localStorage.getItem(getYieldAlertLogsKey());
    const logs = raw ? JSON.parse(raw) : [];
    return Array.isArray(logs) ? logs : [];
  } catch (e) {
    return [];
  }
}

function saveYieldAlertLogs(logs){
  localStorage.setItem(getYieldAlertLogsKey(), JSON.stringify(logs.slice(0, 30)));
}

function notifyYieldAlert(message){
  try {
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification("良率過低自動警報", {
        body: message,
        tag: "yield-alert"
      });
    }
  } catch (e) {
    console.warn("通知送出失敗", e);
  }
}

function addYieldAlertLog(message){
  const logs = getYieldAlertLogs();
  const now = new Date().toISOString();

  const latestSame = logs.find(x => x.message === message);
  if (latestSame) {
    const diff = Date.now() - new Date(latestSame.time).getTime();
    if (diff < 60000) return;
  }

  logs.unshift({
    message,
    time: now
  });

  saveYieldAlertLogs(logs);
  renderYieldAlertLogs();
  notifyYieldAlert(message);
}

function clearYieldAlertLogs(){
  localStorage.removeItem(getYieldAlertLogsKey());
  lastYieldAlertSignature = "";
  lastYieldAlertTime = 0;

  const banner = document.getElementById("yieldAlertBanner");
  if (banner) {
    banner.style.display = "none";
    banner.replaceChildren();
  }

  renderYieldAlertLogs();
}

function renderYieldAlertLogs(){
  const list = document.getElementById("yieldAlertLogList");
  if (!list) return;

  const logs = getYieldAlertLogs();

  if (logs.length === 0) {
    setSafeHtml(list, `<div class="yieldAlertEmpty">目前沒有警報紀錄</div>`);
    return;
  }

  setSafeHtml(list, logs.map(log => {
    const timeText = log.time
      ? new Date(log.time).toLocaleString("zh-TW", {
          year:"numeric",
          month:"2-digit",
          day:"2-digit",
          hour:"2-digit",
          minute:"2-digit",
          second:"2-digit",
          hour12:false
        })
      : "-";

    return `
      <div class="yieldAlertLogItem">
        <div class="yieldAlertLogMain"><b>⚠️ 警報中</b><br>${escapeHtml(log.message)}</div>
        <div class="yieldAlertTime">${escapeHtml(timeText)}</div>
      </div>
    `;
  }).join(""));
}

function getLatestConsecutiveNgCount(list){
  const sorted = [...list].sort((a, b) => {
    const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0;
    const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0;
    return tb - ta;
  });

  let count = 0;

  for (const item of sorted) {
    const status = String(item.status || "").toUpperCase();
    if (status === "NG") {
      count++;
    } else {
      break;
    }
  }

  return count;
}

function updateYieldAlertBanner(messages){
  const banner = document.getElementById("yieldAlertBanner");
  if (!banner) return;

  if (!messages || messages.length === 0) {
    banner.style.display = "none";
    banner.replaceChildren();
    return;
  }

  banner.style.display = "block";
  setSafeHtml(banner, messages.map(msg => `⚠️ ${escapeHtml(msg)}`).join("<br>"));
}

function checkYieldAlerts(filteredList, productStats, totalOK, totalNG){
  const settings = loadYieldAlertSettings();
  const messages = [];
  const total = totalOK + totalNG;
  const totalYield = total > 0 ? Math.round((totalOK / total) * 100) : 0;

  if (total >= settings.minSamples && totalYield < settings.yieldThreshold) {
    messages.push(`整體良率 ${totalYield}% ，低於警戒值 ${settings.yieldThreshold}% 。`);
  }

  Object.keys(productStats || {}).forEach(productName => {
    const stats = productStats[productName];
    const productTotal = (stats?.ok || 0) + (stats?.ng || 0);
    const yieldRate = productTotal > 0 ? Math.round((stats.ok / productTotal) * 100) : 0;

    if (productTotal >= settings.minSamples && yieldRate < settings.yieldThreshold) {
      messages.push(`${productName} 良率 ${yieldRate}% ，低於警戒值 ${settings.yieldThreshold}% 。`);
    }
  });

  const consecutiveNg = getLatestConsecutiveNgCount(filteredList || []);
  if (consecutiveNg >= settings.consecutiveNg) {
    messages.push(`已連續出現 ${consecutiveNg} 件 NG，達到警戒值 ${settings.consecutiveNg} 件。`);
  }

  updateYieldAlertBanner(messages);

  const signature = messages.join("|");
  const now = Date.now();

  if (signature && (signature !== lastYieldAlertSignature || now - lastYieldAlertTime > 60000)) {
    messages.forEach(addYieldAlertLog);
    lastYieldAlertSignature = signature;
    lastYieldAlertTime = now;
  }
}




function escapeHtml(value){
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getDisplayProductsFromList(list){
  const dbProducts = [
    ...new Set(
      (Array.isArray(list) ? list : [])
        .map(x => normalizeProductName(x.product))
        .filter(p => p && p !== "未分類")
    )
  ];

  return [
    ...new Set([
      ...selectedProducts.map(p => normalizeProductName(p)),
      ...dbProducts
    ])
  ].filter(p => p && p !== "未分類");
}

function updateTrendProductOptions(products){
  const select = document.getElementById("trendProductSelect");
  if (!select) return;

  const oldValue = select.value || "__all__";
  const list = Array.isArray(products) ? products.map(String) : [];
  select.replaceChildren();

  const allOption = document.createElement("option");
  allOption.value = "__all__";
  allOption.textContent = "全部產品";
  select.appendChild(allOption);

  list.forEach(product => {
    const option = document.createElement("option");
    option.value = product;
    option.textContent = product;
    select.appendChild(option);
  });

  select.value = list.includes(oldValue) ? oldValue : "__all__";
}

function getEventTimeMs(item){
  if (!item) return 0;
  const raw = item.timestamp || item.receivedAt || item.createdAt || item.time || item.date;
  const t = raw ? new Date(raw).getTime() : 0;
  return Number.isFinite(t) ? t : 0;
}

function getStatusText(item){
  return String(item?.status || "").toUpperCase();
}

function getTrendFilteredList(){
  const product = document.getElementById("trendProductSelect")?.value || "__all__";
  const limit = Number(document.getElementById("trendLimitSelect")?.value || 50);

  const sorted = [...latestDashboardList]
    .filter(item => {
      const status = getStatusText(item);
      if (status !== "OK" && status !== "NG") return false;
      if (product === "__all__") return true;
      return normalizeProductName(item.product) === product;
    })
    .sort((a, b) => getEventTimeMs(a) - getEventTimeMs(b));

  return sorted.slice(-limit);
}

function renderYieldTrend(){
  const canvas = document.getElementById("yieldTrendCanvas");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  const wrap = canvas.parentElement;
  const rect = wrap?.getBoundingClientRect?.() || { width: 700, height: 300 };
  const width = Math.max(320, rect.width || 700);
  const height = Math.max(240, rect.height || 300);
  const dpr = window.devicePixelRatio || 1;

  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const data = getTrendFilteredList();
  const settings = loadYieldAlertSettings();
  const threshold = settings.yieldThreshold;

  const latestText = document.getElementById("trendLatestText");
  const countText = document.getElementById("trendCountText");

  const padding = { left: 58, right: 18, top: 24, bottom: 38 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const yToPx = (value) => padding.top + (100 - value) / 100 * chartH;
  const xToPx = (index, count) => {
    if (count <= 1) return padding.left;
    return padding.left + (index / (count - 1)) * chartW;
  };

  // 背景
  ctx.fillStyle = "rgba(0,0,0,0.02)";
  ctx.fillRect(0, 0, width, height);

  // 格線與 Y 軸文字
  ctx.font = "12px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";

  [0, 25, 50, 75, 100].forEach(v => {
    const y = yToPx(v);
    ctx.strokeStyle = "rgba(148,163,184,0.18)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(width - padding.right, y);
    ctx.stroke();

    ctx.fillStyle = "rgba(203,213,225,0.78)";
    ctx.fillText(`${v}%`, padding.left - 8, y);
  });

  // 警戒值虛線
  const ty = yToPx(threshold);
  ctx.strokeStyle = "rgba(248,113,113,0.95)";
  ctx.lineWidth = 2;
  ctx.setLineDash([7, 7]);
  ctx.beginPath();
  ctx.moveTo(padding.left, ty);
  ctx.lineTo(width - padding.right, ty);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.textAlign = "left";
  ctx.fillStyle = "rgba(248,113,113,0.95)";
  ctx.font = "bold 13px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  ctx.fillText(`警戒 ${threshold}%`, padding.left + 8, Math.max(14, ty - 10));

  if (data.length === 0) {
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(203,213,225,0.75)";
    ctx.font = "bold 15px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    ctx.fillText("目前沒有足夠資料可繪製良率趨勢", width / 2, height / 2);
    if (latestText) latestText.textContent = "最新移動良率：0%";
    if (countText) countText.textContent = "顯示 0 筆";
    return;
  }

  const points = data.map((item, index) => {
    const windowItems = data.slice(Math.max(0, index - 9), index + 1);
    const ok = windowItems.filter(x => getStatusText(x) === "OK").length;
    const total = windowItems.filter(x => ["OK", "NG"].includes(getStatusText(x))).length;
    const rate = total > 0 ? Math.round((ok / total) * 100) : 0;
    return {
      rate,
      time: getEventTimeMs(item)
    };
  });

  // 折線
  ctx.strokeStyle = "rgba(96,165,250,0.98)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  points.forEach((pt, i) => {
    const x = xToPx(i, points.length);
    const y = yToPx(pt.rate);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  // 點
  points.forEach((pt, i) => {
    const x = xToPx(i, points.length);
    const y = yToPx(pt.rate);
    ctx.fillStyle = pt.rate < threshold ? "rgba(248,113,113,0.98)" : "rgba(96,165,250,0.98)";
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();
  });

  // X 軸時間：首、中、尾
  ctx.font = "12px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  ctx.fillStyle = "rgba(203,213,225,0.70)";
  ctx.textBaseline = "top";
  const labelIndexes = points.length >= 3 ? [0, Math.floor((points.length - 1) / 2), points.length - 1] : [0, points.length - 1];
  [...new Set(labelIndexes)].forEach(i => {
    const time = points[i]?.time;
    if (!time) return;
    const text = new Date(time).toLocaleTimeString("zh-TW", { hour:"2-digit", minute:"2-digit", second:"2-digit", hour12:false });
    const x = xToPx(i, points.length);
    ctx.textAlign = i === 0 ? "left" : (i === points.length - 1 ? "right" : "center");
    ctx.fillText(text, x, height - padding.bottom + 12);
  });

  const latest = points[points.length - 1]?.rate ?? 0;
  if (latestText) latestText.textContent = `最新移動良率：${latest}%`;
  if (countText) countText.textContent = `顯示 ${data.length} 筆`;
}

function getNgImageUrl(item){
  if (!item) return "";
  const raw = String(item.image_url || item.imageUrl || item.snapshot_url || item.snapshotUrl || item.snapshot || item.photo_url || item.photoUrl || item.ng_image_url || item.ngImageUrl || item.img || "").trim();
  if (!raw) return "";
  if (raw.startsWith("/")) return new URL(raw, window.location.origin).href;
  if (/^https:\/\//i.test(raw)) return raw;
  return "";
}

function renderNgImageArchive(list = latestDashboardList){
  const area = document.getElementById("ngImageList");
  if (!area) return;

  const ngList = [...(Array.isArray(list) ? list : [])]
    .filter(item => getStatusText(item) === "NG")
    .sort((a, b) => getEventTimeMs(b) - getEventTimeMs(a))
    .slice(0, 12);

  area.replaceChildren();
  if (ngList.length === 0) {
    const empty = document.createElement("div");
    empty.className = "ngImageEmpty";
    empty.textContent = "目前沒有 NG 圖片或 NG 紀錄。";
    area.appendChild(empty);
    return;
  }

  ngList.forEach(item => {
    const card = document.createElement("div");
    card.className = "ngImageItem";

    const thumb = document.createElement("div");
    thumb.className = "ngImageThumb";
    const imgUrl = getNgImageUrl(item);
    if (imgUrl) {
      const image = document.createElement("img");
      image.src = imgUrl;
      image.alt = "NG 瑕疵圖片";
      image.loading = "lazy";
      image.addEventListener("error", () => {
        thumb.replaceChildren();
        thumb.textContent = "圖片讀取失敗";
      });
      thumb.appendChild(image);
    } else {
      const missing = document.createElement("span");
      missing.textContent = "此筆沒有圖片欄位";
      thumb.appendChild(missing);
    }

    const meta = document.createElement("div");
    meta.className = "ngImageMeta";
    const timeText = getEventTimeMs(item)
      ? new Date(getEventTimeMs(item)).toLocaleString("zh-TW", { hour12:false })
      : "-";
    [
      `ID：${item.id || item.case_id || item.caseId || "-"}`,
      `產品：${item.product || "未分類"}`,
      `時間：${timeText}`
    ].forEach(text => {
      const line = document.createElement("div");
      line.textContent = text;
      meta.appendChild(line);
    });

    card.append(thumb, meta);
    area.appendChild(card);
  });
}

async function getSystemsForRanking(){
  const tenantId = getCurrentTenantId();
  const currentSystemId = getCurrentSystemId();

  try {
    if (tenantId) {
      const systems = await apiFetch(`/api/systems?tenant_id=${encodeURIComponent(tenantId)}`);
      if (Array.isArray(systems) && systems.length > 0) {
        const seen = new Set();
        return systems
          .filter(sys => sys?.system_id && !seen.has(sys.system_id) && seen.add(sys.system_id))
          .map(sys => ({
            system_id: sys.system_id,
            system_name: sys.system_name || sys.name || "目前檢視機台"
          }));
      }
    }
  } catch (e) {
    console.warn("讀取機台清單失敗，改用目前機台", e);
  }

  return currentSystemId
    ? [{ system_id: currentSystemId, system_name: "目前檢視機台" }]
    : [];
}

async function loadMachineRanking(force = false){
  const rowsEl = document.getElementById("machineRankingRows");
  const footerEl = document.getElementById("machineRankingFooter");
  if (!rowsEl) return;

  const now = Date.now();
  if (!force && now - lastMachineRankingLoadTime < 15000) return;
  lastMachineRankingLoadTime = now;

  try {
    if (footerEl) footerEl.textContent = "排行讀取中...";

    const tenantId = getCurrentTenantId();
    const systems = await getSystemsForRanking();

    if (systems.length === 0) {
      setSafeHtml(rowsEl, `<div class="rank-row"><div>-</div><div>尚未選擇機台</div><div>0</div><div>0</div><div>0</div><div>0%</div><div>-</div></div>`);
      if (footerEl) footerEl.textContent = "沒有可比較的機台。";
      return;
    }

    const settings = loadYieldAlertSettings();

    const ranking = await Promise.all(systems.map(async sys => {
      const params = new URLSearchParams();
      if (tenantId) params.append("tenant_id", tenantId);
      if (sys.system_id) params.append("system_id", sys.system_id);

      let data = [];
      try {
        const result = await apiFetch(`/api/defects?${params.toString()}`);
        data = Array.isArray(result) ? result : [];
      } catch (e) {
        console.warn("讀取機台資料失敗", sys.system_id, e);
      }

      const valid = data.filter(item => ["OK", "NG"].includes(getStatusText(item)));
      const ok = valid.filter(item => getStatusText(item) === "OK").length;
      const ng = valid.filter(item => getStatusText(item) === "NG").length;
      const total = ok + ng;
      const yieldRate = total > 0 ? Math.round((ok / total) * 1000) / 10 : 0;
      const abnormal = total >= settings.minSamples && yieldRate < settings.yieldThreshold;

      return {
        ...sys,
        total,
        ok,
        ng,
        yieldRate,
        abnormal
      };
    }));

    ranking.sort((a, b) => {
      if (a.total === 0 && b.total > 0) return 1;
      if (b.total === 0 && a.total > 0) return -1;
      if (a.yieldRate !== b.yieldRate) return a.yieldRate - b.yieldRate;
      return b.total - a.total;
    });

    setSafeHtml(rowsEl, ranking.map((item, index) => {
      const yieldClass = item.abnormal ? "rank-yield-bad" : "rank-yield-good";
      const statusClass = item.abnormal ? "rank-status-abnormal" : "rank-status-normal";
      const statusText = item.abnormal ? "異常" : "正常";

      return `
        <div class="rank-row rank-body-row">
          <div>${index + 1}</div>
          <div class="rank-system-main">
            <span class="rank-system-id">${escapeHtml(item.system_id)}</span>
            <span class="rank-system-name">${escapeHtml(item.system_name || "目前檢視機台")}</span>
          </div>
          <div>${item.total}</div>
          <div class="rank-ok">${item.ok}</div>
          <div class="rank-ng">${item.ng}</div>
          <div class="${yieldClass}">${item.yieldRate}%</div>
          <div><span class="rank-status-pill ${statusClass}">${statusText}</span></div>
        </div>
      `;
    }).join(""));

    if (footerEl) {
      footerEl.textContent = `最後更新：${new Date().toLocaleString("zh-TW", { hour12:false })}｜已讀取 ${ranking.reduce((sum, x) => sum + x.total, 0)} 筆資料。排行依目前客戶 ${tenantId || "-"} 分開計算。`;
    }
  } catch (e) {
    console.error(e);
    if (footerEl) footerEl.textContent = "讀取排行失敗。";
  }
}

function getProductStorageKey() {
  const tenantId = sessionStorage.getItem("tenant_id") || "defaultTenant";
  return `selectedProducts_${tenantId}`;
}

function saveSelectedProducts() {
  localStorage.setItem(
    getProductStorageKey(),
    JSON.stringify(selectedProducts)
  );
}

function loadSelectedProducts() {
  try {
    const raw = localStorage.getItem(getProductStorageKey());
    selectedProducts = raw ? JSON.parse(raw) : [];

    if (!Array.isArray(selectedProducts)) {
      selectedProducts = [];
    }
  } catch (e) {
    selectedProducts = [];
  }
}

function normalizeProductName(name) {
  if (!name) return "未分類"; // ⭐ 先擋掉 null/undefined

  const original = String(name).trim();

  const s = original
  .toLowerCase()
  .replace(/\s+/g, "")
  .replace(/[^\u4e00-\u9fa5a-z0-9]/g, ""); // ⭐ 清掉奇怪符號

  // ⭐ 再次保險
  if (s === "" || s === "null" || s === "undefined") {
    return "未分類";
  }

  if (s.includes("橡皮") || s.includes("eraser")) return "橡皮擦";
  if (s.includes("立可帶") || s.includes("修正帶") || s.includes("tape")) return "立可帶";
  if (s.includes("螺帽") || s.includes("螺母") || s.includes("nut")) return "螺帽";

  // ⭐ 不認識的產品不要丟掉，直接保留原本名稱（例如：手機殼、書本）
  return original;
}

async function apiFetch(url, options = {}) {
  const token = sessionStorage.getItem("isLogin");

 // console.log("目前 token:", token);

  if (!token) {
    alert("⚠️ 請重新登入");
    window.location.replace("login.html");
    return null;
  }

  const fullUrl = url.startsWith("http")
    ? url
    : API_BASE + url;

  const res = await fetch(fullUrl, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "ngrok-skip-browser-warning": "true",
      ...(options.headers || {})
    }
  });

  if (res.status === 401) {
    alert("登入過期，請重新登入");
    sessionStorage.clear();
    window.location.replace("login.html");
    return null;
  }

  if (!res.ok) {
    throw new Error("API 錯誤：" + res.status);
  }

  return await res.json();
}

function handleHardReset(e){
  e.preventDefault();
  e.stopPropagation();

  try{
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistrations().then(regs => {
        regs.forEach(r => r.unregister());
        location.replace("login.html");
      });
    } else {
      location.replace("login.html");
    }
  } catch(err){
    console.error("清快取失敗：", err);
  }
}

function forceReload(e){
  e.preventDefault();
  e.stopPropagation();
  location.reload();
}

function isIgnorableRuntimeMessage(message) {
  const msg = String(message || "").trim();
  if (!msg) return true;
  return (
    msg.includes("Script error") ||
    msg.includes("ResizeObserver") ||
    msg.includes("chrome-extension") ||
    msg.includes("extension") ||
    msg.includes("DevTools")
  );
}

window.addEventListener("error", function(e) {
  const msg = e?.message || e?.error?.message || "";
  if (isIgnorableRuntimeMessage(msg)) return;
  console.warn("Dashboard JS 錯誤已記錄，不再跳出遮罩：", msg, e?.error || "");
});

window.addEventListener("unhandledrejection", function(e) {
  const reason = e?.reason;
  const msg = reason?.message || (typeof reason === "string" ? reason : "");
  if (isIgnorableRuntimeMessage(msg)) return;
  console.warn("Dashboard Promise 錯誤已記錄，不再跳出遮罩：", reason);
});

const role = sessionStorage.getItem("role") || "user";
const isSuperAdmin = role === "super_admin" || role === "admin";
const isTenantAdmin = role === "tenant_admin";
const canOpenAdmin = isSuperAdmin || isTenantAdmin;

function getCurrentTenantId(){
  const role = sessionStorage.getItem("role");

  if (role !== "super_admin" && role !== "tenant_admin") {
    return sessionStorage.getItem("tenant_id") || "";
  }

  return sessionStorage.getItem("tenant_id") || "";
}

function setCurrentTenantId(tenantId){
  sessionStorage.setItem("tenant_id", tenantId || "");
}

function setCurrentSystemId(systemId){
  sessionStorage.setItem("system_id", systemId || "");
}

function getCurrentSystemId(){
  return sessionStorage.getItem("system_id") || "";
}

function getDisplayUserName(userId) {
  const userMap = {
    "user_001": "使用者A",
    "user_002": "使用者B",
    "user_003": "使用者C",
    "admin": "系統管理員"
  };

  return userMap[userId] || userId || "未知使用者";
}

function getDisplaySystemName(systemId) {
  return systemId ? `機台 ${systemId}` : "未選擇";
}

function forceCloseErrorOverlay() {
  const selectors = [
    ".fatal-overlay",
    ".error-overlay",
    ".panic-overlay",
    ".app-error-overlay",
    ".global-error-overlay",
    ".white-screen-guard",
    ".runtime-error-modal"
  ];

  selectors.forEach(selector => {
    document.querySelectorAll(selector).forEach(el => {
      el.style.display = "none";
      el.remove();
    });
  });

  document.body.classList.remove("has-error", "app-crashed", "panic-mode", "white-screen-protected");
  document.documentElement.classList.remove("has-error", "app-crashed", "panic-mode", "white-screen-protected");

  try {
    localStorage.removeItem("fatalError");
    localStorage.removeItem("appError");
    localStorage.removeItem("panicMode");
    sessionStorage.removeItem("fatalError");
    sessionStorage.removeItem("appError");
    sessionStorage.removeItem("panicMode");
  } catch (e) {
    console.warn(e);
  }
}

function showError(msg) {
  const el = document.getElementById("errorBar");
  if (!el) return;
  el.textContent = msg || "";
}

function addProduct() {
  const input = document.getElementById("productInput");
  const name = input.value.trim();

  if (!name) return;

  const normalized = normalizeProductName(name);

  if (!selectedProducts.includes(normalized)) {
    selectedProducts.push(normalized);
  }

  saveSelectedProducts();

  input.value = "";
  renderProductList();
  window.refreshDashboard();
}

function removeProduct(name){
  selectedProducts = selectedProducts.filter(p => p !== name);

  saveSelectedProducts();

  renderProductList();
  window.refreshDashboard();
}
function renderProductList() {
  const div = document.getElementById("productList");
  const text = document.getElementById("currentProductsText");

  if (text) {
    text.textContent = selectedProducts.length > 0
      ? selectedProducts.join("、")
      : "尚未設定";
  }

  if (!div) return;
  div.replaceChildren();

  selectedProducts.forEach(product => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.textContent = `${product} ❌`;
    chip.setAttribute("aria-label", `移除產品 ${product}`);
    Object.assign(chip.style, {
      display: "inline-block",
      padding: "6px 12px",
      margin: "4px",
      border: "0",
      borderRadius: "10px",
      background: "#2563eb",
      color: "#fff",
      cursor: "pointer"
    });
    chip.addEventListener("click", () => removeProduct(product));
    div.appendChild(chip);
  });
}

function updateMqttStatus(ok, textMsg = "") {
  const dot = document.getElementById("mqttDot");
  const text = document.getElementById("mqttText");
  if (!dot || !text) return;

  if (ok) {
    dot.style.background = "#22c55e";
    dot.style.boxShadow = "0 0 12px rgba(34,197,94,.8)";
    text.textContent = textMsg || "MQTT 已連線";
  } else {
    dot.style.background = "#ef4444";
    dot.style.boxShadow = "0 0 12px rgba(239,68,68,.8)";
    text.textContent = textMsg || "MQTT 未連線";
  }
}

async function loadHealth() {
  const data = await apiFetch("/api/health");
  if (!data) return;

  updateMqttStatus(
    !!data?.mqttConnected,
    data?.mqttConnected ? "後端 MQTT 已連線" : "後端 MQTT 未連線"
  );
}

function buildDefectsUrl(){
  const role = sessionStorage.getItem("role");
  const params = new URLSearchParams();

  if (role === "super_admin" || role === "tenant_admin") {
    const tenantId = getCurrentTenantId();
    const systemId = getCurrentSystemId();

    if (tenantId) params.append("tenant_id", tenantId);
    if (systemId) params.append("system_id", systemId);
  } else {
    const tenantId = sessionStorage.getItem("tenant_id") || "";
    const systemId = sessionStorage.getItem("system_id") || "";

    if (tenantId) params.append("tenant_id", tenantId);
    if (systemId) params.append("system_id", systemId);
  }

  return `/api/defects?${params.toString()}`;
}

async function loadDashboardStats() {
  try {
    const data = await apiFetch(buildDefectsUrl());
    const list = Array.isArray(data) ? data : [];
    latestDashboardList = list;

// 1. 先整理 MongoDB 裡實際存在的產品
const dbProducts = [
  ...new Set(
    list
      .map(x => normalizeProductName(x.product))
      .filter(p => p && p !== "未分類")
  )
];

// 2. 畫面手動加入的產品 + MongoDB 已存在的產品，合併後去重
const displayProducts = [
  ...new Set([
    ...selectedProducts.map(p => normalizeProductName(p)),
    ...dbProducts
  ])
].filter(p => p && p !== "未分類");

latestTrendProducts = displayProducts;
updateTrendProductOptions(displayProducts);

// 3. 只統計要顯示的產品資料
const filteredList = displayProducts.length === 0
  ? []
  : list.filter(x => {
      const productName = normalizeProductName(x.product);
      return displayProducts.includes(productName);
    });

const totalCount = filteredList.length;

    const defectCount = filteredList.filter(
      x => String(x.status || "").toUpperCase() === "NG"
    ).length;

const productStats = {};

// 先把要顯示的產品建立出來
// 包含：手動加入的產品 + MongoDB 裡實際存在的產品
displayProducts.forEach(p => {
  const product = normalizeProductName(p);

  if (product !== "未分類") {
    productStats[product] = { ok: 0, ng: 0 };
  }
});
filteredList.forEach(item => {

  // 🔥 關鍵修正（這行）
const product = normalizeProductName(item.product);

  const status = String(item.status || "").toUpperCase();

      if (!productStats[product]) {
        productStats[product] = { ok: 0, ng: 0 };
      }

      if (status === "OK") productStats[product].ok++;
      if (status === "NG") productStats[product].ng++;
    });

    document.getElementById("gaugeValue").textContent = totalCount;
    document.getElementById("defectCount").textContent = defectCount;

    const gaugePercent = Math.min(totalCount * 10, 100);
    document.getElementById("gauge").style.setProperty("--p", gaugePercent);
    document.getElementById("gaugeBarFill").style.width = gaugePercent + "%";

    const gaugeArea = document.getElementById("dynamicProductGaugeArea");
    const dynamicRows = document.getElementById("dynamicProductRows");

    if (gaugeArea) gaugeArea.replaceChildren();
    if (dynamicRows) dynamicRows.replaceChildren();

    let totalOK = 0;
    let totalNG = 0;

    Object.keys(productStats).forEach(productName => {
  if (productName === "未分類") return;

  const stats = productStats[productName];
  const total = stats.ok + stats.ng;
  const yieldRate = total > 0 ? Math.round((stats.ok / total) * 100) : 0;
      totalOK += stats.ok;
      totalNG += stats.ng;

      if (gaugeArea) {
        const box = document.createElement("div");
        box.className = "gaugeBox";
        const label = document.createElement("div");
        label.className = "gaugeLabel";
        label.textContent = productName;
        const gauge = document.createElement("div");
        gauge.className = "gauge";
        gauge.style.setProperty("--p", String(yieldRate));
        gauge.style.background = `conic-gradient(from 180deg, rgba(34,197,94,.95) ${yieldRate}%, rgba(239,68,68,.95) ${yieldRate}% 100%)`;
        const gaugeValue = document.createElement("div");
        gaugeValue.className = "gaugeValue";
        gaugeValue.textContent = `${yieldRate}%`;
        gauge.appendChild(gaugeValue);
        const sub = document.createElement("div");
        sub.className = "gaugeSub";
        const ok = document.createElement("span");
        ok.className = "text-ok";
        ok.textContent = `OK: ${stats.ok}`;
        const separator = document.createTextNode(" | ");
        const ng = document.createElement("span");
        ng.className = "text-ng";
        ng.textContent = `NG: ${stats.ng}`;
        sub.append(ok, separator, ng);
        box.append(label, gauge, sub);
        gaugeArea.appendChild(box);
      }

      if (dynamicRows) {
        const row = document.createElement("div");
        row.className = "pt-row";
        const name = document.createElement("div");
        name.className = "pt-name";
        name.textContent = productName;
        const ok = document.createElement("div");
        ok.className = "pt-ok";
        ok.textContent = String(stats.ok);
        const ng = document.createElement("div");
        ng.className = "pt-ng";
        ng.textContent = String(stats.ng);
        row.append(name, ok, ng);
        dynamicRows.appendChild(row);
      }
    });

    document.getElementById("table-ok-total").textContent = totalOK;
    document.getElementById("table-ng-total").textContent = totalNG;
const totalOkEl = document.getElementById("totalOk");
const totalNgEl = document.getElementById("totalNg");

if (totalOkEl) totalOkEl.textContent = totalOK;
if (totalNgEl) totalNgEl.textContent = totalNG;

checkYieldAlerts(filteredList, productStats, totalOK, totalNG);
renderYieldTrend();
renderNgImageArchive(list);

    showError("");
  } catch (e) {
    console.error(e);
    showError("讀取統計資料失敗");
  }
}

async function loadDefects() {
  try {
    const data = await apiFetch(buildDefectsUrl());
    const list = document.getElementById("defect-list");
    if (!list) return;

    list.replaceChildren();

    if (!Array.isArray(data) || data.length === 0) {
      const empty = document.createElement("div");
      empty.style.color = "rgba(155,176,207,.9)";
      empty.style.padding = "12px";
      empty.textContent = "目前沒有資料";
      list.appendChild(empty);
      return;
    }

    data.slice(0, 10).forEach(item => {
      const row = document.createElement("div");
      row.className = "defect-row";

      const statusText = (item.status || "-").toString().toUpperCase();
      const statusClass =
        statusText === "NG" ? "status-ng" :
        statusText === "OK" ? "status-ok" : "";

      setSafeHtml(row, `
        <div class="defect-id">${escapeHtml(item.id || "-")}</div>
        <div class="defect-status ${statusClass}">
          ${escapeHtml(statusText)} ${item.product ? `(${escapeHtml(item.product)})` : ""}
        </div>
        <div class="defect-time">
          ${escapeHtml(item.timestamp ? new Date(item.timestamp).toLocaleString("zh-TW") : "-")}
        </div>
      `);

      list.appendChild(row);
    });
  } catch (e) {
    console.error(e);
    showError("讀取瑕疵資料失敗");
  }
}

async function loadLatestMqtt() {
  try {
    const result = await apiFetch("/api/mqtt/latest");
    const liveHint = document.querySelector(".liveHint");
    if (!liveHint) return;

    if (result?.data?.payload) {
      const p = result.data.payload;
      liveHint.textContent =
        `最新 MQTT：ID=${p.id || "-"} / STATUS=${p.status || "-"} / PRODUCT=${p.product || "-"} / 時間=${result.data.receivedAt || "-"}`;
    } else {
      liveHint.textContent = "目前尚未收到 MQTT 資料";
    }
  } catch (e) {
    console.error(e);
  }
}

async function loadSummary() {
  try {
    const systemId = getCurrentSystemId();
    const tenantId = getCurrentTenantId();

    const params = new URLSearchParams();
    if (tenantId) params.append("tenant_id", tenantId);
    if (systemId) params.append("system_id", systemId);

    const data = await apiFetch(`/api/summary?${params.toString()}`);
    if (!data) return;

    document.getElementById("summaryTotal").textContent = `總數：${data.total}`;
    document.getElementById("summaryOk").textContent = `OK：${data.okCount}`;
    document.getElementById("summaryNg").textContent = `NG：${data.ngCount}`;
    document.getElementById("summaryYield").textContent = `良率：${data.yieldRate}%`;
    document.getElementById("summaryDefect").textContent = `瑕疵率：${data.defectRate}%`;
    document.getElementById("summaryLast20").textContent = `最近20筆異常：${data.last20Ng}`;
  } catch (e) {
    console.error(e);
  }
}

function downloadCSV(){
  apiFetch(buildDefectsUrl())
    .then(data => {
      if (!Array.isArray(data)) data = [];

      let csv = "\uFEFF";
      csv += "id,status,product,time\r\n";

      data.forEach(d => {
        const id = d.id || "";
        const status = d.status || "";
        const product = d.product || "";

        const time = d.timestamp
          ? new Date(d.timestamp).toLocaleString("zh-TW", {
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
              hour12: false
            }).replace(/\//g, "-")
          : "";

        csv += `"${id}","${status}","${product}","${time}"\r\n`;
      });

      const blob = new Blob([csv], {
        type: "text/csv;charset=utf-8;"
      });

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");

      a.href = url;
      a.download = "瑕疵檢測報表.csv";
      a.click();

      URL.revokeObjectURL(url);
    });
}

async function loadSiteConfig() {
  try {
    const tenantId = getCurrentTenantId();
    if (!tenantId) return;

    const result = await apiFetch(`/api/site-config?tenant_id=${tenantId}`);
    const config = result?.data;
    if (!config) return;

    document.title = config.site_title || "瑕疵辨識與分流系統";

    const mainTitle = document.querySelector(".pageTitle b");
    if (mainTitle && config.site_title) {
      mainTitle.textContent = config.site_title;
    }

    const subTitle = document.getElementById("pageSubTitle");
    if (subTitle && config.site_subtitle) {
      subTitle.textContent = config.site_subtitle;
    }

  } catch (e) {
    console.warn("載入網站設定失敗", e);
  }
}

async function getCurrentSystemInfo() {
  const tenantId = getCurrentTenantId();
  const systemId = getCurrentSystemId();

  if (!tenantId || !systemId) return null;

  const systems = await apiFetch(`/api/systems?tenant_id=${encodeURIComponent(tenantId)}`);

  return (Array.isArray(systems) ? systems : []).find(x => x.system_id === systemId) || null;
}

async function startCamera() {
  const img = document.getElementById("camera");
  const hint = document.getElementById("liveHint");

  if (!img) return;

  try {
    const systemInfo = await getCurrentSystemInfo();

    if (!systemInfo) {
      img.removeAttribute("src");
      if (hint) hint.textContent = "找不到機台設定";
      return;
    }

    if (!systemInfo.cam_ip) {
      img.removeAttribute("src");
      if (hint) hint.textContent = "此機台尚未連接 ESP32-CAM";
      return;
    }

    const camUrl = `http://${systemInfo.cam_ip}:81/stream`;

    img.onload = () => {
      if (hint) hint.textContent = `CAM 即時畫面連線成功（${systemInfo.system_id}）`;
    };

    img.onerror = () => {
      img.removeAttribute("src");
      if (hint) hint.textContent = `CAM 連線失敗：${systemInfo.cam_ip}`;
    };

    img.src = camUrl;
  } catch (e) {
    console.error(e);
    img.removeAttribute("src");
    if (hint) hint.textContent = "CAM 啟動失敗";
  }
}

async function loadSystemOptionsByTenant(tenantId) {
  const systemSelect = document.getElementById("systemSelect");
  const systemSwitchWrap = document.getElementById("systemSwitchWrap");

  if (systemSwitchWrap) {
    systemSwitchWrap.style.display = canOpenAdmin ? "flex" : "none";
  }

  if (!systemSelect || !tenantId) return;

  const result = await apiFetch(`/api/systems?tenant_id=${encodeURIComponent(tenantId)}`);
  const systems = Array.isArray(result) ? result : [];

  systemSelect.replaceChildren();

  const seenSystems = new Set();

systems.forEach(sys => {
  if (!sys.system_id) return;

  // 避免同一台機台重複顯示
  if (seenSystems.has(sys.system_id)) return;
  seenSystems.add(sys.system_id);

  const opt = document.createElement("option");
  opt.value = sys.system_id;

  opt.textContent = sys.system_name
    ? `${sys.system_id}｜${sys.system_name}`
    : sys.name
      ? `${sys.system_id}｜${sys.name}`
      : `機台 ${sys.system_id}`;

  systemSelect.appendChild(opt);
});
  let systemId = getCurrentSystemId();

  if (!systemId || !systems.some(x => x.system_id === systemId)) {
    systemId = systems[0]?.system_id || "";
    setCurrentSystemId(systemId);
  }

  systemSelect.value = systemId;
}

async function loadTenantOptions() {
  if (!isSuperAdmin) return;

  const tenantWrap = document.getElementById("tenantSwitchWrap");
  const tenantSelect = document.getElementById("tenantSelect");
  if (!tenantWrap || !tenantSelect) return;

  tenantWrap.style.display = "flex";

  const tenants = await apiFetch("/api/admin/tenants");
  const list = Array.isArray(tenants) ? tenants : [];

  tenantSelect.replaceChildren();

  const seenTenants = new Set();

list.forEach(t => {
  if (!t.tenant_id) return;

  // 避免同一個 tenant_id 重複顯示
  if (seenTenants.has(t.tenant_id)) return;
  seenTenants.add(t.tenant_id);

  const opt = document.createElement("option");
  opt.value = t.tenant_id;

  const companyName = t.company || t.tenant_name || "未命名客戶";

  // 顯示公司名稱 + tenant_id 後幾碼，方便分辨不同客戶
  opt.textContent = `${companyName}｜${t.tenant_id}`;

  tenantSelect.appendChild(opt);
});

  let currentTenantId = getCurrentTenantId();

  if (!currentTenantId && list.length > 0) {
    currentTenantId = list[0].tenant_id;
    setCurrentTenantId(currentTenantId);
  }

  tenantSelect.value = currentTenantId;

  tenantSelect.addEventListener("change", async (e) => {
  const newTenantId = e.target.value;
  setCurrentTenantId(newTenantId);
  setCurrentSystemId("");

  await loadSystemOptionsByTenant(newTenantId);

  loadSelectedProducts();
  renderProductList();
  renderYieldAlertSettings();

  await loadSiteConfig();
  await startCamera();
  await window.refreshDashboard();
  await loadMachineRanking(true);
});
}

window.refreshDashboard = async function() {
  try {
    showError("");
    await loadHealth();
    await loadDashboardStats();
    await loadDefects();
    await loadLatestMqtt();
    await loadSummary();
    await loadMachineRanking(false);
  } catch (e) {
    console.warn("刷新失敗（已忽略）", e);
  }

  forceCloseErrorOverlay();
};

window.demoEstop = async function() {
  try {
    const role = sessionStorage.getItem("role") || "user";
    if (!["super_admin", "tenant_admin"].includes(role)) {
      throw new Error("只有管理員可以使用緊急停止");
    }
    const systemId = getCurrentSystemId();
    if (!systemId) throw new Error("請先選擇要停止的機台");
    if (!confirm(`確定要停止機台 ${systemId} 嗎？此操作會留下稽核紀錄。`)) return;
    const result = await apiFetch("/api/estop", {
      method: "POST",
      body: JSON.stringify({ tenant_id: getCurrentTenantId(), system_id: systemId })
    });
    alert(result?.message || "緊急停止指令已送出");
  } catch (e) {
    console.error(e);
    showError(e.message || "急停失敗");
  }
};

document.addEventListener("DOMContentLoaded", async () => {
  forceCloseErrorOverlay();

  const titleSpan = document.getElementById("pageSubTitle");
  const userChip = document.getElementById("userChip");
  const systemSelect = document.getElementById("systemSelect");

  const currentUserId = sessionStorage.getItem("loginUser") || "";
  const displayName = sessionStorage.getItem("loginName") || getDisplayUserName(currentUserId);

  if (userChip) {
    userChip.textContent = `目前登入：${displayName}`;
  }

  const estopButton = document.querySelector(".estopBig");
  const currentRole = sessionStorage.getItem("role") || "user";
  if (estopButton && !["super_admin", "tenant_admin"].includes(currentRole)) {
    estopButton.style.display = "none";
  }

  const adminNavLink = document.getElementById("adminNavLink");
  const adminNavLinkDrawer = document.getElementById("adminNavLinkDrawer");

  if (adminNavLink) {
    adminNavLink.style.display = canOpenAdmin ? "flex" : "none";
  }
  if (adminNavLinkDrawer) {
    adminNavLinkDrawer.style.display = canOpenAdmin ? "flex" : "none";
  }

  const systemSwitchWrap = document.getElementById("systemSwitchWrap");
  if (systemSwitchWrap) {
    systemSwitchWrap.style.display = canOpenAdmin ? "flex" : "none";
  }

  if (isSuperAdmin) {
    await loadTenantOptions();

    const tenantId = getCurrentTenantId();
    if (tenantId) {
      await loadSystemOptionsByTenant(tenantId);
    }
  } else {
    const tenantId = getCurrentTenantId() || sessionStorage.getItem("tenant_id") || "";
    if (tenantId) {
      await loadSystemOptionsByTenant(tenantId);
    }
  }
loadSelectedProducts();
renderProductList();
renderYieldAlertSettings();

  if (systemSelect) {
    systemSelect.addEventListener("change", async (e) => {
  const newSystemId = e.target.value;
  setCurrentSystemId(newSystemId);

  loadSelectedProducts();
  renderProductList();
  renderYieldAlertSettings();

  await loadSiteConfig();
  await window.refreshDashboard();
  await startCamera();
  await loadMachineRanking(true);
});
  }

  if (titleSpan) {
    titleSpan.textContent =
      `使用者：${displayName}｜系統：${getDisplaySystemName(getCurrentSystemId())}`;
  }

  if (dashboardTimer) clearInterval(dashboardTimer);

  dashboardTimer = setInterval(() => {
    loadDashboardStats();
    loadDefects();
    loadSummary();
    loadLatestMqtt();
  }, 3000);

  await loadSiteConfig();
  await window.refreshDashboard();
  await startCamera();
  await loadMachineRanking(true);
  window.addEventListener("resize", () => renderYieldTrend());
});


// 側邊欄登出保險：如果 core.js 沒有提供 logout，就用這個
if (typeof window.logout !== "function") {
  window.logout = function(){
    fetch("/api/logout", { method:"POST", credentials:"same-origin", cache:"no-store" }).catch(()=>{}).finally(()=>{
      sessionStorage.clear();
      localStorage.removeItem("defect_public_auth_v1");
      window.location.replace("login.html");
    });
  };
}
