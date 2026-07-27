"use strict";

function isTrue(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  return String(value).trim().toLowerCase() === "true";
}

function isPlaceholder(value) {
  const text = String(value || "").trim().toLowerCase();
  return !text || ["change-me", "replace-me", "your-secret", "replace-with-a-random-secret-at-least-32-characters"].includes(text) || text.includes("user:password") || text.includes("your_cluster");
}

function validUrl(value, protocols) {
  try {
    const url = new URL(String(value || ""));
    return protocols.includes(url.protocol);
  } catch (_) {
    return false;
  }
}

function resolveSmtp(env) {
  return {
    user: String(env.SMTP_USER || env.BREVO_SMTP_LOGIN || env.GMAIL_USER || env.EMAIL_USER || "").trim(),
    pass: String(env.SMTP_PASS || env.BREVO_SMTP_KEY || env.GMAIL_APP_PASSWORD || env.GMAIL_PASS || env.EMAIL_PASS || ""),
    from: String(env.SMTP_FROM || env.BREVO_SENDER_EMAIL || env.GMAIL_USER || env.EMAIL_FROM || "").trim()
  };
}

function collectEnvironmentErrors(env = process.env) {
  const errors = [];
  const production = String(env.NODE_ENV || "development") === "production";
  const mongo = String(env.MONGODB_URI || "").trim();
  const jwt = String(env.JWT_SECRET || "");

  if (isPlaceholder(mongo) || !/^mongodb(?:\+srv)?:\/\//i.test(mongo)) {
    errors.push("MONGODB_URI 必須是有效的 MongoDB 連線字串");
  }
  if (isPlaceholder(jwt) || jwt.length < 32) {
    errors.push("JWT_SECRET 必須是至少 32 字元的隨機字串，且不可使用範例值");
  }

  const appBaseUrl = String(env.APP_BASE_URL || "").trim();
  if (production && !validUrl(appBaseUrl, ["https:"])) {
    errors.push("正式環境 APP_BASE_URL 必須是 HTTPS 網址");
  }

  const originValues = String(env.ALLOWED_ORIGINS || "").split(",").map(value => value.trim()).filter(Boolean);
  if (production && !originValues.length) errors.push("正式環境必須設定 ALLOWED_ORIGINS");
  for (const origin of originValues) {
    if (!validUrl(origin, production ? ["https:"] : ["http:", "https:"])) {
      errors.push(`ALLOWED_ORIGINS 含有無效來源：${origin}`);
    }
  }

  const sameSite = String(env.AUTH_COOKIE_SAME_SITE || (production ? "Strict" : "Lax")).trim().toLowerCase();
  if (!["strict", "lax", "none"].includes(sameSite)) errors.push("AUTH_COOKIE_SAME_SITE 只能是 Strict、Lax 或 None");
  if (sameSite === "none" && !production && !isTrue(env.AUTH_COOKIE_SECURE)) {
    errors.push("SameSite=None 必須搭配 AUTH_COOKIE_SECURE=true");
  }

  const publicRegistration = isTrue(env.ALLOW_PUBLIC_REGISTRATION, !production);
  const inviteCode = String(env.REGISTRATION_INVITE_CODE || "");
  if (production && publicRegistration && inviteCode.length < 12) {
    errors.push("正式環境開啟公開註冊時，REGISTRATION_INVITE_CODE 至少需要 12 字元");
  }

  const requireEmail = isTrue(env.REQUIRE_EMAIL_LOGIN, production);
  if (requireEmail) {
    const smtp = resolveSmtp(env);
    if (!smtp.user) errors.push("Email OTP 登入需要 SMTP_USER");
    if (!smtp.pass) errors.push("Email OTP 登入需要 SMTP_PASS");
    if (!smtp.from || !smtp.from.includes("@")) errors.push("Email OTP 登入需要有效的 SMTP_FROM");
  }

  const mqtt = {
    url: String(env.MQTT_URL || "").trim(),
    user: String(env.HIVEMQ_USER || "").trim(),
    pass: String(env.HIVEMQ_PASS || "")
  };
  const mqttConfiguredCount = Object.values(mqtt).filter(Boolean).length;
  if (mqttConfiguredCount > 0 && mqttConfiguredCount < 3) {
    errors.push("MQTT_URL、HIVEMQ_USER、HIVEMQ_PASS 必須同時設定");
  }
  if (mqtt.url && !validUrl(mqtt.url, production ? ["mqtts:", "wss:"] : ["mqtt:", "mqtts:", "ws:", "wss:"])) {
    errors.push("MQTT_URL 通訊協定不正確；正式環境請使用 mqtts:// 或 wss://");
  }

  return errors;
}

function validateEnvironment(env = process.env) {
  const errors = collectEnvironmentErrors(env);
  if (errors.length) {
    const error = new Error(`環境變數檢查失敗：\n- ${errors.join("\n- ")}`);
    error.code = "INVALID_ENVIRONMENT";
    error.details = errors;
    throw error;
  }
  return true;
}

module.exports = {
  isTrue,
  isPlaceholder,
  validUrl,
  resolveSmtp,
  collectEnvironmentErrors,
  validateEnvironment
};
