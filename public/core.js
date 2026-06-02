"use strict"; // 如果要全程啟用嚴格模式，請將它放在檔案的最前面
/* core.js
 * ✅ 1) 防止輸入造成崩潰（safe parse / safe number / safe text）
 * ✅ 2) 保護頁面：dashboard/logs/settings 未登入 → 導回 login.html
 * ✅ 3) 全域錯誤處理：避免白畫面，顯示 errorBar + overlay
 * ✅ 4) 提供 swHardReset：解灰底/三警告（清 SW + CacheStorage）
 */




console.log("swHardReset triggered");

function someFunction() {
  // Your function logic here
}

// 其他程式碼...


  // -------------------------
  // Error UI
  // -------------------------
  function ensureOverlay(){
    if(document.getElementById("errorOverlay")) return;
    const ov = document.createElement("div");
    ov.id = "errorOverlay";
    ov.innerHTML = `
      <div class="errorCard">
        <h2>⚠️ 系統發生錯誤（已防止白畫面）</h2>
        <div id="errorOverlayMsg" style="color:var(--muted); font-size:13px; line-height:1.6;">
          請重新整理頁面，或按「清快取」後重開。
        </div>
        <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:10px;">
          <button class="btn btnPrimary" id="btnReload">重新整理</button>
          <button class="btn" id="btnFix">修復灰底/警告（清快取）</button>
          <button class="btn" id="btnClose">關閉</button>
        </div>
        <pre id="errorOverlayDetail"></pre>
      </div>
    `;
    document.body.appendChild(ov);


    ov.querySelector("#btnReload").addEventListener("click", ()=> location.reload());
    ov.querySelector("#btnFix").addEventListener("click", ()=> swHardReset());
    ov.querySelector("#btnClose").addEventListener("click", ()=> ov.classList.remove("show"));
  }

function toast(msg, state="OK") {
  const el = document.getElementById("errorBar");
  if (!el) return;

  el.textContent = msg || "";

  // 根據狀態設定顏色
  if (state === "OK") {
    el.style.backgroundColor = "rgba(34,197,94,.35)";
    el.style.color = "green";
  } else if (state === "WARN") {
    el.style.backgroundColor = "rgba(245,158,11,.35)";
    el.style.color = "yellow";
  } else {
    el.style.backgroundColor = "rgba(239,68,68,.35)";
    el.style.color = "red";
  }

  el.style.display = "block";  // 顯示提示
  setTimeout(() => {
    el.style.display = "none";  // 4秒後隱藏提示
  }, 4000);
}

  function showError(msg, detail){
    try{
      // errorBar（底部）
      const bar = document.getElementById("errorBar");
      if(bar){
        bar.style.display = "block";
        bar.textContent = "⚠️ " + (msg || "發生錯誤");
        setTimeout(()=>{ bar.style.display = "none"; }, 4000);
      }


      // overlay（避免白畫面）
      ensureOverlay();
      document.getElementById("errorOverlayMsg").textContent = msg || "發生錯誤";
      document.getElementById("errorOverlayDetail").textContent = String(detail || "");
      document.getElementById("errorOverlay").classList.add("show");
    }catch(e){
      console.warn("showError failed", e);
    }
  }


  window.showError = showError;


  // 全域錯誤攔截（避免白畫面）
  window.addEventListener("error", (e)=>{
    console.error("[GlobalError]", e?.message, e?.error);
    showError("頁面執行發生錯誤", e?.error || e?.message || "");
  });
  window.addEventListener("unhandledrejection", (e)=>{
    console.error("[UnhandledRejection]", e?.reason);
    showError("資料處理發生錯誤（Promise）", e?.reason || "");
  });


  // -------------------------
  // Safe helpers (輸入防爆核心)
  // -------------------------
  function safeText(v, fallback="-"){
    try{
      if(v === undefined || v === null) return fallback;
      const s = String(v);
      // 避免控制字元
      return s.replace(/[\u0000-\u001F\u007F]/g, "").trim() || fallback;
    }catch{
      return fallback;
    }
  }
  window.safeText = safeText;


  function safeNumber(v, fallback=0){
    try{
      if(v === undefined || v === null) return fallback;
      const n = Number(String(v).trim());
      return Number.isFinite(n) ? n : fallback;
    }catch{
      return fallback;
    }
  }
  window.safeNumber = safeNumber;


  function safeJsonParse(raw, fallback=null){
    try{
      if(!raw) return fallback;
      return JSON.parse(raw);
    }catch{
      return fallback;
    }
  }
  window.safeJsonParse = safeJsonParse;


  function hasControlChar(s){
    try{
      return /[\u0000-\u001F\u007F]/.test(String(s));
    }catch{
      return false;
    }
  }
  window.hasControlChar = hasControlChar;


  // localStorage 安全讀寫（避免崩潰）
  function safeGet(key, fallback=null){
    try{
      const raw = localStorage.getItem(key);
      if(raw === null) return fallback;
      // 如果是 JSON，嘗試 parse，不是就直接回傳字串
      const obj = safeJsonParse(raw, "__NOT_JSON__");
      return obj === "__NOT_JSON__" ? raw : obj;
    }catch(e){
      console.warn("safeGet error", e);
      return fallback;
    }
  }
  window.safeGet = safeGet;


  function safeSet(key, value){
    try{
      // 物件用 JSON，字串直接存
      if(typeof value === "string"){
        localStorage.setItem(key, value);
      }else{
        localStorage.setItem(key, JSON.stringify(value));
      }
      return true;
    }catch(e){
      console.warn("safeSet error", e);
      return false;
    }
  }
  window.safeSet = safeSet;





  // -------------------------
  // Auth guard（防止 dashboard/logs/settings 未登入）
  // -------------------------
  function isProtectedPage(){
    const p = location.pathname.toLowerCase();
    return p.endsWith("dashboard.html") || p.endsWith("logs.html") || p.endsWith("settings.html");
  }


  document.addEventListener("DOMContentLoaded", ()=>{
    try{
      if(isProtectedPage() && sessionStorage.getItem("isLogin") !== "true"){
  location.replace("login.html");
}
    }catch(e){
      location.replace("login.html");
    }
  });


  // 登出
window.logout = function(){
  try{
    sessionStorage.removeItem("isLogin");
    sessionStorage.removeItem("loginUser");
  }catch(e){}
  location.replace("login.html");
};


  // -------------------------
  // SW hard reset（修灰底/警告/白畫面常見：舊快取污染）
  // -------------------------
async function swHardReset() {
  try {
    // 清除 Service Worker 並清除 Cache
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.unregister()));
    }

    if (window.caches?.keys) {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    }

    // 顯示成功通知
    toast("✅ 已清除修復快取", "OK");

    // 重新載入頁面
    location.reload();

  } catch (e) {
    console.warn("swHardReset failed", e);
    // 顯示錯誤通知
    toast("❌ 清除快取失敗", "WARN");
    location.reload();
  }
  
}
window.swHardReset = swHardReset;

