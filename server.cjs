"use strict";

const dns = require("dns");
try { dns.setDefaultResultOrder("ipv4first"); } catch (_) {}
require("dotenv").config();

const crypto = require("crypto");
const path = require("path");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const { rateLimit } = require("express-rate-limit");
const axios = require("axios");
const mongoose = require("mongoose");
const mqtt = require("mqtt");
const nodemailer = require("nodemailer");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const {
  normalizeEmail,
  validatePassword,
  cleanText,
  clampInt,
  normalizeDefectPayload,
  hashOtp,
  timingSafeTextEqual,
  csvCell
} = require("./lib/security.cjs");
const {
  buildConfiguredOrigins,
  isOriginAllowed
} = require("./lib/origin-policy.cjs");
const {
  DEFAULT_COOKIE_NAME,
  normalizeSameSite,
  getSessionToken,
  buildSessionCookie,
  buildClearCookie
} = require("./lib/auth-cookie.cjs");
const { validateEnvironment, isTrue } = require("./lib/env-validation.cjs");
const { loginSecurityKey, getLockState, nextFailureState } = require("./lib/login-security.cjs");
const { normalizeAckStatus, topicSystemId, commandStatus } = require("./lib/estop.cjs");
const logger = require("./lib/logger.cjs");
const packageInfo = require("./package.json");

const app = express();

function isValidEmail(value) {
  const email = String(value || "").trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}
app.set("trust proxy", 1);

const PORT = Number(process.env.PORT || 5000);
const NODE_ENV = process.env.NODE_ENV || "development";
validateEnvironment(process.env);
const JWT_SECRET = process.env.JWT_SECRET;
const MONGODB_URI = process.env.MONGODB_URI;
const MQTT_REPORT_TOPIC = process.env.MQTT_REPORT_TOPIC || "factory/defect/report";
const MQTT_ESTOP_TOPIC_TEMPLATE = process.env.MQTT_ESTOP_TOPIC_TEMPLATE || "factory/control/estop/{system_id}";
const MQTT_ESTOP_ACK_TOPIC = process.env.MQTT_ESTOP_ACK_TOPIC || "factory/control/estop/ack/+";
const OTP_TTL_MINUTES = clampInt(process.env.OTP_TTL_MINUTES, 5, 2, 20);
const OTP_RESEND_SECONDS = clampInt(process.env.OTP_RESEND_SECONDS, 60, 30, 600);
const OTP_MAX_ATTEMPTS = clampInt(process.env.OTP_MAX_ATTEMPTS, 5, 3, 10);
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "4h";
const JWT_COOKIE_MAX_AGE_SECONDS = clampInt(process.env.JWT_COOKIE_MAX_AGE_SECONDS, 14400, 300, 604800);
const AUTH_COOKIE_NAME = cleanText(process.env.AUTH_COOKIE_NAME || DEFAULT_COOKIE_NAME, 80);
const AUTH_COOKIE_SAME_SITE = normalizeSameSite(
  process.env.AUTH_COOKIE_SAME_SITE || (NODE_ENV === "production" ? "Strict" : "Lax")
);
const AUTH_COOKIE_FORCE_SECURE = String(process.env.AUTH_COOKIE_SECURE || "").toLowerCase() === "true";
const ALERT_THRESHOLD = clampInt(process.env.ALERT_THRESHOLD, 3, 2, 100);
const ALERT_WINDOW_MINUTES = clampInt(process.env.ALERT_WINDOW_MINUTES, 10, 1, 1440);
const ALERT_COOLDOWN_MINUTES = clampInt(process.env.ALERT_COOLDOWN_MINUTES, 30, 1, 1440);
const ALLOW_PUBLIC_REGISTRATION = String(process.env.ALLOW_PUBLIC_REGISTRATION || (NODE_ENV === "production" ? "false" : "true")) === "true";
const DEFECT_RETENTION_DAYS = clampInt(process.env.DEFECT_RETENTION_DAYS, 365, 0, 3650);
const AUDIT_RETENTION_DAYS = clampInt(process.env.AUDIT_RETENTION_DAYS, 365, 0, 3650);
const AI_REQUESTS_PER_DAY = clampInt(process.env.AI_REQUESTS_PER_DAY, 100, 1, 10000);
const GEMINI_DEFAULT_MODEL = process.env.GEMINI_MODEL || "gemini-3.6-flash";
const REQUIRE_EMAIL_LOGIN = isTrue(process.env.REQUIRE_EMAIL_LOGIN, NODE_ENV === "production");
const LOGIN_MAX_FAILURES = clampInt(process.env.LOGIN_MAX_FAILURES, 5, 3, 20);
const LOGIN_FAILURE_WINDOW_MINUTES = clampInt(process.env.LOGIN_FAILURE_WINDOW_MINUTES, 15, 1, 1440);
const LOGIN_LOCK_MINUTES = clampInt(process.env.LOGIN_LOCK_MINUTES, 15, 1, 1440);
const MQTT_MAX_PAYLOAD_BYTES = clampInt(process.env.MQTT_MAX_PAYLOAD_BYTES, 262144, 1024, 1048576);
const MQTT_MAX_FUTURE_SECONDS = clampInt(process.env.MQTT_MAX_FUTURE_SECONDS, 300, 0, 86400);
const MQTT_MAX_PAST_DAYS = clampInt(process.env.MQTT_MAX_PAST_DAYS, 30, 0, 3650);
const ESTOP_ACK_TIMEOUT_SECONDS = clampInt(process.env.ESTOP_ACK_TIMEOUT_SECONDS, 30, 5, 600);
const ESTOP_COMMAND_RETENTION_DAYS = clampInt(process.env.ESTOP_COMMAND_RETENTION_DAYS, 30, 1, 3650);
const mqttRequired = isTrue(process.env.REQUIRE_MQTT, false);
const DEVICE_API_KEY = String(process.env.DEVICE_API_KEY || "");
const ROBOT_HEARTBEAT_TIMEOUT_SECONDS = clampInt(process.env.ROBOT_HEARTBEAT_TIMEOUT_SECONDS, 15, 5, 300);
const NG_IMAGE_MAX_BYTES = clampInt(process.env.NG_IMAGE_MAX_BYTES, 5242880, 65536, 10485760);

const allowedOrigins = buildConfiguredOrigins(process.env);

app.use((req, res, next) => {
  req.requestId = req.headers["x-request-id"] || crypto.randomUUID();
  res.setHeader("X-Request-Id", req.requestId);
  next();
});
app.use((req, res, next) => {
  const corsMiddleware = cors({
    origin(origin, callback) {
      if (isOriginAllowed(req, origin, allowedOrigins)) return callback(null, true);
      return callback(Object.assign(new Error("此來源不允許呼叫 API"), { status: 403 }));
    },
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Request-Id", "X-Device-Key"],
    credentials: true,
    maxAge: 600
  });
  return corsMiddleware(req, res, next);
});
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      imgSrc: ["'self'", "data:", "blob:", "https:"],
      mediaSrc: ["'self'", "blob:"],
      connectSrc: ["'self'"],
      scriptSrc: ["'self'"],
      scriptSrcAttr: ["'none'"],
      styleSrc: ["'self'"],
      styleSrcAttr: ["'none'"],
      fontSrc: ["'self'", "data:"]
    }
  },
  hsts: NODE_ENV === "production" ? { maxAge: 15552000, includeSubDomains: true } : false,
  referrerPolicy: { policy: "same-origin" }
}));
app.use((req, res, next) => {
  res.setHeader("Permissions-Policy", "camera=(self), microphone=(), geolocation=(), payment=(), usb=()");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  next();
});
app.use(express.json({ limit: "256kb", strict: true }));
app.use(express.urlencoded({ extended: false, limit: "64kb" }));

const publicDir = path.join(__dirname, "public");
app.get("/favicon.ico", (req,res) => res.redirect(302,"/icon-192.png"));
app.use(express.static(publicDir, {
  dotfiles: "deny",
  etag: true,
  index: false,
  maxAge: NODE_ENV === "production" ? "1h" : 0,
  setHeaders(res, filePath) {
    const name = path.basename(filePath).toLowerCase();
    if (/\.(?:html|js|css)$/i.test(filePath) || new Set(["sw.js", "manifest.webmanifest"]).has(name)) {
      // Dashboard and realtime code changes frequently during deployment.
      // Do not allow a browser/CDN cache to keep an older JS file while HTML is already new.
      res.setHeader("Cache-Control", "no-store, max-age=0, must-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
    }
  }
}));

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: "draft-8", legacyHeaders: false, message: { message: "登入嘗試過於頻繁，請稍後再試" } });
const otpSendLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 5, standardHeaders: "draft-8", legacyHeaders: false, message: { message: "驗證碼寄送過於頻繁，請稍後再試" } });
const registerLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 5, standardHeaders: "draft-8", legacyHeaders: false, message: { message: "註冊次數過多，請稍後再試" } });
const aiLimiter = rateLimit({ windowMs: 60 * 1000, limit: clampInt(process.env.AI_REQUESTS_PER_MINUTE, 10, 1, 60), standardHeaders: "draft-8", legacyHeaders: false, message: { message: "AI 問題傳送過於頻繁，請稍後再試" } });

const defectSchema = new mongoose.Schema({
  tenant_id: { type: String, required: true, trim: true },
  user_id: { type: String, default: "unknown", trim: true },
  system_id: { type: String, required: true, trim: true },
  id: { type: String, required: true, trim: true },
  event_id: { type: String, default: "", trim: true },
  track_id: { type: String, default: "", trim: true },
  status: { type: String, enum: ["OK", "NG", "PENDING", "UNMATCHED_DEFECT"], required: true, uppercase: true },
  product: { type: String, default: "未分類", trim: true },
  source: { type: String, default: "", trim: true },
  data_mode: { type: String, enum: ["TEST", "PRODUCTION", "LEGACY"], default: "LEGACY", index: true },
  robot_result: { type: String, default: "", trim: true },
  lane: { type: String, default: "", trim: true },
  image_url: { type: String, default: "", trim: true },
  timestamp: { type: Date, default: Date.now, index: true }
}, { versionKey: false });
defectSchema.index({ tenant_id: 1, system_id: 1, timestamp: -1 });
defectSchema.index({ tenant_id: 1, product: 1, timestamp: -1 });
defectSchema.index({ tenant_id: 1, system_id: 1, id: 1 }, { unique: true });
const Defect = mongoose.model("Defect", defectSchema);

const auditLogSchema = new mongoose.Schema({
  request_id: String,
  actor_id: String,
  actor_email: String,
  role: String,
  tenant_id: String,
  system_id: String,
  action: { type: String, required: true },
  target: String,
  status: { type: String, default: "success" },
  command_id: String,
  details: mongoose.Schema.Types.Mixed,
  ip: String,
  createdAt: { type: Date, default: Date.now }
}, { collection: "audit_logs", versionKey: false });
auditLogSchema.index({ tenant_id: 1, createdAt: -1 });
auditLogSchema.index({ tenant_id: 1, action: 1, createdAt: -1 });
auditLogSchema.index({ command_id: 1 }, { sparse: true });
auditLogSchema.index({ status: 1, createdAt: -1 });
const AuditLog = mongoose.model("AuditLog", auditLogSchema);

const smtpProvider = cleanText(process.env.SMTP_PROVIDER || (process.env.BREVO_SMTP_LOGIN ? "brevo" : (process.env.GMAIL_USER ? "gmail" : "custom")), 30).toLowerCase();
const smtpUser = cleanText(process.env.SMTP_USER || process.env.BREVO_SMTP_LOGIN || process.env.GMAIL_USER || process.env.EMAIL_USER, 200);
const smtpPass = String(process.env.SMTP_PASS || process.env.BREVO_SMTP_KEY || process.env.GMAIL_APP_PASSWORD || process.env.GMAIL_PASS || process.env.EMAIL_PASS || "");
const MAIL_FROM = cleanText(process.env.SMTP_FROM || process.env.BREVO_SENDER_EMAIL || process.env.GMAIL_USER || process.env.EMAIL_FROM || smtpUser, 200);
const ALERT_EMAIL = cleanText(process.env.ALERT_EMAIL || MAIL_FROM, 200);
const smtpHost = cleanText(process.env.SMTP_HOST || process.env.BREVO_SMTP_HOST || (smtpProvider === "gmail" ? "smtp.gmail.com" : "smtp-relay.brevo.com"), 200);
const smtpPort = clampInt(process.env.SMTP_PORT || process.env.BREVO_SMTP_PORT, smtpProvider === "gmail" ? 465 : 2525, 1, 65535);
const smtpSecure = String(process.env.SMTP_SECURE || process.env.BREVO_SMTP_SECURE || (smtpProvider === "gmail" ? "true" : "false")) === "true";
const mailEnabled = Boolean(smtpUser && smtpPass && MAIL_FROM);
const transporter = mailEnabled ? nodemailer.createTransport({
  host: smtpHost,
  port: smtpPort,
  secure: smtpSecure,
  auth: { user: smtpUser, pass: smtpPass },
  connectionTimeout: 15000,
  greetingTimeout: 15000,
  socketTimeout: 20000,
  disableFileAccess: true,
  disableUrlAccess: true
}) : null;
let isMailReady = false;
let lastMailCheckAt = null;

function asyncHandler(fn) { return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next); }
function requestUsesHttps(req) {
  const forwarded = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim().toLowerCase();
  return Boolean(req.secure || forwarded === "https");
}

function secureCookieForRequest(req) {
  return AUTH_COOKIE_FORCE_SECURE || NODE_ENV === "production" || requestUsesHttps(req);
}

async function auth(req, res, next) {
  const token = getSessionToken(req, AUTH_COOKIE_NAME);
  if (!token) return res.status(401).json({ message: "未登入" });
  try {
    const claims = jwt.verify(token, JWT_SECRET, { algorithms: ["HS256"], issuer: "defect-system" });
    const users = mongoose.connection.collection("users");
    let user = null;
    if (claims.sub && mongoose.Types.ObjectId.isValid(String(claims.sub))) {
      user = await users.findOne({ _id: new mongoose.Types.ObjectId(String(claims.sub)) });
    }
    if (!user && claims.email) {
      const email = normalizeEmail(claims.email);
      user = await users.findOne({ $or: [{ email }, { username: email }] });
    }
    if (!user) return res.status(401).json({ message: "登入帳號已不存在，請重新登入" });
    if (user.disabled === true || user.status === "disabled") {
      return res.status(403).json({ message: "此帳號已停用，請聯絡管理員" });
    }
    if (Number(claims.session_version || 0) !== Number(user.session_version || 0)) {
      return res.status(401).json({ message: "登入狀態已失效，請重新登入" });
    }
    if (user.passwordChangedAt && Number(claims.iat || 0) * 1000 < new Date(user.passwordChangedAt).getTime()) {
      return res.status(401).json({ message: "密碼已更新，請重新登入" });
    }
    req.authClaims = claims;
    req.user = {
      id: String(user._id),
      email: user.email || user.username || "",
      name: user.name || "",
      company: user.company || "",
      tenant_id: user.tenant_id || "",
      role: user.role || "user",
      systems: Array.isArray(user.systems) ? user.systems : (user.system_id ? [user.system_id] : [])
    };
    return next();
  } catch (error) {
    if (error?.name === "JsonWebTokenError" || error?.name === "TokenExpiredError") {
      return res.status(401).json({ message: "登入已過期，請重新登入" });
    }
    return next(error);
  }
}
function requireRole(...roles) { return (req, res, next) => roles.includes(req.user?.role) ? next() : res.status(403).json({ message: "權限不足" }); }

// Server-owned mode. Missing legacy events are never silently classified as production.
const DATA_MODES = new Set(["TEST", "PRODUCTION"]);
const isDataAdmin = user => user?.role === "super_admin";
async function configuredMachineMode(tenant_id, system_id) {
  const record = await mongoose.connection.collection("machine_data_modes").findOne({ tenant_id, system_id });
  return DATA_MODES.has(record?.mode) ? record.mode : "TEST";
}
function dataModeFilter(user, params = {}) {
  const requested = cleanText(params.data_mode, 20).toUpperCase();
  if (!isDataAdmin(user)) {
    if (requested && requested !== "PRODUCTION") throw Object.assign(new Error("只有平台總管理員可以查看測試資料"), { status: 403 });
    return { data_mode: "PRODUCTION" };
  }
  if (!requested || requested === "PRODUCTION") return { data_mode: "PRODUCTION" };
  if (requested === "TEST") return { $or: [{ data_mode: "TEST" }, { data_mode: "LEGACY" }, { data_mode: { $exists: false } }, { data_mode: null }] };
  if (requested === "ALL") return {};
  throw Object.assign(new Error("data_mode 只能是 PRODUCTION、TEST 或 ALL"), { status: 400 });
}

function deviceAuth(req, res, next) {
  if (!DEVICE_API_KEY) {
    return res.status(503).json({ message: "DEVICE_API_KEY 尚未設定，裝置整合 API 已停用" });
  }
  const supplied = String(req.headers["x-device-key"] || "");
  if (!supplied || !timingSafeTextEqual(supplied, DEVICE_API_KEY)) {
    return res.status(401).json({ message: "裝置驗證失敗" });
  }
  return next();
}
function userSystemIds(user) { return Array.isArray(user?.systems) ? user.systems.map(v => cleanText(v, 100)).filter(Boolean) : []; }

async function systemAccess(user, systemId, requestedTenantId) {
  const cleanId = cleanText(systemId, 100);
  if (!cleanId) return { allowed: false, status: 400, message: "缺少 system_id" };
  const system = await mongoose.connection.collection("systems").findOne({ system_id: cleanId }, { projection: { _id: 0, tenant_id: 1, system_id: 1, name: 1, current_product: 1 } });
  if (!system) return { allowed: false, status: 404, message: "找不到機台" };
  if (requestedTenantId && system.tenant_id !== requestedTenantId) return { allowed: false, status: 403, message: "機台不屬於指定租戶" };
  if (user.role === "super_admin") return { allowed: true, system };
  if (system.tenant_id !== user.tenant_id) return { allowed: false, status: 403, message: "無權存取此租戶" };
  if (user.role === "tenant_admin") return { allowed: true, system };
  if (!userSystemIds(user).includes(cleanId)) return { allowed: false, status: 403, message: "無權存取此機台" };
  return { allowed: true, system };
}

async function buildScopedDefectQuery(user, params = {}) {
  const query = { ...dataModeFilter(user, params) };
  const products = cleanText(params.products, 1000);
  if (products) {
    const list = products.split(",").map(v => cleanText(v, 100)).filter(Boolean).slice(0, 30);
    if (list.length) query.product = { $in: list };
  }
  const productSearch = cleanText(params.product_search, 100);
  if (productSearch) {
    const escaped = productSearch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    query.product = { $regex: escaped, $options: "i" };
  }
  const status = cleanText(params.status, 30).toUpperCase();
  if (status) {
    if (!new Set(["OK", "NG", "PENDING", "UNMATCHED_DEFECT"]).has(status)) throw Object.assign(new Error("status 只能是 OK、NG、PENDING 或 UNMATCHED_DEFECT"), { status: 400 });
    query.status = status;
  }
  const tenant = cleanText(params.tenant_id, 100);
  const system = cleanText(params.system_id, 100);
  if (user.role === "super_admin") {
    if (tenant) query.tenant_id = tenant;
    if (system) {
      const access = await systemAccess(user, system, tenant || undefined);
      if (!access.allowed) throw Object.assign(new Error(access.message), { status: access.status });
      query.system_id = system;
      if (!query.tenant_id) query.tenant_id = access.system.tenant_id;
    }
  } else {
    if (tenant && tenant !== user.tenant_id) throw Object.assign(new Error("無權存取此租戶"), { status: 403 });
    query.tenant_id = user.tenant_id;
    if (system) {
      const access = await systemAccess(user, system, user.tenant_id);
      if (!access.allowed) throw Object.assign(new Error(access.message), { status: access.status });
      query.system_id = system;
    } else if (user.role === "user") {
      const ids = userSystemIds(user);
      query.system_id = ids.length ? { $in: ids } : "__NO_AUTHORIZED_SYSTEM__";
    }
  }
  const from = params.date_from ? new Date(params.date_from) : null;
  const to = params.date_to ? new Date(params.date_to) : null;
  if (params.date_from && Number.isNaN(from.valueOf())) throw Object.assign(new Error("date_from 格式不正確"), { status: 400 });
  if (params.date_to && Number.isNaN(to.valueOf())) throw Object.assign(new Error("date_to 格式不正確"), { status: 400 });
  if (from && to && from.getTime() > to.getTime()) throw Object.assign(new Error("date_from 不可晚於 date_to"), { status: 400 });
  if (from || to) {
    query.timestamp = {};
    if (from) query.timestamp.$gte = from;
    if (to) query.timestamp.$lte = to;
  }
  return query;
}

async function resolveSystemIdsForUserDocument(user) {
  const col = mongoose.connection.collection("systems");
  if (user.role === "super_admin") return (await col.find({}, { projection: { system_id: 1 } }).toArray()).map(v => v.system_id);
  if (user.role === "tenant_admin") return (await col.find({ tenant_id: user.tenant_id }, { projection: { system_id: 1 } }).toArray()).map(v => v.system_id);
  const assigned = Array.isArray(user.systems) ? user.systems : (user.system_id ? [user.system_id] : []);
  if (!assigned.length) return [];
  return (await col.find({ tenant_id: user.tenant_id, system_id: { $in: assigned } }, { projection: { system_id: 1 } }).toArray()).map(v => v.system_id);
}

async function issueLoginResponse(user, req, res) {
  const systems = await resolveSystemIdsForUserDocument(user);
  // Cookie 只放最小必要資料，避免機台很多時 JWT 超過瀏覽器 Cookie 大小上限。
  const token = jwt.sign(
    {
      email: user.email || user.username || "",
      session_type: "web",
      session_version: Number(user.session_version || 0)
    },
    JWT_SECRET,
    {
      subject: String(user._id),
      expiresIn: JWT_EXPIRES_IN,
      algorithm: "HS256",
      issuer: "defect-system"
    }
  );
  res.setHeader("Set-Cookie", buildSessionCookie(token, {
    cookieName: AUTH_COOKIE_NAME,
    secure: secureCookieForRequest(req),
    sameSite: AUTH_COOKIE_SAME_SITE,
    maxAgeSeconds: JWT_COOKIE_MAX_AGE_SECONDS
  }));
  res.setHeader("Cache-Control", "no-store");
  return {
    success: true,
    user: {
      id: String(user._id),
      email: user.email || user.username || "",
      name: user.name || "",
      company: user.company || "",
      tenant_id: user.tenant_id || "",
      role: user.role || "user"
    },
    systems
  };
}

async function writeAudit(req, action, fields = {}) {
  try {
    await AuditLog.create({
      request_id: req.requestId,
      actor_id: fields.actor_id || req.user?.id || "anonymous",
      actor_email: fields.actor_email || req.user?.email || "",
      role: fields.role || req.user?.role || "anonymous",
      tenant_id: fields.tenant_id || req.user?.tenant_id || "",
      system_id: fields.system_id || "",
      action,
      target: fields.target || "",
      status: fields.status || "success",
      command_id: fields.command_id || "",
      details: fields.details || {},
      ip: req.ip
    });
  } catch (error) {
    logger.warn("audit log failed", { request_id: req.requestId, action, error: error.message });
  }
}

function loginSecurityCollection() {
  return mongoose.connection.collection("login_security");
}

async function readLoginLock(email, req) {
  const key = loginSecurityKey(email, req.ip, JWT_SECRET);
  const record = await loginSecurityCollection().findOne({ key });
  return { key, record, ...getLockState(record) };
}

async function recordLoginFailure(email, req) {
  const key = loginSecurityKey(email, req.ip, JWT_SECRET);
  const col = loginSecurityCollection();
  const existing = await col.findOne({ key });
  const state = nextFailureState(existing, {
    maxFailures: LOGIN_MAX_FAILURES,
    windowMs: LOGIN_FAILURE_WINDOW_MINUTES * 60_000,
    lockMs: LOGIN_LOCK_MINUTES * 60_000
  });
  await col.updateOne({ key }, {
    $set: {
      key,
      email,
      ip: req.ip,
      failures: state.failures,
      firstFailedAt: state.firstFailedAt,
      lastFailedAt: state.lastFailedAt,
      lockUntil: state.lockUntil,
      expiresAt: state.expiresAt
    }
  }, { upsert: true });
  return state;
}

async function clearLoginFailures(email, req) {
  const key = loginSecurityKey(email, req.ip, JWT_SECRET);
  await loginSecurityCollection().deleteOne({ key });
}

app.post("/api/register/send-code", otpSendLimiter, asyncHandler(async (req, res) => {
  if (!ALLOW_PUBLIC_REGISTRATION) return res.status(403).json({ message: "目前已關閉公開註冊" });
  if (!mailEnabled || !isMailReady) return res.status(503).json({ message: "Email 驗證服務尚未真正連線" });
  const email = normalizeEmail(req.body.email);
  if (!isValidEmail(email)) return res.status(400).json({ message: "請輸入有效 Email" });
  const users = mongoose.connection.collection("users");
  if (await users.findOne({ $or: [{ username: email }, { email }] })) return res.status(409).json({ message: "帳號已存在" });
  const code = String(crypto.randomInt(100000, 1000000));
  const challengeId = crypto.randomUUID(), now = new Date();
  await mongoose.connection.collection("registration_otps").updateOne({ email }, { $set: { email, challengeId, codeHash: hashOtp(email, code, JWT_SECRET), attempts: 0, createdAt: now, expiresAt: new Date(now.getTime()+OTP_TTL_MINUTES*60000) } }, { upsert: true });
  await transporter.sendMail({ from: MAIL_FROM, to: email, subject: "瑕疵辨識與分流系統註冊驗證碼", text: `您的註冊驗證碼是：${code}\n\n${OTP_TTL_MINUTES} 分鐘內有效。` });
  return res.json({ success:true, challenge_id:challengeId, expires_in_seconds:OTP_TTL_MINUTES*60 });
}));

app.post("/api/register", registerLimiter, asyncHandler(async (req, res) => {
  if (!ALLOW_PUBLIC_REGISTRATION) return res.status(403).json({ message: "目前已關閉公開註冊，請聯絡管理員建立帳號" });
  const company=cleanText(req.body.company,120), name=cleanText(req.body.name,80), username=normalizeEmail(req.body.username), password=String(req.body.password||""), code=cleanText(req.body.code,12), challengeId=cleanText(req.body.challenge_id,100);
  if (!company || !name || !isValidEmail(username) || !password) return res.status(400).json({ message:"請完整輸入公司／單位、姓名、Email 與密碼" });
  const pw=validatePassword(password); if(!pw.valid) return res.status(400).json({message:pw.errors.join("；")});
  const otpCol=mongoose.connection.collection("registration_otps"), saved=await otpCol.findOne({email:username,challengeId});
  if(!saved || new Date(saved.expiresAt).getTime()<Date.now()) return res.status(400).json({message:"註冊驗證碼已失效，請重新寄送"});
  const expected=Buffer.from(String(saved.codeHash||""),"hex"), actual=Buffer.from(hashOtp(username,code,JWT_SECRET),"hex");
  if(!(expected.length===actual.length && crypto.timingSafeEqual(expected,actual))) return res.status(400).json({message:"註冊驗證碼錯誤"});
  const users=mongoose.connection.collection("users"); if(await users.findOne({$or:[{username},{email:username}]})) return res.status(409).json({message:"帳號已存在"});
  const tenant_id=`T${Date.now()}${crypto.randomInt(100,999)}`;
  const session=await mongoose.startSession(); try{await session.withTransaction(async()=>{await mongoose.connection.collection("tenants").insertOne({tenant_id,company,createdAt:new Date()},{session});await users.insertOne({username,email:username,name,company,password:await bcrypt.hash(password,12),tenant_id,role:"tenant_admin",systems:[],session_version:0,disabled:false,createdAt:new Date()},{session});});}finally{await session.endSession();}
  await otpCol.deleteOne({email:username,challengeId}); await writeAudit(req,"tenant.register",{tenant_id,target:username});
  return res.status(201).json({success:true,tenant_id});
}));

// Password recovery uses hashed single-use tokens stored in MongoDB. Never expose account existence.
const passwordResetLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 5, standardHeaders: "draft-8", legacyHeaders: false, message: { message: "操作太頻繁，請稍後再試" } });
const PASSWORD_RESET_TTL_MS = 20 * 60 * 1000;
function passwordResetDigest(token) { return crypto.createHash("sha256").update(String(token)).digest("hex"); }
function passwordResetUrl(token) {
  const configured = String(process.env.PUBLIC_BASE_URL || "").trim();
  const base = configured && /^https:\/\/[^\s/]+(?:\/[^\s]*)?$/.test(configured)
    ? configured.replace(/\/$/, "")
    : (NODE_ENV === "production" ? "https://defect-system-render.onrender.com" : `http://localhost:${PORT}`);
  return `${base}/reset-password.html?token=${encodeURIComponent(token)}`;
}
app.post("/api/password-reset/request", passwordResetLimiter, asyncHandler(async (req,res) => {
  res.setHeader("Cache-Control", "no-store");
  const response = { message: "如果信箱已有帳號且寄信服務可用，重設密碼連結將寄到信箱，請檢查收件匣及垃圾郵件。" };
  const email = normalizeEmail(req.body?.email);
  if (!isValidEmail(email)) return res.json(response);
  if (!mailEnabled || !isMailReady) return res.status(503).json({message:"目前無法寄送重設密碼郵件，請稍後再試或聯絡管理員"});
  const user = await mongoose.connection.collection("users").findOne({$or:[{email},{username:email}],disabled:{$ne:true}});
  if (user) {
    const token = crypto.randomBytes(32).toString("hex"), now = new Date();
    const col = mongoose.connection.collection("password_reset_tokens");
    await col.deleteMany({user_id:user._id});
    await col.insertOne({user_id:user._id,token_hash:passwordResetDigest(token),createdAt:now,expiresAt:new Date(now.getTime()+PASSWORD_RESET_TTL_MS),usedAt:null});
    try {
      await transporter.sendMail({from:MAIL_FROM,to:email,subject:"瑕疵辨識與分流系統－重設密碼",text:`您收到一筆重設密碼申請。請於 20 分鐘內使用下方連結設定新密碼：\n${passwordResetUrl(token)}\n\n如果不是您申請，請忽略此郵件。請勿將連結轉寄給其他人。`});
    } catch(e) {
      await col.deleteOne({token_hash:passwordResetDigest(token)});
      logger.error("Password reset email delivery failed",{error:e.message});
    }
  }
  return res.json(response);
}));
app.post("/api/password-reset/confirm", passwordResetLimiter, asyncHandler(async(req,res)=>{
  res.setHeader("Cache-Control", "no-store");
  const token=String(req.body?.token||"");
  const password=String(req.body?.password||"");
  if(!/^[a-f0-9]{64}$/.test(token)) return res.status(400).json({message:"連結無效或已失效，請重新申請"});
  const check=validatePassword(password);
  if(!check.valid) return res.status(400).json({message:check.errors.join("；")});
  const now=new Date();
  const col=mongoose.connection.collection("password_reset_tokens");
  const claimed=await col.findOneAndUpdate({token_hash:passwordResetDigest(token),usedAt:null,expiresAt:{$gt:now}},{$set:{usedAt:now}},{returnDocument:"before"});
  if(!claimed) return res.status(400).json({message:"連結無效或已失效，請重新申請"});
  const result=await mongoose.connection.collection("users").updateOne({_id:claimed.user_id,disabled:{$ne:true}},{$set:{password:await bcrypt.hash(password,12),passwordChangedAt:now},$unset:{passwordHash:"",password_hash:""},$inc:{session_version:1}});
  await col.deleteMany({user_id:claimed.user_id});
  if(!result.matchedCount) return res.status(400).json({message:"帳號已停用或不存在，請聯絡管理員"});
  await writeAudit(req,"security.password.reset",{actor_id:String(claimed.user_id)});
  return res.json({message:"密碼已更新，請使用新密碼重新登入"});
}));

app.get("/api/login/status", (req,res)=>res.json({ database_connected:mongoose.connection.readyState===1, registration_enabled:ALLOW_PUBLIC_REGISTRATION, registration_requires_invite:false, registration_email_ready:mailEnabled&&isMailReady, two_factor_required:false }));

app.post("/api/login", authLimiter, asyncHandler(async(req,res)=>{
  const email=normalizeEmail(req.body.email), password=String(req.body.password||"");
  if(!isValidEmail(email)||!password) return res.status(400).json({message:"請輸入信箱與密碼"});
  const lock=await readLoginLock(email,req); if(lock.locked){res.setHeader("Retry-After",String(lock.retryAfterSeconds));return res.status(429).json({message:`登入失敗次數過多，請等待 ${lock.retryAfterSeconds} 秒後再試`});}
  const user=await mongoose.connection.collection("users").findOne({$or:[{email},{username:email}]}); const hash=String(user?.password||user?.passwordHash||user?.password_hash||"");
  const matched=user&&user.disabled!==true&&/^\$2[aby]\$/.test(hash)?await bcrypt.compare(password,hash):false;
  if(!matched){const f=await recordLoginFailure(email,req);return res.status(f.shouldLock?429:401).json({message:f.shouldLock?`登入失敗次數過多，暫停登入 ${LOGIN_LOCK_MINUTES} 分鐘`:"信箱或密碼錯誤"});}
  await clearLoginFailures(email,req); await writeAudit(req,"security.login.success",{actor_id:String(user._id),actor_email:email,tenant_id:user.tenant_id||"",role:user.role||"user"}); return res.json(await issueLoginResponse(user,req,res));
}));

app.get("/api/session", auth, asyncHandler(async (req, res) => {
  const systems = await resolveSystemIdsForUserDocument(req.user);
  const tenant = req.user.tenant_id
    ? await mongoose.connection.collection("tenants").findOne({ tenant_id: req.user.tenant_id }, { projection: { company: 1 } })
    : null;
  res.setHeader("Cache-Control", "no-store");
  return res.json({
    authenticated: true,
    user: {
      id: req.user.id,
      email: req.user.email,
      name: req.user.name || "",
      company: req.user.company || tenant?.company || "",
      tenant_id: req.user.tenant_id || "",
      role: req.user.role || "user"
    },
    systems
  });
}));

app.post("/api/logout", asyncHandler(async (req, res) => {
  const token = getSessionToken(req, AUTH_COOKIE_NAME);
  const decoded = token ? jwt.decode(token) : null;
  if (decoded?.sub || decoded?.email) {
    await writeAudit(req, "security.logout", {
      actor_id: cleanText(decoded.sub, 100) || "anonymous",
      actor_email: normalizeEmail(decoded.email),
      status: "success"
    });
  }
  res.setHeader("Set-Cookie", buildClearCookie({
    cookieName: AUTH_COOKIE_NAME,
    secure: secureCookieForRequest(req),
    sameSite: AUTH_COOKIE_SAME_SITE
  }));
  res.setHeader("Cache-Control", "no-store");
  return res.json({ success: true });
}));

app.get("/api/admin/users", auth, requireRole("super_admin", "tenant_admin"), asyncHandler(async (req, res) => {
  const page = clampInt(req.query.page, 1, 1, 100000);
  const limit = clampInt(req.query.limit, 100, 1, 200);
  const query = req.user.role === "tenant_admin" ? { tenant_id: req.user.tenant_id } : {};
  const usersCollection = mongoose.connection.collection("users");
  const total = await usersCollection.countDocuments(query);
  const users = await usersCollection.find(query, {
    projection: { password: 0, passwordHash: 0, password_hash: 0, otp: 0, token: 0, secret: 0 }
  }).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).toArray();
  const tenantIds = [...new Set(users.map(user => user.tenant_id).filter(Boolean))];
  const tenants = tenantIds.length
    ? await mongoose.connection.collection("tenants").find({ tenant_id: { $in: tenantIds } }, { projection: { tenant_id: 1, company: 1 } }).toArray()
    : [];
  res.setHeader("X-Total-Count", String(total));
  res.setHeader("X-Page", String(page));
  return res.json(users.map(u => ({
    id: String(u._id),
    username: u.username || u.email,
    email: u.email || u.username || "",
    name: u.name || "",
    tenant_id: u.tenant_id,
    company: tenants.find(t => t.tenant_id === u.tenant_id)?.company || u.company || "未知",
    role: u.role,
    disabled: u.disabled === true || u.status === "disabled",
    systems: Array.isArray(u.systems) ? u.systems : []
  })));
}));

app.post("/api/admin/create-user", auth, requireRole("super_admin", "tenant_admin"), asyncHandler(async (req, res) => {
  const username = normalizeEmail(req.body.username);
  const password = String(req.body.password || "");
  const role = cleanText(req.body.role, 30);
  const requestedTenant = cleanText(req.body.tenant_id, 100);
  const requestedSystems = Array.isArray(req.body.systems) ? req.body.systems.map(v => cleanText(v, 100)).filter(Boolean) : [];
  if (!username || !password || !role) return res.status(400).json({ message: "資料不完整" });
  const pw = validatePassword(password);
  if (!pw.valid) return res.status(400).json({ message: pw.errors.join("；") });
  if (!new Set(["super_admin", "tenant_admin", "user"]).has(role)) return res.status(400).json({ message: "角色不正確" });
  if (req.user.role === "tenant_admin" && role !== "user") return res.status(403).json({ message: "租戶管理員只能建立一般使用者" });
  const users = mongoose.connection.collection("users");
  if (await users.findOne({ $or: [{ username }, { email: username }] })) return res.status(409).json({ message: "帳號已存在" });
  const tenant_id = req.user.role === "tenant_admin" ? req.user.tenant_id : requestedTenant;
  if (!tenant_id) return res.status(400).json({ message: "缺少 tenant_id" });
  const validSystems = role === "user" && requestedSystems.length ? (await mongoose.connection.collection("systems").find({ tenant_id, system_id: { $in: requestedSystems } }, { projection: { system_id: 1 } }).toArray()).map(v => v.system_id) : [];
  if (role === "user" && requestedSystems.length !== validSystems.length) return res.status(400).json({ message: "包含不存在或不屬於此租戶的機台" });
  await users.insertOne({
    username,
    email: username,
    password: await bcrypt.hash(password, 12),
    tenant_id,
    role,
    systems: validSystems,
    session_version: 0,
    disabled: false,
    createdAt: new Date()
  });
  await writeAudit(req, "user.create", { tenant_id, target: username, details: { role, systems: validSystems } });
  return res.status(201).json({ success: true, message: "帳號建立成功" });
}));

app.patch("/api/admin/users/:id", auth, requireRole("super_admin", "tenant_admin"), asyncHandler(async (req, res) => {
  const id = cleanText(req.params.id, 100);
  if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: "使用者 ID 格式不正確" });
  const users = mongoose.connection.collection("users");
  const target = await users.findOne({ _id: new mongoose.Types.ObjectId(id) });
  if (!target) return res.status(404).json({ message: "找不到使用者" });
  if (req.user.role === "tenant_admin" && target.tenant_id !== req.user.tenant_id) {
    return res.status(403).json({ message: "無權管理其他租戶使用者" });
  }
  if (req.user.role === "tenant_admin" && target.role !== "user") {
    return res.status(403).json({ message: "租戶管理員只能管理一般使用者" });
  }
  if (String(target._id) === req.user.id && req.body.disabled === true) {
    return res.status(400).json({ message: "不可停用目前登入帳號" });
  }

  const update = {};
  if (req.body.name !== undefined) {
    update.name = cleanText(req.body.name, 120);
  }
  if (typeof req.body.disabled === "boolean") update.disabled = req.body.disabled;
  if (req.body.role !== undefined) {
    const role = cleanText(req.body.role, 30);
    if (!new Set(["super_admin", "tenant_admin", "user"]).has(role)) return res.status(400).json({ message: "角色不正確" });
    if (req.user.role !== "super_admin") return res.status(403).json({ message: "只有超級管理員可以修改角色" });
    update.role = role;
  }
  if (req.body.systems !== undefined) {
    const systems = Array.isArray(req.body.systems)
      ? [...new Set(req.body.systems.map(value => cleanText(value, 100)).filter(Boolean))].slice(0, 200)
      : null;
    if (!systems) return res.status(400).json({ message: "systems 必須是陣列" });
    const valid = systems.length
      ? await mongoose.connection.collection("systems").find({ tenant_id: target.tenant_id, system_id: { $in: systems } }, { projection: { system_id: 1 } }).toArray()
      : [];
    if (valid.length !== systems.length) return res.status(400).json({ message: "包含不存在或不屬於此租戶的機台" });
    update.systems = systems;
  }
  if (!Object.keys(update).length) return res.status(400).json({ message: "沒有可更新的欄位" });
  if ((update.role || target.role) !== "user") update.systems = [];
  update.updatedAt = new Date();

  await users.updateOne({ _id: target._id }, { $set: update, $inc: { session_version: 1 } });
  await writeAudit(req, "user.update", {
    tenant_id: target.tenant_id,
    target: target.email || target.username || id,
    details: {
      changed_fields: Object.keys(update).filter(key => key !== "updatedAt"),
      disabled: update.disabled,
      role: update.role,
      systems: update.systems
    }
  });
  return res.json({ success: true, message: "使用者設定已更新；該帳號既有登入狀態已失效" });
}));

app.get("/api/admin/collections", auth, requireRole("super_admin"), (req, res) => res.json(["users", "tenants", "systems", "defects", "audit_logs"]));
app.get("/api/admin/collection/:name", auth, requireRole("super_admin"), asyncHandler(async (req, res) => {
  const name = cleanText(req.params.name, 40);
  if (!new Set(["users", "tenants", "systems", "defects", "audit_logs"]).has(name)) return res.status(403).json({ message: "不允許讀取此 collection" });
  const page = clampInt(req.query.page, 1, 1, 100000);
  const limit = clampInt(req.query.limit, 100, 1, 200);
  const projection = name === "users" ? { password: 0, passwordHash: 0, password_hash: 0, otp: 0, token: 0, secret: 0 } : name === "defects" ? { image_data: 0 } : {};
  const col = mongoose.connection.collection(name);
  res.setHeader("X-Total-Count", String(await col.countDocuments({})));
  return res.json(await col.find({}, { projection }).sort({ _id: -1 }).skip((page - 1) * limit).limit(limit).toArray());
}));
app.get("/api/admin/tenants", auth, requireRole("super_admin"), asyncHandler(async (req, res) => {
  const page = clampInt(req.query.page, 1, 1, 100000);
  const limit = clampInt(req.query.limit, 100, 1, 200);
  const col = mongoose.connection.collection("tenants");
  res.setHeader("X-Total-Count", String(await col.countDocuments({})));
  res.setHeader("X-Page", String(page));
  return res.json(await col.find({}).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).toArray());
}));

// 良率警報以機台為單位持久化；前端只呈現，正式告警由後端寫入 MongoDB。
const YIELD_SETTINGS_DEFAULTS = { yieldThreshold: 90, minSamples: 5, consecutiveNg: 3 };
function validateYieldSettings(body) {
  const a = Number(body?.yieldThreshold), b = Number(body?.minSamples), c = Number(body?.consecutiveNg);
  if (![a,b,c].every(Number.isFinite) || a < 0 || a > 100 ||
      !Number.isInteger(b) || b < 1 || b > 100000 ||
      !Number.isInteger(c) || c < 1 || c > 1000) return null;
  return { yieldThreshold:a, minSamples:b, consecutiveNg:c };
}
app.get("/api/yield-alert-settings", auth, asyncHandler(async(req,res) => {
  const access = await systemAccess(req.user, req.query.system_id, cleanText(req.query.tenant_id,100));
  if (!access.allowed) return res.status(access.status).json({message:access.message});
  const {tenant_id,system_id} = access.system;
  const saved = await mongoose.connection.collection("yield_alert_settings").findOne({tenant_id,system_id});
  res.json({settings:saved ? {yieldThreshold:saved.yieldThreshold,minSamples:saved.minSamples,consecutiveNg:saved.consecutiveNg} : YIELD_SETTINGS_DEFAULTS});
}));
app.put("/api/yield-alert-settings", auth, requireRole("super_admin","tenant_admin"), asyncHandler(async(req,res) => {
  const access = await systemAccess(req.user, req.body.system_id, cleanText(req.body.tenant_id,100));
  if (!access.allowed) return res.status(access.status).json({message:access.message});
  const values = validateYieldSettings(req.body);
  if (!values) return res.status(400).json({message:"良率須在 0–100%，最少筆數 1–100000，連續 NG 1–1000"});
  const {tenant_id,system_id} = access.system;
  await mongoose.connection.collection("yield_alert_settings").updateOne({tenant_id,system_id},{$set:{...values,updatedAt:new Date()}},{upsert:true});
  await writeAudit(req,"yield_alert.settings.updated",{tenant_id,system_id,details:values});
  res.json({success:true,settings:values});
}));
app.get("/api/yield-alert-events", auth, asyncHandler(async(req,res) => {
  const access = await systemAccess(req.user, req.query.system_id, cleanText(req.query.tenant_id,100));
  if (!access.allowed) return res.status(access.status).json({message:access.message});
  const {tenant_id,system_id} = access.system;
  const rows = await mongoose.connection.collection("alerts").find({tenant_id,system_id,type:{$in:["yield_low","yield_consecutive"]}}).sort({createdAt:-1}).limit(30).toArray();
  res.json({alerts:rows.map(row=>({id:String(row._id),message:row.message,time:row.createdAt,status:row.status}))});
}));

async function evaluateYieldAlerts(tenant_id,system_id) {
  const settings = await mongoose.connection.collection("yield_alert_settings").findOne({tenant_id,system_id});
  const cfg = settings || YIELD_SETTINGS_DEFAULTS;
  const docs = await Defect.find({tenant_id,system_id,data_mode:"PRODUCTION",status:{$in:["OK","NG"]}}).sort({timestamp:-1,_id:-1}).select({status:1}).lean();
  const total = docs.length;
  if (!total) return;
  const ng = docs.filter(x=>x.status==="NG").length;
  const ngRun = docs.findIndex(x=>x.status!=="NG");
  const consecutive = ngRun === -1 ? total : ngRun;
  const problems = [];
  if (total >= cfg.minSamples && (total-ng)*100/total < cfg.yieldThreshold)
    problems.push({type:"yield_low", message:`機台 ${system_id} 良率 ${((total-ng)*100/total).toFixed(1)}%，低於設定的 ${cfg.yieldThreshold}%。`});
  if (consecutive >= cfg.consecutiveNg)
    problems.push({type:"yield_consecutive",message:`機台 ${system_id} 連續 ${consecutive} 筆 NG，達到 ${cfg.consecutiveNg} 筆門檻。`});
  const states = mongoose.connection.collection("alert_states"), alerts = mongoose.connection.collection("alerts"), now = new Date();
  for (const p of problems) {
    const key = `${tenant_id}:${system_id}:${p.type}`;
    const state = await states.findOne({key});
    if (state?.cooldownUntil && new Date(state.cooldownUntil)>now) continue;
    // 以單一 key 原子更新避免並行事件重複建警報；失敗不得伪造成功狀態。
    const claim = await states.updateOne({key,$or:[{cooldownUntil:{$lte:now}},{cooldownUntil:{$exists:false}}]},{$set:{key,tenant_id,system_id,cooldownUntil:new Date(now.getTime()+ALERT_COOLDOWN_MINUTES*60000)}},{upsert:false});
    if (!claim.modifiedCount) {
      if (state) continue;
      try { await states.insertOne({key,tenant_id,system_id,cooldownUntil:new Date(now.getTime()+ALERT_COOLDOWN_MINUTES*60000)}); }
      catch(e) { if(e.code===11000) continue; throw e; }
    }
    await alerts.insertOne({tenant_id,system_id,type:p.type,severity:"medium",source:"server",message:p.message,status:"open",createdAt:now,updatedAt:now});
  }
}

app.get("/api/alerts", auth, asyncHandler(async (req, res) => {
  const page = clampInt(req.query.page, 1, 1, 100000);
  const limit = clampInt(req.query.limit, 100, 1, 500);

  const requestedTenant = cleanText(req.query.tenant_id, 100);
  const requestedSystem = cleanText(req.query.system_id, 100);
  const requestedStatus = cleanText(req.query.status, 30);

  const query = {};

  if (req.user.role === "super_admin") {
    if (requestedTenant) query.tenant_id = requestedTenant;
  } else {
    if (requestedTenant && requestedTenant !== req.user.tenant_id) {
      return res.status(403).json({ message: "無權存取其他租戶告警" });
    }

    query.tenant_id = req.user.tenant_id;
  }

  if (requestedSystem) {
    if (
      req.user.role === "user" &&
      !userSystemIds(req.user).includes(requestedSystem)
    ) {
      return res.status(403).json({ message: "無權存取此機台告警" });
    }

    query.system_id = requestedSystem;
  } else if (req.user.role === "user") {
    const ids = userSystemIds(req.user);

    query.system_id = ids.length
      ? { $in: ids }
      : "__NO_AUTHORIZED_SYSTEM__";
  }

  if (
    requestedStatus &&
    ["open", "acknowledged", "resolved"].includes(requestedStatus)
  ) {
    query.status = requestedStatus;
  }

  const alerts = mongoose.connection.collection("alerts");

  res.setHeader(
    "X-Total-Count",
    String(await alerts.countDocuments(query))
  );

  return res.json(
    await alerts
      .find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .toArray()
  );
}));

app.patch("/api/alerts/:id", auth, asyncHandler(async (req, res) => {
  const id = cleanText(req.params.id, 100);

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "無效的告警 ID" });
  }

  const status = cleanText(req.body.status, 30);

  if (!["acknowledged", "resolved"].includes(status)) {
    return res.status(400).json({ message: "無效的告警狀態" });
  }

  const alerts = mongoose.connection.collection("alerts");

  const alert = await alerts.findOne({
    _id: new mongoose.Types.ObjectId(id)
  });

  if (!alert) {
    return res.status(404).json({ message: "找不到告警" });
  }

  if (
    req.user.role !== "super_admin" &&
    alert.tenant_id !== req.user.tenant_id
  ) {
    return res.status(403).json({ message: "無權操作此告警" });
  }

  if (
    req.user.role === "user" &&
    !userSystemIds(req.user).includes(alert.system_id)
  ) {
    return res.status(403).json({ message: "無權操作此機台告警" });
  }

  const now = new Date();

  const update = {
    status,
    handledBy: req.user.email || req.user.username || req.user.id,
    updatedAt: now
  };

  if (status === "acknowledged") {
    update.acknowledgedAt = now;
  }

  if (status === "resolved") {
    update.resolvedAt = now;
  }

  await alerts.updateOne(
    { _id: alert._id },
    { $set: update }
  );

  await writeAudit(req, "alert.update", {
    tenant_id: alert.tenant_id,
    system_id: alert.system_id,
    target: id,
    details: { status }
  });

  return res.json({
    success: true,
    message: status === "resolved"
      ? "告警已標記為解決"
      : "告警已確認"
  });
}));
app.get("/api/admin/audit-logs", auth, requireRole("super_admin", "tenant_admin"), asyncHandler(async (req, res) => {
  const page = clampInt(req.query.page, 1, 1, 100000);
  const limit = clampInt(req.query.limit, 100, 1, 500);
  const requestedTenant = cleanText(req.query.tenant_id, 100);
  const requestedSystem = cleanText(req.query.system_id, 100);
  const query = {};

  if (req.user.role === "tenant_admin") {
    if (requestedTenant && requestedTenant !== req.user.tenant_id) return res.status(403).json({ message: "無權存取此租戶" });
    query.tenant_id = req.user.tenant_id;
  } else if (requestedTenant) {
    query.tenant_id = requestedTenant;
  }

  if (requestedSystem) {
    const access = await systemAccess(req.user, requestedSystem, query.tenant_id || undefined);
    if (!access.allowed) return res.status(access.status).json({ message: access.message });
    query.system_id = requestedSystem;
    if (!query.tenant_id) query.tenant_id = access.system.tenant_id;
  }

  res.setHeader("X-Total-Count", String(await AuditLog.countDocuments(query)));
  return res.json(await AuditLog.find(query)
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .lean());
}));

app.get("/api/site-config", auth, asyncHandler(async (req, res) => {
  const requested = cleanText(req.query.tenant_id, 100);
  const tenant_id = req.user.role === "super_admin" ? requested : req.user.tenant_id;
  if (!tenant_id) return res.status(400).json({ message: "缺少 tenant_id" });
  if (req.user.role !== "super_admin" && requested && requested !== req.user.tenant_id) return res.status(403).json({ message: "無權存取此租戶" });
  const tenant = await mongoose.connection.collection("tenants").findOne({ tenant_id }, { projection: { company: 1 } });
  if (!tenant) return res.status(404).json({ message: "找不到租戶" });
  return res.json({ success: true, data: { site_title: tenant.company || "瑕疵辨識與分流系統", site_subtitle: "即時檢測畫面 + 系統狀態與數據" } });
}));

// 每個租戶獨立的產品目錄。新增名稱不代表 YOLO 已學會辨識該產品。
const productCatalogSchema = new mongoose.Schema({
  tenant_id: { type: String, required: true, index: true },
  name: { type: String, required: true, trim: true },
  yolo_class: { type: String, default: "", trim: true },
  created_at: { type: Date, default: Date.now }
}, { versionKey: false });
productCatalogSchema.index({ tenant_id: 1, name: 1 }, { unique: true });
productCatalogSchema.index({ tenant_id: 1, yolo_class: 1 }, { unique: true, partialFilterExpression: { yolo_class: { $type: "string", $gt: "" } } });
const ProductCatalog = mongoose.model("ProductCatalog", productCatalogSchema);
function productTenant(req) {
  return req.user.role === "super_admin" ? cleanText(req.query.tenant_id || req.body?.tenant_id, 100) : req.user.tenant_id;
}
// Only authenticated administrators may change or inspect an individual machine's mode.
app.get("/api/admin/data-mode", auth, requireRole("super_admin"), asyncHandler(async(req,res) => {
  const access = await systemAccess(req.user, req.query.system_id, cleanText(req.query.tenant_id,100));
  if (!access.allowed) return res.status(access.status).json({message:access.message});
  const {tenant_id, system_id} = access.system;
  res.setHeader("Cache-Control", "no-store");
  return res.json({tenant_id, system_id, mode: await configuredMachineMode(tenant_id, system_id)});
}));
app.put("/api/admin/data-mode", auth, requireRole("super_admin"), asyncHandler(async(req,res) => {
  const access = await systemAccess(req.user, req.body.system_id, cleanText(req.body.tenant_id,100));
  if (!access.allowed) return res.status(access.status).json({message:access.message});
  const mode = cleanText(req.body.mode,20).toUpperCase();
  if (!DATA_MODES.has(mode)) return res.status(400).json({message:"模式只能為 TEST 或 PRODUCTION"});
  const {tenant_id, system_id} = access.system;
  await mongoose.connection.collection("machine_data_modes").updateOne({tenant_id,system_id},{$set:{mode,updated_at:new Date(),updated_by:req.user.id}},{upsert:true});
  await writeAudit(req,"machine.data_mode.updated",{tenant_id,system_id,details:{mode}});
  res.json({success:true,tenant_id,system_id,mode});
}));

app.get("/api/product-catalog", auth, asyncHandler(async (req,res) => {
  const tenant = productTenant(req);
  if (!tenant) return res.status(400).json({ message: "缺少客戶 ID" });
  res.json({ products: await ProductCatalog.find({ tenant_id: tenant }).sort({ name: 1 }).lean() });
}));
app.post("/api/product-catalog", auth, requireRole("super_admin","tenant_admin"), asyncHandler(async (req,res) => {
  const tenant = productTenant(req);
  const name = cleanText(req.body.name, 90);
  const yolo_class = cleanText(req.body.yolo_class || "", 90);
  if (!tenant || !name || name === "未分類") return res.status(400).json({ message: "請輸入正確客戶與產品名稱" });
  if (yolo_class && !/^[a-zA-Z0-9_\- ]{1,90}$/.test(yolo_class)) return res.status(400).json({ message: "YOLO 類別只能使用英數字、底線與連字號" });
  try {
    const item = await ProductCatalog.findOneAndUpdate({ tenant_id: tenant, name }, { $set: { yolo_class } }, { upsert: true, new: true, runValidators: true });
    res.json({ success: true, product: item });
  } catch (e) { if (e.code === 11000) return res.status(409).json({ message: "此 YOLO 類別已對應另一產品" }); throw e; }
}));
app.delete("/api/product-catalog", auth, requireRole("super_admin","tenant_admin"), asyncHandler(async (req,res) => {
  const tenant = productTenant(req);
  const name = cleanText(req.body.name, 90);
  if (!tenant || !name) return res.status(400).json({ message: "缺少產品資料" });
  await ProductCatalog.deleteOne({ tenant_id: tenant, name });
  res.json({ success: true });
}));

// 現場 USB Webcam / YOLOv8 辨識畫面：Python 主動推送 JPEG；不提供虛構影像。
// 影格暫存在此 Node.js 行程記憶體中，重啟或無新影格時即顯示離線。
const liveVisionFrames = new Map();
const LIVE_VISION_TTL_MS = 10000;
const LIVE_VISION_MAX_FRAMES = 80;
app.post("/api/device/vision-frame", express.raw({ type: "image/jpeg", limit: "512kb" }), deviceAuth, asyncHandler(async (req, res) => {
  const systemId = cleanText(req.headers["x-system-id"], 100);
  const cameraId = cleanText(req.headers["x-camera-id"], 40);
  if (!systemId || !cameraId || !/^[-_a-zA-Z0-9]{1,40}$/.test(cameraId)) return res.status(400).json({ message: "缺少或無效的機台／鏡頭識別" });
  const content = req.body;
  if (!Buffer.isBuffer(content) || content.length < 4 || content[0] !== 0xff || content[1] !== 0xd8 || content[content.length-2] !== 0xff || content[content.length-1] !== 0xd9) {
    return res.status(400).json({ message: "僅接受完整 JPEG 影格" });
  }
  const system = await mongoose.connection.collection("systems").findOne({ system_id: systemId }, { projection: { _id: 0, system_id: 1 } });
  if (!system) return res.status(404).json({ message: "無此機台，請先至網站建立機台" });
  liveVisionFrames.set(`${systemId}::${cameraId}`, { cameraId, content, at: Date.now() });
  // 避免多機台時無限累積記憶體
  for (const [key, value] of liveVisionFrames) if (Date.now() - value.at > LIVE_VISION_TTL_MS) liveVisionFrames.delete(key);
  if (liveVisionFrames.size > LIVE_VISION_MAX_FRAMES) liveVisionFrames.delete(liveVisionFrames.keys().next().value);
  res.json({ success: true, system_id: systemId, camera_id: cameraId });
}));
app.get("/api/vision-frame/status", auth, asyncHandler(async (req, res) => {
  const systemId = cleanText(req.query.system_id, 100);
  const access = await systemAccess(req.user, systemId);
  if (!access.allowed) return res.status(access.status).json({ message: access.message });
  const requestedCamera = cleanText(req.query.camera_id, 40);
  const candidates = [...liveVisionFrames.entries()].filter(([key]) => key.startsWith(`${systemId}::`)).map(([, value]) => value);
  const cameras = candidates.filter(v => Date.now() - v.at <= LIVE_VISION_TTL_MS).map(v => ({ camera_id: v.cameraId, age_ms: Date.now() - v.at }));
  const frame = requestedCamera ? liveVisionFrames.get(`${systemId}::${requestedCamera}`) : candidates.sort((a,b) => b.at - a.at)[0];
  const online = Boolean(frame && Date.now() - frame.at <= LIVE_VISION_TTL_MS);
  res.setHeader("Cache-Control", "no-store, private");
  res.json({ online, camera_id: online ? frame.cameraId : null, age_ms: online ? Date.now() - frame.at : null, cameras });
}));
app.get("/api/vision-frame/image", auth, asyncHandler(async (req, res) => {
  const systemId = cleanText(req.query.system_id, 100);
  const access = await systemAccess(req.user, systemId);
  if (!access.allowed) return res.status(access.status).json({ message: access.message });
  const requestedCamera = cleanText(req.query.camera_id, 40);
  const frame = requestedCamera ? liveVisionFrames.get(`${systemId}::${requestedCamera}`) : [...liveVisionFrames.entries()].filter(([key]) => key.startsWith(`${systemId}::`)).map(([, v]) => v).sort((a,b)=>b.at-a.at)[0];
  if (!frame || Date.now() - frame.at > LIVE_VISION_TTL_MS) return res.status(404).json({ message: "現場尚未上傳即時辨識影格" });
  res.setHeader("Cache-Control", "no-store, private");
  res.type("image/jpeg").send(frame.content);
}));

// 機台專屬的品質與視覺效能門檻（保存於 MongoDB systems）。
const DEFAULT_MACHINE_THRESHOLDS = Object.freeze({ ngThreshold: 3, fpsMin: 12 });
function machineThresholds(system) {
  const cfg = system?.monitor_settings || {};
  return {
    ngThreshold: clampInt(cfg.ngThreshold, DEFAULT_MACHINE_THRESHOLDS.ngThreshold, 1, 20),
    fpsMin: clampInt(cfg.fpsMin, DEFAULT_MACHINE_THRESHOLDS.fpsMin, 5, 60)
  };
}
app.get("/api/machine-settings", auth, asyncHandler(async (req,res) => {
  const access = await systemAccess(req.user, req.query.system_id, cleanText(req.query.tenant_id,100));
  if (!access.allowed) return res.status(access.status).json({ message: access.message });
  const sys = await mongoose.connection.collection("systems").findOne({ system_id: access.system.system_id, tenant_id: access.system.tenant_id });
  const cfg = machineThresholds(sys);
  const hb = sys?.components?.vision;
  const age = hb?.received_at ? Date.now() - new Date(hb.received_at).getTime() : Infinity;
  const online = hb?.connected === true && age >= 0 && age <= 30000;
  const fps = online && typeof hb.fps === "number" && Number.isFinite(hb.fps) ? hb.fps : null;
  res.setHeader("Cache-Control","no-store");
  return res.json({ system_id: sys.system_id, ...cfg, fps, fps_state: fps === null ? "no_data" : fps < cfg.fpsMin ? "low" : "normal", fps_received_at: online ? hb.received_at : null });
}));
app.put("/api/machine-settings", auth, requireRole("super_admin", "tenant_admin"), asyncHandler(async (req,res) => {
  const access = await systemAccess(req.user, req.body.system_id, cleanText(req.body.tenant_id,100));
  if (!access.allowed) return res.status(access.status).json({ message: access.message });
  const ngThreshold = Number(req.body.ngThreshold);
  const fpsMin = Number(req.body.fpsMin);
  if (!Number.isInteger(ngThreshold) || ngThreshold < 1 || ngThreshold > 20 || !Number.isInteger(fpsMin) || fpsMin < 5 || fpsMin > 60) {
    return res.status(400).json({ message: "NG 門檻須為 1～20 整數；FPS 下限須為 5～60 整數" });
  }
  await mongoose.connection.collection("systems").updateOne(
    { tenant_id: access.system.tenant_id, system_id: access.system.system_id },
    { $set: { monitor_settings: { ngThreshold, fpsMin, updatedAt: new Date() } } }
  );
  return res.json({ success: true, system_id: access.system.system_id, ngThreshold, fpsMin });
}));
// 現場辨識程式回報實測 FPS。必須提供正確的 x-device-key，不接受網站手動假回報。
app.post("/api/device/vision-fps", deviceAuth, asyncHandler(async (req,res) => {
  const system_id = cleanText(req.body.system_id,100);
  const fps = req.body.fps;
  if (!system_id || typeof fps !== "number" || !Number.isFinite(fps) || fps < 0 || fps > 240) {
    return res.status(400).json({ message: "請提供 system_id 與有效的數字 fps（0～240）" });
  }
  const col = mongoose.connection.collection("systems");
  const sys = await col.findOne({ system_id });
  if (!sys) return res.status(404).json({message:"找不到機台"});
  const now = new Date();
  await col.updateOne({ _id: sys._id }, { $set: {
    "components.vision.connected": true,
    "components.vision.status": "running",
    "components.vision.fps": fps,
    "components.vision.received_at": now,
    "components.vision.last_heartbeat_at": now
  }});
  const cfg = machineThresholds(sys);
  const key = `${sys.tenant_id}:${system_id}:fps-low`;
  const states = mongoose.connection.collection("alert_states");
  if (fps >= cfg.fpsMin) {
    await states.updateOne({key}, {$set:{active:false, recoveredAt:now}}, {upsert:true});
  } else {
    const old = await states.findOne({key});
    if (!old?.active) {
      const message = `機台 ${system_id} 實際辨識 FPS ${fps}，低於下限 ${cfg.fpsMin}。`;
      await mongoose.connection.collection("alerts").insertOne({ tenant_id:sys.tenant_id, system_id, type:"fps_low", severity:"medium", message, status:"open", source:"vision_fps", fps, threshold:cfg.fpsMin, createdAt:now, updatedAt:now });
    }
    await states.updateOne({key}, {$set:{active:true,lastFps:fps,lastEvaluatedAt:now}}, {upsert:true});
  }
  return res.json({success:true, system_id, fps, threshold:cfg.fpsMin, state:fps < cfg.fpsMin ? "low" : "normal"});
}));

app.get("/api/systems", auth, asyncHandler(async (req, res) => {
  const requested = cleanText(req.query.tenant_id, 100);
  const page = clampInt(req.query.page, 1, 1, 100000);
  const limit = clampInt(req.query.limit, 500, 1, 1000);
  const query = {};
  if (req.user.role === "super_admin") { if (requested) query.tenant_id = requested; }
  else {
    if (requested && requested !== req.user.tenant_id) return res.status(403).json({ message: "無權存取此租戶" });
    query.tenant_id = req.user.tenant_id;
    if (req.user.role === "user") { const ids = userSystemIds(req.user); query.system_id = ids.length ? { $in: ids } : "__NO_AUTHORIZED_SYSTEM__"; }
  }
  const col = mongoose.connection.collection("systems");
  res.setHeader("X-Total-Count", String(await col.countDocuments(query)));
  res.setHeader("X-Page", String(page));
  return res.json(await col.find(query, { projection: { secret: 0, token: 0 } }).sort({ name: 1 }).skip((page - 1) * limit).limit(limit).toArray());
}));

let isMqttConnected = false;
let latestMqttMessage = null;
let mqttClient = null;
const processStartedAt = new Date();

// Dashboard 即時事件串流（SSE）。
// MQTT 寫入完成後直接推送給已登入且有權限查看該機台的瀏覽器，
// 不再依賴使用者重新整理頁面。
const realtimeClients = new Set();

function canRealtimeClientAccess(client, tenantId, systemId) {
  if (!client?.user) return false;
  if (client.user.role === "super_admin") return !client.systemId || client.systemId === systemId;
  if (client.user.tenant_id !== tenantId) return false;
  if (client.user.role === "tenant_admin") return !client.systemId || client.systemId === systemId;
  const allowed = userSystemIds(client.user);
  if (!allowed.includes(systemId)) return false;
  return !client.systemId || client.systemId === systemId;
}

function pushRealtimeEvent(eventName, payload, tenantId, systemId) {
  const body = `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const client of [...realtimeClients]) {
    if (!canRealtimeClientAccess(client, tenantId, systemId)) continue;
    try {
      client.res.write(body);
      client.res.flush?.();
    } catch {
      realtimeClients.delete(client);
    }
  }
}

function healthSnapshot() {
  const databaseConnected = mongoose.connection.readyState === 1;
  const mqttConfigured = Boolean(process.env.MQTT_URL && process.env.HIVEMQ_USER && process.env.HIVEMQ_PASS);
  const mailRequired = ALLOW_PUBLIC_REGISTRATION || REQUIRE_EMAIL_LOGIN;
  const mailReady = !mailRequired || (mailEnabled && isMailReady);
  const mqttReady = !mqttRequired || (mqttConfigured && isMqttConnected);
  return {
    status: databaseConnected && mailReady && mqttReady ? "ok" : "degraded",
    version: packageInfo.version,
    uptime_seconds: Math.floor(process.uptime()),
    started_at: processStartedAt.toISOString(),
    checked_at: new Date().toISOString(),
    database_connected: databaseConnected,
    mail_required: mailRequired,
    mail_configured: mailEnabled,
    mail_ready: isMailReady,
    last_mail_check_at: lastMailCheckAt,
    mqtt_required: mqttRequired,
    mqtt_configured: mqttConfigured,
    mqtt_connected: isMqttConnected,
    gemini_configured: Boolean(process.env.GEMINI_API_KEY)
  };
}
app.post("/api/systems", auth, requireRole("super_admin", "tenant_admin"), asyncHandler(async (req,res)=>{
  const tenant_id=req.user.role==="super_admin"?cleanText(req.body.tenant_id,100):req.user.tenant_id;
  const system_id=cleanText(req.body.system_id,100), name=cleanText(req.body.name,120);
  if(!tenant_id||!system_id||!name) return res.status(400).json({message:"請輸入機台 ID 與名稱"});
  if(!/^[A-Za-z0-9_-]{2,100}$/.test(system_id)) return res.status(400).json({message:"機台 ID 只能使用英文、數字、_、-"});
  try{await mongoose.connection.collection("systems").insertOne({tenant_id,system_id,name,current_product:"",createdAt:new Date()});}
  catch(e){if(e?.code===11000)return res.status(409).json({message:"此機台 ID 已存在"});throw e;}
  await writeAudit(req,"system.create",{tenant_id,system_id,target:name}); return res.status(201).json({success:true,system_id,name});
}));

app.patch("/api/systems/:systemId/name", auth, requireRole("super_admin", "tenant_admin"), asyncHandler(async (req,res)=>{
  const system_id=cleanText(req.params.systemId,100);
  const name=cleanText(req.body.name,120);
  const requestedTenant=cleanText(req.body.tenant_id,100);
  const tenant_id=req.user.role==="super_admin"?requestedTenant:req.user.tenant_id;
  if(!system_id||!name) return res.status(400).json({message:"請輸入機台名稱"});
  if(!tenant_id) return res.status(400).json({message:"缺少 tenant_id"});
  const col=mongoose.connection.collection("systems");
  const result=await col.updateOne({tenant_id,system_id},{$set:{name,updatedAt:new Date()}});
  if(!result.matchedCount) return res.status(404).json({message:"找不到機台"});
  await writeAudit(req,"system.rename",{tenant_id,system_id,target:name});
  return res.json({success:true,system_id,name});
}));

// 管理員展示圖片開關：僅平台總管理員可修改；預設關閉，以免誤建測試事件。
const demoImageSettings = () => mongoose.connection.collection("demo_image_settings");
async function demoImageEnabled() {
  const row = await demoImageSettings().findOne({ _id: "global" });
  return row?.enabled === true;
}
app.get("/api/admin/demo-image-settings", auth, requireRole("super_admin"), asyncHandler(async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  return res.json({ enabled: await demoImageEnabled() });
}));
app.put("/api/admin/demo-image-settings", auth, requireRole("super_admin"), asyncHandler(async (req, res) => {
  if (typeof req.body?.enabled !== "boolean") return res.status(400).json({ message: "enabled 必須為布林值" });
  await demoImageSettings().updateOne({ _id: "global" }, { $set: { enabled: req.body.enabled, updated_at: new Date(), updated_by: req.user.id } }, { upsert: true });
  await writeAudit(req, "demo.image.settings.updated", { details: { enabled: req.body.enabled } });
  return res.json({ enabled: req.body.enabled });
}));

// 模擬 NG：資料庫事件固定 TEST，不會影響正式模式統計與正式品質告警。
app.post(
  "/api/admin/demo-ng-image",
  auth,
  requireRole("super_admin"),
  express.raw({ type: ["image/jpeg", "image/png", "image/webp"], limit: `${NG_IMAGE_MAX_BYTES}b` }),
  asyncHandler(async (req, res) => {
    if (!(await demoImageEnabled())) return res.status(403).json({ message: "模擬圖片上傳已關閉，請先至圖片追溯管理區啟用" });
    const system_id = cleanText(req.query.system_id, 100);
    const tenant_id = cleanText(req.query.tenant_id, 100);
    const product = cleanText(req.query.product, 100);
    const contentType = String(req.headers["content-type"] || "").toLowerCase();
    if (!system_id || !tenant_id || !product) return res.status(400).json({ message: "請選擇機台並填寫產品名稱" });
    if (!["image/jpeg", "image/png", "image/webp"].includes(contentType)) return res.status(415).json({ message: "僅支援 JPG、PNG、WebP" });
    if (!Buffer.isBuffer(req.body) || !req.body.length || req.body.length > NG_IMAGE_MAX_BYTES) return res.status(400).json({ message: "圖片不可為空或超過限制" });
    const system = await mongoose.connection.collection("systems").findOne({ tenant_id, system_id });
    if (!system) return res.status(404).json({ message: "找不到對應客戶的機台" });
    const case_id = `DEMO-NG-${require("node:crypto").randomUUID()}`;
    const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: "ng_images" });
    const ext = contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
    const upload = bucket.openUploadStream(`${system_id}-${case_id}.${ext}`, {
      contentType,
      metadata: { tenant_id, system_id, case_id, product, data_mode: "TEST", demo: true, uploaded_at: new Date() }
    });
    await new Promise((resolve, reject) => { upload.once("error", reject); upload.once("finish", resolve); upload.end(req.body); });
    const image_url = `/api/images/${upload.id.toString()}`;
    try {
      await Defect.create({ tenant_id, user_id: req.user.id, system_id, id: case_id, event_id: case_id,
        status: "NG", product, source: "ADMIN_DEMO_IMAGE", data_mode: "TEST", image_url, timestamp: new Date() });
    } catch (error) {
      await bucket.delete(upload.id).catch(() => {});
      throw error;
    }
    await writeAudit(req, "demo.image.uploaded", { tenant_id, system_id, target: case_id, details: { product, data_mode: "TEST" } });
    return res.status(201).json({ success: true, case_id, image_url, data_mode: "TEST" });
  })
);

// ===== 現場裝置整合：NG 圖片與實體手臂 heartbeat =====
app.post(
  "/api/device/ng-image",
  deviceAuth,
  express.raw({ type: ["image/jpeg", "image/png", "image/webp"], limit: `${NG_IMAGE_MAX_BYTES}b` }),
  asyncHandler(async (req, res) => {
    const system_id = cleanText(req.query.system_id, 100);
    const case_id = cleanText(req.query.case_id || req.query.id, 100);
    const product = cleanText(req.query.product, 100) || "未分類";
    const contentType = cleanText(req.headers["content-type"], 100).toLowerCase();

    if (!system_id || !case_id) {
      return res.status(400).json({ message: "缺少 system_id 或 case_id" });
    }
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      return res.status(400).json({ message: "請以 JPEG、PNG 或 WebP 原始圖片內容上傳" });
    }
    if (!["image/jpeg", "image/png", "image/webp"].includes(contentType)) {
      return res.status(415).json({ message: "圖片格式僅支援 JPEG、PNG、WebP" });
    }

    const system = await mongoose.connection.collection("systems").findOne(
      { system_id },
      { projection: { tenant_id: 1, system_id: 1 } }
    );
    if (!system) return res.status(404).json({ message: "找不到機台" });

    const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
      bucketName: "ng_images"
    });
    const ext = contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
    const filename = `${system_id}-${case_id}.${ext}`;
    const upload = bucket.openUploadStream(filename, {
      contentType,
      metadata: {
        tenant_id: system.tenant_id,
        system_id,
        case_id,
        product,
        uploaded_at: new Date()
      }
    });

    await new Promise((resolve, reject) => {
      upload.once("error", reject);
      upload.once("finish", resolve);
      upload.end(req.body);
    });

    const image_url = `/api/images/${upload.id.toString()}`;

    // 若事件已先透過 MQTT 建立，圖片上傳後直接補回同一筆事件。
    await Defect.updateOne(
      { tenant_id: system.tenant_id, system_id, id: case_id },
      { $set: { image_url } }
    );

    return res.status(201).json({
      success: true,
      image_id: upload.id.toString(),
      image_url,
      system_id,
      case_id
    });
  })
);

app.get("/api/images/:id", auth, asyncHandler(async (req, res) => {
  const imageId = cleanText(req.params.id, 100);
  if (!mongoose.Types.ObjectId.isValid(imageId)) {
    return res.status(400).json({ message: "無效的圖片 ID" });
  }

  const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
    bucketName: "ng_images"
  });
  const _id = new mongoose.Types.ObjectId(imageId);
  const files = await bucket.find({ _id }).limit(1).toArray();
  const file = files[0];
  if (!file) return res.status(404).json({ message: "找不到圖片" });

  const meta = file.metadata || {};
  if (req.user.role !== "super_admin") {
    if (meta.tenant_id !== req.user.tenant_id) {
      return res.status(403).json({ message: "無權查看此圖片" });
    }
    if (req.user.role === "user" && !userSystemIds(req.user).includes(meta.system_id)) {
      return res.status(403).json({ message: "無權查看此機台圖片" });
    }
  }

  // A direct image URL must not bypass test-data permissions.
  if (!isDataAdmin(req.user)) {
    const visible = await Defect.exists({
      tenant_id: meta.tenant_id,
      system_id: meta.system_id,
      image_url: `/api/images/${imageId}`,
      data_mode: "PRODUCTION"
    });
    if (!visible) return res.status(404).json({ message: "找不到正式資料圖片" });
  }

  res.setHeader("Content-Type", file.contentType || "image/jpeg");
  res.setHeader("Cache-Control", "private, max-age=300");
  const stream = bucket.openDownloadStream(_id);
  stream.on("error", error => {
    if (!res.headersSent) res.status(404).json({ message: "圖片讀取失敗" });
    else res.destroy(error);
  });
  return stream.pipe(res);
}));

app.post("/api/device/robot-heartbeat", deviceAuth, asyncHandler(async (req, res) => {
  const system_id = cleanText(req.body.system_id, 100);
  if (!system_id) return res.status(400).json({ message: "缺少 system_id" });

  const robot_connected = req.body.robot_connected === true;
  const robot_status = cleanText(
    req.body.robot_status || (robot_connected ? "connected" : "disconnected"),
    60
  );
  const robot_port = cleanText(req.body.robot_port, 80);
  const controller = cleanText(req.body.controller || "python", 80);
  const reportedAt = req.body.timestamp ? new Date(req.body.timestamp) : new Date();
  if (Number.isNaN(reportedAt.getTime())) {
    return res.status(400).json({ message: "timestamp 格式不正確" });
  }

  const col = mongoose.connection.collection("systems");
  const result = await col.updateOne(
    { system_id },
    {
      $set: {
        robot_connected,
        robot_status,
        robot_port,
        robot_controller: controller,
        last_robot_heartbeat_at: reportedAt,
        robot_heartbeat_received_at: new Date()
      }
    }
  );
  if (!result.matchedCount) return res.status(404).json({ message: "找不到機台" });

  return res.json({
    success: true,
    system_id,
    robot_connected,
    robot_status,
    heartbeat_timeout_seconds: ROBOT_HEARTBEAT_TIMEOUT_SECONDS,
    received_at: new Date().toISOString()
  });
}));

app.post("/api/device/component-heartbeat", deviceAuth, asyncHandler(async (req, res) => {
  const system_id = cleanText(req.body.system_id, 100);
  const component = cleanText(req.body.component, 40).toLowerCase();
  const allowed = new Set(["vision", "left_robot", "right_robot", "conveyor_controller"]);
  if (!system_id || !allowed.has(component)) return res.status(400).json({ message: "component 必須是 vision、left_robot、right_robot 或 conveyor_controller" });
  const connected = req.body.connected === true;
  const status = cleanText(req.body.status || (connected ? "connected" : "disconnected"), 60);
  const reportedAt = req.body.timestamp ? new Date(req.body.timestamp) : new Date();
  if (Number.isNaN(reportedAt.getTime())) return res.status(400).json({ message: "timestamp 格式不正確" });
  const setDoc = {};
  setDoc[`components.${component}.connected`] = connected;
  setDoc[`components.${component}.status`] = status;
  setDoc[`components.${component}.last_heartbeat_at`] = reportedAt;
  setDoc[`components.${component}.received_at`] = new Date();
  const result = await mongoose.connection.collection("systems").updateOne({ system_id }, { $set: setDoc });
  if (!result.matchedCount) return res.status(404).json({ message: "找不到機台" });
  return res.json({ success: true, system_id, component, connected, status, received_at: new Date().toISOString() });
}));

app.get("/api/machine-status", auth, asyncHandler(async (req, res) => {
  const requestedTenant = cleanText(req.query.tenant_id, 100);

  const systemQuery = {};

  if (req.user.role === "super_admin") {
    if (requestedTenant) {
      systemQuery.tenant_id = requestedTenant;
    }
  } else {
    if (
      requestedTenant &&
      requestedTenant !== req.user.tenant_id
    ) {
      return res.status(403).json({
        message: "無權存取其他租戶"
      });
    }

    systemQuery.tenant_id = req.user.tenant_id;

    if (req.user.role === "user") {
      const ids = userSystemIds(req.user);

      systemQuery.system_id = ids.length
        ? { $in: ids }
        : "__NO_AUTHORIZED_SYSTEM__";
    }
  }

  const systems = await mongoose.connection
    .collection("systems")
    .find(systemQuery, {
      projection: {
        secret: 0,
        token: 0
      }
    })
    .sort({ name: 1 })
    .toArray();

  const now = Date.now();
  const onlineWindowMs = 2 * 60 * 1000;

  const result = await Promise.all(
    systems.map(async system => {
      const defectQuery = {
        tenant_id: system.tenant_id,
        system_id: system.system_id,
        data_mode: "PRODUCTION"
      };

      const [summary] = await Defect.aggregate([
        {
          $match: defectQuery
        },
        {
          $group: {
            _id: null,
            total: {
              $sum: 1
            },
            ok: {
              $sum: {
                $cond: [
                  { $eq: ["$status", "OK"] },
                  1,
                  0
                ]
              }
            },
            ng: {
              $sum: {
                $cond: [
                  { $eq: ["$status", "NG"] },
                  1,
                  0
                ]
              }
            }
          }
        }
      ]);

      const total = Number(summary?.total || 0);
      const ok = Number(summary?.ok || 0);
      const ng = Number(summary?.ng || 0);

      const lastReportAt = system.last_report_at
        ? new Date(system.last_report_at)
        : null;

      const online =
        lastReportAt &&
        !Number.isNaN(lastReportAt.getTime()) &&
        now - lastReportAt.getTime() <= onlineWindowMs;

      const lastRobotHeartbeatAt = system.last_robot_heartbeat_at
        ? new Date(system.last_robot_heartbeat_at)
        : null;
      const robotHeartbeatFresh =
        lastRobotHeartbeatAt &&
        !Number.isNaN(lastRobotHeartbeatAt.getTime()) &&
        now - lastRobotHeartbeatAt.getTime() <= ROBOT_HEARTBEAT_TIMEOUT_SECONDS * 1000;
      const robotOnline = Boolean(system.robot_connected === true && robotHeartbeatFresh);

      const latestEstop = await AuditLog.findOne({
        tenant_id: system.tenant_id,
        system_id: system.system_id,
        action: "machine.estop"
      })
        .sort({ createdAt: -1 })
        .lean();

      const componentTimeoutMs = ROBOT_HEARTBEAT_TIMEOUT_SECONDS * 1000;
      const componentStatus = {};
      for (const key of ["vision", "left_robot", "right_robot", "conveyor_controller"]) {
        const component = system.components?.[key] || {};
        const at = component.last_heartbeat_at ? new Date(component.last_heartbeat_at) : null;
        const fresh = at && !Number.isNaN(at.getTime()) && now - at.getTime() <= componentTimeoutMs;
        componentStatus[key] = {
          connected: Boolean(component.connected === true && fresh),
          reported_connected: component.connected === true,
          status: component.status || "never_reported",
          last_heartbeat_at: component.last_heartbeat_at || null
        };
      }

      return {
        components: componentStatus,
        tenant_id: system.tenant_id,
        system_id: system.system_id,
        name: system.name || "未命名機台",
        current_product:
          system.current_product || "未設定",
        online: Boolean(online),
        last_report_at:
          system.last_report_at || null,
        robot_online: robotOnline,
        robot_connected_reported: system.robot_connected === true,
        robot_status: system.robot_status || "never_reported",
        robot_port: system.robot_port || "",
        robot_controller: system.robot_controller || "",
        last_robot_heartbeat_at: system.last_robot_heartbeat_at || null,
        robot_heartbeat_timeout_seconds: ROBOT_HEARTBEAT_TIMEOUT_SECONDS,
        total,
        ok,
        ng,
        yield_rate:
          total > 0
            ? Number(
                ((ok / total) * 100).toFixed(1)
              )
            : 0,
        estop_status:
          latestEstop?.status || "none",
        estop_command_id:
          latestEstop?.command_id || null,
        estop_requested_at:
          latestEstop?.createdAt || null
      };
    })
  );

  return res.json({
    online_window_seconds: 120,
    robot_heartbeat_timeout_seconds: ROBOT_HEARTBEAT_TIMEOUT_SECONDS,
    machines: result
  });
}));
app.get("/api/health", (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  return res.json(healthSnapshot());
});
app.get("/health/live", (req, res) => res.json({ status: "ok", version: packageInfo.version, uptime_seconds: Math.floor(process.uptime()) }));
app.get("/health/ready", (req, res) => {
  const snapshot = healthSnapshot();
  return res.status(snapshot.status === "ok" ? 200 : 503).json(snapshot);
});
app.get("/health", (req, res) => {
  const databaseConnected = mongoose.connection.readyState === 1;
  return res.status(databaseConnected ? 200 : 503).json({
    status: databaseConnected ? "ok" : "degraded",
    version: packageInfo.version,
    database_connected: databaseConnected
  });
});
app.get("/api/realtime", auth, (req, res) => {
  const requestedSystemId = cleanText(req.query.system_id, 100);

  if (requestedSystemId && req.user.role !== "super_admin" && req.user.role !== "tenant_admin") {
    if (!userSystemIds(req.user).includes(requestedSystemId)) {
      return res.status(403).json({ message: "無權存取此機台" });
    }
  }

  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  const client = {
    res,
    user: { ...req.user, systems: [...(req.user.systems || [])] },
    systemId: requestedSystemId || ""
  };
  realtimeClients.add(client);

  res.write(`event: ready\ndata: ${JSON.stringify({ connected: true, system_id: requestedSystemId || null, at: new Date().toISOString() })}\n\n`);
  res.flush?.();

  const heartbeat = setInterval(() => {
    try {
      res.write(`: keepalive ${Date.now()}\n\n`);
      res.flush?.();
    } catch {
      clearInterval(heartbeat);
      realtimeClients.delete(client);
    }
  }, 25000);
  heartbeat.unref?.();

  req.on("close", () => {
    clearInterval(heartbeat);
    realtimeClients.delete(client);
  });
});

// Lightweight dashboard lane snapshot. Used as a 1-second safety-net poll in addition
// to SSE so the four lane cards keep updating even if a proxy/browser delays an SSE frame.
app.get("/api/lane-status", auth, asyncHandler(async (req, res) => {
  const query = await buildScopedDefectQuery(req.user, req.query);
  query.status = { $in: ["OK", "NG"] };
  query.lane = { $in: ["1", "2", "3", "4"] };

  const rows = await Defect.find(query)
    .sort({ timestamp: -1 })
    .limit(100)
    .select("id event_id track_id tenant_id system_id product status source robot_result lane image_url timestamp")
    .lean();

  const latestByLane = new Map();
  for (const row of rows) {
    const lane = String(row.lane || "").trim();
    if (!latestByLane.has(lane)) latestByLane.set(lane, row);
    if (latestByLane.size >= 4) break;
  }

  res.setHeader("Cache-Control", "no-store, max-age=0");
  return res.json({
    updated_at: new Date().toISOString(),
    lanes: [1, 2, 3, 4].map(lane => latestByLane.get(String(lane)) || null)
  });
}));

app.get("/api/mqtt/latest", auth, (req, res) => {
  if (!latestMqttMessage) return res.json({ data: null });
  if (latestMqttMessage.data_mode !== "PRODUCTION") return res.json({ data: null });
  if (req.user.role === "super_admin") return res.json({ data: latestMqttMessage });
  if (latestMqttMessage.tenant_id !== req.user.tenant_id) return res.json({ data: null });
  if (req.user.role === "tenant_admin") return res.json({ data: latestMqttMessage });
  return res.json({ data: userSystemIds(req.user).includes(latestMqttMessage.payload.system_id) ? latestMqttMessage : null });
});

app.get("/api/defects", auth, asyncHandler(async (req, res) => {
  const query = await buildScopedDefectQuery(req.user, req.query);
  const page = clampInt(req.query.page, 1, 1, 100000);
  const limit = clampInt(req.query.limit, 500, 1, 1000);
  res.setHeader("X-Total-Count", String(await Defect.countDocuments(query)));
  res.setHeader("X-Page", String(page));
  return res.json(await Defect.find(query).sort({ timestamp: -1 }).skip((page - 1) * limit).limit(limit).lean());
}));

app.get("/api/defects/export.csv", auth, asyncHandler(async (req, res) => {
  const query = await buildScopedDefectQuery(req.user, req.query);
  const limit = clampInt(req.query.limit, 5000, 1, 10000);
  const rows = await Defect.find(query)
    .sort({ timestamp: -1 })
    .limit(limit)
    .select("tenant_id system_id id event_id track_id status product source data_mode robot_result lane image_url timestamp")
    .lean();
  const header = ["tenant_id", "system_id", "event_id", "track_id", "status", "product", "source", "data_mode", "robot_result", "lane", "image_url", "timestamp"];
  const csv = [
    header.map(csvCell).join(","),
    ...rows.map(row => [
      row.tenant_id,
      row.system_id,
      row.event_id || row.id,
      row.track_id || "",
      row.status,
      row.product,
      row.source || "",
      row.data_mode || "LEGACY",
      row.robot_result || "",
      row.lane || "",
      row.image_url || "",
      row.timestamp ? new Date(row.timestamp).toISOString() : ""
    ].map(csvCell).join(","))
  ].join("\r\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="defects-${new Date().toISOString().slice(0, 10)}.csv"`);
  return res.send(`\uFEFF${csv}`);
}));

app.get("/api/predict", auth, aiLimiter, asyncHandler(async (req, res) => {
  const query = await buildScopedDefectQuery(req.user, req.query);
  const data = await Defect.find(query).sort({ timestamp: -1 }).limit(20).select("status").lean();
  const ng = data.filter(v => v.status === "NG").length;
  return res.json({ ng_count: ng, sample_size: data.length, prediction: ng > 5 ? "高風險" : "正常" });
}));

app.get("/api/summary", auth, asyncHandler(async (req, res) => {
  const query = await buildScopedDefectQuery(req.user, req.query);
  const [facet = {}] = await Defect.aggregate([{ $match: query }, { $facet: {
    totals: [{ $group: {
      _id: null,
      total: { $sum: 1 },
      okCount: { $sum: { $cond: [{ $eq: ["$status", "OK"] }, 1, 0] } },
      ngCount: { $sum: { $cond: [{ $eq: ["$status", "NG"] }, 1, 0] } },
      pendingCount: { $sum: { $cond: [{ $eq: ["$status", "PENDING"] }, 1, 0] } },
      unmatchedCount: { $sum: { $cond: [{ $eq: ["$status", "UNMATCHED_DEFECT"] }, 1, 0] } }
    } }],
    byProduct: [{ $group: {
      _id: { $ifNull: ["$product", "未分類"] }, total: { $sum: 1 },
      ok: { $sum: { $cond: [{ $eq: ["$status", "OK"] }, 1, 0] } },
      ng: { $sum: { $cond: [{ $eq: ["$status", "NG"] }, 1, 0] } },
      pending: { $sum: { $cond: [{ $eq: ["$status", "PENDING"] }, 1, 0] } },
      unmatched: { $sum: { $cond: [{ $eq: ["$status", "UNMATCHED_DEFECT"] }, 1, 0] } }
    } }],
    recent: [{ $sort: { timestamp: -1 } }, { $limit: 20 }, { $project: { status: 1 } }]
  } }]);
  const totals = facet.totals?.[0] || { total: 0, okCount: 0, ngCount: 0, pendingCount: 0, unmatchedCount: 0 };
  const classifiedTotal = Number(totals.okCount || 0) + Number(totals.ngCount || 0);
  const byProduct = {};
  for (const item of facet.byProduct || []) byProduct[item._id] = { total: item.total, ok: item.ok, ng: item.ng, pending: item.pending, unmatched: item.unmatched };
  return res.json({
    total: totals.total, classifiedTotal, okCount: totals.okCount, ngCount: totals.ngCount,
    pendingCount: totals.pendingCount, unmatchedCount: totals.unmatchedCount,
    yieldRate: classifiedTotal ? ((totals.okCount / classifiedTotal) * 100).toFixed(1) : "0.0",
    defectRate: classifiedTotal ? ((totals.ngCount / classifiedTotal) * 100).toFixed(1) : "0.0",
    last20Ng: (facet.recent || []).filter(v => v.status === "NG").length, byProduct
  });
}));

function summarizeDefectsForAi(defects) {
  const total = defects.length;
  const okCount = defects.filter(v => v.status === "OK").length;
  const ngCount = defects.filter(v => v.status === "NG").length;
  const pendingCount = defects.filter(v => v.status === "PENDING").length;
  const unmatchedCount = defects.filter(v => v.status === "UNMATCHED_DEFECT").length;
  const classifiedTotal = okCount + ngCount;
  const byProduct = {}, bySystem = {};
  for (const d of defects) {
    const p = d.product || "未分類", s = d.system_id || "未指定機台";
    byProduct[p] ||= { total: 0, ok: 0, ng: 0, pending: 0, unmatched: 0, yieldRate: 0, defectRate: 0 };
    bySystem[s] ||= { total: 0, ok: 0, ng: 0, pending: 0, unmatched: 0, yieldRate: 0, defectRate: 0 };
    for (const x of [byProduct[p], bySystem[s]]) { x.total++; if (d.status === "OK") x.ok++; if (d.status === "NG") x.ng++; if (d.status === "PENDING") x.pending++; if (d.status === "UNMATCHED_DEFECT") x.unmatched++; }
  }
  for (const group of [byProduct, bySystem]) for (const x of Object.values(group)) { const classified = x.ok + x.ng; x.yieldRate = classified ? Number((x.ok / classified * 100).toFixed(1)) : 0; x.defectRate = classified ? Number((x.ng / classified * 100).toFixed(1)) : 0; }
  return { total, classifiedTotal, okCount, ngCount, pendingCount, unmatchedCount, yieldRate: classifiedTotal ? Number((okCount / classifiedTotal * 100).toFixed(1)) : 0, defectRate: classifiedTotal ? Number((ngCount / classifiedTotal * 100).toFixed(1)) : 0, last20Ng: defects.slice(0, 20).filter(v => v.status === "NG").length, byProduct, bySystem, recent: defects.slice(0, 12).map(d => ({ time: d.timestamp, product: d.product || "未分類", status: d.status, system_id: d.system_id, event_id: d.event_id || d.id, track_id: d.track_id || "", source: d.source || "", robot_result: d.robot_result || "", lane: d.lane || "" })) };
}
function buildLocalAiReply(message, summary, scope = {}) {
  const text = String(message || "").toLowerCase();
  const machine = scope.system_id || "全部可查看機台";
  const product = scope.products || "全部產品";
  const range = `${scope.date_from || "不限"} ～ ${scope.date_to || "不限"}`;
  const lines = [`【分析範圍】機台：${machine}｜產品：${product}｜時間：${range}｜資料：${summary.total} 筆`, `目前 OK ${summary.okCount} 筆，NG ${summary.ngCount} 筆，待判 ${summary.pendingCount || 0} 筆，未配對瑕疵 ${summary.unmatchedCount || 0} 筆。`, `良率 ${summary.yieldRate}%；NG 率 ${summary.defectRate}%。`];
  if (text.includes("mqtt") || text.includes("payload") || text.includes("格式")) lines.push(`Topic：${MQTT_REPORT_TOPIC}`, '{"system_id":"S001","id":"case_001","status":"OK","product":"螺帽"}', '{"system_id":"S001","id":"case_002","status":"NG","product":"螺帽"}');
  if (!summary.total) lines.push("目前沒有符合條件的檢測紀錄，請確認 MQTT payload、system_id 與 MongoDB 寫入狀態。");
  if (text.includes("ng") || text.includes("異常") || text.includes("瑕疵")) lines.push(`最近 20 筆有 ${summary.last20Ng} 筆 NG；建議依序檢查光源、鏡頭、治具位置與產品分類。`);
  return lines.join("\n");
}
function extractGeminiText(data) {
  const text = (data?.candidates || []).flatMap(c => c?.content?.parts || []).map(p => typeof p?.text === "string" ? p.text : "").filter(Boolean).join("\n").trim();
  return text || (data?.promptFeedback?.blockReason ? `Gemini 因安全限制未產生回答（${data.promptFeedback.blockReason}）。` : "Gemini 已回應，但沒有可顯示的文字內容。");
}
app.get("/api/ai/status", auth, (req, res) => { const model = GEMINI_DEFAULT_MODEL; return res.json({ enabled: Boolean(process.env.GEMINI_API_KEY), provider: "gemini", model, tier: "free", mode: process.env.GEMINI_API_KEY ? "gemini" : "local-summary" }); });

app.get("/api/ai/history", auth, asyncHandler(async (req, res) => {
  const limit = clampInt(req.query.limit, 30, 1, 100);
  const rows = await mongoose.connection.collection("ai_conversations")
    .find({ user_id: req.user.id }, { projection: { _id: 0, conversation_id: 1, title: 1, createdAt: 1, updatedAt: 1 } })
    .sort({ updatedAt: -1 })
    .limit(limit)
    .toArray();
  return res.json(rows);
}));

app.get("/api/ai/history/:conversation_id", auth, asyncHandler(async (req, res) => {
  const conversation_id = cleanText(req.params.conversation_id, 100);
  const row = await mongoose.connection.collection("ai_conversations").findOne(
    { user_id: req.user.id, conversation_id },
    { projection: { _id: 0, conversation_id: 1, title: 1, messages: 1, createdAt: 1, updatedAt: 1 } }
  );
  if (!row) return res.status(404).json({ message: "找不到此 AI 對話紀錄" });
  return res.json(row);
}));

app.delete("/api/ai/history/:conversation_id", auth, asyncHandler(async (req, res) => {
  const conversation_id = cleanText(req.params.conversation_id, 100);
  await mongoose.connection.collection("ai_conversations").deleteOne({ user_id: req.user.id, conversation_id });
  return res.json({ success: true });
}));

async function saveAiConversationTurn(user, conversationId, message, reply) {
  const now = new Date();
  const cleanConversationId = cleanText(conversationId, 100) || crypto.randomUUID();
  const cleanMessage = cleanText(message, 2000);
  const cleanReply = cleanText(reply, 12000);
  const title = cleanText(cleanMessage, 42) || "AI 品質問答";
  await mongoose.connection.collection("ai_conversations").updateOne(
    { user_id: user.id, conversation_id: cleanConversationId },
    {
      $setOnInsert: {
        conversation_id: cleanConversationId,
        user_id: user.id,
        user_email: user.email || "",
        tenant_id: user.tenant_id || "",
        title,
        createdAt: now
      },
      $set: { updatedAt: now },
      $push: {
        messages: {
          $each: [
            { role: "user", text: cleanMessage, createdAt: now },
            { role: "assistant", text: cleanReply, createdAt: now }
          ],
          $slice: -60
        }
      }
    },
    { upsert: true }
  );
  return cleanConversationId;
}
app.post("/api/ai/chat", auth, aiLimiter, asyncHandler(async (req, res) => {
  const message = cleanText(req.body.message, 2000);
  if (!message) return res.status(400).json({ message: "請輸入問題" });
  const query = await buildScopedDefectQuery(req.user, req.body || {});
  const defects = await Defect.find(query).sort({ timestamp: -1 }).limit(500).lean();
  const summary = summarizeDefectsForAi(defects);
  const requestedConversationId = cleanText(req.body.conversation_id, 100);
  if (!process.env.GEMINI_API_KEY) {
    const reply = buildLocalAiReply(message, summary, req.body || {});
    const conversation_id = await saveAiConversationTurn(req.user, requestedConversationId, message, reply);
    return res.json({ mode: "local-summary", provider: "local", reply, summary, conversation_id });
  }
  const model = GEMINI_DEFAULT_MODEL;
  const usageKey = `${new Date().toISOString().slice(0, 10)}:${req.user.id || req.user.email || req.ip}`;
  const usage = await mongoose.connection.collection("ai_daily_usage").findOneAndUpdate(
    { key: usageKey },
    {
      $setOnInsert: { key: usageKey, createdAt: new Date(), expiresAt: new Date(Date.now() + 2 * 86400000) },
      $inc: { count: 1 }
    },
    { upsert: true, returnDocument: "after" }
  );
  if (Number(usage?.count || 0) > AI_REQUESTS_PER_DAY) {
    return res.status(429).json({ message: `今日 AI 使用次數已達 ${AI_REQUESTS_PER_DAY} 次上限，請明天再試` });
  }
  try {
    const response = await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      systemInstruction: { parts: [{ text: "你是瑕疵辨識與分流系統的 AI 品質資料助理。請使用繁體中文。每次回答第一段先列出「分析範圍（機台、產品、時間、資料筆數）」；再給結論與最多 5 個可操作步驟。只能根據後端提供的統計與事件摘要回答；資料不足時必須明確說明。不得因為存在歷史檢測資料、MQTT Broker 已連線或 system_id 出現，就推論實體機械手臂、相機或輸送帶目前在線或正在運轉。除非資料中明確提供設備連線狀態，否則只能描述品質資料，不得宣稱設備連線正常。" }] },
      contents: [{ role: "user", parts: [{ text: `使用者問題：${message}\n\n查詢範圍：\n${JSON.stringify({ tenant_id: req.user.tenant_id || "", system_id: req.body.system_id || "全部可查看機台", products: req.body.products || "全部產品", date_from: req.body.date_from || "不限", date_to: req.body.date_to || "不限", count: summary.total }).slice(0, 3000)}\n\n目前統計資料：\n${JSON.stringify(summary).slice(0, 12000)}` }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 500 }
    }, { headers: { "x-goog-api-key": process.env.GEMINI_API_KEY, "Content-Type": "application/json" }, timeout: 30000, maxContentLength: 1048576, maxBodyLength: 1048576, proxy: false });
    const reply = extractGeminiText(response.data);
    const conversation_id = await saveAiConversationTurn(req.user, requestedConversationId, message, reply);
    return res.json({ mode: "gemini", provider: "gemini", tier: "free", model, reply, summary, conversation_id });
  } catch (error) {
    const reason = error?.response?.status === 429 ? "Gemini 免費額度或速率限制已達上限" : "Gemini 暫時無法連線";
    const reply = `${reason}，已自動切換成本機統計模式。\n\n${buildLocalAiReply(message, summary, req.body || {})}`;
    const conversation_id = await saveAiConversationTurn(req.user, requestedConversationId, message, reply);
    return res.json({ mode: "local-summary-fallback", provider: "local", model, warning: `${reason}，已自動切換成本機統計模式。`, reply, summary, conversation_id });
  }
}));

app.post("/api/current-product", auth, asyncHandler(async (req, res) => {
  const system_id = cleanText(req.body.system_id, 100), product = cleanText(req.body.product, 100), tenant_id = cleanText(req.body.tenant_id, 100);
  if (!system_id || !product) return res.status(400).json({ message: "缺少 system_id 或 product" });
  const access = await systemAccess(req.user, system_id, tenant_id || undefined);
  if (!access.allowed) return res.status(access.status).json({ message: access.message });
  await mongoose.connection.collection("systems").updateOne({ tenant_id: access.system.tenant_id, system_id }, { $set: { current_product: product, updatedAt: new Date() } });
  await writeAudit(req, "system.current_product.update", { tenant_id: access.system.tenant_id, system_id, target: product });
  return res.json({ success: true, message: "產品設定成功" });
}));

app.get("/api/estop/:command_id", auth, requireRole("super_admin", "tenant_admin"), asyncHandler(async (req, res) => {
  const command_id = cleanText(req.params.command_id, 100);
  if (!/^[0-9a-f-]{36}$/i.test(command_id)) return res.status(400).json({ message: "command_id 格式不正確" });
  const query = { command_id, action: "machine.estop" };
  if (req.user.role === "tenant_admin") query.tenant_id = req.user.tenant_id;
  let log = await AuditLog.findOne(query).sort({ createdAt: -1 }).lean();
  if (!log) return res.status(404).json({ message: "找不到遠端停止指令" });

  const state = commandStatus(log, ESTOP_ACK_TIMEOUT_SECONDS);
  if (state.timedOut) {
    const timedOutAt = new Date();
    await AuditLog.updateOne({ _id: log._id, status: "pending_ack" }, {
      $set: { status: "timed_out", "details.timedOutAt": timedOutAt }
    });
    log = { ...log, status: "timed_out", details: { ...(log.details || {}), timedOutAt } };
  }

  return res.json({
    command_id: log.command_id,
    status: log.status,
    tenant_id: log.tenant_id,
    system_id: log.system_id,
    requested_at: log.createdAt,
    acknowledged_at: log.details?.acknowledgedAt || null,
    timed_out_at: log.details?.timedOutAt || null,
    ack_timeout_seconds: ESTOP_ACK_TIMEOUT_SECONDS,
    ack: log.details?.ack || null
  });
}));

app.post("/api/estop", auth, requireRole("super_admin", "tenant_admin"), asyncHandler(async (req, res) => {
  const system_id = cleanText(req.body.system_id, 100), tenant_id = cleanText(req.body.tenant_id, 100);
  if (!system_id) return res.status(400).json({ message: "請先選擇要停止的機台" });
  const access = await systemAccess(req.user, system_id, tenant_id || undefined);
  if (!access.allowed) return res.status(access.status).json({ message: access.message });
  if (!mqttClient || !isMqttConnected) return res.status(503).json({ message: "MQTT 尚未連線，無法發送遠端停止指令" });

  const command_id = crypto.randomUUID();
  const requestedAt = new Date();
  const topic = MQTT_ESTOP_TOPIC_TEMPLATE.replace("{system_id}", system_id);
  const payload = JSON.stringify({
    command: "STOP",
    command_id,
    tenant_id: access.system.tenant_id,
    system_id,
    requested_at: requestedAt.toISOString(),
    ack_timeout_seconds: ESTOP_ACK_TIMEOUT_SECONDS
  });
  await new Promise((resolve, reject) => mqttClient.publish(topic, payload, { qos: 1 }, error => error ? reject(error) : resolve()));
  await writeAudit(req, "machine.estop", {
    tenant_id: access.system.tenant_id,
    system_id,
    command_id,
    status: "pending_ack",
    details: {
      topic,
      ack_timeout_seconds: ESTOP_ACK_TIMEOUT_SECONDS,
      expiresAt: new Date(requestedAt.getTime() + ESTOP_COMMAND_RETENTION_DAYS * 86400000)
    }
  });
  return res.status(202).json({
    success: true,
    command_id,
    status: "pending_ack",
    ack_timeout_seconds: ESTOP_ACK_TIMEOUT_SECONDS,
    message: "緊急停止指令已送出，等待設備確認。若逾時，系統不會自動重送，請人工確認機台狀態。"
  });
}));

async function evaluateNgAlert(tenant_id, system_id) {
  const now = new Date();
  const sys = await mongoose.connection.collection("systems").findOne({tenant_id,system_id});
  const threshold = machineThresholds(sys).ngThreshold;
  // 按接收的檢測事件計算「連續 NG」，OK 會中斷連續次數；去重事件由上游 UPSERT 保證。
  const recent = await Defect.find({tenant_id,system_id,data_mode:"PRODUCTION",status:{$in:["OK","NG"]}})
    .sort({timestamp:-1,_id:-1}).limit(threshold).select({status:1}).lean();
  const count = recent.findIndex(e=>e.status!=="NG") === -1 ? recent.length : recent.findIndex(e=>e.status!=="NG");
  if (count < threshold) return;

  const stateCollection = mongoose.connection.collection("alert_states");
  const alertsCollection = mongoose.connection.collection("alerts");
  const key = `${tenant_id}:${system_id}:ng-consecutive`;
  const cooldownUntil = new Date(
    now.getTime() + ALERT_COOLDOWN_MINUTES * 60000
  );

  try {
    const claim = await stateCollection.findOneAndUpdate(
      {
        key,
        $and: [
          {
            $or: [
              { cooldownUntil: { $exists: false } },
              { cooldownUntil: { $lte: now } }
            ]
          },
          {
            $or: [
              { processingUntil: { $exists: false } },
              { processingUntil: { $lte: now } }
            ]
          }
        ]
      },
      {
        $set: {
          key,
          tenant_id,
          system_id,
          processingUntil: new Date(now.getTime() + 120000),
          lastEvaluatedAt: now,
          lastCount: count
        }
      },
      {
        upsert: true,
        returnDocument: "after"
      }
    );

    if (!claim) return;
  } catch (error) {
    if (error?.code === 11000) return;
    throw error;
  }

  const message =
    `機台 ${system_id} 已連續 ${count} 筆 NG，達到門檻 ${threshold} 筆。`;

  try {
    // 站內告警不依賴 Email。
    await alertsCollection.insertOne({
      tenant_id,
      system_id,
      type: "ng_consecutive",
      severity: "high",
      message,
      status: "open",
      source: "mqtt",
      count,
      threshold,

      createdAt: now,
      updatedAt: now
    });
  } catch (error) {
    await stateCollection.updateOne(
      { key },
      {
        $set: {
          lastError: cleanText(error.message, 500),
          lastErrorAt: new Date()
        },
        $unset: { processingUntil: "" }
      }
    ).catch(() => {});

    logger.error("NG site alert creation failed", {
      tenant_id,
      system_id,
      error: error.message
    });

    throw error;
  }

  let emailStatus = "not_configured";

  if (mailEnabled && ALERT_EMAIL && isMailReady && transporter) {
    try {
      await transporter.sendMail({
        from: MAIL_FROM,
        to: ALERT_EMAIL,
        subject: "產線 NG 異常警報",
        text: message
      });

      emailStatus = "sent";
    } catch (error) {
      emailStatus = "failed";

      logger.error("NG alert email failed", {
        tenant_id,
        system_id,
        error: error.message
      });
    }
  }

  await stateCollection.updateOne(
    { key },
    {
      $set: {
        lastSentAt: emailStatus === "sent" ? now : null,
        cooldownUntil,
        lastCount: count,
        lastAlertAt: now,
        lastEmailStatus: emailStatus
      },
      $unset: {
        processingUntil: "",
        lastError: ""
      }
    }
  );

  await AuditLog.create({
    actor_id: "system",
    actor_email: "",
    role: "system",
    tenant_id,
    system_id,
    action: "alert.ng.created",
    status: "success",
    details: {
      count,

      threshold,
      email_status: emailStatus
    },
    createdAt: now
  });
}
function createMqttClient() {
  const mqttUrl = cleanText(process.env.MQTT_URL, 500);
  const mqttUser = cleanText(process.env.HIVEMQ_USER, 200);
  const mqttPass = String(process.env.HIVEMQ_PASS || "");
  if (!mqttUrl && !mqttUser && !mqttPass) {
    logger.warn("MQTT is not configured; device ingestion is disabled");
    return null;
  }

  const configuredClientId = cleanText(process.env.MQTT_CLIENT_ID, 100);
  const fallbackClientId = `defect-system-${crypto.createHash("sha256").update(String(process.env.APP_BASE_URL || "local")).digest("hex").slice(0, 12)}`;
  const client = mqtt.connect(mqttUrl, {
    port: clampInt(process.env.MQTT_PORT, 8883, 1, 65535),
    username: mqttUser,
    password: mqttPass,
    clientId: configuredClientId || fallbackClientId,
    reconnectPeriod: 5000,
    connectTimeout: 15000,
    clean: false,
    rejectUnauthorized: true,
    resubscribe: true
  });

  client.on("connect", () => {
    isMqttConnected = true;
    client.subscribe([MQTT_REPORT_TOPIC, MQTT_ESTOP_ACK_TOPIC], { qos: 1 }, error => {
      if (error) logger.error("MQTT subscription failed", { error: error.message });
      else logger.info("MQTT connected and subscribed", { report_topic: MQTT_REPORT_TOPIC, ack_topic: MQTT_ESTOP_ACK_TOPIC });
    });
  });
  client.on("offline", () => { isMqttConnected = false; });
  client.on("close", () => { isMqttConnected = false; });
  client.on("error", error => {
    isMqttConnected = false;
    logger.error("MQTT connection error", { error: error.message });
  });

  client.on("message", async (topic, buffer) => {
    try {
      if (buffer.length > MQTT_MAX_PAYLOAD_BYTES) throw new Error(`MQTT payload 超過 ${MQTT_MAX_PAYLOAD_BYTES} bytes`);
      const raw = JSON.parse(buffer.toString("utf8"));

      const ackSystemFromTopic = topicSystemId(topic, MQTT_ESTOP_ACK_TOPIC);
      if (ackSystemFromTopic) {
        const command_id = cleanText(raw.command_id, 100);
        if (!/^[0-9a-f-]{36}$/i.test(command_id)) throw new Error("E-stop ACK 缺少有效 command_id");
        const status = normalizeAckStatus(raw.status);
        const payloadSystemId = cleanText(raw.system_id, 100);
        if (payloadSystemId && payloadSystemId !== ackSystemFromTopic) throw new Error("E-stop ACK topic 與 system_id 不一致");
        const log = await AuditLog.findOne({ command_id, action: "machine.estop" }).sort({ createdAt: -1 }).lean();
        if (!log) {
          logger.warn("Unknown E-stop ACK ignored", { command_id, topic });
          return;
        }
        if (log.system_id !== ackSystemFromTopic) throw new Error("E-stop ACK 不屬於原始機台");
        const receivedAt = new Date();
        await AuditLog.updateOne({ _id: log._id }, { $set: {
          status,
          "details.ack": {
            command_id,
            status,
            system_id: ackSystemFromTopic,
            topic,
            received_at: receivedAt.toISOString()
          },
          "details.acknowledgedAt": receivedAt,
          "details.lateAck": log.status === "timed_out"
        } });
        logger.info("E-stop ACK received", { command_id, system_id: ackSystemFromTopic, status, late: log.status === "timed_out" });
        return;
      }

      if (topic !== MQTT_REPORT_TOPIC) return;
      const systemId = cleanText(raw.system_id, 100);
      const systemDoc = await mongoose.connection.collection("systems").findOne(
  { system_id: systemId },
  { projection: { tenant_id: 1, current_product: 1 } }
);

if (!systemDoc) throw new Error("找不到機台");

const receivedAt = new Date();
const ingestDataMode = await configuredMachineMode(systemDoc.tenant_id, systemId);

await mongoose.connection.collection("systems").updateOne(
  {
    tenant_id: systemDoc.tenant_id,
    system_id: systemId
  },
  {
    $set: {
      last_report_at: receivedAt,
      last_report_status: "online"
    }
  }
);

const normalized = normalizeDefectPayload(
  raw,
  systemDoc.current_product || "未分類",
  {
    now: receivedAt,
    maxFutureMs: MQTT_MAX_FUTURE_SECONDS * 1000,
    maxPastMs: MQTT_MAX_PAST_DAYS * 86400000
  }
);
      const owner = await mongoose.connection.collection("users").findOne(
        { tenant_id: systemDoc.tenant_id },
        { projection: { username: 1, email: 1 } }
      );
      const products = await ProductCatalog.find({ tenant_id: systemDoc.tenant_id }).lean();
      const classMap = new Map(products.filter(p => p.yolo_class).map(p => [p.yolo_class.toLowerCase(), p.name]));
      const docs = normalized.items.map(item => ({
        tenant_id: systemDoc.tenant_id,
        user_id: owner?.username || owner?.email || "unknown",
        system_id: normalized.system_id,
        id: item.id,
        event_id: item.event_id || item.id,
        track_id: item.track_id || "",
        status: item.status,
        product: classMap.get(String(item.product || "").toLowerCase()) || item.product,
        source: item.source || "",
        data_mode: ingestDataMode,
        robot_result: item.robot_result || "",
        lane: item.lane || "",
        image_url: item.image_url || "",
        timestamp: item.timestamp || receivedAt
      }));
      // 同一 event/id 可能在現場流程中由「辨識」繼續補上「分流 lane／手臂結果」。
      // 不能只用 $setOnInsert，否則 MQTT 以相同 event_id 補送 lane 時，既有事件永遠不會更新。
      // 身分欄位只在第一次建立；可變動的辨識／分流欄位允許後續回報覆寫。
      const operations = docs.map(doc => ({
        updateOne: {
          filter: { tenant_id: doc.tenant_id, system_id: doc.system_id, id: doc.id },
          update: {
            $setOnInsert: {
              tenant_id: doc.tenant_id,
              user_id: doc.user_id,
              system_id: doc.system_id,
              id: doc.id,
              event_id: doc.event_id,
              track_id: doc.track_id,
              data_mode: doc.data_mode
            },
            $set: {
              status: doc.status,
              product: doc.product,
              source: doc.source,
              ...(doc.robot_result ? { robot_result: doc.robot_result } : {}),
              ...(doc.lane ? { lane: doc.lane } : {}),
              ...(doc.image_url ? { image_url: doc.image_url } : {}),
              timestamp: doc.timestamp
            }
          },
          upsert: true
        }
      }));
      const result = await Defect.bulkWrite(operations, { ordered: false });
      const last = docs[docs.length - 1];
      latestMqttMessage = {
        payload: {
          id: last.id,
          event_id: last.event_id || last.id,
          track_id: last.track_id || "",
          status: last.status,
          product: last.product,
          system_id: last.system_id,
          source: last.source || "",
          data_mode: ingestDataMode,
          robot_result: last.robot_result || "",
          lane: last.lane || "",
          image_url: last.image_url,
          timestamp: last.timestamp || receivedAt
        },
        tenant_id: last.tenant_id,
        data_mode: ingestDataMode,
        timestamp: receivedAt,
        receivedAt: receivedAt.toISOString(),
        inserted_count: Number(result.upsertedCount || 0),
        duplicate_count: Math.max(0, docs.length - Number(result.upsertedCount || 0))
      };

      // 資料真正寫入 MongoDB 後再推播，避免前端先看到尚未落庫的事件。
      // 一個 MQTT payload 若含多筆事件，就逐筆通知；首頁會立即更新對應 lane。
      for (const doc of docs) {
        if (ingestDataMode !== "PRODUCTION") continue;
        pushRealtimeEvent("defect", {
          id: doc.id,
          event_id: doc.event_id || doc.id,
          track_id: doc.track_id || "",
          system_id: doc.system_id,
          product: doc.product,
          status: doc.status,
          source: doc.source || "",
          data_mode: doc.data_mode,
          robot_result: doc.robot_result || "",
          lane: doc.lane || "",
          image_url: doc.image_url || "",
          timestamp: doc.timestamp || receivedAt,
          received_at: receivedAt.toISOString()
        }, doc.tenant_id, doc.system_id);
      }
      if (ingestDataMode === "PRODUCTION" && Number(result.upsertedCount || 0) > 0 && docs.some(value => value.status === "NG")) {
        await evaluateNgAlert(systemDoc.tenant_id, normalized.system_id);
        await evaluateYieldAlerts(systemDoc.tenant_id, normalized.system_id);
      }
    } catch (error) {
      logger.warn("MQTT message rejected", { topic, error: error.message, payload_bytes: buffer.length });
    }
  });
  return client;
}

app.get("/", (req, res) => res.redirect(302, "/login.html"));
app.use("/api", (req, res) => res.status(404).json({ message: "找不到此 API", request_id: req.requestId }));
app.use((error, req, res, next) => {
  const rawStatus = Number(error.status || error.statusCode || 500);
  const status = rawStatus >= 400 && rawStatus <= 599 ? rawStatus : 500;
  if (status >= 500) {
    logger.error("HTTP request failed", {
      request_id: req.requestId,
      method: req.method,
      path: req.originalUrl,
      status,
      error: error.message,
      stack: NODE_ENV === "development" ? error.stack : undefined
    });
  } else {
    logger.warn("HTTP request rejected", { request_id: req.requestId, method: req.method, path: req.originalUrl, status, error: error.message });
  }
  return res.status(status).json({
    message: status >= 500 && NODE_ENV === "production" ? "伺服器暫時發生錯誤" : (error.message || "請求失敗"),
    request_id: req.requestId
  });
});

async function runRetentionCleanup() {
  const tasks = [];
  if (DEFECT_RETENTION_DAYS > 0) {
    tasks.push(Defect.deleteMany({ timestamp: { $lt: new Date(Date.now() - DEFECT_RETENTION_DAYS * 86400000) } }));
  }
  if (AUDIT_RETENTION_DAYS > 0) {
    tasks.push(AuditLog.deleteMany({ createdAt: { $lt: new Date(Date.now() - AUDIT_RETENTION_DAYS * 86400000) } }));
  }
  if (!tasks.length) return;
  const results = await Promise.allSettled(tasks);
  results.forEach(result => {
    if (result.status === "rejected") logger.warn("Retention cleanup failed", { error: result.reason?.message || String(result.reason) });
  });
}

async function ensureIndexes() {
  const tasks = [
    mongoose.connection.collection("login_otps").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    mongoose.connection.collection("registration_otps").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    mongoose.connection.collection("registration_otps").createIndex({ email: 1 }, { unique: true }),
    mongoose.connection.collection("login_otps").createIndex({ email: 1 }, { unique: true }),
    mongoose.connection.collection("login_otps").createIndex({ challengeId: 1 }, { unique: true, sparse: true }),
    mongoose.connection.collection("login_security").createIndex({ key: 1 }, { unique: true }),
    mongoose.connection.collection("login_security").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    mongoose.connection.collection("users").createIndex({ email: 1 }, { unique: true, sparse: true }),
    mongoose.connection.collection("users").createIndex({ username: 1 }, { unique: true, sparse: true }),
    mongoose.connection.collection("users").createIndex({ tenant_id: 1, role: 1, createdAt: -1 }),
    mongoose.connection.collection("systems").createIndex({ tenant_id: 1, system_id: 1 }, { unique: true }),
    mongoose.connection.collection("alert_states").createIndex(
  { key: 1 },
  { unique: true }
),

mongoose.connection.collection("ai_conversations").createIndex(
  { user_id: 1, updatedAt: -1 },
  { name: "ai_history_user_updated" }
),

mongoose.connection.collection("alerts").createIndex(
  { tenant_id: 1, system_id: 1, status: 1, createdAt: -1 }
),

mongoose.connection.collection("ai_daily_usage").createIndex(
  { key: 1 },
  { unique: true }
),
    mongoose.connection.collection("ai_daily_usage").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    Defect.createIndexes(),
    AuditLog.createIndexes()
  ];
  const results = await Promise.allSettled(tasks);
  results.forEach(result => {
    if (result.status === "rejected") logger.warn("Index creation warning", { error: result.reason?.message || String(result.reason) });
  });
}

async function verifyMailTransport() {
  lastMailCheckAt = new Date().toISOString();
  if (!mailEnabled || !transporter) {
    isMailReady = false;
    return false;
  }
  try {
    await transporter.verify();
    isMailReady = true;
    logger.info("SMTP verification succeeded", { provider: smtpProvider, host: smtpHost, port: smtpPort });
  } catch (error) {
    isMailReady = false;
    logger.error("SMTP verification failed", { provider: smtpProvider, host: smtpHost, port: smtpPort, error: error.message });
  }
  return isMailReady;
}

async function start() {
  await mongoose.connect(MONGODB_URI, {
    serverSelectionTimeoutMS: 10000,
    maxPoolSize: 10,
    minPoolSize: 1,
    maxIdleTimeMS: 60000,
    retryWrites: true
  });
  logger.info("MongoDB connected");
  await ensureIndexes();
  await runRetentionCleanup();
  await verifyMailTransport();
  setInterval(() => runRetentionCleanup().catch(error => logger.warn("Retention cleanup failed", { error: error.message })), 24 * 60 * 60 * 1000).unref();
  setInterval(() => verifyMailTransport().catch(error => logger.warn("SMTP periodic check failed", { error: error.message })), 15 * 60 * 1000).unref();
  mqttClient = createMqttClient();
  const server = app.listen(PORT, "0.0.0.0", () => logger.info("HTTP server started", { port: PORT, version: packageInfo.version }));
  const shutdown = async signal => {
    logger.info("Graceful shutdown started", { signal });
    server.close();
    try { mqttClient?.end(true); } catch (_) {}
    await mongoose.disconnect().catch(() => {});
    process.exit(0);
  };
  process.once("SIGTERM", () => shutdown("SIGTERM"));
  process.once("SIGINT", () => shutdown("SIGINT"));
  return server;
}
if (require.main === module) start().catch(error => {
  logger.error("Server startup failed", { error: error.message, stack: error.stack });
  process.exit(1);
});
module.exports = { app, start };
