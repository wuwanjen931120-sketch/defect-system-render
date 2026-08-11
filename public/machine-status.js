"use strict";

let machineStatusFilter = "all";
let machineStatusData = [];
let machineStatusTimer = null;

function machineText(value) {
  return String(value ?? "");
}

function formatMachineTime(value) {
  if (!value) return "尚未回報";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "時間格式異常";
  }

  return date.toLocaleString("zh-TW", {
    hour12: false
  });
}

function estopStatusText(status) {
  if (!status || status === "none") {
    return "無急停紀錄";
  }

  if (status === "pending_ack") {
    return "等待 ACK";
  }

  if (status === "acknowledged") {
    return "已確認";
  }

  if (status === "timed_out") {
    return "ACK 逾時";
  }

  if (status === "success") {
    return "已完成";
  }

  if (status === "failed") {
    return "失敗";
  }

  return machineText(status);
}

function setMachineMessage(message, type = "") {
  const el = document.getElementById("machineStatusMessage");

  if (!el) return;

  el.textContent = message || "";
  el.className = "machineStatusMessage";

  if (type) {
    el.classList.add(type);
  }
}

function createInfoRow(label, value) {
  const row = document.createElement("div");
  row.className = "machineInfoRow";

  const labelEl = document.createElement("span");
  labelEl.className = "machineInfoLabel";
  labelEl.textContent = label;

  const valueEl = document.createElement("span");
  valueEl.className = "machineInfoValue";
  valueEl.textContent = value;

  row.append(labelEl, valueEl);

  return row;
}

function createStat(label, value) {
  const box = document.createElement("div");
  box.className = "machineStat";

  const labelEl = document.createElement("span");
  labelEl.textContent = label;

  const valueEl = document.createElement("strong");
  valueEl.textContent = value;

  box.append(labelEl, valueEl);

  return box;
}

function renderMachineSummary() {
  const all = machineStatusData.length;

  const online = machineStatusData.filter(
    machine => machine.online === true
  ).length;

  const offline = all - online;

  const allEl = document.getElementById("machineCountAll");
  const onlineEl = document.getElementById("machineCountOnline");
  const offlineEl = document.getElementById("machineCountOffline");

  if (allEl) allEl.textContent = String(all);
  if (onlineEl) onlineEl.textContent = String(online);
  if (offlineEl) offlineEl.textContent = String(offline);
}

function filteredMachines() {
  if (machineStatusFilter === "online") {
    return machineStatusData.filter(
      machine => machine.online === true
    );
  }

  if (machineStatusFilter === "offline") {
    return machineStatusData.filter(
      machine => machine.online !== true
    );
  }

  return machineStatusData;
}

function renderMachines() {
  const container = document.getElementById("machineCards");

  if (!container) return;

  container.replaceChildren();

  const machines = filteredMachines();

  if (!machines.length) {
    const empty = document.createElement("div");
    empty.className = "machineEmpty";
    empty.textContent = "目前沒有符合條件的機台。";

    container.appendChild(empty);
    return;
  }

  machines.forEach(machine => {
    const card = document.createElement("article");

    card.className = machine.online
      ? "machineCard machineCardOnline"
      : "machineCard machineCardOffline";

    const header = document.createElement("div");
    header.className = "machineCardHeader";

    const heading = document.createElement("div");

    const name = document.createElement("div");
    name.className = "machineName";
    name.textContent =
      machineText(machine.name) || "未命名機台";

    const id = document.createElement("div");
    id.className = "machineId";
    id.textContent =
      machineText(machine.system_id) || "-";

    heading.append(name, id);

    const badge = document.createElement("span");

    badge.className = machine.online
      ? "machineStatusBadge machineStatusOnline"
      : "machineStatusBadge machineStatusOffline";

    badge.textContent = machine.online
      ? "🟢 Online"
      : "🔴 Offline";

    header.append(heading, badge);

    const info = document.createElement("div");
    info.className = "machineInfo";

    info.append(
      createInfoRow(
        "目前產品",
        machineText(machine.current_product) || "未設定"
      ),
      createInfoRow(
        "最後回報",
        formatMachineTime(machine.last_report_at)
      )
    );

    const stats = document.createElement("div");
    stats.className = "machineStats";

    stats.append(
      createStat("總數", String(machine.total ?? 0)),
      createStat("OK", String(machine.ok ?? 0)),
      createStat("NG", String(machine.ng ?? 0)),
      createStat(
        "良率",
        `${Number(machine.yield_rate || 0).toFixed(1)}%`
      )
    );

    const estop = document.createElement("div");
    estop.className = "machineEstop";

    const estopLabel = document.createElement("span");
    estopLabel.className = "machineEstopLabel";
    estopLabel.textContent = "E-stop";

    const estopValue = document.createElement("span");
    estopValue.className = "machineEstopValue";
    estopValue.textContent =
      estopStatusText(machine.estop_status);

    estop.append(estopLabel, estopValue);

    card.append(
      header,
      info,
      stats,
      estop
    );

    container.appendChild(card);
  });
}

async function loadMachineStatus() {
  setMachineMessage("正在讀取機台狀態...");

  try {
    const response = await fetch(
      "/api/machine-status",
      {
        credentials: "same-origin",
        cache: "no-store"
      }
    );

    if (response.status === 401) {
      window.location.href = "login.html";
      return;
    }

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data?.message || "機台狀態讀取失敗"
      );
    }

    machineStatusData = Array.isArray(data?.machines)
      ? data.machines
      : [];

    const windowSeconds = Number(
      data?.online_window_seconds || 120
    );

    const windowEl =
      document.getElementById("machineOnlineWindow");

    if (windowEl) {
      windowEl.textContent =
        `${windowSeconds} 秒`;
    }

    renderMachineSummary();
    renderMachines();

    setMachineMessage(
      `目前共 ${machineStatusData.length} 台機台。`,
      "success"
    );
  } catch (error) {
    machineStatusData = [];

    renderMachineSummary();
    renderMachines();

    setMachineMessage(
      error.message || "機台狀態讀取失敗",
      "error"
    );
  }
}

function restartMachineTimer() {
  if (machineStatusTimer) {
    clearInterval(machineStatusTimer);
    machineStatusTimer = null;
  }

  const enabled =
    document.getElementById("machineAutoRefresh")
      ?.checked === true;

  if (!enabled) return;

  machineStatusTimer = setInterval(() => {
    loadMachineStatus();
  }, 15000);
}

document.addEventListener(
  "DOMContentLoaded",
  async () => {
    document
      .getElementById("refreshMachinesBtn")
      ?.addEventListener(
        "click",
        loadMachineStatus
      );

    document
      .getElementById("machineAutoRefresh")
      ?.addEventListener(
        "change",
        restartMachineTimer
      );

    document
      .querySelectorAll(".machineTab")
      .forEach(button => {
        button.addEventListener(
          "click",
          () => {
            document
              .querySelectorAll(".machineTab")
              .forEach(item => {
                item.classList.remove("active");
              });

            button.classList.add("active");

            machineStatusFilter =
              button.dataset.filter || "all";

            renderMachines();
          }
        );
      });

    await loadMachineStatus();

    restartMachineTimer();
  }
);

window.addEventListener("beforeunload", () => {
  if (machineStatusTimer) {
    clearInterval(machineStatusTimer);
  }
});
