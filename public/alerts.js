"use strict";

let currentAlertStatus = "";
let currentAlerts = [];

function alertText(value) {
  return String(value ?? "");
}

function formatAlertTime(value) {
  if (!value) return "-";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return date.toLocaleString("zh-TW", {
    hour12: false
  });
}

function alertStatusText(status) {
  if (status === "open") return "未處理";
  if (status === "acknowledged") return "已確認";
  if (status === "resolved") return "已解決";
  return alertText(status) || "-";
}

function alertStatusClass(status) {
  if (status === "open") return "alertBadgeOpen";
  if (status === "acknowledged") return "alertBadgeAcknowledged";
  if (status === "resolved") return "alertBadgeResolved";
  return "";
}

function alertTypeText(type) {
  if (type === "ng_window") return "NG 異常";
  return alertText(type) || "-";
}

function alertSeverityText(severity) {
  if (severity === "high") return "高";
  if (severity === "medium") return "中";
  if (severity === "low") return "低";
  return alertText(severity) || "-";
}

function setAlertMessage(message, type = "") {
  const el = document.getElementById("alertsMessage");

  if (!el) return;

  el.textContent = message || "";
  el.className = "alertsMessage";

  if (type) {
    el.classList.add(type);
  }
}

function createCell(text, className = "") {
  const td = document.createElement("td");
  td.textContent = text;

  if (className) {
    td.className = className;
  }

  return td;
}

function createActionButton(text, status, alertId) {
  const button = document.createElement("button");

  button.type = "button";
  button.className = "alertActionBtn";
  button.textContent = text;

  button.addEventListener("click", () => {
    updateAlertStatus(alertId, status);
  });

  return button;
}

function renderAlerts() {
  const body = document.getElementById("alertsTableBody");

  if (!body) return;

  body.replaceChildren();

  if (!currentAlerts.length) {
    const row = document.createElement("tr");
    const cell = createCell("目前沒有符合條件的告警紀錄", "emptyRow");

    cell.colSpan = 8;
    row.appendChild(cell);
    body.appendChild(row);

    return;
  }

  currentAlerts.forEach(alert => {
    const row = document.createElement("tr");

    row.appendChild(createCell(formatAlertTime(alert.createdAt)));
    row.appendChild(createCell(alertText(alert.system_id) || "-"));
    row.appendChild(createCell(alertTypeText(alert.type)));
    row.appendChild(
      createCell(
        alertSeverityText(alert.severity),
        alert.severity === "high" ? "alertSeverityHigh" : ""
      )
    );

    row.appendChild(
      createCell(alertText(alert.message) || "-", "alertMessageText")
    );

    const statusCell = document.createElement("td");
    const statusBadge = document.createElement("span");

    statusBadge.className =
      `alertBadge ${alertStatusClass(alert.status)}`.trim();

    statusBadge.textContent = alertStatusText(alert.status);

    statusCell.appendChild(statusBadge);
    row.appendChild(statusCell);

    row.appendChild(createCell(alertText(alert.handledBy) || "-"));

    const actionCell = document.createElement("td");
    actionCell.className = "alertActions";

    if (alert.status === "open") {
      actionCell.appendChild(
        createActionButton(
          "確認",
          "acknowledged",
          String(alert._id)
        )
      );

      actionCell.appendChild(
        createActionButton(
          "已解決",
          "resolved",
          String(alert._id)
        )
      );
    } else if (alert.status === "acknowledged") {
      actionCell.appendChild(
        createActionButton(
          "已解決",
          "resolved",
          String(alert._id)
        )
      );
    } else {
      actionCell.textContent = "—";
    }

    row.appendChild(actionCell);
    body.appendChild(row);
  });
}

async function loadAlertCounts() {
  try {
    const response = await fetch("/api/alerts?limit=500", {
      credentials: "same-origin",
      cache: "no-store"
    });

    if (!response.ok) return;

    const alerts = await response.json();

    const all = Array.isArray(alerts) ? alerts : [];

    const open = all.filter(item => item.status === "open").length;

    const acknowledged = all.filter(
      item => item.status === "acknowledged"
    ).length;

    const resolved = all.filter(
      item => item.status === "resolved"
    ).length;

    document.getElementById("countAll").textContent = String(all.length);
    document.getElementById("countOpen").textContent = String(open);

    document.getElementById("countAcknowledged").textContent =
      String(acknowledged);

    document.getElementById("countResolved").textContent =
      String(resolved);
  } catch (error) {
    console.error("告警統計讀取失敗", error);
  }
}

async function loadSystems() {
  const select = document.getElementById("alertSystemFilter");

  if (!select) return;

  try {
    const response = await fetch("/api/systems?limit=1000", {
      credentials: "same-origin",
      cache: "no-store"
    });

    if (!response.ok) return;

    const systems = await response.json();

    for (const system of systems) {
      const option = document.createElement("option");

      option.value = alertText(system.system_id);

      option.textContent =
        `${alertText(system.name) || "未命名機台"} ` +
        `(${alertText(system.system_id)})`;

      select.appendChild(option);
    }
  } catch (error) {
    console.error("機台清單讀取失敗", error);
  }
}

async function loadAlerts() {
  setAlertMessage("正在讀取告警...");

  const params = new URLSearchParams();

  params.set("limit", "500");

  if (currentAlertStatus) {
    params.set("status", currentAlertStatus);
  }

  const selectedSystem =
    document.getElementById("alertSystemFilter")?.value || "";

  if (selectedSystem) {
    params.set("system_id", selectedSystem);
  }

  try {
    const response = await fetch(`/api/alerts?${params.toString()}`, {
      credentials: "same-origin",
      cache: "no-store"
    });

    if (response.status === 401) {
      window.location.href = "login.html";
      return;
    }

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data?.message || "告警讀取失敗");
    }

    currentAlerts = Array.isArray(data) ? data : [];

    renderAlerts();

    setAlertMessage(
      `目前顯示 ${currentAlerts.length} 筆告警。`,
      "success"
    );

    await loadAlertCounts();
  } catch (error) {
    currentAlerts = [];
    renderAlerts();

    setAlertMessage(
      error.message || "告警讀取失敗",
      "error"
    );
  }
}

async function updateAlertStatus(alertId, status) {
  try {
    const response = await fetch(
      `/api/alerts/${encodeURIComponent(alertId)}`,
      {
        method: "PATCH",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ status })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data?.message || "告警更新失敗");
    }

    setAlertMessage(
      data?.message || "告警狀態已更新",
      "success"
    );

    await loadAlerts();
  } catch (error) {
    setAlertMessage(
      error.message || "告警更新失敗",
      "error"
    );
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  document
    .getElementById("refreshAlertsBtn")
    ?.addEventListener("click", loadAlerts);

  document
    .getElementById("alertSystemFilter")
    ?.addEventListener("change", loadAlerts);

  document.querySelectorAll(".alertTab").forEach(button => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".alertTab").forEach(item => {
        item.classList.remove("active");
      });

      button.classList.add("active");

      currentAlertStatus = button.dataset.status || "";

      loadAlerts();
    });
  });

  await loadSystems();
  await loadAlerts();
});
