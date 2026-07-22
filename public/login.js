"use strict";

(function () {
  const $ = id => document.getElementById(id);
  const emailInput = $("email");
  const passwordInput = $("pass");
  const codeInput = $("code");
  const sendButton = $("btnSendCode");
  const loginButton = $("btnLogin");
  const fixButton = $("btnFix");
  const homeButton = $("btnHome");
  const registerButton = $("btnRegister");
  const serviceStatus = $("serviceStatus");

  function showErr(message) {
    $("okBox").style.display = "none";
    $("errBox").style.display = "block";
    $("errBox").textContent = `⚠️ ${message}`;
  }

  function showOk(message) {
    $("errBox").style.display = "none";
    $("okBox").style.display = "block";
    $("okBox").textContent = `✅ ${message}`;
  }

  function clearMessage() {
    $("errBox").style.display = "none";
    $("okBox").style.display = "none";
  }

  async function readJson(response) {
    const text = await response.text();
    if (!text) return {};
    try {
      return JSON.parse(text);
    } catch (_) {
      return { message: text.slice(0, 300) };
    }
  }

  async function apiRequest(path, options = {}) {
    const response = await fetch(path, {
      cache: "no-store",
      credentials: "same-origin",
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {})
      }
    });
    const data = await readJson(response);
    if (!response.ok) {
      const error = new Error(data.message || `請求失敗（HTTP ${response.status}）`);
      error.status = response.status;
      throw error;
    }
    return data;
  }

  function setBusy(button, busyText, isBusy) {
    if (!button.dataset.originalText) button.dataset.originalText = button.textContent;
    button.disabled = isBusy;
    button.textContent = isBusy ? busyText : button.dataset.originalText;
  }

  function startResendCountdown(seconds = 60) {
    let remain = Math.max(1, Number(seconds) || 60);
    sendButton.disabled = true;
    const original = sendButton.dataset.originalText || "寄送驗證碼";
    const timer = window.setInterval(() => {
      sendButton.textContent = `重新寄送（${remain}）`;
      remain -= 1;
      if (remain < 0) {
        window.clearInterval(timer);
        sendButton.disabled = false;
        sendButton.textContent = original;
      }
    }, 1000);
  }

  async function loadLoginStatus() {
    try {
      const status = await apiRequest("/api/login/status", { method: "GET", headers: {} });
      if (!status.database_connected) {
        serviceStatus.textContent = "資料庫尚未連線，請稍後重新整理";
        serviceStatus.className = "serviceStatus warning";
        sendButton.disabled = true;
        return;
      }
      if (!status.email_login_enabled) {
        serviceStatus.textContent = "登入驗證信服務尚未設定，請先在 Render Environment 設定 SMTP";
        serviceStatus.className = "serviceStatus warning";
        sendButton.disabled = true;
        return;
      }
      serviceStatus.textContent = `登入服務正常（${status.smtp_provider || "SMTP"} 驗證信）`;
      serviceStatus.className = "serviceStatus ready";
    } catch (error) {
      serviceStatus.textContent = `無法讀取登入服務狀態：${error.message}`;
      serviceStatus.className = "serviceStatus warning";
    }
  }

  async function sendCode() {
    clearMessage();
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    if (!email || !password) {
      showErr("請先輸入信箱與密碼");
      return;
    }

    try {
      setBusy(sendButton, "寄送中...", true);
      const data = await apiRequest("/api/login/send-code", {
        method: "POST",
        body: JSON.stringify({ email, password })
      });
      showOk(data.message || "驗證碼已寄出，請到信箱查看");
      codeInput.focus();
      startResendCountdown(60);
    } catch (error) {
      showErr(error.message);
      sendButton.disabled = false;
    } finally {
      if (!sendButton.disabled) setBusy(sendButton, "", false);
    }
  }

  async function verifyAndLogin() {
    clearMessage();
    const email = emailInput.value.trim();
    const code = codeInput.value.trim();
    if (!email || !/^\d{6}$/.test(code)) {
      showErr("請輸入信箱與 6 位數驗證碼");
      return;
    }

    try {
      setBusy(loginButton, "驗證中...", true);
      const data = await apiRequest("/api/login/verify-code", {
        method: "POST",
        body: JSON.stringify({ email, code })
      });

      const user = data.user || {};
      const systems = Array.isArray(data.systems) ? data.systems : [];
      sessionStorage.setItem("token", data.token || "");
      sessionStorage.setItem("isLogin", "true");
      sessionStorage.setItem("email", user.email || email);
      sessionStorage.setItem("loginEmail", user.email || email);
      sessionStorage.setItem("loginUser", JSON.stringify(user));
      sessionStorage.setItem("loginName", user.name || "");
      sessionStorage.setItem("tenant_id", user.tenant_id || "");
      sessionStorage.setItem("role", user.role || "user");
      sessionStorage.setItem("system_id", systems[0] || "");
      sessionStorage.setItem("allowed_systems", JSON.stringify(systems));

      showOk("登入成功，正在前往儀表板");
      window.setTimeout(() => location.replace("dashboard.html"), 450);
    } catch (error) {
      showErr(error.message);
    } finally {
      setBusy(loginButton, "", false);
    }
  }

  async function fixCache() {
    try {
      localStorage.clear();
      sessionStorage.clear();
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map(key => caches.delete(key)));
      }
      if ("serviceWorker" in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map(registration => registration.unregister()));
      }
      showOk("已清除快取與舊登入資料，頁面即將重新整理");
      window.setTimeout(() => location.reload(), 700);
    } catch (error) {
      console.error(error);
      showErr("修復失敗，請使用 Ctrl+F5 強制重新整理");
    }
  }

  sendButton.addEventListener("click", sendCode);
  loginButton.addEventListener("click", verifyAndLogin);
  fixButton.addEventListener("click", fixCache);
  homeButton.addEventListener("click", () => { location.href = "index.html"; });
  registerButton.addEventListener("click", () => { location.href = "register.html"; });
  codeInput.addEventListener("input", () => {
    codeInput.value = codeInput.value.replace(/\D/g, "").slice(0, 6);
  });
  document.addEventListener("keydown", event => {
    if (event.key !== "Enter") return;
    if (codeInput.value.trim()) verifyAndLogin();
    else sendCode();
  });

  loadLoginStatus();
})();
