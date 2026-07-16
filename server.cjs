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
  hashOtp
} = require("./lib/security.cjs");

const app = express();
app.set("trust proxy", 1);

const PORT = Number(process.env.PORT || 5000);
const NODE_ENV = process.env.NODE_ENV || "development";
const JWT_SECRET = process.env.JWT_SECRET;
const MONGODB_URI = process.env.MONGODB_URI;
const MQTT_REPORT_TOPIC = process.env.MQTT_REPORT_TOPIC || "factory/defect/report";
const MQTT_ESTOP_TOPIC_TEMPLATE = process.env.MQTT_ESTOP_TOPIC_TEMPLATE || "factory/control/estop/{system_id}";
const MQTT_ESTOP_ACK_TOPIC = process.env.MQTT_ESTOP_ACK_TOPIC || "factory/control/estop/ack/+";
const OTP_TTL_MINUTES = clampInt(process.env.OTP_TTL_MINUTES, 5, 2, 20);
const OTP_RESEND_SECONDS = clampInt(process.env.OTP_RESEND_SECONDS, 60, 30, 600);
const OTP_MAX_ATTEMPTS = clampInt(process.env.OTP_MAX_ATTEMPTS, 5, 3, 10);
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "4h";
const ALERT_THRESHOLD = clampInt(process.env.ALERT_THRESHOLD, 3, 2, 100);
const ALERT_WINDOW_MINUTES = clampInt(process.env.ALERT_WINDOW_MINUTES, 10, 1, 1440);
const ALERT_COOLDOWN_MINUTES = clampInt(process.env.ALERT_COOLDOWN_MINUTES, 30, 1, 1440);

function validateEnvironment() {
  const missing = [];
  if (!MONGODB_URI) missing.push("MONGODB_URI");
  if (!JWT_SECRET || JWT_SECRET.length < 32) missing.push("JWT_SECRET（至少 32 字元）");
  if (missing.length) throw new Error(`缺少必要環境變數：${missing.join("、")}`);
}
validateEnvironment();

const allowedOrigins = new Set([
  ...String(process.env.ALLOWED_ORIGINS || "").split(",").map(v => v.trim()).filter(Boolean),
  process.env.APP_BASE_URL,
  "http://localhost:5000",
  "http://127.0.0.1:5000"
].filter(Boolean));

app.use((req, res, next) => {
  req.requestId = req.headers["x-request-id"] || crypto.randomUUID();
  res.setHeader("X-Request-Id", req.requestId);
  next();
});
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) return callback(null, true);
    return callback(Object.assign(new Error("此來源不允許呼叫 API"), { status: 403 }));
  },
  methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Request-Id"],
  maxAge: 600
}));
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      imgSrc: ["'self'", "data:", "blob:"],
      mediaSrc: ["'self'", "blob:"],
      connectSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      fontSrc: ["'self'", "data:"]
    }
  },
  hsts: NODE_ENV === "production" ? { maxAge: 15552000, includeSubDomains: true } : false,
  referrerPolicy: { policy: "same-origin" }
}));
app.use(express.json({ limit: "256kb", strict: true }));
app.use(express.urlencoded({ extended: false, limit: "64kb" }));

const publicDir = path.join(__dirname, "public");
app.use((req, res, next) => {
  if (/\.html$/i.test(req.path) || req.path === "/") res.setHeader("Cache-Control", "no-store");
  next();
});
app.use(express.static(publicDir, { dotfiles: "deny", etag: true, index: "index.html", maxAge: NODE_ENV === "production" ? "1h" : 0 }));

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: "draft-8", legacyHeaders: false, message: { message: "登入嘗試過於頻繁，請稍後再試" } });
const otpSendLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 5, standardHeaders: "draft-8", legacyHeaders: false, message: { message: "驗證碼寄送過於頻繁，請稍後再試" } });
const registerLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 5, standardHeaders: "draft-8", legacyHeaders: false, message: { message: "註冊次數過多，請稍後再試" } });
const aiLimiter = rateLimit({ windowMs: 60 * 1000, limit: clampInt(process.env.AI_REQUESTS_PER_MINUTE, 10, 1, 60), standardHeaders: "draft-8", legacyHeaders: false, message: { message: "AI 問題傳送過於頻繁，請稍後再試" } });

const defectSchema = new mongoose.Schema({
  tenant_id: { type: String, required: true, trim: true },
  user_id: { type: String, default: "unknown", trim: true },
  system_id: { type: String, required: true, trim: true },
  id: { type: String, required: true, trim: true },
  status: { type: String, enum: ["OK", "NG"], required: true, uppercase: true },
  product: { type: String, default: "未分類", trim: true },
  timestamp: { type: Date, default: Date.now, index: true }
}, { versionKey: false });
defectSchema.index({ tenant_id: 1, system_id: 1, timestamp: -1 });
defectSchema.index({ tenant_id: 1, product: 1, timestamp: -1 });
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
auditLogSchema.index({ command_id: 1 }, { sparse: true });
const AuditLog = mongoose.model("AuditLog", auditLogSchema);

const MAIL_FROM = cleanText(process.env.BREVO_SENDER_EMAIL || process.env.GMAIL_USER || process.env.BREVO_SMTP_LOGIN, 200);
const ALERT_EMAIL = cleanText(process.env.ALERT_EMAIL || MAIL_FROM, 200);
const mailEnabled = Boolean(process.env.BREVO_SMTP_LOGIN && process.env.BREVO_SMTP_KEY && MAIL_FROM);
const transporter = mailEnabled ? nodemailer.createTransport({
  host: process.env.BREVO_SMTP_HOST || "smtp-relay.brevo.com",
  port: clampInt(process.env.BREVO_SMTP_PORT, 2525, 1, 65535),
  secure: String(process.env.BREVO_SMTP_SECURE || "false") === "true",
  auth: { user: process.env.BREVO_SMTP_LOGIN, pass: process.env.BREVO_SMTP_KEY },
  connectionTimeout: 15000,
  greetingTimeout: 15000,
  socketTimeout: 20000,
  disableFileAccess: true,
  disableUrlAccess: true
}) : null;

function asyncHandler(fn) { return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next); }
function auth(req, res, next) {
  const header = String(req.headers.authorization || "");
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return res.status(401).json({ message: "未登入" });
  try {
    req.user = jwt.verify(token, JWT_SECRET, { algorithms: ["HS256"], issuer: "defect-system" });
    return next();
  } catch (_) {
    return res.status(401).json({ message: "登入已過期，請重新登入" });
  }
}
function requireRole(...roles) { return (req, res, next) => roles.includes(req.user?.role) ? next() : res.status(403).json({ message: "權限不足" }); }
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
  const query = {};
  const products = cleanText(params.products, 1000);
  if (products) {
    const list = products.split(",").map(v => cleanText(v, 100)).filter(Boolean).slice(0, 30);
    if (list.length) query.product = { $in: list };
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
  if ((from && !Number.isNaN(from.valueOf())) || (to && !Number.isNaN(to.valueOf()))) {
    query.timestamp = {};
    if (from && !Number.isNaN(from.valueOf())) query.timestamp.$gte = from;
    if (to && !Number.isNaN(to.valueOf())) query.timestamp.$lte = to;
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

async function issueLoginResponse(user) {
  const systems = await resolveSystemIdsForUserDocument(user);
  const payload = { id: String(user._id), email: user.email || user.username, name: user.name || "", company: user.company || "", tenant_id: user.tenant_id || "", role: user.role || "user", systems };
  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN, algorithm: "HS256", issuer: "defect-system" });
  return { token, user: { id: payload.id, email: payload.email, name: payload.name, company: payload.company, tenant_id: payload.tenant_id, role: payload.role }, systems };
}

async function writeAudit(req, action, fields = {}) {
  try {
    await AuditLog.create({ request_id: req.requestId, actor_id: req.user?.id || "anonymous", actor_email: req.user?.email || "", role: req.user?.role || "anonymous", tenant_id: fields.tenant_id || req.user?.tenant_id || "", system_id: fields.system_id || "", action, target: fields.target || "", status: fields.status || "success", command_id: fields.command_id || "", details: fields.details || {}, ip: req.ip });
  } catch (error) { console.warn("audit log failed:", error.message); }
}

app.post("/api/register", registerLimiter, asyncHandler(async (req, res) => {
  if (String(process.env.ALLOW_PUBLIC_REGISTRATION || "true") !== "true") return res.status(403).json({ message: "目前已關閉公開註冊，請聯絡管理員建立帳號" });
  const company = cleanText(req.body.company, 120);
  const username = normalizeEmail(req.body.username);
  const password = String(req.body.password || "");
  if (!company || !username || !password) return res.status(400).json({ message: "資料不完整" });
  const pw = validatePassword(password);
  if (!pw.valid) return res.status(400).json({ message: pw.errors.join("；") });
  const users = mongoose.connection.collection("users");
  if (await users.findOne({ $or: [{ username }, { email: username }] })) return res.status(409).json({ message: "帳號已存在" });
  const tenant_id = `T${Date.now()}${crypto.randomInt(100, 999)}`;
  const system_id = `S${Date.now()}${crypto.randomInt(100, 999)}`;
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await mongoose.connection.collection("tenants").insertOne({ tenant_id, company, createdAt: new Date() }, { session });
      await users.insertOne({ username, email: username, password: await bcrypt.hash(password, 12), tenant_id, role: "tenant_admin", systems: [system_id], createdAt: new Date() }, { session });
      await mongoose.connection.collection("systems").insertOne({ tenant_id, system_id, name: "預設機台", createdAt: new Date() }, { session });
    });
  } finally { await session.endSession(); }
  await writeAudit(req, "tenant.register", { tenant_id, system_id, target: username });
  return res.status(201).json({ success: true, tenant_id, system_id });
}));

app.post("/api/login", authLimiter, (req, res) => res.status(409).json({ message: "此系統採用兩步驟登入，請先寄送驗證碼" }));

app.post("/api/login/send-code", otpSendLimiter, asyncHandler(async (req, res) => {
  if (!mailEnabled) return res.status(503).json({ message: "寄信服務尚未設定，請檢查 Brevo 環境變數" });
  const email = normalizeEmail(req.body.email);
  const password = String(req.body.password || "");
  if (!email || !password) return res.status(400).json({ message: "請輸入信箱與密碼" });
  const user = await mongoose.connection.collection("users").findOne({ $or: [{ email }, { username: email }] });
  const matched = user ? await bcrypt.compare(password, user.password || "") : false;
  if (!user || !matched) return res.status(401).json({ message: "信箱或密碼錯誤" });
  const col = mongoose.connection.collection("login_otps");
  const existing = await col.findOne({ email });
  if (existing?.lastSentAt && Date.now() - new Date(existing.lastSentAt).getTime() < OTP_RESEND_SECONDS * 1000) {
    const wait = Math.ceil((OTP_RESEND_SECONDS * 1000 - (Date.now() - new Date(existing.lastSentAt).getTime())) / 1000);
    return res.status(429).json({ message: `請等待 ${wait} 秒後再寄送驗證碼` });
  }
  const code = String(crypto.randomInt(100000, 1000000));
  const now = new Date();
  await col.updateOne({ email }, { $set: { email, codeHash: hashOtp(email, code, JWT_SECRET), attempts: 0, createdAt: now, lastSentAt: now, expiresAt: new Date(now.getTime() + OTP_TTL_MINUTES * 60000) } }, { upsert: true });
  await transporter.sendMail({ from: MAIL_FROM, to: user.email || user.username, subject: "瑕疵辨識與分流系統登入驗證碼", text: `您的登入驗證碼是：${code}\n\n此驗證碼 ${OTP_TTL_MINUTES} 分鐘內有效。` });
  const response = { success: true, message: "驗證碼已寄出，請到信箱查看" };
  if (NODE_ENV === "development" && process.env.DEV_RETURN_OTP === "true") response.dev_code = code;
  return res.json(response);
}));

app.post("/api/login/verify-code", authLimiter, asyncHandler(async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const code = cleanText(req.body.code, 12);
  if (!email || !code) return res.status(400).json({ message: "請輸入信箱與驗證碼" });
  const col = mongoose.connection.collection("login_otps");
  const saved = await col.findOne({ email });
  if (!saved) return res.status(400).json({ message: "請先寄送驗證碼" });
  if (new Date(saved.expiresAt).getTime() < Date.now()) { await col.deleteOne({ email }); return res.status(400).json({ message: "驗證碼已過期，請重新寄送" }); }
  if (Number(saved.attempts || 0) >= OTP_MAX_ATTEMPTS) { await col.deleteOne({ email }); return res.status(429).json({ message: "驗證碼錯誤次數過多，請重新寄送" }); }
  const expected = Buffer.from(String(saved.codeHash || ""), "hex");
  const actual = Buffer.from(hashOtp(email, code, JWT_SECRET), "hex");
  if (!(expected.length === actual.length && crypto.timingSafeEqual(expected, actual))) {
    const updated = await col.findOneAndUpdate({ email }, { $inc: { attempts: 1 } }, { returnDocument: "after" });
    return res.status(400).json({ message: `驗證碼錯誤，剩餘 ${Math.max(0, OTP_MAX_ATTEMPTS - Number(updated?.attempts || 1))} 次機會` });
  }
  await col.deleteOne({ email });
  const user = await mongoose.connection.collection("users").findOne({ $or: [{ email }, { username: email }] });
  if (!user) return res.status(401).json({ message: "帳號不存在" });
  return res.json(await issueLoginResponse(user));
}));

app.get("/api/admin/users", auth, requireRole("super_admin", "tenant_admin"), asyncHandler(async (req, res) => {
  const query = req.user.role === "tenant_admin" ? { tenant_id: req.user.tenant_id } : {};
  const users = await mongoose.connection.collection("users").find(query, { projection: { password: 0, passwordHash: 0, token: 0, secret: 0 } }).sort({ createdAt: -1 }).limit(500).toArray();
  const tenants = await mongoose.connection.collection("tenants").find({}, { projection: { tenant_id: 1, company: 1 } }).toArray();
  return res.json(users.map(u => ({ username: u.username || u.email, tenant_id: u.tenant_id, company: tenants.find(t => t.tenant_id === u.tenant_id)?.company || "未知", role: u.role, systems: Array.isArray(u.systems) ? u.systems : [] })));
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
  await users.insertOne({ username, email: username, password: await bcrypt.hash(password, 12), tenant_id, role, systems: validSystems, createdAt: new Date() });
  await writeAudit(req, "user.create", { tenant_id, target: username, details: { role, systems: validSystems } });
  return res.status(201).json({ success: true, message: "帳號建立成功" });
}));

app.get("/api/admin/collections", auth, requireRole("super_admin"), (req, res) => res.json(["users", "tenants", "systems", "defects", "audit_logs"]));
app.get("/api/admin/collection/:name", auth, requireRole("super_admin"), asyncHandler(async (req, res) => {
  const name = cleanText(req.params.name, 40);
  if (!new Set(["users", "tenants", "systems", "defects", "audit_logs"]).has(name)) return res.status(403).json({ message: "不允許讀取此 collection" });
  const page = clampInt(req.query.page, 1, 1, 100000);
  const limit = clampInt(req.query.limit, 100, 1, 200);
  const projection = name === "users" ? { password: 0, passwordHash: 0, otp: 0, token: 0, secret: 0 } : name === "defects" ? { image_data: 0 } : {};
  const col = mongoose.connection.collection(name);
  res.setHeader("X-Total-Count", String(await col.countDocuments({})));
  return res.json(await col.find({}, { projection }).sort({ _id: -1 }).skip((page - 1) * limit).limit(limit).toArray());
}));
app.get("/api/admin/tenants", auth, requireRole("super_admin"), asyncHandler(async (req, res) => res.json(await mongoose.connection.collection("tenants").find({}).sort({ createdAt: -1 }).limit(500).toArray())));

app.get("/api/site-config", auth, asyncHandler(async (req, res) => {
  const requested = cleanText(req.query.tenant_id, 100);
  const tenant_id = req.user.role === "super_admin" ? requested : req.user.tenant_id;
  if (!tenant_id) return res.status(400).json({ message: "缺少 tenant_id" });
  if (req.user.role !== "super_admin" && requested && requested !== req.user.tenant_id) return res.status(403).json({ message: "無權存取此租戶" });
  const tenant = await mongoose.connection.collection("tenants").findOne({ tenant_id }, { projection: { company: 1 } });
  if (!tenant) return res.status(404).json({ message: "找不到租戶" });
  return res.json({ success: true, data: { site_title: tenant.company || "瑕疵辨識與分流系統", site_subtitle: "即時檢測畫面 + 系統狀態與數據" } });
}));

app.get("/api/systems", auth, asyncHandler(async (req, res) => {
  const requested = cleanText(req.query.tenant_id, 100);
  const query = {};
  if (req.user.role === "super_admin") { if (requested) query.tenant_id = requested; }
  else {
    if (requested && requested !== req.user.tenant_id) return res.status(403).json({ message: "無權存取此租戶" });
    query.tenant_id = req.user.tenant_id;
    if (req.user.role === "user") { const ids = userSystemIds(req.user); query.system_id = ids.length ? { $in: ids } : "__NO_AUTHORIZED_SYSTEM__"; }
  }
  return res.json(await mongoose.connection.collection("systems").find(query, { projection: { secret: 0, token: 0 } }).sort({ name: 1 }).toArray());
}));

let isMqttConnected = false;
let latestMqttMessage = null;
let mqttClient = null;
app.get("/api/health", (req, res) => res.json({ status: mongoose.connection.readyState === 1 ? "ok" : "degraded", databaseConnected: mongoose.connection.readyState === 1, mqttConnected: isMqttConnected, mailConfigured: mailEnabled, geminiConfigured: Boolean(process.env.GEMINI_API_KEY) }));
app.get("/health", (req, res) => { const ok = mongoose.connection.readyState === 1; return res.status(ok ? 200 : 503).json({ status: ok ? "ok" : "degraded", databaseConnected: ok }); });
app.get("/api/mqtt/latest", auth, (req, res) => {
  if (!latestMqttMessage) return res.json({ data: null });
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

app.get("/api/predict", auth, aiLimiter, asyncHandler(async (req, res) => {
  const query = await buildScopedDefectQuery(req.user, req.query);
  const data = await Defect.find(query).sort({ timestamp: -1 }).limit(20).select("status").lean();
  const ng = data.filter(v => v.status === "NG").length;
  return res.json({ ng_count: ng, sample_size: data.length, prediction: ng > 5 ? "高風險" : "正常" });
}));

app.get("/api/summary", auth, asyncHandler(async (req, res) => {
  const query = await buildScopedDefectQuery(req.user, req.query);
  const [facet = {}] = await Defect.aggregate([{ $match: query }, { $facet: {
    totals: [{ $group: { _id: null, total: { $sum: 1 }, okCount: { $sum: { $cond: [{ $eq: ["$status", "OK"] }, 1, 0] } }, ngCount: { $sum: { $cond: [{ $eq: ["$status", "NG"] }, 1, 0] } } } }],
    byProduct: [{ $group: { _id: { $ifNull: ["$product", "未分類"] }, total: { $sum: 1 }, ok: { $sum: { $cond: [{ $eq: ["$status", "OK"] }, 1, 0] } }, ng: { $sum: { $cond: [{ $eq: ["$status", "NG"] }, 1, 0] } } } }],
    recent: [{ $sort: { timestamp: -1 } }, { $limit: 20 }, { $project: { status: 1 } }]
  } }]);
  const totals = facet.totals?.[0] || { total: 0, okCount: 0, ngCount: 0 };
  const byProduct = {};
  for (const item of facet.byProduct || []) byProduct[item._id] = { total: item.total, ok: item.ok, ng: item.ng };
  return res.json({ total: totals.total, okCount: totals.okCount, ngCount: totals.ngCount, yieldRate: totals.total ? ((totals.okCount / totals.total) * 100).toFixed(1) : "0.0", defectRate: totals.total ? ((totals.ngCount / totals.total) * 100).toFixed(1) : "0.0", last20Ng: (facet.recent || []).filter(v => v.status === "NG").length, byProduct });
}));

function summarizeDefectsForAi(defects) {
  const total = defects.length;
  const okCount = defects.filter(v => v.status === "OK").length;
  const ngCount = defects.filter(v => v.status === "NG").length;
  const byProduct = {}, bySystem = {};
  for (const d of defects) {
    const p = d.product || "未分類", s = d.system_id || "未指定機台";
    byProduct[p] ||= { total: 0, ok: 0, ng: 0, yieldRate: 0, defectRate: 0 };
    bySystem[s] ||= { total: 0, ok: 0, ng: 0, yieldRate: 0, defectRate: 0 };
    for (const x of [byProduct[p], bySystem[s]]) { x.total++; if (d.status === "OK") x.ok++; if (d.status === "NG") x.ng++; }
  }
  for (const group of [byProduct, bySystem]) for (const x of Object.values(group)) { x.yieldRate = x.total ? Number((x.ok / x.total * 100).toFixed(1)) : 0; x.defectRate = x.total ? Number((x.ng / x.total * 100).toFixed(1)) : 0; }
  return { total, okCount, ngCount, yieldRate: total ? Number((okCount / total * 100).toFixed(1)) : 0, defectRate: total ? Number((ngCount / total * 100).toFixed(1)) : 0, last20Ng: defects.slice(0, 20).filter(v => v.status === "NG").length, byProduct, bySystem, recent: defects.slice(0, 12).map(d => ({ time: d.timestamp, product: d.product || "未分類", status: d.status, system_id: d.system_id, case_id: d.id })) };
}
function buildLocalAiReply(message, summary) {
  const text = String(message || "").toLowerCase();
  const lines = [`目前資料總數 ${summary.total} 筆，OK ${summary.okCount} 筆，NG ${summary.ngCount} 筆。`, `良率 ${summary.yieldRate}%；NG 率 ${summary.defectRate}%。`];
  if (text.includes("mqtt") || text.includes("payload") || text.includes("格式")) lines.push(`Topic：${MQTT_REPORT_TOPIC}`, '{"system_id":"S001","id":"case_001","status":"OK","product":"螺帽"}', '{"system_id":"S001","id":"case_002","status":"NG","product":"螺帽"}');
  if (!summary.total) lines.push("目前沒有符合條件的檢測紀錄，請確認 MQTT payload、system_id 與 MongoDB 寫入狀態。");
  if (text.includes("ng") || text.includes("異常") || text.includes("瑕疵")) lines.push(`最近 20 筆有 ${summary.last20Ng} 筆 NG；建議依序檢查光源、鏡頭、治具位置與產品分類。`);
  return lines.join("\n");
}
function extractGeminiText(data) {
  const text = (data?.candidates || []).flatMap(c => c?.content?.parts || []).map(p => typeof p?.text === "string" ? p.text : "").filter(Boolean).join("\n").trim();
  return text || (data?.promptFeedback?.blockReason ? `Gemini 因安全限制未產生回答（${data.promptFeedback.blockReason}）。` : "Gemini 已回應，但沒有可顯示的文字內容。");
}
app.get("/api/ai/status", auth, (req, res) => { const model = process.env.GEMINI_MODEL || "gemini-3.1-flash-lite"; return res.json({ enabled: Boolean(process.env.GEMINI_API_KEY), provider: "gemini", model, mode: process.env.GEMINI_API_KEY ? "gemini" : "local-summary" }); });
app.post("/api/ai/chat", auth, aiLimiter, asyncHandler(async (req, res) => {
  const message = cleanText(req.body.message, 2000);
  if (!message) return res.status(400).json({ message: "請輸入問題" });
  const query = await buildScopedDefectQuery(req.user, req.body || {});
  const defects = await Defect.find(query).sort({ timestamp: -1 }).limit(500).lean();
  const summary = summarizeDefectsForAi(defects);
  if (!process.env.GEMINI_API_KEY) return res.json({ mode: "local-summary", provider: "local", reply: buildLocalAiReply(message, summary), summary });
  const model = process.env.GEMINI_MODEL || "gemini-3.1-flash-lite";
  try {
    const response = await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      systemInstruction: { parts: [{ text: "你是瑕疵辨識與分流系統的 AI 助理。請使用繁體中文，先給結論，再提供最多 5 個可操作步驟。只能根據提供的統計資料回答；資料不足時必須說明只是可能原因。" }] },
      contents: [{ role: "user", parts: [{ text: `使用者問題：${message}\n\n目前統計資料：\n${JSON.stringify(summary).slice(0, 12000)}` }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 700 }
    }, { headers: { "x-goog-api-key": process.env.GEMINI_API_KEY, "Content-Type": "application/json" }, timeout: 30000, maxContentLength: 1048576, maxBodyLength: 1048576, proxy: false });
    return res.json({ mode: "gemini", provider: "gemini", model, reply: extractGeminiText(response.data), summary });
  } catch (error) {
    const reason = error?.response?.status === 429 ? "Gemini 免費額度或速率限制已達上限" : "Gemini 暫時無法連線";
    return res.json({ mode: "local-summary-fallback", provider: "local", model, warning: `${reason}，已自動切換成本機統計模式。`, reply: `${reason}，已自動切換成本機統計模式。\n\n${buildLocalAiReply(message, summary)}`, summary });
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

app.post("/api/estop", auth, requireRole("super_admin", "tenant_admin"), asyncHandler(async (req, res) => {
  const system_id = cleanText(req.body.system_id, 100), tenant_id = cleanText(req.body.tenant_id, 100);
  if (!system_id) return res.status(400).json({ message: "請先選擇要停止的機台" });
  const access = await systemAccess(req.user, system_id, tenant_id || undefined);
  if (!access.allowed) return res.status(access.status).json({ message: access.message });
  if (!mqttClient || !isMqttConnected) return res.status(503).json({ message: "MQTT 尚未連線，無法發送急停指令" });
  const command_id = crypto.randomUUID();
  const topic = MQTT_ESTOP_TOPIC_TEMPLATE.replace("{system_id}", system_id);
  const payload = JSON.stringify({ command: "STOP", command_id, tenant_id: access.system.tenant_id, system_id, requested_at: new Date().toISOString() });
  await new Promise((resolve, reject) => mqttClient.publish(topic, payload, { qos: 1 }, e => e ? reject(e) : resolve()));
  await writeAudit(req, "machine.estop", { tenant_id: access.system.tenant_id, system_id, command_id, status: "pending_ack", details: { topic } });
  return res.status(202).json({ success: true, command_id, status: "pending_ack", message: "緊急停止指令已送出，等待設備確認。" });
}));

async function evaluateNgAlert(tenant_id, system_id) {
  if (!mailEnabled || !ALERT_EMAIL) return;
  const now = new Date(), since = new Date(now.getTime() - ALERT_WINDOW_MINUTES * 60000);
  const count = await Defect.countDocuments({ tenant_id, system_id, status: "NG", timestamp: { $gte: since } });
  if (count < ALERT_THRESHOLD) return;
  const col = mongoose.connection.collection("alert_states"), key = `${tenant_id}:${system_id}:ng-window`, state = await col.findOne({ key });
  if (state?.lastSentAt && now.getTime() - new Date(state.lastSentAt).getTime() < ALERT_COOLDOWN_MINUTES * 60000) return;
  await transporter.sendMail({ from: MAIL_FROM, to: ALERT_EMAIL, subject: "產線 NG 異常警報", text: `機台 ${system_id} 在最近 ${ALERT_WINDOW_MINUTES} 分鐘內有 ${count} 筆 NG，已達門檻 ${ALERT_THRESHOLD} 筆。` });
  await col.updateOne({ key }, { $set: { key, tenant_id, system_id, lastSentAt: now, lastCount: count } }, { upsert: true });
}

function createMqttClient() {
  if (!process.env.HIVEMQ_USER || !process.env.HIVEMQ_PASS) { console.warn("⚠️ MQTT 帳密未設定，跳過 MQTT 連線"); return null; }
  const client = mqtt.connect(process.env.MQTT_URL || "mqtts://487b901642cc4a189a7c7dfd277110a8.s1.eu.hivemq.cloud", { port: clampInt(process.env.MQTT_PORT, 8883, 1, 65535), username: process.env.HIVEMQ_USER, password: process.env.HIVEMQ_PASS, reconnectPeriod: 5000, connectTimeout: 15000, clean: true });
  client.on("connect", () => { isMqttConnected = true; client.subscribe([MQTT_REPORT_TOPIC, MQTT_ESTOP_ACK_TOPIC], { qos: 1 }); console.log("✅ MQTT 已連線"); });
  client.on("offline", () => { isMqttConnected = false; }); client.on("close", () => { isMqttConnected = false; }); client.on("error", e => { isMqttConnected = false; console.error("MQTT 錯誤:", e.message); });
  client.on("message", async (topic, buffer) => {
    try {
      const raw = JSON.parse(buffer.toString("utf8"));
      if (topic.startsWith(MQTT_ESTOP_ACK_TOPIC.replace("+", ""))) { const command_id = cleanText(raw.command_id, 100); if (command_id) await AuditLog.updateOne({ command_id }, { $set: { status: cleanText(raw.status || "acknowledged", 40), "details.ack": raw, "details.acknowledgedAt": new Date() } }); return; }
      if (topic !== MQTT_REPORT_TOPIC) return;
      const systemId = cleanText(raw.system_id, 100);
      const systemDoc = await mongoose.connection.collection("systems").findOne({ system_id: systemId }, { projection: { tenant_id: 1, current_product: 1 } });
      if (!systemDoc) throw new Error("找不到機台");
      const normalized = normalizeDefectPayload(raw, systemDoc.current_product || "未分類");
      const owner = await mongoose.connection.collection("users").findOne({ tenant_id: systemDoc.tenant_id }, { projection: { username: 1, email: 1 } });
      const now = new Date();
      const docs = normalized.items.map(item => ({ tenant_id: systemDoc.tenant_id, user_id: owner?.username || owner?.email || "unknown", system_id: normalized.system_id, id: item.id, status: item.status, product: item.product, timestamp: now }));
      await Defect.insertMany(docs, { ordered: true });
      const last = docs[docs.length - 1]; latestMqttMessage = { payload: { id: last.id, status: last.status, product: last.product, system_id: last.system_id }, tenant_id: last.tenant_id, timestamp: now };
      if (docs.some(v => v.status === "NG")) await evaluateNgAlert(systemDoc.tenant_id, normalized.system_id);
    } catch (error) { console.error("MQTT 訊息拒絕:", error.message); }
  });
  return client;
}

app.get("/", (req, res) => res.sendFile(path.join(publicDir, "index.html")));
app.use("/api", (req, res) => res.status(404).json({ message: "找不到此 API", request_id: req.requestId }));
app.use((error, req, res, next) => { const status = Number(error.status || error.statusCode || 500); if (status >= 500) console.error(`[${req.requestId}]`, error); return res.status(status).json({ message: status >= 500 && NODE_ENV === "production" ? "伺服器暫時發生錯誤" : (error.message || "請求失敗"), request_id: req.requestId }); });

async function ensureIndexes() {
  const tasks = [
    mongoose.connection.collection("login_otps").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    mongoose.connection.collection("login_otps").createIndex({ email: 1 }, { unique: true }),
    mongoose.connection.collection("users").createIndex({ email: 1 }, { unique: true, sparse: true }),
    mongoose.connection.collection("users").createIndex({ username: 1 }, { unique: true, sparse: true }),
    mongoose.connection.collection("systems").createIndex({ tenant_id: 1, system_id: 1 }, { unique: true }),
    mongoose.connection.collection("alert_states").createIndex({ key: 1 }, { unique: true }),
    Defect.createIndexes(),
    AuditLog.createIndexes()
  ];
  const results = await Promise.allSettled(tasks);
  results.forEach(result => {
    if (result.status === "rejected") console.warn("索引建立警告：", result.reason?.message || result.reason);
  });
}
async function start() { await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 10000, maxPoolSize: 10 }); console.log("✅ MongoDB 連線成功"); await ensureIndexes(); mqttClient = createMqttClient(); app.listen(PORT, "0.0.0.0", () => console.log(`🚀 server running on ${PORT}`)); }
if (require.main === module) start().catch(error => { console.error("❌ 伺服器啟動失敗:", error); process.exit(1); });
module.exports = { app, start };
