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

const machineConnectionState = (machine, now = Date.now()) => {
  if (!machine?.last_report_at) {
    return "never";
  }

  const lastReport = new Date(machine.last_report_at).getTime();
  if (!Number.isFinite(lastReport)) {
    return "never";
  }

  const ageSeconds = Math.max(0, (now - lastReport) / 1000);
  if (ageSeconds <= 10) return "online";
  if (ageSeconds <= 30) return "unstable";
  return "offline";
};

async function loadMachineConnection() {
  const tenantId = sessionStorage.getItem("tenant_id") || "";
  const role = sessionStorage.getItem("role") || "";
  const params = new URLSearchParams();

  if (role === "super_admin" && tenantId) {
    params.set("tenant_id", tenantId);
  }

  const url = params.toString()
    ? `/api/machine-status?${params.toString()}`
    : "/api/machine-status";

  try {
    const response = await fetch(url, {
      credentials: "include",
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    const machines = Array.isArray(data?.machines) ? data.machines : [];

    if (!machines.length) {
      setStatus("machineConnection", "尚無機台", "warn");
      const detail = document.getElementById("machineConnectionDetail");
      if (detail) detail.textContent = "目前沒有可查看的機台";
      return { healthy: false, total: 0 };
    }

    const counts = {
      online: 0,
      unstable: 0,
      offline: 0,
      never: 0
    };

    const now = Date.now();
    machines.forEach((machine) => {
      counts[machineConnectionState(machine, now)] += 1;
    });

    const total = machines.length;
    const mainState =
      counts.offline > 0 || counts.never > 0
        ? "error"
        : counts.unstable > 0
          ? "warn"
          : "ok";

    let label = `${counts.online} / ${total} 台正常`;
    if (counts.online === total) {
      label = `全部 ${total} 台正常連線`;
    } else if (counts.online === 0 && counts.unstable === 0) {
      label = "目前無正常連線機台";
    }

    setStatus("machineConnection", label, mainState);

    const detail = document.getElementById("machineConnectionDetail");
    if (detail) {
      const parts = [`正常 ${counts.online}`];
      if (counts.unstable) parts.push(`不穩 ${counts.unstable}`);
      if (counts.offline) parts.push(`離線 ${counts.offline}`);
      if (counts.never) parts.push(`尚未連線 ${counts.never}`);
      detail.textContent = parts.join("｜");
    }

    return {
      healthy: mainState === "ok",
      total,
      counts
    };
  } catch (error) {
    console.error("machine connection check failed", error);
    setStatus("machineConnection", "無法確認", "error");
    const detail = document.getElementById("machineConnectionDetail");
    if (detail) detail.textContent = "機台狀態讀取失敗";
    return { healthy: false, total: 0 };
  }
}

async function loadHealth() {
  const overall = document.getElementById("overall");
  overall.textContent = "正在檢查系統狀態...";

  try {
    const [response, machineResult] = await Promise.all([
      fetch("/api/health", {
        credentials: "include",
        cache: "no-store"
      }),
      loadMachineConnection()
    ]);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();

    const databaseOk = data.database_connected === true;
    const emailOk = data.mail_ready === true;
    const mqttOk = data.mqtt_connected === true;

    setStatus(
      "database",
      databaseOk ? "正常" : "資料庫未連線",
      databaseOk ? "ok" : "error"
    );

    setStatus(
      "email",
      emailOk ? "正常" : "Email 服務未就緒",
      emailOk ? "ok" : "error"
    );

    setStatus(
      "mqtt",
      mqttOk ? "已連線" : "未連線",
      mqttOk ? "ok" : "error"
    );

    const geminiEnabled = data.gemini_configured === true;

    setStatus(
      "gemini",
      geminiEnabled ? "已設定" : "未回報",
      geminiEnabled ? "ok" : "warn"
    );

    document.getElementById("uptime").textContent =
      formatUptime(data.uptime_seconds);

    const coreServicesOk = databaseOk && emailOk && mqttOk;
    overall.textContent = coreServicesOk && machineResult.healthy
      ? "✅ 主要服務與機台連線目前正常"
      : "⚠️ 部分服務或機台連線需要檢查";
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
