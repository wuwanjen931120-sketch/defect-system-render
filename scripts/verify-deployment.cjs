"use strict";

const base = String(process.argv[2] || process.env.APP_BASE_URL || "").replace(/\/$/, "");
if (!/^https:\/\//i.test(base)) {
  console.error("用法：npm run verify:deployment -- https://你的服務.onrender.com");
  process.exit(1);
}

const failures = [];

async function request(path, options = {}) {
  const response = await fetch(`${base}${path}`, {
    redirect: options.redirect || "follow",
    cache: "no-store",
    signal: AbortSignal.timeout(120000),
    headers: { "User-Agent": "defect-system-deployment-verifier/1.1", ...(options.headers || {}) }
  });
  const text = await response.text();
  let json = null;
  try { json = JSON.parse(text); } catch (_) {}
  return { response, text, json };
}

function check(condition, message) {
  if (condition) console.log(`✅ ${message}`);
  else {
    console.error(`❌ ${message}`);
    failures.push(message);
  }
}

async function main() {
  const root = await request("/", { redirect: "manual" });
  check([301, 302, 307, 308].includes(root.response.status), "根網址會重新導向登入頁");
  check(String(root.response.headers.get("location") || "").includes("login.html"), "根網址導向 login.html");

  const live = await request("/health/live");
  check(live.response.ok && live.json?.status === "ok", "Liveness 正常");

  const ready = await request("/health/ready");
  check(ready.response.ok && ready.json?.status === "ok", "資料庫、Email 與必要服務 Readiness 正常");

  const loginStatus = await request("/api/login/status");
  check(loginStatus.response.ok && loginStatus.json?.database_connected === true, "登入狀態 API 已連接資料庫");
  check(loginStatus.json?.email_login_enabled === true, "Email OTP 寄信服務已通過驗證");
  check(loginStatus.json?.registration_enabled === false, "正式環境公開註冊已關閉");

  const login = await request("/login.html");
  check(login.response.ok && /瑕疵辨識與分流系統/.test(login.text), "登入頁可開啟");

  const register = await request("/register.html");
  check(register.response.ok, "註冊頁可開啟");
  check(/type="email"/.test(register.text) && /登入 Email/.test(register.text), "註冊欄位明確要求可收 OTP 的 Email");
  check(Boolean(login.response.headers.get("content-security-policy")), "CSP 安全標頭存在");
  check(Boolean(login.response.headers.get("strict-transport-security")), "HSTS 安全標頭存在");
  check(login.response.headers.get("x-content-type-options") === "nosniff", "X-Content-Type-Options=nosniff");
  check(Boolean(login.response.headers.get("permissions-policy")), "Permissions-Policy 安全標頭存在");

  for (const asset of ["/manifest.webmanifest", "/sw.js", "/icon-192.png", "/icon-512.png"]) {
    const result = await request(asset);
    check(result.response.ok, `${asset} 可正常讀取`);
  }

  if (failures.length) {
    console.error(`\n部署檢查失敗：${failures.length} 項`);
    process.exit(1);
  }
  console.log("\n部署檢查全部通過。登入、角色與實體 MQTT/ACK 仍需使用測試帳號與設備執行整合測試。");
}

main().catch(error => {
  console.error(`部署檢查發生錯誤：${error.message}`);
  process.exit(1);
});
