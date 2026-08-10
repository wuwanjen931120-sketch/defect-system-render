"use strict";

let auditRows = [];

function valueOf(row, ...keys) {
  for (const key of keys) {
    if (row?.[key] !== undefined && row?.[key] !== null) {
      return row[key];
    }
  }

  return "";
}

function formatTime(value) {
  if (!value) return "-";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleString("zh-TW");
}

function normalizeRows(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.logs)) return data.logs;
  if (Array.isArray(data?.data)) return data.data;

  return [];
}

function renderRows() {
  const body = document.getElementById("auditBody");
  const search = document
    .getElementById("searchInput")
    .value.trim()
    .toLowerCase();

  const action = document.getElementById("actionFilter").value;

  const rows = auditRows.filter((row) => {
    const actionText = String(
      valueOf(row, "action", "event", "type")
    ).toUpperCase();

    const searchable = [
      valueOf(row, "email", "user_email", "username", "user"),
      valueOf(row, "role"),
      actionText,
      valueOf(row, "target"),
      valueOf(row, "system_id", "systemId"),
      valueOf(row, "ip")
    ]
      .join(" ")
      .toLowerCase();

    if (search && !searchable.includes(search)) {
      return false;
    }

    if (action && !actionText.includes(action)) {
      return false;
    }

    return true;
  });

  body.replaceChildren();

  if (!rows.length) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");

    td.colSpan = 8;
    td.className = "empty";
    td.textContent = "目前沒有符合條件的稽核紀錄";

    tr.appendChild(td);
    body.appendChild(tr);
    return;
  }

  rows.forEach((row) => {
    const tr = document.createElement("tr");

    const values = [
      formatTime(valueOf(row, "createdAt", "timestamp", "time")),
      valueOf(row, "email", "user_email", "username", "user") || "-",
      valueOf(row, "role") || "-",
      valueOf(row, "action", "event", "type") || "-",
      valueOf(row, "target") || "-",
      valueOf(row, "system_id", "systemId") || "-",
      valueOf(row, "ip") || "-",
      valueOf(row, "result", "status", "outcome") || "-"
    ];

    values.forEach((value, index) => {
      const td = document.createElement("td");
      td.textContent = String(value);

      if (index === 7) {
        const normalized = String(value).toLowerCase();

        if (
          normalized.includes("success") ||
          normalized.includes("ok")
        ) {
          td.classList.add("ok");
        }

        if (
          normalized.includes("fail") ||
          normalized.includes("error")
        ) {
          td.classList.add("error");
        }
      }

      tr.appendChild(td);
    });

    body.appendChild(tr);
  });
}

async function loadAuditLogs() {
  const status = document.getElementById("status");
  status.textContent = "正在載入操作紀錄...";

  try {
    const response = await fetch("/api/admin/audit-logs?limit=200", {
      credentials: "include",
      cache: "no-store"
    });

    if (response.status === 401) {
      window.location.href = "login.html";
      return;
    }

    if (response.status === 403) {
      status.textContent = "沒有權限查看稽核紀錄";
      return;
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    auditRows = normalizeRows(data);

    status.textContent = `共 ${auditRows.length} 筆紀錄`;

    renderRows();
  } catch (error) {
    status.textContent = "讀取稽核紀錄失敗";
    console.error("audit log load failed", error);
  }
}

document
  .getElementById("refreshBtn")
  .addEventListener("click", loadAuditLogs);

document
  .getElementById("searchInput")
  .addEventListener("input", renderRows);

document
  .getElementById("actionFilter")
  .addEventListener("change", renderRows);

loadAuditLogs();
