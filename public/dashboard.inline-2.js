const DASHBOARD_BUILD = "20261012-live-v4-displayname-fix";
console.info("[Dashboard] build", DASHBOARD_BUILD);

const API_BASE = window.location.origin;
let dashboardTimer = null;
let dashboardRealtimeSource = null;
let dashboardRealtimeRefreshTimer = null;
let dashboardRealtimeConnected = false;
let dashboardLaneTimer = null;
let dashboardHealthTimer = null;
let selectedProducts = [];
let latestDashboardList = [];
let latestTrendProducts = [];
let lastMachineRankingLoadTime = 0;
let productGaugePage = 0;
const PRODUCT_GAUGE_PAGE_SIZE = 8;
let latestProductStats = {};
let selectedGaugeProducts = new Set();
let knownGaugeProducts = new Set();


function normalizeLaneNumber(value){
  const raw = String(value ?? "").trim();
  const matched = raw.match(/[1-4]/);
  return matched ? Number(matched[0]) : 0;
}


function formatLaneEventTime(value){
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("zh-TW", {
    year:"numeric", month:"2-digit", day:"2-digit",
    hour:"2-digit", minute:"2-digit", second:"2-digit", hour12:false
  });
}

function upsertRealtimeDefect(item){
  if (!item || typeof item !== "object") return;
  const incomingId = String(item.event_id || item.id || "").trim();
  if (!incomingId) return;

  const next = Array.isArray(latestDashboardList) ? [...latestDashboardList] : [];
  const index = next.findIndex(row => String(row?.event_id || row?.id || "").trim() === incomingId);
  if (index >= 0) next[index] = { ...next[index], ...item };
  else next.unshift(item);

  next.sort((a,b) => new Date(b?.timestamp || b?.received_at || 0).getTime() - new Date(a?.timestamp || a?.received_at || 0).getTime());
  latestDashboardList = next.slice(0, 1000);
  renderLaneStatus(latestDashboardList);
}

function scheduleRealtimeDashboardRefresh(){
  if (dashboardRealtimeRefreshTimer) clearTimeout(dashboardRealtimeRefreshTimer);
  dashboardRealtimeRefreshTimer = setTimeout(async () => {
    dashboardRealtimeRefreshTimer = null;
    await Promise.allSettled([
      loadDashboardStats(),
      loadDefects(),
      loadSummary(),
      loadLatestMqtt()
    ]);
  }, 120);
}

function stopDashboardRealtime(){
  if (dashboardRealtimeSource) {
    dashboardRealtimeSource.close();
    dashboardRealtimeSource = null;
  }
  if (dashboardLaneTimer) {
    clearInterval(dashboardLaneTimer);
    dashboardLaneTimer = null;
  }
  if (dashboardHealthTimer) {
    clearInterval(dashboardHealthTimer);
    dashboardHealthTimer = null;
  }
  dashboardRealtimeConnected = false;
}

// 平台總管理員可以查看測試（含所有舊資料）；客戶只能讀正式資料。
function isDashboardDataAdmin(){
  return window.authState?.user?.role === "super_admin";
}
function dashboardDataMode(){
  return isDashboardDataAdmin()
    ? (document.getElementById("adminDashboardDataMode")?.value || "PRODUCTION")
    : "PRODUCTION";
}
function addDashboardDataMode(params){
  if (isDashboardDataAdmin()) {
    params.set("data_mode", dashboardDataMode());
  }
  return params;
}
function initAdminDashboardDataMode(){
  if(!isDashboardDataAdmin()) return;
  if(document.getElementById("adminDashboardDataMode")) return;
  const wrap=document.createElement("div");
  wrap.id="adminDashboardDataModeContainer";
  wrap.style.cssText="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin:12px 0;padding:12px 16px;background:#102139;border:1px solid #395574;border-radius:12px;color:#e6f0ff";
  const label=document.createElement("label");label.htmlFor="adminDashboardDataMode";label.textContent="平台總管理員資料檢視：";
  const select=document.createElement("select");select.id="adminDashboardDataMode";
  select.style.cssText="background:#0b182b;color:#fff;border:1px solid #56739a;border-radius:7px;padding:7px 12px;min-width:180px";
  for(const [value,text] of [["PRODUCTION","正式資料"],["TEST","測試資料（包含全部舊資料）"],["ALL","全部資料"]]){
    const option=document.createElement("option");option.value=value;option.textContent=text;select.appendChild(option);
  }
  wrap.append(label,select);
  const target=document.querySelector("main")||document.querySelector(".dashboard-content")||document.body;
  target.insertBefore(wrap,target.firstChild);
  select.addEventListener("change",async()=>{
    stopDashboardRealtime();
    latestDashboardList=[];
    renderLaneStatus([]);
    if(typeof window.refreshDashboard==="function") await window.refreshDashboard();
    await loadLaneStatus();
    await loadMachineRanking(true);
    startDashboardRealtime();
  });
}

function startDashboardRealtime(){
  stopDashboardRealtime();
  if (!("EventSource" in window)) {
    console.warn("此瀏覽器不支援 EventSource，將使用備援輪詢。");
    return;
  }

  const params = new URLSearchParams();
  const systemId = getCurrentSystemId();
  if (systemId) params.set("system_id", systemId);
  params.set("_", String(Date.now()));

  addDashboardDataMode(params);
  const source = new EventSource(`/api/realtime?${params.toString()}`);
  dashboardRealtimeSource = source;

  source.addEventListener("ready", () => {
    dashboardRealtimeConnected = true;
    loadLaneStatus();
    loadHealth();
  });

  source.addEventListener("defect", event => {
    try {
      const item = JSON.parse(event.data || "{}");
      if (getCurrentSystemId() && item.system_id && item.system_id !== getCurrentSystemId()) return;
      const activeMode = dashboardDataMode();
      const eventMode = item.data_mode === "PRODUCTION" ? "PRODUCTION" : "TEST";
      if(activeMode !== "ALL" && activeMode !== eventMode) return;
      dashboardRealtimeConnected = true;
      upsertRealtimeDefect(item);
      scheduleRealtimeDashboardRefresh();
    } catch (error) {
      console.error("即時事件解析失敗", error);
    }
  });

  source.onerror = () => {
    dashboardRealtimeConnected = false;
    // EventSource 會自動重連；下方 3 秒輪詢仍保留作為備援。
  };
}

function renderLaneStatus(list = latestDashboardList){
  const events = Array.isArray(list) ? [...list] : [];
  events.sort((a,b) => new Date(b?.timestamp || 0).getTime() - new Date(a?.timestamp || 0).getTime());

  const latestByLane = new Map();
  for (const item of events) {
    const status = String(item?.status || "").toUpperCase();
    if (!["OK", "NG"].includes(status)) continue;
    const lane = normalizeLaneNumber(item?.lane);
    if (!lane || latestByLane.has(lane)) continue;
    latestByLane.set(lane, item);
  }

  let activeCount = 0;
  for (let lane = 1; lane <= 4; lane++) {
    const item = latestByLane.get(lane);
    const productEl = document.getElementById(`lane${lane}ProductText`);
    const statusEl = document.getElementById(`lane${lane}StatusText`);
    const metaEl = document.getElementById(`lane${lane}MetaText`);
    const cardEl = document.getElementById(`laneCard${lane}`);
    if (!productEl || !statusEl || !metaEl || !cardEl) continue;

    if (!item) {
      productEl.textContent = "等待辨識資料";
      statusEl.textContent = "尚無結果";
      statusEl.className = "laneStatusPill neutral";
      metaEl.textContent = "尚未收到此分流道事件";
      cardEl.classList.remove("laneOk", "laneNg");
      continue;
    }

    activeCount++;
    const status = String(item.status || "").toUpperCase();
    const product = normalizeProductName(item.product || "未分類") || "未分類";
    const eventId = item.event_id || item.id || "";
    const timeText = formatLaneEventTime(item.timestamp);
    const sourceText = String(item.source || "").trim();

    productEl.textContent = product;
    statusEl.textContent = status;
    statusEl.className = `laneStatusPill ${status === "OK" ? "ok" : "ng"}`;
    cardEl.classList.toggle("laneOk", status === "OK");
    cardEl.classList.toggle("laneNg", status === "NG");
    metaEl.textContent = [
      timeText,
      eventId ? `事件 ${eventId}` : "",
      sourceText ? `來源 ${sourceText}` : ""
    ].filter(Boolean).join("｜") || "已收到分流事件";
  }

  const badge = document.getElementById("laneLiveBadge");
  if (badge) {
    badge.textContent = activeCount ? `已取得 ${activeCount} 道分流資料` : "等待分流資料";
    badge.classList.toggle("active", activeCount > 0);
  }
}

async function loadLaneStatus(){
  try {
    const params = new URLSearchParams();
    const tenantId = getCurrentTenantId();
    const systemId = getCurrentSystemId();
    if (tenantId) params.set("tenant_id", tenantId);
    if (systemId) params.set("system_id", systemId);
    params.set("_", String(Date.now()));

    addDashboardDataMode(params);
    const data = await apiFetch(`/api/lane-status?${params.toString()}`, { cache: "no-store" });
    const lanes = Array.isArray(data?.lanes) ? data.lanes.filter(Boolean) : [];
    if (!lanes.length) {
      renderLaneStatus([]);
      return;
    }

    // Merge with the normal dashboard list so SSE and polling always paint the same cards.
    for (const item of lanes) upsertRealtimeDefect(item);
    renderLaneStatus(lanes);
  } catch (error) {
    console.warn("四道分流即時狀態讀取失敗，等待下一次重試", error);
  }
}

function startLaneRealtimeFallback(){
  if (dashboardLaneTimer) clearInterval(dashboardLaneTimer);
  loadLaneStatus();
  dashboardLaneTimer = setInterval(loadLaneStatus, 1000);
}

function startHealthHeartbeat(){
  if (dashboardHealthTimer) clearInterval(dashboardHealthTimer);
  loadHealth();
  dashboardHealthTimer = setInterval(loadHealth, 5000);
}

const YIELD_ALERT_DEFAULTS = {
  yieldThreshold: 90,
  minSamples: 5,
  consecutiveNg: 3
};

let lastYieldAlertSignature = "";
let lastYieldAlertTime = 0;

// 設定與告警紀錄以 MongoDB 為準；切換機台時重新讀取。
let currentYieldSettings = { ...YIELD_ALERT_DEFAULTS };
let currentYieldLogs = [];
function yieldApiParams() {
  const tenant = getCurrentTenantId?.() || sessionStorage.getItem("tenant_id") || "";
  const system = getCurrentSystemId?.() || sessionStorage.getItem("system_id") || "";
  if (!system) return null;
  return {tenant_id:tenant, system_id:system};
}
function yieldApiQuery(p) { return new URLSearchParams(p).toString(); }
function clampNumber(value, min, max, fallback){
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  if (typeof max === "number") return Math.min(Math.max(n, min), max);
  return Math.max(n, min);
}

function loadYieldAlertSettings(){ return currentYieldSettings; }
async function syncYieldAlertSettings(){
  const p=yieldApiParams();
  if(!p){ currentYieldSettings={...YIELD_ALERT_DEFAULTS};currentYieldLogs=[];renderYieldAlertSettings();return; }
  try {
    const [cfg,logs]=await Promise.all([
      apiFetch("/api/yield-alert-settings?"+yieldApiQuery(p)),
      apiFetch("/api/yield-alert-events?"+yieldApiQuery(p))
    ]);
    if(cfg?.settings) currentYieldSettings=cfg.settings;
    currentYieldLogs=Array.isArray(logs?.alerts)?logs.alerts:[];
    renderYieldAlertSettings();
  }catch(e){ console.error("讀取警報設定或紀錄失敗",e); }
}
function renderYieldAlertSettings(){
  const settings = loadYieldAlertSettings();

  const thresholdInput = document.getElementById("alertYieldThreshold");
  const minSamplesInput = document.getElementById("alertMinSamples");
  const consecutiveInput = document.getElementById("alertConsecutiveNg");

  if (settings) {
    if (thresholdInput) thresholdInput.value = settings.yieldThreshold;
    if (minSamplesInput) minSamplesInput.value = settings.minSamples;
    if (consecutiveInput) consecutiveInput.value = settings.consecutiveNg;
  }

  renderYieldAlertLogs();
}

async function saveYieldAlertSettingsFromUI(){
  const p=yieldApiParams();
  if(!p){alert("請先選擇要設定的機台");return;}
  const settings={
    yieldThreshold:clampNumber(document.getElementById("alertYieldThreshold")?.value,0,100,YIELD_ALERT_DEFAULTS.yieldThreshold),
    minSamples:Math.round(clampNumber(document.getElementById("alertMinSamples")?.value,1,100000,YIELD_ALERT_DEFAULTS.minSamples)),
    consecutiveNg:Math.round(clampNumber(document.getElementById("alertConsecutiveNg")?.value,1,1000,YIELD_ALERT_DEFAULTS.consecutiveNg))
  };
  try{
    const result=await apiFetch("/api/yield-alert-settings",{method:"PUT",body:JSON.stringify({...p,...settings})});
    if(!result?.success) throw new Error("儲存失敗");
    currentYieldSettings=result.settings;
    renderYieldAlertSettings();
    alert("設定已儲存至 MongoDB，正式警報由後端依實際事件建立。");
    window.refreshDashboard?.();
  }catch(e){alert("儲存警報設定失敗："+(e.message||"未知錯誤"));}
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

function getYieldAlertLogs(){ return currentYieldLogs; }
function notifyYieldAlert(message){
  try { if("Notification" in window && Notification.permission==="granted")
    new Notification("良率警報",{body:message,tag:"yield-alert"}); } catch(e){console.warn(e);}
}
// 警報是後端正式歷史紀錄，不允許只清除單一瀏覽器的資料。
async function clearYieldAlertLogs(){ await syncYieldAlertSettings(); }
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
        <div class="yieldAlertLogMain"><b>⚠️ ${escapeHtml(log.status === "resolved" ? "已解決" : log.status === "acknowledged" ? "已確認" : "警報中")}</b><br>${escapeHtml(log.message)}</div>
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

  // 前端只更新提示；正式持久化記錄由 MQTT 入庫後的後端評估建立。

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
  const width = Math.max(320, Math.floor(wrap?.clientWidth || 700));
  const height = Math.max(240, Math.floor(wrap?.clientHeight || 300));
  const dpr = window.devicePixelRatio || 1;

  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  canvas.style.width = "100%";
  canvas.style.height = "100%";

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
        addDashboardDataMode(params);
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

let productCatalogEntries = [];
function saveSelectedProducts() { /* 已改由 MongoDB 保存，避免 localStorage 分歧 */ }
async function loadSelectedProducts() {
  try {
    const tenant = getCurrentTenantId() || sessionStorage.getItem("tenant_id") || "";
    const data = await apiFetch(`/api/product-catalog?tenant_id=${encodeURIComponent(tenant)}`);
    productCatalogEntries = Array.isArray(data?.products) ? data.products : [];
    selectedProducts = productCatalogEntries.map(p => p.name);
    renderProductList();
  } catch (e) {
    console.warn("產品目錄讀取失敗", e);
    selectedProducts = [];
    productCatalogEntries = [];
    renderProductList();
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



  // ⭐ 不認識的產品不要丟掉，直接保留原本名稱（例如：手機殼、書本）
  return original;
}

async function apiFetch(url, options = {}) {
  // 不再把 sessionStorage 當成登入依據；真正登入狀態由 HttpOnly Cookie
  // 與 /api/session 決定，避免驗證成功後因前端暫存尚未同步而跳回登入頁。
  if (window.authReady) {
    const session = await window.authReady;
    if (!session) return null;
  }

  const fullUrl = url.startsWith("http")
    ? url
    : API_BASE + url;

  const res = await fetch(fullUrl, {
    ...options,
    cache: options.cache || "no-store",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      "ngrok-skip-browser-warning": "true",
      ...(options.headers || {})
    }
  });

  if (res.status === 401) {
    window.clearPublicAuth?.();
    window.location.replace("login.html?reason=session-expired");
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

async function addProduct() {
  const input = document.getElementById("productInput");
  const name = (input?.value || "").trim();
  if (!name) return;
  const normalized = normalizeProductName(name);
  // 新增產品只需名稱，YOLO 類別映射可在管理產品時另外設定。
  try {
    await apiFetch("/api/product-catalog", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ tenant_id:getCurrentTenantId(), name:normalized }) });
    if (input) input.value = "";
    await loadSelectedProducts();
    await window.refreshDashboard();
  } catch(e) { showError(e.message || "新增產品失敗"); }
}
async function removeProduct(name) {
  if (!window.confirm(`要將「${name}」從產品清單移除嗎？歷史事件不會刪除。`)) return;
  try {
    await apiFetch("/api/product-catalog", { method:"DELETE", headers:{"Content-Type":"application/json"}, body:JSON.stringify({tenant_id:getCurrentTenantId(),name}) });
    await loadSelectedProducts();
    await window.refreshDashboard();
  } catch(e) { showError(e.message || "移除產品失敗"); }
}
function renderProductList() {
  const div = document.getElementById("productList");
  const text = document.getElementById("currentProductsText");

  if (text) {
    const dbCount = new Set(
      (Array.isArray(latestDashboardList) ? latestDashboardList : [])
        .map(item => normalizeProductName(item.product))
        .filter(name => name && name !== "未分類")
    ).size;
    text.textContent = `網站自訂 ${selectedProducts.length} 種｜資料庫已出現 ${dbCount} 種`;
  }

  if (!div) return;
  div.replaceChildren();

  selectedProducts.forEach(product => {
    const chip = document.createElement("button");
    chip.type = "button";
    const matched = productCatalogEntries.find(p => p.name === product);
    chip.textContent = `${product}｜${matched?.yolo_class ? `YOLO: ${matched.yolo_class}` : "待設定辨識模型"} ❌`;
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

function toggleProductManager(){
  const div = document.getElementById("productList");
  const btn = document.getElementById("dashboard-handler-15");
  if (!div) return;
  const open = div.classList.toggle("is-open");
  if (btn) btn.textContent = open ? "收合產品管理" : "管理產品";
}

function bindProductInputEnter(){
  const input = document.getElementById("productInput");
  if (!input || input.dataset.enterBound === "1") return;
  input.dataset.enterBound = "1";
  input.addEventListener("keydown", event => {
    if (event.key === "Enter") {
      event.preventDefault();
      addProduct();
    }
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
  try {
    const data = await apiFetch(`/api/health?_=${Date.now()}`, { cache: "no-store" });
    if (!data) {
      updateMqttStatus(false, "MQTT 狀態無法取得");
      return;
    }

    const mqttConnected =
      data?.mqtt_connected === true ||
      data?.mqttConnected === true;

    updateMqttStatus(
      mqttConnected,
      mqttConnected ? "後端 MQTT 已連線" : "後端 MQTT 未連線"
    );
  } catch (error) {
    console.warn("健康狀態讀取失敗", error);
    updateMqttStatus(false, "MQTT 狀態讀取失敗");
  }
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

  addDashboardDataMode(params);
  return `/api/defects?${params.toString()}`;
}


async function loadDashboardStats() {
  try {
    const data = await apiFetch(buildDefectsUrl());
    const list = Array.isArray(data) ? data : [];
    latestDashboardList = list;
    renderLaneStatus(list);

// 1. 先整理 MongoDB 裡實際存在的產品
const dbProducts = [
  ...new Set(
    list
      .map(x => normalizeProductName(x.product))
      .filter(p => p && p !== "未分類")
  )
];

// 2. 產品管理只影響監控／統計清單；不控制四道分流。
//    手動加入的產品 + MongoDB 已存在的產品，合併後去重
const displayProducts = [
  ...new Set([
    ...selectedProducts.map(p => normalizeProductName(p)),
    ...dbProducts
  ])
].filter(p => p && p !== "未分類");

latestTrendProducts = displayProducts;
updateTrendProductOptions(displayProducts);
renderProductList();

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

    const gaugeValueEl = document.getElementById("gaugeValue");
    const defectCountEl = document.getElementById("defectCount");
    const totalGaugeEl = document.getElementById("gauge");
    const gaugeBarFillEl = document.getElementById("gaugeBarFill");
    if (gaugeValueEl) gaugeValueEl.textContent = totalCount;
    if (defectCountEl) defectCountEl.textContent = defectCount;

    const gaugePercent = Math.min(totalCount * 10, 100);
    if (totalGaugeEl) totalGaugeEl.style.setProperty("--p", gaugePercent);
    if (gaugeBarFillEl) gaugeBarFillEl.style.width = gaugePercent + "%";

    const gaugeArea = document.getElementById("dynamicProductGaugeArea");
    const dynamicRows = document.getElementById("dynamicProductRows");
    const productGaugeCountText = document.getElementById("productGaugeCountText");
    const productGaugeCheckboxes = document.getElementById("productGaugeCheckboxes");
    const productGaugePageText = document.getElementById("productGaugePageText");
    const productGaugePrev = document.getElementById("productGaugePrev");
    const productGaugeNext = document.getElementById("productGaugeNext");
    const productTableFilterSelect = document.getElementById("productTableFilterSelect");

    const productNames = Object.keys(productStats).filter(name => name !== "未分類");
    latestProductStats = productStats;

    if (productGaugeCountText) {
      productGaugeCountText.textContent = `共 ${productNames.length} 種產品`;
    }

    const newProducts = productNames.filter(name => !knownGaugeProducts.has(name));
    if (knownGaugeProducts.size === 0) {
      selectedGaugeProducts = new Set(productNames);
    } else {
      newProducts.forEach(name => selectedGaugeProducts.add(name));
      [...selectedGaugeProducts].forEach(name => {
        if (!productNames.includes(name)) selectedGaugeProducts.delete(name);
      });
    }
    knownGaugeProducts = new Set(productNames);

    if (productGaugeCheckboxes) {
      productGaugeCheckboxes.replaceChildren();
      if (!productNames.length) {
        const empty = document.createElement("div");
        empty.className = "productGaugePickerEmpty";
        empty.textContent = "目前沒有產品";
        productGaugeCheckboxes.appendChild(empty);
      } else {
        productNames.forEach(productName => {
          const label = document.createElement("label");
          label.className = "productGaugeCheckItem";
          const checkbox = document.createElement("input");
          checkbox.type = "checkbox";
          checkbox.checked = selectedGaugeProducts.has(productName);
          checkbox.value = productName;
          checkbox.addEventListener("change", async () => {
            if (checkbox.checked) selectedGaugeProducts.add(productName);
            else selectedGaugeProducts.delete(productName);
            productGaugePage = 0;
            await loadDashboardStats();
          });
          const text = document.createElement("span");
          text.textContent = productName;
          label.append(checkbox, text);
          productGaugeCheckboxes.appendChild(label);
        });
      }
    }

    const selectedGaugeNames = productNames.filter(name => selectedGaugeProducts.has(name));
    const pageCount = Math.max(1, Math.ceil(selectedGaugeNames.length / PRODUCT_GAUGE_PAGE_SIZE));
    productGaugePage = Math.min(Math.max(productGaugePage, 0), pageCount - 1);
    if (productGaugePageText) productGaugePageText.textContent = `${productGaugePage + 1} / ${pageCount}`;
    if (productGaugePrev) productGaugePrev.disabled = productGaugePage <= 0;
    if (productGaugeNext) productGaugeNext.disabled = productGaugePage >= pageCount - 1;

    if (gaugeArea) gaugeArea.replaceChildren();
    if (dynamicRows) dynamicRows.replaceChildren();

    let totalOK = 0;
    let totalNG = 0;
    productNames.forEach(productName => {
      const stats = productStats[productName];
      totalOK += stats.ok;
      totalNG += stats.ng;
    });

    if (productTableFilterSelect) {
      const previousFilter = productTableFilterSelect.value || "__all__";
      productTableFilterSelect.replaceChildren();
      const allOption = document.createElement("option");
      allOption.value = "__all__";
      allOption.textContent = `全部產品（${productNames.length}）`;
      productTableFilterSelect.appendChild(allOption);
      productNames.forEach(productName => {
        const option = document.createElement("option");
        option.value = productName;
        option.textContent = productName;
        productTableFilterSelect.appendChild(option);
      });
      productTableFilterSelect.value = productNames.includes(previousFilter) ? previousFilter : "__all__";
    }

    const selectedTableProduct = productTableFilterSelect?.value || "__all__";
    const tableVisibleNames = selectedTableProduct === "__all__"
      ? productNames
      : productNames.filter(name => name === selectedTableProduct);

    tableVisibleNames.forEach(productName => {
      const stats = productStats[productName];
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

    const pageStart = productGaugePage * PRODUCT_GAUGE_PAGE_SIZE;
    const visibleProductNames = selectedGaugeNames.slice(pageStart, pageStart + PRODUCT_GAUGE_PAGE_SIZE);

    if (gaugeArea && selectedGaugeNames.length === 0) {
      const empty = document.createElement("div");
      empty.className = "productGaugeEmpty";
      empty.textContent = "尚未勾選要顯示的產品";
      gaugeArea.appendChild(empty);
    }

    visibleProductNames.forEach(productName => {
      const stats = productStats[productName];
      const total = stats.ok + stats.ng;
      const yieldRate = total > 0 ? Math.round((stats.ok / total) * 100) : 0;

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
    });

    // 每頁固定 8 個位置（4 欄 × 2 排）。最後一頁不足 8 個時補空白占位，
    // 避免第 2 頁只有 1~2 張卡時卡片被整列撐高、版面變形。
    if (gaugeArea && selectedGaugeNames.length > 0) {
      const missingSlots = Math.max(0, PRODUCT_GAUGE_PAGE_SIZE - visibleProductNames.length);
      for (let i = 0; i < missingSlots; i += 1) {
        const placeholder = document.createElement("div");
        placeholder.className = "gaugeBox gaugeBoxPlaceholder";
        placeholder.setAttribute("aria-hidden", "true");
        gaugeArea.appendChild(placeholder);
      }
    }

    const tableOkTotalEl = document.getElementById("table-ok-total");
    const tableNgTotalEl = document.getElementById("table-ng-total");
    if (tableOkTotalEl) {
      tableOkTotalEl.textContent = selectedTableProduct === "__all__"
        ? totalOK
        : (productStats[selectedTableProduct]?.ok ?? 0);
    }
    if (tableNgTotalEl) {
      tableNgTotalEl.textContent = selectedTableProduct === "__all__"
        ? totalNG
        : (productStats[selectedTableProduct]?.ng ?? 0);
    }
const totalOkEl = document.getElementById("totalOk");
const totalNgEl = document.getElementById("totalNg");

if (totalOkEl) totalOkEl.textContent = totalOK;
if (totalNgEl) totalNgEl.textContent = totalNG;

checkYieldAlerts(filteredList, productStats, totalOK, totalNG);
renderYieldTrend();
renderNgImageArchive(list);

    showError("");
  } catch (e) {
    console.error("dashboard stats load failed", e);
    const detail = e?.message ? `：${e.message}` : "";
    showError(`讀取統計資料失敗${detail}`);
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
        <div class="defect-id"><span class="eventIdLabel">事件編號：</span>${escapeHtml(item.id || "-")}</div>
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
    if (dashboardDataMode() !== "PRODUCTION") {
      const hint = document.querySelector(".liveHint");
      if (hint) hint.textContent = "目前檢視歷史／測試資料；即時 MQTT 提示只對正式模式顯示";
      return;
    }
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

    addDashboardDataMode(params);
    const data = await apiFetch(`/api/summary?${params.toString()}`);
    if (!data) return;

    document.getElementById("summaryTotal").textContent = `總數：${data.total}`;
    document.getElementById("summaryOk").textContent = `OK：${data.okCount}`;
    document.getElementById("summaryNg").textContent = `NG：${data.ngCount}`;
    const pendingEl = document.getElementById("summaryPending"); if (pendingEl) pendingEl.textContent = `待判：${data.pendingCount ?? 0}`;
    const unmatchedEl = document.getElementById("summaryUnmatched"); if (unmatchedEl) unmatchedEl.textContent = `未配對瑕疵：${data.unmatchedCount ?? 0}`;
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

// Render 不能直接讀取插在現場 Windows 電腦的 USB Webcam。
// 從已登入的同源 API 讀取 Python 上傳的 YOLOv8 JPEG 辨識畫面。
let visionFrameTimer = null;
let visionFrameBusy = false;
let visionFrameObjectUrl = null;
let visionFrameGeneration = 0;
let chosenCameraId = "";
function ensureCameraPicker() {
  // 選單固定放在標題列中，不插入即時畫面內。
  const picker = document.getElementById("visionCameraPicker");
  if (!picker) return null;
  if (!picker.dataset.cameraPickerReady) {
    picker.dataset.cameraPickerReady = "1";
    picker.addEventListener("change", () => {
      chosenCameraId = picker.value;
      startCamera();
    });
  }
  return picker;
}
async function startCamera() {
  if (visionFrameTimer) clearInterval(visionFrameTimer);
  visionFrameTimer = null;
  visionFrameGeneration += 1;
  const generation = visionFrameGeneration;
  const img = document.getElementById("camera");
  const hint = document.getElementById("liveHint");
  const picker = ensureCameraPicker();
  if (!img) return;
  img.removeAttribute("src");
  if (visionFrameObjectUrl) URL.revokeObjectURL(visionFrameObjectUrl);
  visionFrameObjectUrl = null;
  if (hint) hint.textContent = "正在檢查現場 USB Webcam／YOLOv8 影像來源...";
  const systemId = getCurrentSystemId();
  if (!systemId) {
    if (hint) hint.textContent = "請先選擇機台；尚未連接鏡頭";
    return;
  }
  const updateFrame = async () => {
    if (generation !== visionFrameGeneration || visionFrameBusy || document.hidden) return;
    visionFrameBusy = true;
    try {
      const status = await apiFetch(`/api/vision-frame/status?system_id=${encodeURIComponent(systemId)}&camera_id=${encodeURIComponent(chosenCameraId)}`);
      if (picker && Array.isArray(status?.cameras)) {
        const ids = status.cameras.map(c => c.camera_id);
        if (chosenCameraId && !ids.includes(chosenCameraId)) ids.push(chosenCameraId);
        const oldIds = [...picker.options].slice(1).map(o => o.value);
        if (JSON.stringify(ids) !== JSON.stringify(oldIds)) {
          picker.replaceChildren(new Option("自動顯示最新畫面", ""), ...ids.map(id => new Option(id, id)));
          picker.value = chosenCameraId;
        }
      }
      if (generation !== visionFrameGeneration) return;
      if (!status?.online) {
        img.removeAttribute("src");
        if (visionFrameObjectUrl) URL.revokeObjectURL(visionFrameObjectUrl);
        visionFrameObjectUrl = null;
        if (hint) hint.textContent = "未連線：尚未收到現場 Python／YOLOv8 即時影像（或影像已逾時）";
        return;
      }
      const response = await fetch(`/api/vision-frame/image?system_id=${encodeURIComponent(systemId)}&camera_id=${encodeURIComponent(chosenCameraId)}`, { credentials: "same-origin", cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      if (generation !== visionFrameGeneration) return;
      if (blob.type !== "image/jpeg") throw new Error("非 JPEG 影像");
      const nextUrl = URL.createObjectURL(blob);
      const previousUrl = visionFrameObjectUrl;
      visionFrameObjectUrl = nextUrl;
      img.src = nextUrl;
      if (previousUrl) URL.revokeObjectURL(previousUrl);
      if (hint) hint.textContent = `現場影像已連線｜鏡頭 ${status.camera_id}｜YOLOv8 辨識畫面`;
    } catch (error) {
      img.removeAttribute("src");
      if (visionFrameObjectUrl) URL.revokeObjectURL(visionFrameObjectUrl);
      visionFrameObjectUrl = null;
      if (hint) hint.textContent = "即時影像讀取失敗：請檢查現場 Python 與網路連線";
      console.warn("YOLOv8 即時影像讀取失敗", error);
    } finally {
      visionFrameBusy = false;
    }
  };
  await updateFrame();
  if (generation === visionFrameGeneration) visionFrameTimer = setInterval(updateFrame, 1200);
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

  opt.textContent = sys.system_name || sys.name || "未命名機台";
  opt.title = `system_id：${sys.system_id}`;

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

  await loadSelectedProducts();
  renderProductList();
  syncYieldAlertSettings();

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
    alert(result?.message || "遠端停止指令已送出，請等待裝置 ACK／現場確認");
  } catch (e) {
    console.error(e);
    showError(e.message || "遠端停止失敗");
  }
};

document.addEventListener("DOMContentLoaded", async () => {
  // 等待後端 /api/session 驗證完成，再用伺服器確認的角色初始化管理員控制項。
  if (window.authReady) {
    const verifiedSession = await window.authReady;
    if (!verifiedSession) return;
  }
  forceCloseErrorOverlay();

  // Do not leave the header stuck on "狀態讀取中" while tenant/system lists are loading.
  updateMqttStatus(false, "正在檢查 MQTT...");
  startHealthHeartbeat();

  const titleSpan = document.getElementById("pageSubTitle");
  const userChip = document.getElementById("userChip");
  const systemSelect = document.getElementById("systemSelect");

  const currentUserRaw = sessionStorage.getItem("loginUser") || "";
  let currentUser = {};
  try { currentUser = JSON.parse(currentUserRaw) || {}; } catch (e) { currentUser = {}; }
  const companyName = String(currentUser.company || "").trim();
  const personName = String(currentUser.name || sessionStorage.getItem("loginName") || "").trim();
  const email = String(currentUser.email || sessionStorage.getItem("email") || "").trim();
  const identityText = companyName && personName
    ? `${companyName}｜${personName}`
    : (personName || companyName || email || "使用者");

  if (userChip) {
    userChip.textContent = identityText;
    userChip.title = email ? `登入帳號：${email}` : identityText;
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
// 首次進入首頁就建立平台總管理員專用檢視；原版錯放在機台 change 事件內。
initAdminDashboardDataMode();
await loadSelectedProducts();
renderProductList();
await syncYieldAlertSettings();

  const productGaugePickerBtn = document.getElementById("productGaugePickerBtn");
  const productGaugePicker = document.getElementById("productGaugePicker");
  const productGaugePrev = document.getElementById("productGaugePrev");
  const productGaugeNext = document.getElementById("productGaugeNext");
  const productGaugeSelectAll = document.getElementById("productGaugeSelectAll");
  const productGaugeClearAll = document.getElementById("productGaugeClearAll");

  productGaugePickerBtn?.addEventListener("click", (event) => {
    event.stopPropagation();
    productGaugePicker?.classList.toggle("show");
  });
  productGaugePicker?.addEventListener("click", event => event.stopPropagation());
  document.addEventListener("click", () => productGaugePicker?.classList.remove("show"));
  productGaugePrev?.addEventListener("click", async () => {
    productGaugePage = Math.max(0, productGaugePage - 1);
    await loadDashboardStats();
  });
  productGaugeNext?.addEventListener("click", async () => {
    productGaugePage += 1;
    await loadDashboardStats();
  });
  productGaugeSelectAll?.addEventListener("click", async () => {
    selectedGaugeProducts = new Set(Object.keys(latestProductStats).filter(name => name !== "未分類"));
    productGaugePage = 0;
    await loadDashboardStats();
  });
  productGaugeClearAll?.addEventListener("click", async () => {
    selectedGaugeProducts.clear();
    productGaugePage = 0;
    await loadDashboardStats();
  });

  const productTableFilterSelect = document.getElementById("productTableFilterSelect");
  productTableFilterSelect?.addEventListener("change", async () => {
    await loadDashboardStats();
  });

  if (systemSelect) {
    systemSelect.addEventListener("change", async (e) => {
  const newSystemId = e.target.value;
  setCurrentSystemId(newSystemId);

  await loadSelectedProducts();
  renderProductList();
  syncYieldAlertSettings();

  initAdminDashboardDataMode();
  await loadSiteConfig();
  await window.refreshDashboard();
  startDashboardRealtime();
  startLaneRealtimeFallback();
  startHealthHeartbeat();
  await startCamera();
  await loadMachineRanking(true);
});
  }

  if (titleSpan) {
    titleSpan.textContent =
      `使用者：${identityText}｜系統：${getDisplaySystemName(getCurrentSystemId())}`;
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
  startDashboardRealtime();
  startLaneRealtimeFallback();
  startHealthHeartbeat();
  await startCamera();
  await loadMachineRanking(true);
  window.addEventListener("resize", () => renderYieldTrend());

  // 瀏覽器分頁從背景切回前景時立即同步一次。Chrome 可能節流背景計時器，
  // 因此不能只依賴 setInterval。
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      window.refreshDashboard();
      loadLaneStatus();
    }
  });
  window.addEventListener("focus", () => {
    window.refreshDashboard();
    loadLaneStatus();
  });

  window.addEventListener("beforeunload", stopDashboardRealtime, { once: true });
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


document.addEventListener("DOMContentLoaded", bindProductInputEnter);


