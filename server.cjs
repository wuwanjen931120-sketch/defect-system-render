// ==========================================
// 1. 套件引入與環境設定 (地基)
// ==========================================
const dns = require("dns");
// Render 有時候連 Gmail SMTP 會先走 IPv6，但 Render 環境可能沒有 IPv6 出口，
// 會出現 connect ENETUNREACH 2607:f8b0...:465。這裡強制 DNS 優先使用 IPv4。
try { dns.setDefaultResultOrder("ipv4first"); } catch (_) {}
dns.setServers(["8.8.8.8", "1.1.1.1"]); // 解決手機熱點 DNS 阻擋
require("dotenv").config(); // 讀取保險箱 .env

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const { rateLimit } = require("express-rate-limit");
const path = require("path");
const crypto = require("crypto");
const axios = require("axios");
const mongoose = require("mongoose");
const mqtt = require("mqtt");
const nodemailer = require("nodemailer");
const jwt = require("jsonwebtoken");
const {
  cleanText,
  validatePassword,
  normalizeDefectItem,
  parsePagination,
  parseCsv
} = require("./lib/validators.cjs");

// ==========================================
// 2. 伺服器、資料庫與寄信系統設定 (內部部門)
// ==========================================
const app = express();
const PORT = Number(process.env.PORT || 5000);
const JWT_SECRET = process.env.JWT_SECRET;

function validateEnvironment() {
  const missing = ["MONGODB_URI", "JWT_SECRET"].filter(name => !process.env[name]);
  if (missing.length) {
    throw new Error(`缺少必要環境變數：${missing.join(", ")}`);
  }

  const optionalGroups = [
    ["HIVEMQ_USER", "HIVEMQ_PASS"],
    ["BREVO_SMTP_LOGIN", "BREVO_SMTP_KEY"],
    ["GEMINI_API_KEY"]
  ];
  optionalGroups.forEach(group => {
    if (group.some(name => !process.env[name])) {
      console.warn(`⚠️ 選用功能尚未完整設定：${group.join(", ")}`);
    }
  });
}
validateEnvironment();

app.set("trust proxy", 1);

const defaultOrigins = [
  "https://defect-system-render.onrender.com",
  "http://localhost:5000",
  "http://127.0.0.1:5000"
];
const allowedOrigins = new Set([
  ...defaultOrigins,
  ...String(process.env.CORS_ORIGINS || "").split(",").map(v => v.trim()).filter(Boolean),
  process.env.RENDER_EXTERNAL_URL,
  process.env.RENDER_EXTERNAL_HOSTNAME ? `https://${process.env.RENDER_EXTERNAL_HOSTNAME}` : ""
].filter(Boolean).map(v => v.replace(/\/$/, "")));

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin.replace(/\/$/, ""))) {
      return callback(null, true);
    }
    return callback(new Error("此來源不在 CORS 允許清單"));
  },
  methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  maxAge: 86400
}));

const cspDirectives = {
  defaultSrc: ["'self'"],
  scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
  styleSrc: ["'self'", "'unsafe-inline'"],
  imgSrc: ["'self'", "data:", "blob:", "https:"],
  connectSrc: ["'self'", "https://generativelanguage.googleapis.com", "https:", "wss:"],
  fontSrc: ["'self'", "data:"],
  mediaSrc: ["'self'", "blob:"],
  workerSrc: ["'self'", "blob:"],
  objectSrc: ["'none'"],
  baseUri: ["'self'"],
  formAction: ["'self'"],
  frameAncestors: ["'none'"]
};
if (process.env.NODE_ENV !== "production") cspDirectives.upgradeInsecureRequests = null;

app.use(helmet({
  contentSecurityPolicy: { directives: cspDirectives },
  crossOriginEmbedderPolicy: false
}));
app.use(express.json({ limit: "1mb" }));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { message: "請求次數過多，請稍後再試" }
});
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { message: "登入或驗證嘗試過多，請 15 分鐘後再試" }
});
const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 40,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { message: "AI 查詢次數過多，請稍後再試" }
});
app.use("/api", apiLimiter);

// ================= 信箱驗證碼暫存 =================
// 單機展示版仍使用記憶體；已加入到期、重寄冷卻與錯誤次數上限。
const loginCodeStore = new Map();
const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_RESEND_COOLDOWN_MS = 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;

function makeLoginCode() {
  return String(crypto.randomInt(100000, 1000000));
}

// Render 部署：由同一個 Node.js 服務提供前端網頁
app.use(express.static(path.join(__dirname, "public"), {
  etag: true,
  maxAge: process.env.NODE_ENV === "production" ? "1h" : 0,
  setHeaders(res, filePath) {
    if (filePath.endsWith(".html") || filePath.endsWith("sw.js")) {
      res.setHeader("Cache-Control", "no-cache");
    }
  }
}));


app.post("/api/register", loginLimiter, async (req, res) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

  const { company, username, password, invite_code } = req.body;

if (!company || !username || !password) {
  await session.abortTransaction();
  session.endSession();
  return res.status(400).json({ message: "資料不完整" });
}

const normalizedUsername = cleanText(username, 160).toLowerCase();
const normalizedCompany = cleanText(company, 120);
const passwordCheck = validatePassword(password);
if (!passwordCheck.valid) {
  await session.abortTransaction();
  session.endSession();
  return res.status(400).json({ message: passwordCheck.message });
}
if (process.env.REGISTRATION_INVITE_CODE && invite_code !== process.env.REGISTRATION_INVITE_CODE) {
  await session.abortTransaction();
  session.endSession();
  return res.status(403).json({ message: "註冊邀請碼不正確" });
}

    const usersCol = mongoose.connection.collection("users");
    const tenantsCol = mongoose.connection.collection("tenants");
    const systemsCol = mongoose.connection.collection("systems");

const exist = await usersCol.findOne({
  $or: [
    { username: normalizedUsername },
    { email: normalizedUsername }
  ]
});
    if (exist) {
  await session.abortTransaction();
  session.endSession();
  return res.status(400).json({ message: "帳號已存在" });
}

    const tenant_id = "T" + Date.now();
    const system_id = "S" + Date.now();

    // 🔥 建立 tenant
    await tenantsCol.insertOne({
      tenant_id,
      company: normalizedCompany,
      createdAt: new Date()
    }, { session });

    // 🔥 密碼加密
    const bcrypt = require("bcrypt");
    const hash = await bcrypt.hash(password, 10);

    // 🔥 建立 user
    await usersCol.insertOne({
  username: normalizedUsername,
  email: normalizedUsername,
  password: hash,
  tenant_id,
  role: "tenant_admin",
  createdAt: new Date()
}, { session });

    // 🔥 建立 system
    await systemsCol.insertOne({
      tenant_id,
      system_id,
      name: "預設機台",
      createdAt: new Date()
    }, { session });

    // ✅ 成功提交
    await session.commitTransaction();
    session.endSession();

    res.json({
      success: true,
      tenant_id,
      system_id
    });

  } catch (err) {
    await session.abortTransaction();
    session.endSession();

    console.error(err);
    res.status(500).json({ message: "註冊失敗（已回滾）" });
  }
});





app.post("/api/login", loginLimiter, async (req, res) => {
  try {
    if (process.env.ALLOW_PASSWORD_LOGIN !== "true") {
      return res.status(403).json({ message: "請使用信箱驗證碼登入流程" });
    }

    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "請輸入信箱與密碼" });
    }

    const usersCol = mongoose.connection.collection("users");
    const systemsCol = mongoose.connection.collection("systems");

    const user = await usersCol.findOne({
      email: email.toLowerCase().trim()
    });

    if (!user) {
      return res.status(401).json({ message: "信箱不存在，請先註冊" });
    }

    const bcrypt = require("bcrypt");
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(401).json({ message: "密碼錯誤" });
    }

    let systems = [];

    if (user.role === "super_admin") {
      systems = await systemsCol.find({}).toArray();
    } else if (user.role === "tenant_admin") {
      systems = await systemsCol.find({ tenant_id: user.tenant_id }).toArray();
    } else {
      const assignedSystems = Array.isArray(user.systems) ? user.systems.filter(Boolean) : [];
      systems = assignedSystems.length
        ? await systemsCol.find({ tenant_id: user.tenant_id, system_id: { $in: assignedSystems } }).toArray()
        : [];
    }

    const systemIds = systems.map(s => s.system_id);

    const tokenPayload = {
      id: user._id,
      email: user.email,
      name: user.name,
      company: user.company,
      tenant_id: user.tenant_id,
      role: user.role,
      systems: systemIds
    };

    const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: "8h" });

    res.json({
      token,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        company: user.company,
        tenant_id: user.tenant_id,
        role: user.role
      },
      systems: systemIds
    });

  } catch (err) {
    console.error("登入錯誤：", err);
    res.status(500).json({ message: "登入失敗" });
  }
});
app.get("/api/admin/users", auth, requireRole("super_admin", "tenant_admin"), async (req, res) => {
  try {
    const usersCol = mongoose.connection.collection("users");
    const tenantsCol = mongoose.connection.collection("tenants");

    const query = {};

    // 客戶管理員只能看自己公司的帳號
    if (req.user.role === "tenant_admin") {
      query.tenant_id = req.user.tenant_id;
    }

    const users = await usersCol.find(query).toArray();
    const tenants = await tenantsCol.find().toArray();

    const result = users.map(u => {
      const t = tenants.find(x => x.tenant_id === u.tenant_id);

      return {
        username: u.username,
        tenant_id: u.tenant_id,
        company: t?.company || "未知",
        role: u.role,
        systems: Array.isArray(u.systems) ? u.systems : []
      };
    });

    res.json(result);

  } catch (err) {
    console.error("admin users error:", err);
    res.status(500).json({ message: "取得使用者失敗" });
  }
});


app.get("/api/admin/collections", auth, requireRole("super_admin"), async (req, res) => {
  const allowed = ["users", "tenants", "systems", "defects"];
  res.json(allowed);
});

app.get("/api/admin/collection/:name", auth, requireRole("super_admin"), async (req, res) => {
  try {
    const { name } = req.params;

    const allowed = ["users", "tenants", "systems", "defects"];

    if (!allowed.includes(name)) {
      return res.status(403).json({ message: "不允許讀取此 collection" });
    }

    const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 100, maxLimit: 200 });
    const projection = name === "users"
      ? { password: 0, passwordHash: 0, otp: 0, token: 0, secret: 0 }
      : {};
    const collection = mongoose.connection.collection(name);
    const [data, total] = await Promise.all([
      collection.find({}, { projection }).sort({ _id: -1 }).skip(skip).limit(limit).toArray(),
      collection.countDocuments({})
    ]);

    res.json({ data, page, limit, total, totalPages: Math.ceil(total / limit) });

  } catch (err) {
    console.error("Mongo admin error:", err);
    res.status(500).json({ message: "讀取資料失敗" });
  }
});

app.get("/api/predict", auth, async (req, res) => {
  try {
    const scope = await buildScopedDefectQuery(req.user, req.query);
    if (scope.error) return res.status(scope.status).json({ message: scope.error });

    const data = await Defect.find(scope.query).sort({ timestamp: -1 }).limit(20).lean();
    const ng = data.filter(d => d.status === "NG").length;
    res.json({ ng_count: ng, prediction: ng > 5 ? "高風險" : "正常", sample_size: data.length });
  } catch (err) {
    console.error("predict error:", err);
    res.status(500).json({ message: "預測資料讀取失敗" });
  }
});
app.post("/api/admin/create-user", auth, requireRole("super_admin", "tenant_admin"), async (req, res) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const { company, username, password, role, tenant_id, systems = [] } = req.body;

    const usersCol = mongoose.connection.collection("users");
    const tenantsCol = mongoose.connection.collection("tenants");
    const systemsCol = mongoose.connection.collection("systems");

    if (!username || !password || !role) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: "資料不完整" });
    }

    const passwordCheck = validatePassword(password);
    if (!passwordCheck.valid) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: passwordCheck.message });
    }

    const exist = await usersCol.findOne({ username });
    if (exist) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: "帳號已存在" });
    }

    let finalTenantId = tenant_id;

    if (req.user.role === "super_admin") {
      if (!finalTenantId) {
        if (!company) {
          await session.abortTransaction();
          session.endSession();
          return res.status(400).json({ message: "缺少公司名稱" });
        }

        finalTenantId = "T" + Date.now();
        const system_id = "S" + Date.now();

        await tenantsCol.insertOne({
          tenant_id: finalTenantId,
          company,
          createdAt: new Date()
        }, { session });

        await systemsCol.insertOne({
          tenant_id: finalTenantId,
          system_id,
          name: "預設機台",
          createdAt: new Date()
        }, { session });
      }
    }

    if (req.user.role === "tenant_admin") {
      finalTenantId = req.user.tenant_id;

      if (role !== "user") {
        await session.abortTransaction();
        session.endSession();
        return res.status(403).json({
          message: "客戶管理員只能建立一般使用者"
        });
      }
    }

    const requestedSystems = Array.isArray(systems)
      ? systems.map(id => cleanText(id, 100)).filter(Boolean)
      : [];
    const validSystems = requestedSystems.length
      ? await systemsCol.find({ tenant_id: finalTenantId, system_id: { $in: requestedSystems } }, { session }).toArray()
      : [];
    if (validSystems.length !== requestedSystems.length) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: "包含不存在或不屬於此租戶的機台" });
    }

    const bcrypt = require("bcrypt");
    const hash = await bcrypt.hash(password, 10);

    await usersCol.insertOne({
      username: cleanText(username, 160).toLowerCase(),
      email: cleanText(username, 160).toLowerCase(),
      password: hash,
      tenant_id: finalTenantId,
      role,
      systems: role === "user" ? requestedSystems : [],
      createdAt: new Date()
    }, { session });

    await session.commitTransaction();
    session.endSession();

    res.json({
      success: true,
      message: "帳號建立成功"
    });

  } catch (err) {
    await session.abortTransaction();
    session.endSession();

    console.error("create-user error:", err);
    res.status(500).json({ message: "建立帳號失敗（已回滾）" });
  }
});



// 📧 Brevo 郵件系統設定（保留你原本可用的登入驗證碼寄信方式）
// Render 連 Gmail SMTP 容易 timeout / IPv6 ENETUNREACH，這裡改回你原本使用的 Brevo SMTP。
const MAIL_FROM = process.env.BREVO_SENDER_EMAIL || process.env.GMAIL_USER || process.env.BREVO_SMTP_LOGIN;
const ALERT_EMAIL = process.env.ALERT_EMAIL || MAIL_FROM;

const transporter = nodemailer.createTransport({
  host: "smtp-relay.brevo.com",
  port: Number(process.env.BREVO_SMTP_PORT || 2525),
  secure: false,
  auth: {
    user: process.env.BREVO_SMTP_LOGIN,
    pass: process.env.BREVO_SMTP_KEY
  },
  connectionTimeout: 15000,
  greetingTimeout: 15000,
  socketTimeout: 20000
});

// ================= 寄送登入驗證碼 =================
app.post("/api/login/send-code", loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "請輸入信箱與密碼" });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const usersCol = mongoose.connection.collection("users");

    const user = await usersCol.findOne({
      $or: [
        { email: normalizedEmail },
        { username: normalizedEmail }
      ]
    });

    if (!user) {
      return res.status(401).json({ message: "信箱不存在，請先註冊" });
    }

    const bcrypt = require("bcrypt");
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(401).json({ message: "密碼錯誤" });
    }

    const existingCode = loginCodeStore.get(normalizedEmail);
    if (existingCode && Date.now() - existingCode.sentAt < OTP_RESEND_COOLDOWN_MS) {
      const waitSeconds = Math.ceil((OTP_RESEND_COOLDOWN_MS - (Date.now() - existingCode.sentAt)) / 1000);
      return res.status(429).json({ message: `請等待 ${waitSeconds} 秒後再寄送驗證碼` });
    }

    const code = makeLoginCode();
    loginCodeStore.set(normalizedEmail, {
      code,
      expiresAt: Date.now() + OTP_TTL_MS,
      sentAt: Date.now(),
      attempts: 0
    });

    await transporter.sendMail({
      from: MAIL_FROM,
      to: user.email || user.username,
      subject: "瑕疵辨識與分流系統登入驗證碼",
      text: `您的登入驗證碼是：${code}\n\n此驗證碼 5 分鐘內有效。`
    });

    res.json({
      success: true,
      message: "驗證碼已寄出，請到信箱查看"
    });

  } catch (err) {
    console.error("send-code error:", err);
    res.status(500).json({
      message: "驗證碼寄送失敗，請稍後再試",
      detail: process.env.NODE_ENV === "development" ? err.message : undefined
    });
  }
});

// ================= 驗證登入驗證碼並登入 =================
app.post("/api/login/verify-code", loginLimiter, async (req, res) => {
  try {
    const { email, code } = req.body;

    if (!email || !code) {
      return res.status(400).json({ message: "請輸入信箱與驗證碼" });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const saved = loginCodeStore.get(normalizedEmail);

    if (!saved) {
      return res.status(400).json({ message: "請先寄送驗證碼" });
    }

    if (Date.now() > saved.expiresAt) {
      loginCodeStore.delete(normalizedEmail);
      return res.status(400).json({ message: "驗證碼已過期，請重新寄送" });
    }

    if (String(code).trim() !== saved.code) {
      saved.attempts = Number(saved.attempts || 0) + 1;
      if (saved.attempts >= OTP_MAX_ATTEMPTS) {
        loginCodeStore.delete(normalizedEmail);
        return res.status(429).json({ message: "驗證碼錯誤次數過多，請重新寄送" });
      }
      loginCodeStore.set(normalizedEmail, saved);
      return res.status(400).json({ message: `驗證碼錯誤，剩餘 ${OTP_MAX_ATTEMPTS - saved.attempts} 次` });
    }

    loginCodeStore.delete(normalizedEmail);

    const usersCol = mongoose.connection.collection("users");
    const systemsCol = mongoose.connection.collection("systems");

    const user = await usersCol.findOne({
  $or: [
    { email: normalizedEmail },
    { username: normalizedEmail }
  ]
});

    if (!user) {
      return res.status(401).json({ message: "信箱不存在" });
    }

    let systems = [];

    if (user.role === "super_admin") {
      systems = await systemsCol.find({}).toArray();
    } else if (user.role === "tenant_admin") {
      systems = await systemsCol.find({ tenant_id: user.tenant_id }).toArray();
    } else {
      const assignedSystems = Array.isArray(user.systems) ? user.systems.filter(Boolean) : [];
      systems = assignedSystems.length
        ? await systemsCol.find({ tenant_id: user.tenant_id, system_id: { $in: assignedSystems } }).toArray()
        : [];
    }

    const systemIds = systems.map(s => s.system_id);

    const tokenPayload = {
      id: user._id,
      email: user.email || user.username,
      name: user.name,
      company: user.company,
      tenant_id: user.tenant_id,
      role: user.role,
      systems: systemIds
    };

    const token = jwt.sign(tokenPayload, JWT_SECRET, {
      expiresIn: "8h"
    });

    res.json({
      token,
      user: {
        id: user._id,
        email: user.email || user.username,
        name: user.name,
        company: user.company,
        tenant_id: user.tenant_id,
        role: user.role
      },
      systems: systemIds
    });

  } catch (err) {
    console.error("verify-code error:", err);
    res.status(500).json({
      message: "驗證登入失敗，請稍後再試",
      detail: process.env.NODE_ENV === "development" ? err.message : undefined
    });
  }
});

// 🔔 異常警報設定：改用資料庫時間窗，避免服務重啟後歸零
const ALERT_THRESHOLD = Number(process.env.ALERT_THRESHOLD || 3);
const ALERT_WINDOW_MINUTES = Number(process.env.ALERT_WINDOW_MINUTES || 10);
const ALERT_COOLDOWN_MINUTES = Number(process.env.ALERT_COOLDOWN_MINUTES || 10);

// 💾 MongoDB 連線設定
const dbUri = process.env.MONGODB_URI;

mongoose
  .connect(dbUri, {
    serverSelectionTimeoutMS: 10000
  })
  .then(() => {
    console.log("✅ MongoDB 連線成功！");

    app.listen(PORT, "0.0.0.0", () => {
      console.log(`🚀 server running on ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("❌ MongoDB 連線失敗：", err);
  });

// 📝 定義資料庫 Schema：正式改成 product
const defectSchema = new mongoose.Schema({
  tenant_id: { type: String, required: true, index: true },
  user_id: { type: String, default: "unknown" },
  system_id: { type: String, required: true, index: true },
  id: { type: String, required: true },
  status: { type: String, required: true, enum: ["OK", "NG"], index: true },
  product: { type: String, required: true, default: "未分類", index: true },
  timestamp: { type: Date, default: Date.now, index: true }
}, { versionKey: false });
defectSchema.index({ tenant_id: 1, system_id: 1, timestamp: -1 });
defectSchema.index({ tenant_id: 1, product: 1, timestamp: -1 });

const auditLogSchema = new mongoose.Schema({
  tenant_id: { type: String, index: true },
  system_id: { type: String, index: true },
  user_id: String,
  role: String,
  action: { type: String, required: true, index: true },
  target: String,
  payload: mongoose.Schema.Types.Mixed,
  status: { type: String, default: "recorded" },
  command_id: { type: String, index: true },
  ip: String,
  createdAt: { type: Date, default: Date.now, index: true }
}, { versionKey: false });
auditLogSchema.index({ tenant_id: 1, createdAt: -1 });

const Defect = mongoose.model("Defect", defectSchema);
const AuditLog = mongoose.model("AuditLog", auditLogSchema);

// ==========================================
// 3. MQTT 訊息接收與處理 (接收前線資料)
// ==========================================
const mqttOptions = {
  port: 8883,
  username: process.env.HIVEMQ_USER,
  password: process.env.HIVEMQ_PASS
};

// 用來記錄 MQTT 狀態供前端查詢
let isMqttConnected = false;
let latestMqttMessage = null;

const client = mqtt.connect(
  "mqtts://487b901642cc4a189a7c7dfd277110a8.s1.eu.hivemq.cloud",
  mqttOptions
);

client.on("connect", () => {
  isMqttConnected = true;
  console.log("✅ 成功連線到 HiveMQ 雲端郵局總局！");
  client.subscribe(["factory/defect/report", "factory/control/ack"]);
});

client.on("offline", () => {
  isMqttConnected = false;
});

client.on("error", (err) => {
  isMqttConnected = false;
  console.error("❌ MQTT 錯誤：", err);
});



async function evaluateNgAlert({ tenantId, systemId }) {
  const windowStart = new Date(Date.now() - ALERT_WINDOW_MINUTES * 60 * 1000);
  const recentNgCount = await Defect.countDocuments({
    tenant_id: tenantId,
    system_id: systemId,
    status: "NG",
    timestamp: { $gte: windowStart }
  });
  if (recentNgCount < ALERT_THRESHOLD) return;

  const system = await mongoose.connection.collection("systems").findOne({ tenant_id: tenantId, system_id: systemId });
  const lastAlertAt = system?.last_ng_alert_at ? new Date(system.last_ng_alert_at) : null;
  const cooldownMs = ALERT_COOLDOWN_MINUTES * 60 * 1000;
  if (lastAlertAt && Date.now() - lastAlertAt.getTime() < cooldownMs) return;

  await mongoose.connection.collection("systems").updateOne(
    { tenant_id: tenantId, system_id: systemId },
    { $set: { last_ng_alert_at: new Date() } }
  );

  if (!process.env.BREVO_SMTP_LOGIN || !process.env.BREVO_SMTP_KEY || !ALERT_EMAIL) {
    console.warn("⚠️ NG 已達警示門檻，但 SMTP 尚未設定完整");
    return;
  }

  await transporter.sendMail({
    from: MAIL_FROM,
    to: ALERT_EMAIL,
    subject: "🚨 產線異常",
    text: `機台 ${systemId} 在最近 ${ALERT_WINDOW_MINUTES} 分鐘內已有 ${recentNgCount} 筆 NG。`
  });
}

client.on("message", async (topic, message) => {
  try {
    if (topic === "factory/control/ack") {
      const ack = JSON.parse(message.toString());
      const commandId = cleanText(ack.command_id, 100);
      if (commandId) {
        await AuditLog.updateOne(
          { command_id: commandId },
          { $set: { status: cleanText(ack.status || "acknowledged", 40), ackAt: new Date(), ackPayload: ack } }
        );
      }
      return;
    }

    if (topic !== "factory/defect/report") return;
    const data = JSON.parse(message.toString());
    const systemId = cleanText(data.system_id, 100);
    if (!systemId) throw new Error("缺少 system_id");

    const systemDoc = await mongoose.connection.collection("systems").findOne({ system_id: systemId });
    if (!systemDoc) throw new Error("找不到機台");

    const userDoc = await mongoose.connection.collection("users").findOne({ tenant_id: systemDoc.tenant_id });
    const owner = { user_id: userDoc?.username || "unknown", tenant_id: systemDoc.tenant_id };
    const rawItems = Array.isArray(data.items) ? data.items : [data];
    if (!rawItems.length || rawItems.length > 100) throw new Error("items 數量必須介於 1 到 100 筆");

    const normalizedItems = rawItems.map((item, index) => {
      const result = normalizeDefectItem(item, systemDoc.current_product || "未分類");
      if (!result.valid) throw new Error(`第 ${index + 1} 筆資料錯誤：${result.message}`);
      return {
        tenant_id: owner.tenant_id,
        user_id: owner.user_id,
        system_id: systemId,
        ...result.value
      };
    });

    await Defect.insertMany(normalizedItems, { ordered: true });
    const latest = normalizedItems[normalizedItems.length - 1];
    latestMqttMessage = {
      payload: { id: latest.id, status: latest.status, product: latest.product, system_id: systemId },
      timestamp: latest.timestamp
    };

    await evaluateNgAlert({ tenantId: owner.tenant_id, systemId });
    console.log(`✅ MQTT 已存入 ${normalizedItems.length} 筆資料`);
  } catch (error) {
    console.error("❌ MQTT 處理錯誤:", error.message);
  }
});

// ================= JWT 驗證 =================
function auth(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];

  if (!token) return res.status(401).json({ message: "未登入" });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ message: "token錯誤" });
  }
}
function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: "無權限" });
    }
    next();
  };
}

function tokenSystems(user) {
  return Array.isArray(user?.systems) ? user.systems.filter(Boolean) : [];
}

async function canAccessSystem(user, tenantId, systemId) {
  if (!user || !systemId) return false;
  if (user.role === "super_admin") {
    return Boolean(await mongoose.connection.collection("systems").findOne({
      ...(tenantId ? { tenant_id: tenantId } : {}),
      system_id: systemId
    }, { projection: { _id: 1 } }));
  }
  if (tenantId && tenantId !== user.tenant_id) return false;
  if (user.role === "tenant_admin") {
    return Boolean(await mongoose.connection.collection("systems").findOne({
      tenant_id: user.tenant_id,
      system_id: systemId
    }, { projection: { _id: 1 } }));
  }
  return tokenSystems(user).includes(systemId);
}

async function buildScopedDefectQuery(user, params = {}) {
  const query = {};
  const products = parseCsv(params.products);
  if (products.length) query.product = { $in: products };

  const requestedTenantId = cleanText(params.tenant_id, 100);
  const requestedSystemId = cleanText(params.system_id, 100);

  if (user.role === "super_admin") {
    if (requestedTenantId) query.tenant_id = requestedTenantId;
    if (requestedSystemId) {
      if (!await canAccessSystem(user, requestedTenantId, requestedSystemId)) {
        return { error: "找不到指定機台", status: 404 };
      }
      query.system_id = requestedSystemId;
    }
    return { query };
  }

  query.tenant_id = user.tenant_id;
  if (user.role === "tenant_admin") {
    if (requestedSystemId) {
      if (!await canAccessSystem(user, user.tenant_id, requestedSystemId)) {
        return { error: "無權限查看此機台", status: 403 };
      }
      query.system_id = requestedSystemId;
    }
    return { query };
  }

  const systems = tokenSystems(user);
  if (!systems.length) return { error: "此帳號尚未被指派任何機台", status: 403 };
  if (requestedSystemId && !systems.includes(requestedSystemId)) {
    return { error: "無權限查看此機台", status: 403 };
  }
  query.system_id = requestedSystemId || { $in: systems };
  return { query };
}

async function writeAuditLog(req, data) {
  try {
    await AuditLog.create({
      tenant_id: data.tenant_id || req.user?.tenant_id,
      system_id: data.system_id,
      user_id: req.user?.email || req.user?.id,
      role: req.user?.role,
      action: data.action,
      target: data.target,
      payload: data.payload,
      status: data.status || "recorded",
      command_id: data.command_id,
      ip: req.ip
    });
  } catch (err) {
    console.error("audit log error:", err.message);
  }
}




// ==========================================
// 4. API 路由設定 (對前端開放的服務窗口)
// ==========================================
app.get("/", (req, res) => {
  res.send("✅ 產線總部 API 伺服器正常運作中！");
});



// 新增這段 ↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓
app.get("/api/admin/tenants", auth, async (req, res) => {
  try {
    if (req.user.role !== "super_admin") {
      return res.status(403).json({ message: "無權限" });
    }

    const tenants = await mongoose.connection
      .collection("tenants")
      .find({})
      .sort({ createdAt: -1 })
      .toArray();

    res.json(tenants);

  } catch (err) {
    console.error("tenant API error:", err);
    res.status(500).json({
      message: "取得 tenants 失敗"
    });
  }
});


// 取得客戶網站設定
app.get("/api/site-config", auth, async (req, res) => {
  try {
    const requestedTenantId = cleanText(req.query.tenant_id, 100);
    const tenantId = req.user.role === "super_admin" ? requestedTenantId : req.user.tenant_id;
    if (!tenantId) return res.status(400).json({ message: "缺少 tenant_id" });
    if (req.user.role !== "super_admin" && requestedTenantId && requestedTenantId !== req.user.tenant_id) {
      return res.status(403).json({ message: "無權限讀取其他租戶設定" });
    }

    const tenant = await mongoose.connection.collection("tenants").findOne({ tenant_id: tenantId });
    if (!tenant) return res.status(404).json({ message: "找不到租戶" });

    res.json({
      success: true,
      data: {
        site_title: tenant.company || "瑕疵辨識與分流系統",
        site_subtitle: "即時檢測畫面 + 系統狀態與數據"
      }
    });

  } catch (err) {
    console.error("site-config API error:", err);
    res.status(500).json({ message: "取得網站設定失敗" });
  }
});
// 原本就有的


// 取得某個 tenant 底下的機台
app.get("/api/systems", auth, async (req, res) => {
  try {
    const { tenant_id } = req.query;

    let query = {};
   

    if (req.user.role === "super_admin") {
      if (tenant_id) query.tenant_id = tenant_id;
    } else {
  query.tenant_id = req.user.tenant_id;

  if (Array.isArray(req.user.systems) && req.user.systems.length > 0) {
    query.system_id = { $in: req.user.systems };
  }
}

    const systems = await mongoose.connection
      .collection("systems")
      .find(query)
      .toArray();

    res.json(systems);

  } catch (err) {
    console.error("systems API error:", err);
    res.status(500).json({ message: "取得 systems 失敗" });
  }
});

// 健康狀態檢查
app.get("/api/health", auth, (req, res) => {
  res.json({
    status: mongoose.connection.readyState === 1 ? "ok" : "degraded",
    mongoConnected: mongoose.connection.readyState === 1,
    mqttConnected: isMqttConnected,
    smtpConfigured: Boolean(process.env.BREVO_SMTP_LOGIN && process.env.BREVO_SMTP_KEY),
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY)
  });
});
app.get("/health", (req, res) => {
  const healthy = mongoose.connection.readyState === 1;
  res.status(healthy ? 200 : 503).json({ status: healthy ? "ok" : "degraded" });
});
// 取得最新一筆 MQTT 訊息
app.get("/api/mqtt/latest", auth, (req, res) => {
  const user = req.user;

  if (!latestMqttMessage) {
    return res.json({ data: null });
  }

  const msg = latestMqttMessage.payload;

  if (user.role === "super_admin"){
    return res.json({ data: latestMqttMessage });
  }

  if (!tokenSystems(user).includes(msg.system_id)) {
    return res.json({ data: null });
  }

  return res.json({ data: latestMqttMessage });
});

// 讓前端抓取所有歷史資料
app.get("/api/defects", auth, async (req, res) => {
  try {
    const scope = await buildScopedDefectQuery(req.user, req.query);
    if (scope.error) return res.status(scope.status).json({ message: scope.error });

    const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 100, maxLimit: 500 });
    const [data, total] = await Promise.all([
      Defect.find(scope.query).sort({ timestamp: -1 }).skip(skip).limit(limit).select("-image_data").lean(),
      Defect.countDocuments(scope.query)
    ]);

    // 舊版前端預期陣列；未提供 page/limit 時維持相容。
    if (!req.query.page && !req.query.limit) return res.json(data);
    return res.json({ data, page, limit, total, totalPages: Math.ceil(total / limit) });
  } catch (error) {
    console.error("defects error:", error);
    res.status(500).json({ message: "抓取資料失敗" });
  }
});

app.post("/api/estop", auth, requireRole("super_admin", "tenant_admin"), async (req, res) => {
  try {
    const tenantId = cleanText(req.body?.tenant_id || req.user.tenant_id, 100);
    const systemId = cleanText(req.body?.system_id, 100);
    if (!systemId) return res.status(400).json({ message: "請指定要停止的 system_id" });
    if (!await canAccessSystem(req.user, tenantId, systemId)) {
      return res.status(403).json({ message: "無權限控制此機台" });
    }
    if (!isMqttConnected) return res.status(503).json({ message: "MQTT 尚未連線，無法送出急停" });

    const commandId = crypto.randomUUID();
    const stopPayload = JSON.stringify({
      command: "STOP",
      command_id: commandId,
      tenant_id: tenantId,
      system_id: systemId,
      requested_at: new Date().toISOString()
    });

    client.publish(`factory/control/${systemId}/estop`, stopPayload, { qos: 1 });
    client.publish("factory/control/estop", stopPayload, { qos: 1 });
    await writeAuditLog(req, {
      tenant_id: tenantId,
      system_id: systemId,
      action: "ESTOP_REQUESTED",
      target: `system:${systemId}`,
      command_id: commandId,
      payload: { command: "STOP" },
      status: "sent"
    });

    res.json({
      success: true,
      command_id: commandId,
      status: "sent",
      message: "緊急停止指令已送出，等待設備 ACK。"
    });
  } catch (error) {
    console.error("停機指令發送失敗：", error);
    res.status(500).json({ success: false, message: "停機指令發送失敗" });
  }
});

// ==========================================
// 5. 啟動伺服器大門
// ==========================================
app.get("/api/summary", auth, async (req, res) => {
  try {
    const scope = await buildScopedDefectQuery(req.user, req.query);
    if (scope.error) return res.status(scope.status).json({ message: scope.error });

    const data = await Defect.find(scope.query).sort({ timestamp: -1 }).select("status product").lean();
    const total = data.length;
    const okCount = data.filter(d => d.status === "OK").length;
    const ngCount = data.filter(d => d.status === "NG").length;
    const yieldRate = total > 0 ? ((okCount / total) * 100).toFixed(1) : "0.0";
    const defectRate = total > 0 ? ((ngCount / total) * 100).toFixed(1) : "0.0";
    const last20Ng = data.slice(0, 20).filter(d => d.status === "NG").length;

    const byProduct = {};
    data.forEach(d => {
      const product = d.product || "未分類";
      if (!byProduct[product]) byProduct[product] = { total: 0, ok: 0, ng: 0 };
      byProduct[product].total += 1;
      if (d.status === "OK") byProduct[product].ok += 1;
      if (d.status === "NG") byProduct[product].ng += 1;
    });

    res.json({ total, okCount, ngCount, yieldRate, defectRate, last20Ng, byProduct });
  } catch (err) {
    console.error("summary error:", err);
    res.status(500).json({ message: "統計失敗" });
  }
});

// ================= AI 助理：依照登入者權限讀取良率 / NG / 事件紀錄 =================
function summarizeDefectsForAi(defects) {
  const total = defects.length;
  const okCount = defects.filter(d => String(d.status || "").toUpperCase() === "OK").length;
  const ngCount = defects.filter(d => String(d.status || "").toUpperCase() === "NG").length;
  const yieldRate = total ? Number(((okCount / total) * 100).toFixed(1)) : 0;
  const defectRate = total ? Number(((ngCount / total) * 100).toFixed(1)) : 0;

  const byProduct = {};
  const bySystem = {};

  for (const d of defects) {
    const product = d.product || "未分類";
    const system = d.system_id || "未指定機台";
    const status = String(d.status || "").toUpperCase();

    if (!byProduct[product]) byProduct[product] = { total: 0, ok: 0, ng: 0, yieldRate: 0, defectRate: 0 };
    byProduct[product].total += 1;
    if (status === "OK") byProduct[product].ok += 1;
    if (status === "NG") byProduct[product].ng += 1;

    if (!bySystem[system]) bySystem[system] = { total: 0, ok: 0, ng: 0, yieldRate: 0, defectRate: 0 };
    bySystem[system].total += 1;
    if (status === "OK") bySystem[system].ok += 1;
    if (status === "NG") bySystem[system].ng += 1;
  }

  for (const item of Object.values(byProduct)) {
    item.yieldRate = item.total ? Number(((item.ok / item.total) * 100).toFixed(1)) : 0;
    item.defectRate = item.total ? Number(((item.ng / item.total) * 100).toFixed(1)) : 0;
  }

  for (const item of Object.values(bySystem)) {
    item.yieldRate = item.total ? Number(((item.ok / item.total) * 100).toFixed(1)) : 0;
    item.defectRate = item.total ? Number(((item.ng / item.total) * 100).toFixed(1)) : 0;
  }

  const recent = defects.slice(0, 12).map(d => ({
    time: d.timestamp,
    product: d.product || "未分類",
    status: d.status || "未知",
    system_id: d.system_id || "未指定",
    case_id: d.id || "-"
  }));

  const last20 = defects.slice(0, 20);
  const last20Ng = last20.filter(d => String(d.status || "").toUpperCase() === "NG").length;

  return { total, okCount, ngCount, yieldRate, defectRate, last20Ng, byProduct, bySystem, recent };
}

function buildLocalAiReply(message, summary) {
  const text = String(message || "").toLowerCase();
  const lines = [];

  lines.push(`目前資料總數 ${summary.total} 筆，OK ${summary.okCount} 筆，NG ${summary.ngCount} 筆。`);
  lines.push(`良率 = ${summary.yieldRate}%；NG率 = ${summary.defectRate}%。`);

  if (text.includes("mqtt") || text.includes("測試資料") || text.includes("payload") || text.includes("格式")) {
    lines.push("MQTT Topic 建議使用：factory/defect/report");
    lines.push('OK 範例：{"system_id":"你的機台ID","id":"case_001","status":"OK","product":"螺帽"}');
    lines.push('NG 範例：{"system_id":"你的機台ID","id":"case_002","status":"NG","product":"螺帽"}');
    lines.push("重點：system_id 一定要和網站登入後可查看的機台一致，status 建議只打 OK 或 NG。");
  }

  if (text.includes("沒資料") || text.includes("沒有資料") || text.includes("不顯示")) {
    lines.push("事件紀錄沒有資料時，優先檢查：1. MQTT topic 是否是 factory/defect/report；2. JSON 是否正確；3. system_id 是否存在；4. 該登入帳號是否有該機台權限；5. MongoDB defects 是否有存入資料。");
  }

  if (summary.total === 0) {
    lines.push("目前沒有符合條件的檢測紀錄，可以先從 MQTT 發送 OK/NG 測試資料，或確認機台 system_id 是否正確。");
    return lines.join("\n");
  }

  if (text.includes("良率") || text.includes("yield")) {
    lines.push("公式：良率 = OK ÷ (OK + NG) × 100%。如果良率偏低，建議先看 NG 最多的產品與最近 20 筆紀錄。");
  }

  if (text.includes("ng") || text.includes("瑕疵") || text.includes("異常") || text.includes("警報")) {
    lines.push(`最近 20 筆中有 ${summary.last20Ng} 筆 NG。若連續 NG 過多，建議先停機檢查鏡頭、光源、治具位置與產品分類是否正確。`);
  }

  const productRows = Object.entries(summary.byProduct)
    .sort((a, b) => b[1].ng - a[1].ng || b[1].total - a[1].total)
    .slice(0, 5);

  if (productRows.length) {
    lines.push("產品統計：");
    for (const [name, item] of productRows) {
      lines.push(`- ${name}：總數 ${item.total}，OK ${item.ok}，NG ${item.ng}，良率 ${item.yieldRate}%，NG率 ${item.defectRate}%`);
    }
  }

  lines.push("若要由 Gemini AI 進行自然語言分析，請在 Render Environment Variables 加上 GEMINI_API_KEY。");
  return lines.join("\n");
}

function extractGeminiText(responseData) {
  const candidates = Array.isArray(responseData?.candidates) ? responseData.candidates : [];
  const text = candidates
    .flatMap(candidate => candidate?.content?.parts || [])
    .map(part => typeof part?.text === "string" ? part.text : "")
    .filter(Boolean)
    .join("\n")
    .trim();

  if (text) return text;

  const blockReason = responseData?.promptFeedback?.blockReason;
  if (blockReason) {
    return `Gemini 因安全限制未產生回答（${blockReason}）。請換一種問法再試一次。`;
  }

  return "Gemini 已回應，但沒有可顯示的文字內容。";
}

app.get("/api/ai/status", auth, (req, res) => {
  const model = process.env.GEMINI_MODEL || "gemini-3.1-flash-lite";
  res.json({
    enabled: Boolean(process.env.GEMINI_API_KEY),
    provider: "gemini",
    model,
    mode: process.env.GEMINI_API_KEY ? "gemini" : "local-summary"
  });
});

app.post("/api/ai/chat", auth, aiLimiter, async (req, res) => {
  try {
    const { message, system_id, tenant_id, products } = req.body || {};

    if (!message || !String(message).trim()) {
      return res.status(400).json({ message: "請輸入問題" });
    }

    if (String(message).length > 2000) {
      return res.status(400).json({ message: "問題文字不可超過 2000 字" });
    }

    const scope = await buildScopedDefectQuery(req.user, { system_id, tenant_id, products });
    if (scope.error) return res.status(scope.status).json({ message: scope.error });
    const defects = await Defect.find(scope.query)
      .sort({ timestamp: -1 })
      .limit(500)
      .select("-image_data")
      .lean();
    const summary = summarizeDefectsForAi(defects);

    if (!process.env.GEMINI_API_KEY) {
      return res.json({
        mode: "local-summary",
        provider: "local",
        reply: buildLocalAiReply(message, summary),
        summary
      });
    }

    const systemPrompt = `你是「瑕疵辨識與分流系統」的 AI 助理。

回答規則：
1. 一律使用繁體中文，直接回答問題，不要打招呼、不要自我介紹。
2. 一般回答控制在 250～450 個中文字內；只有使用者明確要求詳細說明時才可加長。
3. 最多使用 3 個小標題，每個小標題下以精簡條列呈現。
4. 不要每次重複所有產品統計，只列出與問題直接相關的數據。
5. 使用者問「NG 最多」時，要分清楚：
   - NG 數量最多：比較 ng 數量。
   - NG 率最高：比較 defectRate。
   若兩者不是同一產品，必須分別說明。
6. 使用者問 MQTT 範例時，只提供必要欄位與一組 OK、一組 NG 範例，不要再附上過長的通用說明。
7. 若資料不足，明確說明只能提出可能原因，不可把推測當成事實。
8. 回答可以使用 Markdown，但避免過多分隔線、重複標題或冗長前言。
9. 先給結論，再給必要的操作步驟。

你只能根據下列系統功能與統計資料回答，不要假裝看到不存在的資料。
系統功能：WebCam 即時預覽、MQTT 訊息接收、MongoDB 瑕疵紀錄、登入權限、首頁儀表板、事件紀錄、系統設定、緊急停止、產品良率與 NG 率分析。
公式：良率 = OK ÷ (OK + NG) × 100%；NG率 = NG ÷ (OK + NG) × 100%。
排錯時優先提供可實際操作的建議，例如檢查 system_id、tenant_id、產品分類、MQTT payload、鏡頭、光源、治具位置，以及資料是否寫入 MongoDB。`;

    const userPrompt = `使用者問題：${String(message).slice(0, 2000)}

目前可用統計資料：
${JSON.stringify(summary, null, 2).slice(0, 12000)}`;
    const model = process.env.GEMINI_MODEL || "gemini-3.1-flash-lite";

    try {
      const aiResponse = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        {
          systemInstruction: {
            parts: [{ text: systemPrompt }]
          },
          contents: [
            {
              role: "user",
              parts: [{ text: userPrompt }]
            }
          ],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 700
          }
        },
        {
          headers: {
            "x-goog-api-key": process.env.GEMINI_API_KEY,
            "Content-Type": "application/json"
          },
          timeout: 30000
        }
      );

      return res.json({
        mode: "gemini",
        provider: "gemini",
        model,
        reply: extractGeminiText(aiResponse.data),
        summary
      });
    } catch (geminiError) {
      const status = geminiError?.response?.status;
      const apiMessage = geminiError?.response?.data?.error?.message || geminiError.message;
      console.error("Gemini AI chat error:", geminiError?.response?.data || geminiError.message);

      const reason = status === 429
        ? "Gemini 免費額度或速率限制已達上限"
        : "Gemini 暫時無法連線";

      return res.json({
        mode: "local-summary-fallback",
        provider: "local",
        model,
        warning: `${reason}，已自動切換成本機統計模式。`,
        reply: `${reason}，已自動切換成本機統計模式。

${buildLocalAiReply(message, summary)}`,
        summary,
        error_code: status || null,
        error_detail: process.env.NODE_ENV === "development" ? apiMessage : undefined
      });
    }
  } catch (err) {
    console.error("AI chat error:", err?.response?.data || err.message);
    return res.status(500).json({
      message: "AI 助理暫時無法回覆，請稍後再試。",
      fallback: process.env.NODE_ENV === "development" ? err.message : undefined
    });
  }
});

app.post("/api/current-product", auth, requireRole("super_admin", "tenant_admin"), async (req, res) => {
  try {
    const tenantId = cleanText(req.body?.tenant_id || req.user.tenant_id, 100);
    const systemId = cleanText(req.body?.system_id, 100);
    const product = cleanText(req.body?.product, 100);
    if (!tenantId || !systemId || !product) return res.status(400).json({ message: "缺少參數" });
    if (!await canAccessSystem(req.user, tenantId, systemId)) {
      return res.status(403).json({ message: "無權限設定此機台產品" });
    }

    const result = await mongoose.connection.collection("systems").updateOne(
      { tenant_id: tenantId, system_id: systemId },
      { $set: { current_product: product, updatedAt: new Date() } }
    );
    if (!result.matchedCount) return res.status(404).json({ message: "找不到機台" });

    await writeAuditLog(req, {
      tenant_id: tenantId,
      system_id: systemId,
      action: "CURRENT_PRODUCT_UPDATED",
      target: `system:${systemId}`,
      payload: { product }
    });
    res.json({ message: "產品設定成功" });
  } catch (err) {
    console.error("current-product error:", err);
    res.status(500).json({ message: "設定失敗" });
  }
});

app.get("/api/admin/audit-logs", auth, requireRole("super_admin", "tenant_admin"), async (req, res) => {
  try {
    const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 50, maxLimit: 200 });
    const query = req.user.role === "super_admin" ? {} : { tenant_id: req.user.tenant_id };
    const [data, total] = await Promise.all([
      AuditLog.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      AuditLog.countDocuments(query)
    ]);
    res.json({ data, page, limit, total, totalPages: Math.ceil(total / limit) });
  } catch (err) {
    console.error("audit logs error:", err);
    res.status(500).json({ message: "讀取操作紀錄失敗" });
  }
});

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  const requestId = crypto.randomUUID();
  console.error(`[${requestId}]`, err);
  const isCorsError = err?.message?.includes("CORS");
  res.status(isCorsError ? 403 : 500).json({
    message: isCorsError ? "來源不被允許" : "伺服器處理失敗",
    request_id: requestId,
    detail: process.env.NODE_ENV === "development" ? err.message : undefined
  });
});
