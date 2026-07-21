"use strict";

const crypto = require("crypto");

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function validatePassword(password) {
  const value = String(password || "");
  const errors = [];
  const weakPasswords = new Set([
    "password123",
    "1234567890",
    "qwerty1234",
    "admin12345",
    "1111111111",
    "abc1234567"
  ]);

  if (value.length < 10) errors.push("密碼至少需要 10 個字元");
  if (value.length > 128) errors.push("密碼長度不可超過 128 個字元");
  if (!/[A-Za-z]/.test(value)) errors.push("密碼需包含英文字母");
  if (!/\d/.test(value)) errors.push("密碼需包含數字");
  if (weakPasswords.has(value.toLowerCase())) errors.push("此密碼過於常見，請更換");

  return { valid: errors.length === 0, errors };
}

function cleanText(value, maxLength = 120) {
  return String(value ?? "")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .trim()
    .slice(0, maxLength);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function clampInt(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

function normalizeImageUrl(value) {
  const url = cleanText(value, 1000);
  if (!url) return "";
  if (url.startsWith("/")) return url;
  if (/^https:\/\//i.test(url)) return url;
  throw new Error("image_url 只能是 HTTPS 網址或站內路徑");
}

function normalizeDefectItem(item, fallbackProduct = "未分類") {
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    throw new Error("瑕疵資料格式錯誤");
  }

  const id = cleanText(item.id || item.case_id || item.caseId, 100);
  const status = cleanText(item.status, 10).toUpperCase();
  const product = cleanText(item.product || fallbackProduct, 100) || "未分類";
  const image_url = normalizeImageUrl(
    item.image_url || item.imageUrl || item.snapshot_url || item.snapshotUrl || ""
  );

  if (!id) throw new Error("缺少 id 或 case_id");
  if (!new Set(["OK", "NG"]).has(status)) throw new Error("status 只能是 OK 或 NG");

  let timestamp = new Date();
  if (item.timestamp || item.createdAt || item.receivedAt) {
    timestamp = new Date(item.timestamp || item.createdAt || item.receivedAt);
    if (Number.isNaN(timestamp.getTime())) throw new Error("timestamp 格式不正確");
  }

  return { id, status, product, image_url, timestamp };
}

function normalizeDefectPayload(payload, fallbackProduct = "未分類") {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("MQTT payload 必須是 JSON 物件");
  }

  const system_id = cleanText(payload.system_id, 100);
  if (!system_id) throw new Error("缺少 system_id");

  if (Array.isArray(payload.items)) {
    if (payload.items.length === 0) throw new Error("items 不可為空");
    if (payload.items.length > 100) throw new Error("單次最多接收 100 筆 items");
    return {
      system_id,
      items: payload.items.map(item => normalizeDefectItem(item, fallbackProduct))
    };
  }

  return { system_id, items: [normalizeDefectItem(payload, fallbackProduct)] };
}

function hashOtp(email, code, secret) {
  return crypto
    .createHmac("sha256", String(secret || ""))
    .update(`${normalizeEmail(email)}:${String(code || "")}`)
    .digest("hex");
}

function timingSafeTextEqual(left, right) {
  const a = Buffer.from(String(left ?? ""), "utf8");
  const b = Buffer.from(String(right ?? ""), "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function csvCell(value) {
  let text = String(value ?? "");
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

module.exports = {
  normalizeEmail,
  validatePassword,
  cleanText,
  escapeHtml,
  clampInt,
  normalizeImageUrl,
  normalizeDefectItem,
  normalizeDefectPayload,
  hashOtp,
  timingSafeTextEqual,
  csvCell
};
