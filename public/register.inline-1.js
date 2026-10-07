"use strict";
const API_BASE = location.origin;
let challengeId = "";
let enabled = true;
const $ = (id) => document.getElementById(id);
function showErr(message) {
  $("okBox").hidden = true;
  $("errBox").hidden = false;
  $("errBox").textContent = `⚠️ ${message}`;
}
function showOk(message) {
  $("errBox").hidden = true;
  $("okBox").hidden = false;
  $("okBox").textContent = `✅ ${message}`;
}
async function json(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || `HTTP ${response.status}`);
  return data;
}
async function sendCode() {
  const username = $("username").value.trim();
  if (!username) return showErr("請先輸入 Email");
  const button = $("btnSendCode");
  button.disabled = true;
  try {
    const data = await json(await fetch("/api/register/send-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: username })
    }));
    challengeId = data.challenge_id || "";
    showOk("驗證碼已寄出，請到信箱查看");
  } catch (error) {
    showErr(error.message);
  } finally {
    button.disabled = false;
  }
}
async function register() {
  if (!enabled) return;
  const company = $("company").value.trim();
  const name = $("name").value.trim();
  const username = $("username").value.trim();
  const password = $("password").value;
  const code = $("code").value.trim();
  if (!company || !name || !username || !password || !/^[0-9]{6}$/.test(code) || !challengeId) {
    return showErr("請完整輸入公司／單位、姓名、Email、密碼並完成 6 位數 Email 驗證碼");
  }
  if (password.length < 10 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return showErr("密碼至少 10 碼，且需包含英文字母與數字");
  }
  const button = $("btnRegister");
  button.disabled = true;
  try {
    await json(await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ company, name, username, password, code, challenge_id: challengeId })
    }));
    showOk("註冊成功，正在前往登入頁");
    setTimeout(() => { location.href = "login.html"; }, 1000);
  } catch (error) {
    showErr(error.message);
  } finally {
    button.disabled = false;
  }
}
async function init() {
  try {
    const data = await json(await fetch("/api/login/status", { cache: "no-store" }));
    enabled = !!data.registration_enabled;
    if (!enabled) showErr("目前已關閉公開註冊");
  } catch (error) {
    enabled = false;
    showErr("無法確認註冊服務狀態");
  }
}
$("btnSendCode").addEventListener("click", sendCode);
$("btnRegister").addEventListener("click", register);
$("backLogin").addEventListener("click", () => { location.href = "login.html"; });
$("username").addEventListener("input", () => { challengeId = ""; $("code").value = ""; });
$("code").addEventListener("input", (event) => { event.target.value = event.target.value.replace(/\D/g, "").slice(0, 6); });
document.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && document.activeElement?.id !== "btnSendCode") register();
});
init();
