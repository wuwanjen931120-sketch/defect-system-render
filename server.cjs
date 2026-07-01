// ==========================================
// 1. 套件引入與環境設定 (地基)
// ==========================================
const dns = require("dns");
// Render 有時候連 Gmail SMTP 會先走 IPv6，但 Render 環境可能沒有 IPv6 出口，
// 會出現 connect ENETUNREACH 2607:f8b0...:465。這裡強制 DNS 優先使用 IPv4。
try { dns.setDefaultResultOrder("ipv4first"); } catch (_) {}
// 不指定 dns.setServers，讓 Render 使用平台自己的 DNS；後面寄信會再強制解析 IPv4。
require("dotenv").config(); // 讀取保險箱 .env

const express = require("express");
const cors = require("cors");
const path = require("path");
const axios = require("axios");


const mongoose = require("mongoose");
const mqtt = require("mqtt");

const nodemailer = require("nodemailer");

// 🔥 在這裡加
const jwt = require("jsonwebtoken");

// ==========================================
// 2. 伺服器、資料庫與寄信系統設定 (內部部門)
// ==========================================
const app = express();
// ================= 信箱驗證碼暫存 =================
// 注意：這是本機測試版，重開 server 後驗證碼會消失
const loginCodeStore = new Map();

function makeLoginCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}
// ================= 登入系統 =================
const JWT_SECRET = process.env.JWT_SECRET;


app.use(cors());
app.use(express.json());

// Render 部署：由同一個 Node.js 服務提供前端網頁
app.use(express.static(path.join(__dirname, "public")));


app.post("/api/register", async (req, res) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

  const { company, username, password } = req.body;

if (!company || !username || !password) {
  await session.abortTransaction();
  session.endSession();
  return res.status(400).json({ message: "資料不完整" });
}

const normalizedUsername = username.toLowerCase().trim();

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
      company,
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





app.post("/api/login", async (req, res) => {
  try {
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
    } else {
      systems = await systemsCol.find({
        tenant_id: user.tenant_id
      }).toArray();
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
        role: u.role
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

    const data = await mongoose.connection
      .collection(name)
      .find({})
      .sort({ _id: -1 })
      .limit(200)
      .toArray();

    res.json(data);

  } catch (err) {
    console.error("Mongo admin error:", err);
    res.status(500).json({ message: "讀取資料失敗" });
  }
});

app.get("/api/predict", async (req,res)=>{
  const data = await Defect.find().sort({timestamp:-1}).limit(20);

  let ng = data.filter(d=>d.status==="NG").length;

  let risk = ng > 5 ? "高風險" : "正常";

  res.json({
    ng_count: ng,
    prediction: risk
  });
});
app.post("/api/admin/create-user", auth, requireRole("super_admin", "tenant_admin"), async (req, res) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const { company, username, password, role, tenant_id } = req.body;

    const usersCol = mongoose.connection.collection("users");
    const tenantsCol = mongoose.connection.collection("tenants");
    const systemsCol = mongoose.connection.collection("systems");

    if (!username || !password || !role) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: "資料不完整" });
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

    const bcrypt = require("bcrypt");
    const hash = await bcrypt.hash(password, 10);

    await usersCol.insertOne({
      username,
      password: hash,
      tenant_id: finalTenantId,
      role,
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



// 📧 Gmail 郵差機車與鑰匙設定
// Render 有時候仍會把 smtp.gmail.com 連到 IPv6，導致 ENETUNREACH。
// 這裡改成「寄信時」依序嘗試：465 / 587 / 直接解析 IPv4 位址，避免卡在 IPv6。
async function resolveGmailIPv4() {
  const addresses = await dns.promises.resolve4("smtp.gmail.com");
  if (!addresses || addresses.length === 0) {
    throw new Error("無法解析 smtp.gmail.com 的 IPv4 位址");
  }
  return addresses[0];
}

function createSmtpTransport(options) {
  return nodemailer.createTransport({
    host: options.host,
    port: options.port,
    secure: options.secure,
    requireTLS: options.requireTLS || false,
    family: 4,
    connectionTimeout: 20000,
    greetingTimeout: 20000,
    socketTimeout: 30000,
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_PASS
    },
    tls: {
      servername: "smtp.gmail.com",
      minVersion: "TLSv1.2"
    }
  });
}

async function sendMailSafe(mailOptions) {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_PASS) {
    throw new Error("Render Environment 缺少 GMAIL_USER 或 GMAIL_PASS");
  }

  const attempts = [
    { label: "Gmail 465 hostname IPv4", host: "smtp.gmail.com", port: 465, secure: true },
    { label: "Gmail 587 hostname IPv4", host: "smtp.gmail.com", port: 587, secure: false, requireTLS: true }
  ];

  try {
    const ipv4 = await resolveGmailIPv4();
    attempts.push(
      { label: `Gmail 465 direct IPv4 ${ipv4}`, host: ipv4, port: 465, secure: true },
      { label: `Gmail 587 direct IPv4 ${ipv4}`, host: ipv4, port: 587, secure: false, requireTLS: true }
    );
  } catch (err) {
    console.warn("⚠️ Gmail IPv4 解析失敗，先改用 hostname 嘗試：", err.message);
  }

  let lastError = null;

  for (const attempt of attempts) {
    try {
      console.log("📧 嘗試寄信方式：", attempt.label);
      const mailer = createSmtpTransport(attempt);
      const info = await mailer.sendMail(mailOptions);
      console.log("✅ Gmail 驗證信寄出：", info.messageId || attempt.label);
      return info;
    } catch (err) {
      lastError = err;
      console.error(`❌ ${attempt.label} 寄信失敗：`, err.message);
    }
  }

  throw new Error(`Gmail SMTP 全部嘗試失敗：${lastError ? lastError.message : "未知錯誤"}`);
}

// ================= 寄送登入驗證碼 =================
app.post("/api/login/send-code", async (req, res) => {
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

    const code = makeLoginCode();

    loginCodeStore.set(normalizedEmail, {
      code,
      expiresAt: Date.now() + 5 * 60 * 1000
    });

    await sendMailSafe({
      from: process.env.GMAIL_USER,
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
      message: "驗證碼寄送失敗：" + err.message
    });
  }
});

// ================= 驗證登入驗證碼並登入 =================
app.post("/api/login/verify-code", async (req, res) => {
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
      return res.status(400).json({ message: "驗證碼錯誤" });
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
    } else {
      systems = await systemsCol.find({
        tenant_id: user.tenant_id
      }).toArray();
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
      message: "驗證登入失敗：" + err.message
    });
  }
});

// 🔔 異常警報計數器
const ngCounterMap = {};
const ALERT_THRESHOLD = 3; // 連續 3 個 NG 就寄信

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
  tenant_id: String,   // 🔥加這行
  user_id: String,
  system_id: String,
  id: String,
  status: String,
  product: String,
  timestamp: { type: Date, default: Date.now }
});

const Defect = mongoose.model("Defect", defectSchema);

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
  client.subscribe("factory/defect/report");
});

client.on("offline", () => {
  isMqttConnected = false;
});

client.on("error", (err) => {
  isMqttConnected = false;
  console.error("❌ MQTT 錯誤：", err);
});



client.on("message", async (topic, message) => {
  
  if (topic === "factory/defect/report") {
    try {

      const data = JSON.parse(message.toString());



      const systemId = data.system_id;

      if (!systemId) {
        console.log("❌ 缺少 system_id");
        return;
      }

      const systemDoc = await mongoose.connection
        .collection("systems")
        .findOne({ system_id: systemId });

      if (!systemDoc) {
        console.log("❌ 找不到機台");
        return;
      }

      const userDoc = await mongoose.connection
        .collection("users")
        .findOne({ tenant_id: systemDoc.tenant_id });

      const owner = {
        user_id: userDoc?.username || "unknown",
        tenant_id: systemDoc.tenant_id
      };

      // ⭐ 多產品
      if (Array.isArray(data.items)) {

  console.log("📦 多產品資料");

  await Defect.insertMany(
    data.items.map(item => ({
      tenant_id: owner.tenant_id,
      user_id: owner.user_id,
      system_id: systemId,
      id: item.id,
      status: item.status,
      product: item.product,
      timestamp: new Date()
    }))
  );

  latestMqttMessage = {
  payload: {
    ...data.items[data.items.length - 1],
    system_id: systemId
  },
  timestamp: new Date()
};
} else {

  console.log("📦 單產品資料");

  const newDefect = new Defect({
    tenant_id: owner.tenant_id,
    user_id: owner.user_id,
    system_id: systemId,
    id: data.id,
    status: data.status,
    product: data.product || systemDoc?.current_product || "未分類",
    timestamp: new Date()
  });

  await newDefect.save();

  latestMqttMessage = {
  payload: {
    ...data,
    system_id: systemId
  },
  timestamp: new Date()
};
}

// ⭐⭐⭐ 補這段 ⭐⭐⭐
console.log("✅ 已存入 MongoDB");

// 🔥🔥🔥 在這裡貼 🔥🔥🔥
const counterKey = `${owner.user_id}_${systemId}`;

if (!ngCounterMap[counterKey]) {
  ngCounterMap[counterKey] = 0;
}

const ngCount = Array.isArray(data.items)
  ? data.items.filter(i => i.status === "NG").length
  : (data.status === "NG" ? 1 : 0);

if (ngCount > 0) {
  ngCounterMap[counterKey] += ngCount;
} else {
  ngCounterMap[counterKey] = 0;
}

if (ngCounterMap[counterKey] >= ALERT_THRESHOLD) {
  console.log("🚨 連續NG警報");

  await sendMailSafe({
    from: process.env.GMAIL_USER,
    to: process.env.GMAIL_USER,
    subject: "🚨 產線異常",
    text: `機台 ${systemId} 已連續 ${ALERT_THRESHOLD} 次 NG`
  });

  ngCounterMap[counterKey] = 0;
}

} catch (error) {
  console.error("❌ MQTT 處理錯誤:", error);
}

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
    const { tenant_id } = req.query;

    if (!tenant_id) {
      return res.status(400).json({ message: "缺少 tenant_id" });
    }

    const tenant = await mongoose.connection
      .collection("tenants")
      .findOne({ tenant_id });

    res.json({
      success: true,
      data: {
        site_title: tenant?.company || "瑕疵辨識與分流系統",
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
app.get("/api/health", (req, res) => {
  res.json({ mqttConnected: isMqttConnected });
});
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
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

  if (!user.systems.includes(msg.system_id)) {
    return res.json({ data: null });
  }

  return res.json({ data: latestMqttMessage });
});

// 讓前端抓取所有歷史資料
app.get("/api/defects", auth, async (req, res) => {
  try {
    const { system_id, tenant_id, products } = req.query;

    const query = {};   // ⭐ 一定要先宣告

    // ⭐ 多產品過濾
    if (products) {
      const productArray = products
        .split(",")
        .map(p => p.trim());

      query.product = { $in: productArray };
    }

    // 👑 權限
    if (req.user.role === "super_admin") {
      if (tenant_id) query.tenant_id = tenant_id;
    } else {
      query.tenant_id = req.user.tenant_id;
    }

    // 🔧 機台
    if (system_id) {
      query.system_id = system_id;
    }

    const data = await Defect.find(query).sort({ timestamp: -1 });

    res.json(data);

  } catch (error) {
    console.error("defects error:", error);
    res.status(500).json({ message: "抓取資料失敗" });
  }
});

app.post("/api/estop", auth, (req, res) => {
  try {
    const stopPayload = JSON.stringify({ command: "STOP" });
    client.publish("factory/control/estop", stopPayload);
    console.log("\n🚨 [總部警告] 已接收前端急停請求，並發送停機廣播！");
    res.json({
      success: true,
      message: "已成功發送緊急停止指令！產線即將斷電。"
    });
  } catch (error) {
    console.log("❌ 停機指令發送失敗：", error);
    res.status(500).json({
      success: false,
      message: "停機指令發送失敗"
    });
  }
});

// ==========================================
// 5. 啟動伺服器大門
// ==========================================
const PORT = process.env.PORT || 5000;

app.get("/api/summary", auth, async (req, res) => {
  try {
   const { system_id, tenant_id, products } = req.query;

    const query = {};

    if (products) {
  const productArray = products
    .split(",")
    .map(p => p.trim());

  query.product = { $in: productArray };
}

// 👑 super_admin：可以切 tenant
if (req.user.role === "super_admin") {
  if (tenant_id) {
    query.tenant_id = tenant_id;
  }
}
// 🏢 tenant_admin：只能看自己 tenant
else if (req.user.role === "tenant_admin") {
  query.tenant_id = req.user.tenant_id;
}
// 👤 一般 user：只能看自己 tenant + system
else {
  query.tenant_id = req.user.tenant_id;

  if (Array.isArray(req.user.systems) && req.user.systems.length > 0) {
    query.system_id = { $in: req.user.systems };
  }
}

if (system_id) {
  if (req.user.role === "super_admin") {
    query.system_id = system_id;
  } else {
    // 🔥 限制只能自己機台
    if (req.user.systems.includes(system_id)) {
      query.system_id = system_id;
    }
  }
}

    const data = await Defect.find(query).sort({ timestamp: -1 });

    const total = data.length;
    const okCount = data.filter(d => String(d.status).toUpperCase() === "OK").length;
    const ngCount = data.filter(d => String(d.status).toUpperCase() === "NG").length;
    const yieldRate = total > 0 ? ((okCount / total) * 100).toFixed(1) : "0.0";
    const defectRate = total > 0 ? ((ngCount / total) * 100).toFixed(1) : "0.0";

    const last20 = data.slice(0, 20);
    const last20Ng = last20.filter(d => String(d.status).toUpperCase() === "NG").length;

    const byProduct = {};
    data.forEach(d => {
      const product = d.product || "未分類";
      const status = String(d.status || "").toUpperCase();

      if (!byProduct[product]) {
        byProduct[product] = { total: 0, ok: 0, ng: 0 };
      }

      byProduct[product].total++;
      if (status === "OK") byProduct[product].ok++;
      if (status === "NG") byProduct[product].ng++;
    });

    res.json({
      total,
      okCount,
      ngCount,
      yieldRate,
      defectRate,
      last20Ng,
      byProduct
    });
  } catch (err) {
    console.error("summary error:", err);
    res.status(500).json({ message: "統計失敗" });
  }
});


// ================= AI 助理：依照登入者權限讀取良率 / NG / 事件紀錄 =================
function buildAiQuery(user, params = {}) {
  const query = {};

  const products = params.products;
  if (products) {
    const productArray = String(products)
      .split(",")
      .map(p => p.trim())
      .filter(Boolean);
    if (productArray.length) query.product = { $in: productArray };
  }

  const requestedTenantId = params.tenant_id;
  const requestedSystemId = params.system_id;
  const userSystems = Array.isArray(user.systems) ? user.systems : [];

  if (user.role === "super_admin") {
    if (requestedTenantId) query.tenant_id = requestedTenantId;
    if (requestedSystemId) query.system_id = requestedSystemId;
    return query;
  }

  query.tenant_id = user.tenant_id;

  if (user.role === "tenant_admin") {
    if (requestedSystemId) {
      if (userSystems.length === 0 || userSystems.includes(requestedSystemId)) {
        query.system_id = requestedSystemId;
      } else {
        query.system_id = "__NO_PERMISSION__";
      }
    }
    return query;
  }

  if (userSystems.length > 0) {
    query.system_id = { $in: userSystems };
  }

  if (requestedSystemId) {
    if (userSystems.includes(requestedSystemId)) {
      query.system_id = requestedSystemId;
    } else {
      query.system_id = "__NO_PERMISSION__";
    }
  }

  return query;
}

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

  lines.push("若要更像 GPT 一樣用自然語言分析，請在 Render Environment Variables 加上 OPENAI_API_KEY。");
  return lines.join("\n");
}

function extractOpenAIText(responseData) {
  if (responseData?.output_text) return responseData.output_text;

  const output = responseData?.output || [];
  for (const item of output) {
    const content = item?.content || [];
    for (const part of content) {
      if (part?.text) return part.text;
      if (part?.type === "output_text" && part?.text) return part.text;
    }
  }

  return "AI 已回應，但無法讀取文字內容。";
}

app.get("/api/ai/status", auth, (req, res) => {
  res.json({
    enabled: Boolean(process.env.OPENAI_API_KEY),
    model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
    mode: process.env.OPENAI_API_KEY ? "openai" : "local-summary"
  });
});

app.post("/api/ai/chat", auth, async (req, res) => {
  try {
    const { message, system_id, tenant_id, products } = req.body || {};

    if (!message || !String(message).trim()) {
      return res.status(400).json({ message: "請輸入問題" });
    }

    const query = buildAiQuery(req.user, { system_id, tenant_id, products });
    const defects = await Defect.find(query).sort({ timestamp: -1 }).limit(500).lean();
    const summary = summarizeDefectsForAi(defects);

    if (!process.env.OPENAI_API_KEY) {
      return res.json({
        mode: "local-summary",
        reply: buildLocalAiReply(message, summary),
        summary
      });
    }

    const systemPrompt = `你是「瑕疵辨識與分流系統」的 AI 助理。請用繁體中文回答，語氣要像在教初學者。
你只能根據下列系統功能與統計資料回答，不要假裝看到不存在的資料。
系統功能：WebCam 即時預覽、MQTT 訊息接收、MongoDB 瑕疵紀錄、登入權限、首頁儀表板、事件紀錄、系統設定、緊急停止、產品良率與 NG 率分析。
公式：良率 = OK ÷ (OK + NG) × 100%；NG率 = NG ÷ (OK + NG) × 100%。
回答時優先給可操作建議，例如檢查 system_id、tenant_id、產品分類、MQTT payload、鏡頭光源、資料是否有存入 MongoDB。`;

    const aiInput = [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `使用者問題：${String(message).slice(0, 2000)}\n\n目前可用統計資料：\n${JSON.stringify(summary, null, 2).slice(0, 12000)}`
      }
    ];

    const aiResponse = await axios.post(
      "https://api.openai.com/v1/responses",
      {
        model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
        input: aiInput,
        temperature: 0.2
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        },
        timeout: 30000
      }
    );

    res.json({
      mode: "openai",
      reply: extractOpenAIText(aiResponse.data),
      summary
    });
  } catch (err) {
    console.error("AI chat error:", err?.response?.data || err.message);
    res.status(500).json({
      message: "AI 助理暫時無法回覆，請檢查 OPENAI_API_KEY 或網路連線。",
      fallback: err.message
    });
  }
});

app.post("/api/current-product", auth, async (req, res) => {
  try {
    const { tenant_id, system_id, product } = req.body;

    if (!tenant_id || !system_id || !product) {
      return res.status(400).json({ message: "缺少參數" });
    }

    await mongoose.connection.collection("systems").updateOne(
      { tenant_id, system_id },
      { $set: { current_product: product } }
    );

    res.json({ message: "產品設定成功" });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "設定失敗" });
  }
});

