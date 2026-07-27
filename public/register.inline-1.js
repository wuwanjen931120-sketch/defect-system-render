"use strict";

const API_BASE = window.location.origin;
let registrationEnabled = false;

function showErr(message) {
  const errBox = document.getElementById("errBox");
  const okBox = document.getElementById("okBox");
  okBox.hidden = true;
  errBox.hidden = false;
  errBox.textContent = `⚠️ ${message}`;
}

function showOk(message) {
  const errBox = document.getElementById("errBox");
  const okBox = document.getElementById("okBox");
  errBox.hidden = true;
  okBox.hidden = false;
  okBox.textContent = `✅ ${message}`;
}

function clearMessage() {
  document.getElementById("errBox").hidden = true;
  document.getElementById("okBox").hidden = true;
}

function setFormEnabled(enabled) {
  registrationEnabled = enabled;
  ["company", "username", "password", "inviteCode", "btnRegister"].forEach(id => {
    const element = document.getElementById(id);
    if (element) element.disabled = !enabled;
  });
}

async function loadRegistrationStatus() {
  try {
    const response = await fetch("/api/login/status", { cache: "no-store", headers: { "Accept": "application/json" } });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || `HTTP ${response.status}`);
    if (!data.registration_enabled) {
      setFormEnabled(false);
      showErr("目前已關閉公開註冊，請聯絡管理員建立帳號");
      return;
    }
    setFormEnabled(true);
    const inviteInput = document.getElementById("inviteCode");
    if (data.registration_requires_invite) {
      inviteInput.required = true;
      inviteInput.placeholder = "請輸入管理員提供的邀請碼";
    } else {
      inviteInput.required = false;
      inviteInput.placeholder = "未設定可留空";
    }
  } catch (error) {
    setFormEnabled(false);
    showErr(`無法確認註冊服務狀態：${error.message}`);
  }
}

async function doRegister() {
  clearMessage();
  if (!registrationEnabled) {
    showErr("目前已關閉公開註冊");
    return;
  }

  const company = document.getElementById("company").value.trim();
  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value;
  const invite_code = document.getElementById("inviteCode").value.trim();
  if (!company || !username || !password) {
    showErr("請完整輸入公司名稱、帳號、密碼");
    return;
  }
  if (password.length < 10 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    showErr("密碼至少 10 碼，且需包含英文字母與數字");
    return;
  }

  const button = document.getElementById("btnRegister");
  button.disabled = true;
  const originalText = button.textContent;
  button.textContent = "註冊中...";
  try {
    const response = await fetch(`${API_BASE}/api/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ company, username, password, invite_code })
    });
    const data = await response.json();
    if (!response.ok) {
      showErr(data.message || "註冊失敗");
      return;
    }
    showOk("註冊成功，2 秒後前往登入頁");
    window.setTimeout(() => { location.href = "login.html"; }, 2000);
  } catch (error) {
    showErr("無法連線後端或後端尚未部署最新版本");
  } finally {
    button.textContent = originalText;
    button.disabled = !registrationEnabled;
  }
}

document.getElementById("btnRegister").addEventListener("click", doRegister);
document.addEventListener("keydown", event => {
  if (event.key === "Enter") doRegister();
});
loadRegistrationStatus();
