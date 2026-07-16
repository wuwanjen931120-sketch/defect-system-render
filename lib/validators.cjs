"use strict";

const STATUS_VALUES = new Set(["OK", "NG"]);

function cleanText(value, maxLength = 120) {
  return String(value ?? "")
    .trim()
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .slice(0, maxLength);
}

function validatePassword(password) {
  const value = String(password || "");
  if (value.length < 8) {
    return { valid: false, message: "密碼至少需要 8 碼" };
  }
  if (value.length > 128) {
    return { valid: false, message: "密碼長度不可超過 128 碼" };
  }
  if (!/[A-Za-z]/.test(value) || !/\d/.test(value)) {
    return { valid: false, message: "密碼至少需包含英文字母與數字" };
  }
  return { valid: true, message: "" };
}

function normalizeDefectItem(item, fallbackProduct = "未分類") {
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    return { valid: false, message: "檢測資料必須是 JSON 物件" };
  }

  const id = cleanText(item.id || item.case_id, 100);
  const status = cleanText(item.status, 10).toUpperCase();
  const product = cleanText(item.product || fallbackProduct, 100) || "未分類";

  if (!id) return { valid: false, message: "缺少 id 或 case_id" };
  if (!STATUS_VALUES.has(status)) {
    return { valid: false, message: "status 只能是 OK 或 NG" };
  }

  let timestamp = new Date();
  if (item.timestamp) {
    const parsed = new Date(item.timestamp);
    if (Number.isNaN(parsed.getTime())) {
      return { valid: false, message: "timestamp 格式不正確" };
    }
    timestamp = parsed;
  }

  return {
    valid: true,
    value: { id, status, product, timestamp }
  };
}

function parsePagination(query = {}, defaults = {}) {
  const defaultLimit = Number(defaults.defaultLimit || 100);
  const maxLimit = Number(defaults.maxLimit || 500);
  const rawPage = Number.parseInt(query.page, 10);
  const rawLimit = Number.parseInt(query.limit, 10);
  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
  const limitCandidate = Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : defaultLimit;
  const limit = Math.min(limitCandidate, maxLimit);
  return { page, limit, skip: (page - 1) * limit };
}

function parseCsv(value, maxItems = 50) {
  return String(value || "")
    .split(",")
    .map(item => cleanText(item, 100))
    .filter(Boolean)
    .slice(0, maxItems);
}

module.exports = {
  cleanText,
  validatePassword,
  normalizeDefectItem,
  parsePagination,
  parseCsv
};
