const API_BASE = window.location.origin;


function getCurrentTenantId(){
  return sessionStorage.getItem("tenant_id") || "";
}

function getCurrentSystemId(){
  return sessionStorage.getItem("system_id") || "";
}

function buildDefectsParams(){
  const params = new URLSearchParams();

  const tenantId = getCurrentTenantId();
  const systemId = getCurrentSystemId();

  if (tenantId) params.append("tenant_id", tenantId);
  if (systemId) params.append("system_id", systemId);

  return params;
}

function buildDefectsUrl(){
  return `${API_BASE}/api/defects?${buildDefectsParams().toString()}`;
}

async function exportDefectsCsv(){
  if (window.authReady && !(await window.authReady)) return;
  try {
    const res = await fetch(`${API_BASE}/api/defects/export.csv?${buildDefectsParams().toString()}`, {
      cache: "no-store",
      credentials: "same-origin",
      headers: { "Accept": "text/csv" }
    });
    if (res.status === 401) {
      sessionStorage.clear();
      window.location.replace("login.html");
      return;
    }
    if (!res.ok) throw new Error("匯出失敗");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `defects-${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error(error);
    alert("CSV 匯出失敗，請稍後再試");
  }
}

async function apiFetch(url, options = {}) {
  if (window.authReady) {
    const session = await window.authReady;
    if (!session) return [];
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch(url, {
      ...options,
      cache: options.cache || "no-store",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        "ngrok-skip-browser-warning": "true",
        ...(options.headers || {})
      },
      signal: controller.signal
    });

    if (res.status === 401) {
      window.clearPublicAuth?.();
      window.location.replace("login.html?reason=session-expired");
      return [];
    }

    if (!res.ok) {
      console.warn("API 錯誤：", res.status);
      return [];
    }

    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      console.warn("後端未回傳 JSON");
      return [];
    }

    return await res.json();
  } catch (e) {
    console.error("apiFetch 失敗", e);
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

function showError(msg) {
  const el = document.getElementById("errorBar");
  if (!el) return;
  el.textContent = msg || "";
}

function getStatusClass(status) {
  const s = String(status || "").toUpperCase();
  if (s === "OK") return "status-ok";
  if (s === "NG") return "status-ng";
  return "status-warn";
}

function getRemark(item) {
  const status = String(item.status || "").toUpperCase();
  if (status === "NG") return "瑕疵分流";
  if (status === "OK") return "正常檢測";
  return "-";
}


function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, "&#096;");
}

function getImageUrl(item) {
  const raw =
    item.image_url ||
    item.imageUrl ||
    item.snapshot_url ||
    item.snapshotUrl ||
    item.ng_image_url ||
    item.ngImageUrl ||
    "";

  if (!raw) return "";
  if (/^https:\/\//i.test(raw)) return raw;
  if (raw.startsWith("/")) return API_BASE + raw;
  return "";
}

function openImagePreview(url) {
  const modal = document.getElementById("imageModal");
  const img = document.getElementById("imageModalImg");
  const caption = document.getElementById("imageModalCaption");

  if (!modal || !img) return;

  img.src = url;
  if (caption) caption.textContent = url;
  modal.classList.add("active");
}

function closeImagePreview(event) {
  if (event) {
    const target = event.target;
    if (target?.id !== "imageModal" && !target?.classList?.contains("imageModalClose")) {
      return;
    }
  }

  const modal = document.getElementById("imageModal");
  const img = document.getElementById("imageModalImg");

  if (modal) modal.classList.remove("active");
  if (img) img.src = "";
}

window.openImagePreview = openImagePreview;
window.closeImagePreview = closeImagePreview;


let currentFilter = "all";

// ⭐ 補在這裡
async function loadSystemOptionsByTenant(tenantId) {
  const systemSelect = document.getElementById("systemSelect");
  if (!systemSelect || !tenantId) return;

  const systems = await apiFetch(
  `${API_BASE}/api/systems?tenant_id=${encodeURIComponent(tenantId)}`
);

  systemSelect.replaceChildren();

const seenSystems = new Set();

(Array.isArray(systems) ? systems : []).forEach(s => {
  if (!s.system_id) return;

  if (seenSystems.has(s.system_id)) return;
  seenSystems.add(s.system_id);

  const opt = document.createElement("option");
  opt.value = s.system_id;

  opt.textContent = s.system_name
    ? `${s.system_id}｜${s.system_name}`
    : s.name
      ? `${s.system_id}｜${s.name}`
      : `機台 ${s.system_id}`;

  systemSelect.appendChild(opt);
});

// ⭐ 這段就是你問的「改這裡」
const saved = sessionStorage.getItem("system_id");

// 判斷之前選的還在不在
const hasSaved = Array.isArray(systems) && systems.some(s => s.system_id === saved);

// 如果有就用舊的，沒有就用第一台
const chosen = hasSaved ? saved : (systems[0]?.system_id || "");

sessionStorage.setItem("system_id", chosen);
systemSelect.value = chosen;
}
async function loadLogs() {
  try {
    const data = await apiFetch(buildDefectsUrl());
    if (!Array.isArray(data)) return;

    const body = document.getElementById("logBody");
    if (!body) return;

    body.replaceChildren();

    const filteredList = data
      .filter(item => {
        if (currentFilter === "all") return true;
        return item.product === currentFilter;
      })
      .slice(0, 50);

    if (filteredList.length === 0) {
      setSafeHtml(body, `
        <tr>
          <td colspan="5" class="empty-row">目前沒有資料</td>
        </tr>
      `);
      return;
    }

    filteredList.forEach(item => {
      const tr = document.createElement("tr");
      const status = String(item.status || "-").toUpperCase();
      const product = String(item.product || "-");
      const timeText = item.timestamp
        ? new Date(item.timestamp).toLocaleString("zh-TW", {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: false
          })
        : "-";

      const timeCell = document.createElement("td");
      timeCell.textContent = timeText;
      tr.appendChild(timeCell);

      const statusCell = document.createElement("td");
      const statusBadge = document.createElement("span");
      statusBadge.className = getStatusClass(status);
      statusBadge.textContent = status;
      statusCell.appendChild(statusBadge);
      tr.appendChild(statusCell);

      const productCell = document.createElement("td");
      productCell.textContent = product;
      tr.appendChild(productCell);

      const remarkCell = document.createElement("td");
      remarkCell.textContent = getRemark(item);
      tr.appendChild(remarkCell);

      const imageCell = document.createElement("td");
      imageCell.className = "imageCell";
      const imageUrl = getImageUrl(item);
      if (imageUrl) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "thumbBtn";
        button.addEventListener("click", () => openImagePreview(imageUrl));
        const image = document.createElement("img");
        image.className = "logThumb";
        image.src = imageUrl;
        image.alt = "NG圖片";
        image.loading = "lazy";
        button.appendChild(image);
        imageCell.appendChild(button);
      } else {
        const noImage = document.createElement("span");
        noImage.className = "noImage";
        noImage.textContent = "無圖片";
        imageCell.appendChild(noImage);
      }
      tr.appendChild(imageCell);
      body.appendChild(tr);
    });

   } catch (e) {
    console.warn("忽略錯誤（避免畫面跳錯）", e);
  } finally {
    forceCloseErrorOverlay();  // ⭐ 放這裡
  }
}

document.addEventListener("DOMContentLoaded", async () => {

  // ⭐⭐⭐ 在這裡加 ⭐⭐⭐
  const role = sessionStorage.getItem("role") || "user";

const isSuperAdmin = role === "super_admin";
const isTenantAdmin = role === "tenant_admin";
const canOpenAdmin = isSuperAdmin || isTenantAdmin;


  const tenantSelect = document.getElementById("tenantSelect");

if (isSuperAdmin && tenantSelect) {

  document.getElementById("tenantSwitchWrap").style.display = "flex";
const systemSwitchWrap = document.getElementById("systemSwitchWrap");
if (systemSwitchWrap) {
  systemSwitchWrap.style.display = "flex";
}
  const tenants = await apiFetch(`${API_BASE}/api/admin/tenants`);

  tenantSelect.replaceChildren();

  tenants.forEach(t => {
    const opt = document.createElement("option");
    opt.value = t.tenant_id;
    opt.textContent = t.company || t.tenant_name || t.tenant_id;
    tenantSelect.appendChild(opt);
  });

  const savedTenant = sessionStorage.getItem("tenant_id");

if (savedTenant) {
  tenantSelect.value = savedTenant;
} else if (tenants.length > 0) {
  sessionStorage.setItem("tenant_id", tenants[0].tenant_id);
  tenantSelect.value = tenants[0].tenant_id;
}

const tenantId = getCurrentTenantId();

if (tenantId) {
  await loadSystemOptionsByTenant(tenantId);
}

  tenantSelect.addEventListener("change", async (e) => {
  const tenantId = e.target.value;

  sessionStorage.setItem("tenant_id", tenantId);
  sessionStorage.removeItem("system_id");

  await loadSystemOptionsByTenant(tenantId);
  await loadLogs();

});



}
// ⭐⭐⭐ 正確位置（獨立事件）⭐⭐⭐
const systemSelect = document.getElementById("systemSelect");

if (systemSelect) {
  systemSelect.addEventListener("change", async (e) => {
    const systemId = e.target.value;

    sessionStorage.setItem("system_id", systemId);

    await loadLogs();
  });
}
  const adminNavLink = document.getElementById("adminNavLink");
  const adminNavLinkDrawer = document.getElementById("adminNavLinkDrawer");

  if (adminNavLink) {
   adminNavLink.style.display = canOpenAdmin ? "flex" : "none";

  }
  if (adminNavLinkDrawer) {
   adminNavLinkDrawer.style.display = canOpenAdmin ? "flex" : "none";
  }

  // ⭐ 原本的程式從這裡開始 ↓↓↓

  document.querySelectorAll(".filterBtn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".filterBtn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      currentFilter = btn.dataset.filter;
      loadLogs();
    });
  });

  await loadLogs();

  });
// 註解掉
// setInterval(loadLogs, 3000);
setInterval(() => {
  try {
    loadLogs();
  } catch(e) {
    console.warn("輪詢錯誤已忽略");
  }
}, 5000);
window.addEventListener("load", () => {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(console.error);
  }
});
window.addEventListener("error", e => {
  console.error("錯誤:", e.message);
});
window.addEventListener("unhandledrejection", e => e.preventDefault());
window.addEventListener("keydown", e => {
  if (e.key === "Escape") closeImagePreview();
});
function forceCloseErrorOverlay() {
  document.querySelectorAll(
    ".runtime-error-modal, .error-overlay, .white-screen-guard"
  ).forEach(el => el.remove());
}
function swHardReset() {
  if ("caches" in window) {
    caches.keys().then(keys => {
      keys.forEach(k => caches.delete(k));
    });
  }

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.getRegistrations().then(regs => {
      regs.forEach(r => r.unregister());
    });
  }

  alert("已清除快取，重新載入");
  location.reload();
}
function forceReload(e) {
  if (e) e.preventDefault();
  window.location.reload();
}
