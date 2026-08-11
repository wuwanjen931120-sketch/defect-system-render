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


  function getLoginInfo(){
    const loginUser = safeJsonParse(sessionStorage.getItem("loginUser"), {}) || {};
    return {
      authenticated: sessionStorage.getItem("isLogin") === "true",
      email: sessionStorage.getItem("email") || sessionStorage.getItem("loginEmail") || loginUser.email || loginUser.username || "",
      role: sessionStorage.getItem("role") || loginUser.role || "",
      tenant_id: sessionStorage.getItem("tenant_id") || loginUser.tenant_id || ""
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
        ALLOWED_ATTR:["class","href","src","alt","title","type","loading","aria-label"]
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
    el.classList.remove("toast-ok", "toast-warn", "toast-error");
    el.classList.add(state === "OK" ? "toast-ok" : state === "WARN" ? "toast-warn" : "toast-error");
    el.hidden = false;
    setTimeout(()=>{ el.hidden = true; }, 3800);
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

  function clearClientSession(){
    try{
      localStorage.removeItem("defect_public_auth_v1");
      ["isLogin", "email", "loginEmail", "loginUser", "loginName", "role", "tenant_id", "system_id", "allowed_systems"].forEach(key => sessionStorage.removeItem(key));
    }catch{}
  }
  window.clearClientSession = clearClientSession;

  function logout(){
    fetch("/api/logout", { method:"POST", credentials:"same-origin", cache:"no-store" })
      .catch(()=>{})
      .finally(()=>{
        clearClientSession();
        location.replace("login.html");
      });
  }
  window.logout = logout;

  function injectUnifiedSidebarCss(){ /* 已改為外部 unified-sidebar.css */ }

  function createNavLink(file, label, pill){
    const link = document.createElement("a");
    link.href = file;
    if(currentFile() === file) link.classList.add("active");
    const labelElement = document.createElement("span");
    labelElement.className = "nav-label";
    labelElement.textContent = label;
    const pillElement = document.createElement("span");
    pillElement.className = "pill";
    pillElement.textContent = pill;
    link.append(labelElement, pillElement);
    return link;
  }

  function standardizeSidebar(){
    const sidebars = Array.from(document.querySelectorAll(".sidebar"));
    if(!sidebars.length) return;
    const info = getLoginInfo();
    const canAdmin = info.role === "super_admin" || info.role === "tenant_admin";

    sidebars.forEach(side => {
      const brand = document.createElement("div");
      brand.className = "brand";
      const logo = document.createElement("div");
      logo.className = "logo";
      const brandText = document.createElement("div");
      const title = document.createElement("h1");
      title.textContent = "瑕疵辨識與分流系統";
      const subtitle = document.createElement("p");
      subtitle.textContent = "Defect System";
      brandText.append(title, subtitle);
      brand.append(logo, brandText);

      const nav = document.createElement("div");
      nav.className = "nav";
      nav.append(
  createNavLink("dashboard.html", "🏠 首頁", "Dashboard"),
  createNavLink("logs.html", "🧾 事件紀錄", "Logs"),
  createNavLink("settings.html", "⚙️ 系統設定", "Settings"),
  createNavLink("ai.html", "🤖 AI 助理", "AI"),
  createNavLink("health.html", "🩺 系統健康", "Health")
);
if (canAdmin) {
  nav.append(
    createNavLink("user-manage.html", "👥 角色機台", "Users"),
    createNavLink("admin.html", "🧑‍💼 管理後台", "Admin")
  );
}
      const footer = document.createElement("div");
      footer.className = "side-footer";
      const resetButton = document.createElement("button");
      resetButton.className = "btn";
      resetButton.type = "button";
      resetButton.textContent = "修復灰底/警告（清快取）";
      resetButton.addEventListener("click", swHardReset);
      const logoutButton = document.createElement("button");
      logoutButton.className = "btn";
      logoutButton.type = "button";
      logoutButton.textContent = "登出";
      logoutButton.addEventListener("click", logout);
      footer.append(resetButton, logoutButton);

      side.replaceChildren(brand, nav, footer);
    });
  }

  function ensureAiFloatingButton(){
    const info = getLoginInfo();
    if(!info.authenticated) return;
    if(document.getElementById("aiFloatBtn")) return;
    if(currentFile() === "ai.html") return;
    const btn = document.createElement("a");
    btn.id = "aiFloatBtn";
    btn.href = "ai.html";
    btn.textContent = "🤖 AI 助理";
    btn.setAttribute("aria-label", "開啟 AI 助理");
    document.body.appendChild(btn);
  }

  document.addEventListener("DOMContentLoaded", async ()=>{
    try{
      // 登入狀態以伺服器的 HttpOnly Cookie 為準。
      // 先等待 auth-bootstrap 完成 /api/session 檢查，避免頁面還沒讀到 Cookie
      // 就因為舊版的 sessionStorage 檢查而被送回登入頁。
      if(isProtectedPage()){
        const session = window.authReady ? await window.authReady : null;
        if(!session) return;
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
      // auth-bootstrap 會依真正的 /api/session 結果處理轉址，
      // 此處不再用前端暫存資料重複判斷，避免誤判登入失敗。
    }
  });
})();
