
/* script.js
 * 共用 UI 行為（Dashboard / Logs / Settings 都可以用）
 * ✅ 已加防爆：safeText/safeNumber 防 null、防 NaN、防奇怪輸入
 */


window.toggleDrawer = function(open){
  const drawer = document.getElementById("drawer");
  const overlay = document.getElementById("overlay");
  if(!drawer || !overlay) return;


  if(open){
    drawer.classList.add("open");
    overlay.classList.add("show");
  }else{
    drawer.classList.remove("open");
    overlay.classList.remove("show");
  }
};


window.scrollToId = function(id){
  window.toggleDrawer(false);
  const el = document.getElementById(id);
  if(!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
};


window.nowTime = function(){
  const d = new Date();
  const p = (n)=> String(n).padStart(2,'0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};


window.pushLog = function(state, text, note){
  const body = document.getElementById("logBody");
  if(!body) return;


  const tr = document.createElement("tr");


  let badgeClass = "ok";
  let badgeText = "OK";
  if(state === "NG"){ badgeClass = "ng"; badgeText = "NG"; }
  if(state === "WARN"){ badgeClass = "warn"; badgeText = "WARN"; }


  tr.innerHTML = `
    <td>${window.escapeHtml(window.nowTime())}</td>
    <td><span class="badge ${badgeClass}">${badgeText}</span></td>
    <td>${window.escapeHtml(window.safeText(text, "-"))}</td>
    <td>${window.escapeHtml(window.safeText(note, ""))}</td>
  `;


  body.prepend(tr);
  while(body.children.length > 50) body.removeChild(body.lastChild);
};


// demo：KPI 波動（你之後可換成 API）
window.demoRefresh = function(){
  try{
    // 你的新版 dashboard 沒有 KPI 區也沒關係，下面取不到會 fallback
    const total = window.safeNumber(document.getElementById("kpiTotal")?.textContent, 0);
    const ng = window.safeNumber(document.getElementById("kpiNg")?.textContent, 0);
    const fps = window.safeNumber(document.getElementById("kpiFps")?.textContent, 15);


    const add = Math.floor(Math.random()*3)+1;
    const isNg = Math.random() < 0.22;


    const newTotal = total + add;
    const newNg = isNg ? (ng + 1) : ng;
    const newFps = Math.max(10, Math.min(20, fps + (Math.random()<0.5?-1:1)));


    // 若 KPI 元件存在就更新，不存在就跳過（不會炸）
    if(document.getElementById("kpiTotal")) document.getElementById("kpiTotal").textContent = String(newTotal);
    if(document.getElementById("kpiNg")) document.getElementById("kpiNg").textContent = String(newNg);
    if(document.getElementById("kpiFps")) document.getElementById("kpiFps").textContent = String(newFps);


    window.pushLog(isNg ? "NG" : "OK", isNg ? "scratch_demo" : "nut_demo",
                   isNg ? "分流：瑕疵區" : "分類：良品區");
  }catch(e){
    console.error(e);
    window.showError("更新資料時發生錯誤（已防爆）");
  }
};


window.setMqtt = function(online){
  const dot = document.getElementById("mqttDot");
  const text = document.getElementById("mqttText");
  if(!dot || !text) return;


  if(online){
    dot.style.background = "var(--good)";
    dot.style.boxShadow = "0 0 16px rgba(34,197,94,.6)";
    text.textContent = "MQTT 已連線";
    window.pushLog("OK", "MQTT", "連線正常");
  }else{
    dot.style.background = "var(--bad)";
    dot.style.boxShadow = "0 0 16px rgba(239,68,68,.6)";
    text.textContent = "MQTT 斷線";
    window.pushLog("WARN", "MQTT", "連線中斷");
  }
};


window.demoEstop = async function(){
  try{
    const role = sessionStorage.getItem("role") || "user";
    if (!['super_admin','tenant_admin'].includes(role)) throw new Error("只有管理員可以使用緊急停止");
    const system_id = sessionStorage.getItem("system_id") || "";
    const tenant_id = sessionStorage.getItem("tenant_id") || "";
    if (!system_id) throw new Error("請先選擇機台");
    if (!confirm(`確定要停止機台 ${system_id} 嗎？`)) return;
    await apiFetch(`${API_BASE}/api/estop`, {
      method: "POST",
      body: JSON.stringify({ system_id, tenant_id })
    });

    pushLog("WARN", "ESTOP", "已觸發緊急停止");
    alert("已觸發緊急停止");

  }catch(e){
    console.error(e);
    showError("急停失敗");
  }
};

window.loadStock = async function(){
  try{
    const data = await apiFetch(`${API_BASE}/api/defects`);

    const el = document.getElementById("stockCount");
    if(el){
      el.textContent = Array.isArray(data) ? data.length : 0;
    }

  }catch(e){
    console.error(e);
    window.showError("讀取 stock 失敗");
  }
};

window.demoMail = function(){
  const el = document.getElementById("mailState");
  if(el){
    el.style.color = "var(--warn)";
    el.textContent = "已送出（展示）";
    setTimeout(()=>{
      el.style.color = "var(--good)";
      el.textContent = "可用（展示）";
    }, 1200);
  }
  window.pushLog("WARN", "Gmail", "已推播通知（展示）");
};
async function checkMqttStatus(){
  try{
    const data = await apiFetch(`${API_BASE}/api/health`);

    window.setMqtt(data.mqttConnected === true);

  }catch(e){
    console.error(e);
    window.setMqtt(false);
  }
}
document.addEventListener("DOMContentLoaded", () => {
  checkMqttStatus();
});

// ✅ 全頁統一註冊 SW（避免多處重複也不會炸）
window.addEventListener("load", () => {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(console.error);
  }
});


async function clearAreaA() {
  try {
    const res = await fetch(`${API_BASE}/api/clearA`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      }
    });

    const data = await res.json();

    if (!res.ok || !data.success) {
      throw new Error(data.message || "清除 A 區失敗");
    }

    alert(`A 區清除成功，刪除了 ${data.deletedCount ?? 0} 筆資料`);

    if (typeof loadDashboardStats === "function") await loadDashboardStats();
    if (typeof loadDefects === "function") await loadDefects();

  } catch (err) {
    console.error("clearAreaA error:", err);
    alert("清除 A 區失敗：" + err.message);
  }
}

async function clearAreaB() {
  try {
    const res = await fetch(`${API_BASE}/api/areaB`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json"
      }
    });

    const data = await res.json();

    if (!res.ok || !data.success) {
      throw new Error(data.message || "清除 B 區失敗");
    }

    alert(`B 區清除成功，刪除了 ${data.deletedCount ?? 0} 筆資料`);

    if (typeof loadDashboardStats === "function") await loadDashboardStats();
    if (typeof loadDefects === "function") await loadDefects();

  } catch (err) {
    console.error("clearAreaB error:", err);
    alert("清除 B 區失敗：" + err.message);
  }
}

window.refreshDashboard = async function() {
  try {
    if (typeof loadDashboardStats === "function") {
      await loadDashboardStats();
    }

    if (typeof loadDefects === "function") {
      await loadDefects();
    }

    // 🔥 每次刷新後重新更新 MQTT 狀態
    await checkMqttStatus();

    console.log("✅ Dashboard refreshed");

  } catch (e) {
    console.error(e);
    alert("重新整理失敗");
  }
};
async function loadDefects(){
  try{
    const data = await apiFetch(`${API_BASE}/api/defects`);

    // =========================
    // ✅ 防空資料（🔥放這裡）
    // =========================
    if (!Array.isArray(data) || data.length === 0) {
      document.getElementById("defectCount").textContent = 0;

      const list = document.getElementById("defect-list");
      if (list) {
        list.innerHTML = "<div style='color:#888;'>目前沒有資料</div>";
      }

      return;
    }

    // =========================
    // 正常顯示
    // =========================
    document.getElementById("defectCount").textContent = data.length;

    const list = document.getElementById("defect-list");
    if (list) list.innerHTML = "";

    data.forEach(item => {
      const div = document.createElement("div");
      div.textContent = `${item.id || "-"} - ${item.status || "-"} - ${item.timestamp || "-"}`;
      list.appendChild(div);
    });

  }catch(e){
    console.error(e);
  }
}
