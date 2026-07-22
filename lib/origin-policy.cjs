"use strict";

function normalizeOrigin(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  try {
    return new URL(text).origin.toLowerCase();
  } catch (_) {
    return "";
  }
}

function buildConfiguredOrigins(env = process.env) {
  const values = [
    ...String(env.ALLOWED_ORIGINS || "").split(","),
    env.APP_BASE_URL,
    env.RENDER_EXTERNAL_HOSTNAME ? `https://${env.RENDER_EXTERNAL_HOSTNAME}` : "",
    "http://localhost:5000",
    "http://127.0.0.1:5000"
  ];

  return new Set(values.map(normalizeOrigin).filter(Boolean));
}

function firstHeaderValue(value) {
  return String(value || "").split(",")[0].trim();
}

function getRequestOrigin(req) {
  const forwardedHost = firstHeaderValue(req.headers?.["x-forwarded-host"]);
  const host = forwardedHost || firstHeaderValue(req.headers?.host) || (typeof req.get === "function" ? req.get("host") : "");
  if (!host) return "";

  const forwardedProto = firstHeaderValue(req.headers?.["x-forwarded-proto"]);
  const protocol = forwardedProto || req.protocol || "http";
  return normalizeOrigin(`${protocol}://${host}`);
}

function isOriginAllowed(req, origin, configuredOrigins) {
  if (!origin) return true;
  const normalized = normalizeOrigin(origin);
  if (!normalized) return false;
  if (configuredOrigins?.has(normalized)) return true;
  return normalized === getRequestOrigin(req);
}

module.exports = {
  normalizeOrigin,
  buildConfiguredOrigins,
  getRequestOrigin,
  isOriginAllowed
};
