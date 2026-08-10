"use strict";

const setStatus = (id, text, state = "ok") => {
  const el = document.getElementById(id);
  if (!el) return;

  el.textContent = text;
  el.className = "";

  if (state === "ok") {
    el.classList.add("status-ok");
  } else if (state === "error") {
    el.classList.add("status-error");
  } else {
    el.classList.add("status-warn");
  }
};

const formatUptime = (seconds) => {
  const total = Number(seconds || 0);

  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);

  return `${days} 天 ${hours} 小時 ${minutes} 分`;
};

async function loadHealth() {
  const overall = document.getElementById("overall");
  overall.textContent = "正在檢查系統狀態...";

  try {
    const response = await fetch("/api/health", {
      credentials: "include",
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();

    const databaseOk =
      data.database === "connected" ||
      data.database === "ok" ||
      data.database === true;

    const emailOk =
      data.email === "verified" ||
      data.email === "ok" ||
      data.email === true;

    const mqttOk =
      data.mqtt === "connected" ||
      data.mqtt === "ok" ||
      data.mqtt === true;

    setStatus(
      "database",
      databaseOk ? "正常" : String(data.database ?? "異常"),
      databaseOk ? "ok" : "error"
    );

    setStatus(
      "email",
      emailOk ? "正常" : String(data.email ?? "異常"),
      emailOk ? "ok" : "error"
    );

    setStatus(
      "mqtt",
      mqttOk ? "已連線" : String(data.mqtt ?? "未連線"),
      mqttOk ? "ok" : "error"
    );

    const geminiEnabled =
      data.gemini === true ||
      data.gemini === "configured" ||
      data.ai === "configured";

    setStatus(
      "gemini",
      geminiEnabled ? "已設定" : "未回報",
      geminiEnabled ? "ok" : "warn"
    );

    document.getElementById("version").textContent =
      data.version ?? "-";

    document.getElementById("uptime").textContent =
      formatUptime(data.uptime);

    overall.textContent =
      databaseOk && emailOk && mqttOk
        ? "✅ 主要服務目前正常"
        : "⚠️ 部分服務需要檢查";
  } catch (error) {
    overall.textContent = "❌ 無法取得系統健康狀態";

    setStatus("database", "無法確認", "error");
    setStatus("email", "無法確認", "error");
    setStatus("mqtt", "無法確認", "error");
    setStatus("gemini", "無法確認", "error");

    console.error("health check failed", error);
  }
}

document
  .getElementById("refreshBtn")
  .addEventListener("click", loadHealth);

loadHealth();
