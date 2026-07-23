"use strict";

const DEFAULT_COOKIE_NAME = "defect_session";

function normalizeSameSite(value) {
  const raw = String(value || "Lax").trim().toLowerCase();
  if (raw === "strict") return "Strict";
  if (raw === "none") return "None";
  return "Lax";
}

function parseCookieHeader(header) {
  const result = {};
  const raw = String(header || "");
  if (!raw) return result;
  for (const pair of raw.split(";")) {
    const index = pair.indexOf("=");
    if (index < 0) continue;
    const key = pair.slice(0, index).trim();
    if (!key) continue;
    const value = pair.slice(index + 1).trim();
    try { result[key] = decodeURIComponent(value); }
    catch { result[key] = value; }
  }
  return result;
}

function getSessionToken(req, cookieName = DEFAULT_COOKIE_NAME) {
  const cookies = parseCookieHeader(req?.headers?.cookie);
  const cookieToken = String(cookies[cookieName] || "").trim();
  if (cookieToken) return cookieToken;

  const header = String(req?.headers?.authorization || "");
  return header.startsWith("Bearer ") ? header.slice(7).trim() : "";
}

function buildSessionCookie(token, options = {}) {
  const cookieName = options.cookieName || DEFAULT_COOKIE_NAME;
  const maxAgeSeconds = Math.max(60, Number(options.maxAgeSeconds || 14400));
  const secure = Boolean(options.secure);
  const sameSite = normalizeSameSite(options.sameSite || "Lax");
  const parts = [
    `${cookieName}=${encodeURIComponent(String(token || ""))}`,
    "Path=/",
    "HttpOnly",
    `SameSite=${sameSite}`,
    `Max-Age=${Math.floor(maxAgeSeconds)}`,
    "Priority=High"
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

function buildClearCookie(options = {}) {
  const cookieName = options.cookieName || DEFAULT_COOKIE_NAME;
  const secure = Boolean(options.secure);
  const sameSite = normalizeSameSite(options.sameSite || "Lax");
  const parts = [
    `${cookieName}=`,
    "Path=/",
    "HttpOnly",
    `SameSite=${sameSite}`,
    "Max-Age=0",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
    "Priority=High"
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

module.exports = {
  DEFAULT_COOKIE_NAME,
  normalizeSameSite,
  parseCookieHeader,
  getSessionToken,
  buildSessionCookie,
  buildClearCookie
};
