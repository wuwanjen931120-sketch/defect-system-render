"use strict";
/* core.js
 * 統一側邊欄 + 登入保護 + 錯誤處理 + 清快取工具
 * 目的：讓首頁、事件紀錄、系統設定、AI 助理左邊選單都長一樣。
 */
(function(){
  const PROTECTED_PAGES = ["dashboard.html", "logs.html", "settings.html", "ai.html", "admin.html", "mongo-admin.html"];

  function currentFile(){
    const p = location.pathname.toLowerCase();
    const last = p.split("/").pop() || "dashboard.html";
    return last === "" ? "dashboard.html" : last;
  }

  function isProtectedPage(){
    return PROTECTED_PAGES.includes(currentFile());
  }

  function parseJwtPayload(token){
    try{
      if(!token || !token.includes(".")) return null;
      const payload = token.split(".")[1];
      const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
      return JSON.parse(decodeURIComponent(Array.prototype.map.call(json, c => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2)).join("")));
    }catch{
      try{
        const payload = token.split(".")[1];
        return JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
      }catch{
        return null;
      }
    }
  }

  function getLoginInfo(){
    const token = sessionStorage.getItem("token") || "";
    const payload = parseJwtPayload(token) || {};
    const loginUser = safeJsonParse(sessionStorage.getItem("loginUser"), {}) || {};
    return {
      token,
      email: sessionStorage.getItem("email") || sessionStorage.getItem("loginEmail") || payload.email || loginUser.email || loginUser.username || "",
      role: sessionStorage.getItem("role") || payload.role || loginUser.role || "",
      tenant_id: sessionStorage.getItem("tenant_id") || payload.tenant_id || loginUser.tenant_id || ""
    };
  }

  function escapeHtml(value){
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
  window.escapeHtml = window.escapeHtml || escapeHtml;

  function safeHtml(raw){
    const text = String(raw ?? "");
    if(window.DOMPurify){
      return window.DOMPurify.sanitize(text, {
        ALLOWED_TAGS:["div","span","b","strong","br","button","img","table","thead","tbody","tr","th","td","a","p"],
        ALLOWED_ATTR:["class","href","src","alt","title","type","loading","style","aria-label"]
      });
    }
    return escapeHtml(text);
  }
  window.safeHtml = safeHtml;

  function safeText(v, fallback="-"){
    try{
      if(v === undefined || v === null) return fallback;
      const s = String(v).replace(/[\u0000-\u001F\u007F]/g, "").trim();
      return s || fallback;
    }catch{
      return fallback;
    }
  }
  window.safeText = safeText;

  function safeNumber(v, fallback=0){
    try{
      const n = Number(String(v ?? "").trim());
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
    try{ return /[\u0000-\u001F\u007F]/.test(String(s)); }
    catch{ return false; }
  }
  window.hasControlChar = hasControlChar;

  function safeGet(key, fallback=null){
    try{
      const raw = localStorage.getItem(key);
      if(raw === null) return fallback;
      return safeJsonParse(raw, raw);
    }catch{
      return fallback;
    }
  }
  window.safeGet = safeGet;

  function safeSet(key, value){
    try{
      localStorage.setItem(key, typeof value === "string" ? value : JSON.stringify(value));
      return true;
    }catch{
      return false;
    }
  }
  window.safeSet = safeSet;

  function toast(msg, state="OK"){
    let el = document.getElementById("errorBar");
    if(!el){
      el = document.createElement("div");
      el.id = "errorBar";
      document.body.appendChild(el);
    }
    el.textContent = msg || "";
    el.style.display = "block";
    el.style.backgroundColor = state === "OK" ? "rgba(34,197,94,.20)" : state === "WARN" ? "rgba(245,158,11,.22)" : "rgba(239,68,68,.22)";
    el.style.borderColor = state === "OK" ? "rgba(34,197,94,.35)" : state === "WARN" ? "rgba(245,158,11,.35)" : "rgba(239,68,68,.35)";
    el.style.color = "rgba(231,238,252,.95)";
    setTimeout(()=>{ el.style.display = "none"; }, 3800);
  }
  window.toast = toast;

  function isIgnorableRuntimeMessage(message){
    const msg = String(message || "").trim();
    if(!msg) return true;
    return (
      msg.includes("Script error") ||
      msg.includes("ResizeObserver") ||
      msg.includes("chrome-extension") ||
      msg.includes("extension") ||
      msg.includes("DevTools") ||
      msg.includes("Non-Error promise rejection captured")
    );
  }
  window.isIgnorableRuntimeMessage = isIgnorableRuntimeMessage;

  function ensureOverlay(){
    // 保留函式名稱，避免舊程式呼叫時出錯；但新版不再自動彈出遮罩。
    return;
  }

  function showError(msg, detail){
    const message = String(msg || detail || "").trim();
    if(isIgnorableRuntimeMessage(message)) return;
    console.warn("[系統錯誤已記錄，不再阻擋畫面]", msg, detail || "");
    try{ toast("⚠️ " + (msg || "發生錯誤"), "WARN"); }catch(_){ }
  }
  window.showError = showError;

  window.addEventListener("error", (e)=>{
    const message = e?.message || e?.error?.message || "";
    if(isIgnorableRuntimeMessage(message)) return;
    console.warn("[GlobalError 已記錄，不顯示遮罩]", message, e?.error || "");
  });

  window.addEventListener("unhandledrejection", (e)=>{
    const reason = e?.reason;
    const message = reason?.message || (typeof reason === "string" ? reason : "");
    if(isIgnorableRuntimeMessage(message)) return;
    console.warn("[UnhandledRejection 已記錄，不顯示遮罩]", reason || "");
  });

  async function swHardReset(){
    try{
      if("serviceWorker" in navigator){
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r => r.unregister()));
      }
      if(window.caches?.keys){
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      }
      toast("✅ 已清除快取，正在重新整理", "OK");
      setTimeout(()=>location.reload(), 350);
    }catch(e){
      console.warn("swHardReset failed", e);
      toast("⚠️ 清除快取失敗，仍會重新整理", "WARN");
      setTimeout(()=>location.reload(), 350);
    }
  }
  window.swHardReset = swHardReset;

  function logout(){
    try{
      sessionStorage.removeItem("token");
      sessionStorage.removeItem("isLogin");
      sessionStorage.removeItem("loginUser");
      sessionStorage.removeItem("role");
      sessionStorage.removeItem("tenant_id");
      sessionStorage.removeItem("system_id");
    }catch{}
    location.replace("login.html");
  }
  window.logout = logout;

  function injectUnifiedSidebarCss(){
    if(document.getElementById("unifiedSidebarCss")) return;
    const style = document.createElement("style");
    style.id = "unifiedSidebarCss";
    style.textContent = `
      .app{ grid-template-columns:240px 1fr !important; }
      .sidebar{
        width:240px !important; min-width:240px !important; max-width:240px !important;
        background:linear-gradient(180deg, rgba(15,27,45,.96), rgba(15,27,45,.82)) !important;
        border-right:1px solid rgba(255,255,255,.10) !important;
        padding:18px 16px !important;
        position:sticky !important; top:0 !important; height:100vh !important;
        overflow:auto !important; display:flex !important; flex-direction:column !important;
      }
      .drawer .sidebar{ position:static !important; display:flex !important; height:100vh !important; }
      .sidebar .logo{ flex-shrink:0 !important; }
      .brand{ display:flex !important; align-items:center !important; gap:12px !important; min-height:82px !important; padding:10px 10px 16px !important; margin-bottom:14px !important; }
      .brand h1{ font-size:14px !important; line-height:1.35 !important; margin:0 !important; white-space:normal !important; }
      .brand p{ display:block !important; font-size:12px !important; color:var(--muted) !important; margin:3px 0 0 !important; }
      .nav{ display:flex !important; flex-direction:column !important; gap:12px !important; }
      .nav a{
        width:100% !important; min-height:56px !important; padding:0 18px !important; margin:0 !important;
        display:flex !important; align-items:center !important; justify-content:flex-start !important; gap:8px !important;
        border-radius:20px !important; background:linear-gradient(180deg, rgba(40,78,130,.95), rgba(30,58,95,.95)) !important;
        color:#fff !important; border:1px solid rgba(255,255,255,.16) !important;
        font-size:16px !important; font-weight:800 !important; line-height:1.2 !important;
        text-decoration:none !important; box-sizing:border-box !important; overflow:hidden !important; white-space:nowrap !important;
      }
      .nav a:hover{ background:linear-gradient(180deg, rgba(52,100,165,.98), rgba(37,72,118,.98)) !important; }
      .nav a.active{ background:linear-gradient(180deg, rgba(58,106,172,1), rgba(44,83,136,1)) !important; border-color:rgba(160,205,255,.45) !important; }
      .nav-label{ display:inline-flex !important; align-items:center !important; gap:10px !important; min-width:0 !important; overflow:hidden !important; text-overflow:ellipsis !important; white-space:nowrap !important; word-break:keep-all !important; }
      .nav .pill{ margin-left:auto !important; flex-shrink:0 !important; font-size:12px !important; padding:4px 10px !important; border-radius:999px !important; color:rgba(231,238,252,.80) !important; background:rgba(0,0,0,.18) !important; border:1px solid rgba(255,255,255,.12) !important; }
      .side-footer{ margin-top:16px !important; padding:10px !important; border-top:1px solid rgba(255,255,255,.10) !important; display:grid !important; gap:10px !important; }
      .side-footer .btn{ width:100% !important; min-height:52px !important; display:flex !important; align-items:center !important; justify-content:center !important; border-radius:18px !important; font-size:15px !important; font-weight:800 !important; white-space:nowrap !important; text-decoration:none !important; }
      #aiFloatBtn{ position:fixed; right:18px; bottom:18px; z-index:9998; padding:12px 18px; border-radius:999px; background:linear-gradient(90deg,#38bdf8,#22c55e); color:white; font-weight:900; box-shadow:0 14px 34px rgba(0,0,0,.35); border:1px solid rgba(255,255,255,.18); text-decoration:none !important; }
      #aiFloatBtn:hover{ filter:brightness(1.08); }
      @media(max-width:980px){ .app{ grid-template-columns:1fr !important; } .sidebar{ display:none !important; } .drawer .sidebar{ display:flex !important; } .hamburger{ display:inline-flex !important; } }
    `;
    document.head.appendChild(style);
  }

  function navLink(file, label, pill){
    const active = currentFile() === file ? " active" : "";
    return `<a href="${file}" class="${active.trim()}"><span class="nav-label">${label}</span><span class="pill">${pill}</span></a>`;
  }

  function standardizeSidebar(){
    const sidebars = Array.from(document.querySelectorAll(".sidebar"));
    if(!sidebars.length) return;
    const info = getLoginInfo();
    const canAdmin = info.role === "super_admin" || info.role === "tenant_admin";
    const adminHtml = canAdmin ? navLink("admin.html", "🧑‍💼 管理後台", "Admin") : "";
    const html = `
      <div class="brand">
        <div class="logo"></div>
        <div>
          <h1>瑕疵辨識與分流系統</h1>
          <p>Defect System</p>
        </div>
      </div>
      <div class="nav">
        ${navLink("dashboard.html", "🏠 首頁", "Dashboard")}
        ${navLink("logs.html", "🧾 事件紀錄", "Logs")}
        ${navLink("settings.html", "⚙️ 系統設定", "Settings")}
        ${navLink("ai.html", "🤖 AI 助理", "AI")}
        ${adminHtml}
      </div>
      <div class="side-footer">
        <button class="btn" type="button" onclick="swHardReset()">修復灰底/警告（清快取）</button>
        <button class="btn" type="button" onclick="logout()">登出</button>
      </div>`;
    sidebars.forEach(side => { side.innerHTML = html; });
  }

  function ensureAiFloatingButton(){
    const info = getLoginInfo();
    if(!info.token) return;
    if(document.getElementById("aiFloatBtn")) return;
    if(currentFile() === "ai.html") return;
    const btn = document.createElement("a");
    btn.id = "aiFloatBtn";
    btn.href = "ai.html";
    btn.textContent = "🤖 AI 助理";
    btn.setAttribute("aria-label", "開啟 AI 助理");
    document.body.appendChild(btn);
  }

  document.addEventListener("DOMContentLoaded", ()=>{
    try{
      const info = getLoginInfo();
      if(isProtectedPage() && !info.token){
        location.replace("login.html");
        return;
      }
      document.body.classList.add("unified-sidebar-ready");
      injectUnifiedSidebarCss();
      standardizeSidebar();
      ensureAiFloatingButton();
      // 有些頁面會在載入後用自己的舊版側邊欄覆蓋，這裡再補跑幾次，確保每頁左側固定統一。
      setTimeout(standardizeSidebar, 80);
      setTimeout(standardizeSidebar, 450);
      setTimeout(standardizeSidebar, 1200);
      try{
        const observer = new MutationObserver(()=>{
          const bad = Array.from(document.querySelectorAll(".sidebar")).some(side => !side.textContent.includes("AI 助理") || !side.textContent.includes("Defect System") || !side.textContent.includes("登出"));
          if(bad) standardizeSidebar();
        });
        observer.observe(document.body, { childList:true, subtree:true });
      }catch(_){}
    }catch(e){
      console.warn("core init failed", e);
      if(isProtectedPage()) location.replace("login.html");
    }
  });
})();
