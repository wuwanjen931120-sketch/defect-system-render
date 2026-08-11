"use strict";

let reportRows = [];

function reportText(value) {
  return String(value ?? "");
}

function formatReportTime(value) {
  if (!value) return "-";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return date.toLocaleString("zh-TW", {
    hour12: false
  });
}

function toIsoOrEmpty(value) {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toISOString();
}

function buildReportParams() {
  const params = new URLSearchParams();

  params.set("limit", "1000");

  const systemId =
    document.getElementById("reportSystem")?.value || "";

  const product =
    document.getElementById("reportProduct")?.value.trim() || "";

  const status =
    document.getElementById("reportStatus")?.value || "";

  const dateFrom =
    document.getElementById("reportDateFrom")?.value || "";

  const dateTo =
    document.getElementById("reportDateTo")?.value || "";

  if (systemId) {
    params.set("system_id", systemId);
  }

  if (product) {
    params.set("products", product);
  }

  if (status) {
    params.set("status", status);
  }

  const fromIso = toIsoOrEmpty(dateFrom);
  const toIso = toIsoOrEmpty(dateTo);

  if (fromIso) {
    params.set("date_from", fromIso);
  }

  if (toIso) {
    params.set("date_to", toIso);
  }

  return params;
}

function updateReportSummary() {
  const total = reportRows.length;

  const ok = reportRows.filter(
    row => row.status === "OK"
  ).length;

  const ng = reportRows.filter(
    row => row.status === "NG"
  ).length;

  const yieldRate =
    total > 0
      ? ((ok / total) * 100).toFixed(1)
      : "0.0";

  document.getElementById("reportTotal").textContent =
    String(total);

  document.getElementById("reportOk").textContent =
    String(ok);

  document.getElementById("reportNg").textContent =
    String(ng);

  document.getElementById("reportYield").textContent =
    `${yieldRate}%`;
}

function renderReportRows() {
  const body = document.getElementById("reportTableBody");

  if (!body) return;

  body.replaceChildren();

  if (!reportRows.length) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");

    cell.colSpan = 6;
    cell.className = "reportEmpty";
    cell.textContent = "目前沒有符合條件的資料";

    row.appendChild(cell);
    body.appendChild(row);

    return;
  }

  reportRows.forEach(item => {
    const row = document.createElement("tr");

    const timeCell = document.createElement("td");
    timeCell.textContent = formatReportTime(item.timestamp);

    const systemCell = document.createElement("td");
    systemCell.textContent =
      reportText(item.system_id) || "-";

    const idCell = document.createElement("td");
    idCell.textContent =
      reportText(item.id) || "-";

    const productCell = document.createElement("td");
    productCell.textContent =
      reportText(item.product) || "未分類";

    const statusCell = document.createElement("td");
    statusCell.textContent =
      reportText(item.status) || "-";

    if (item.status === "OK") {
      statusCell.className = "reportStatusOk";
    }

    if (item.status === "NG") {
      statusCell.className = "reportStatusNg";
    }

    const imageCell = document.createElement("td");

    if (item.image_url) {
      const link = document.createElement("a");

      link.className = "reportImageLink";
      link.href = item.image_url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = "查看圖片";

      imageCell.appendChild(link);
    } else {
      imageCell.textContent = "-";
    }

    row.append(
      timeCell,
      systemCell,
      idCell,
      productCell,
      statusCell,
      imageCell
    );

    body.appendChild(row);
  });
}

async function loadReportSystems() {
  const select = document.getElementById("reportSystem");

  if (!select) return;

  try {
    const response = await fetch("/api/systems?limit=1000", {
      credentials: "same-origin",
      cache: "no-store"
    });

    if (response.status === 401) {
      window.location.href = "login.html";
      return;
    }

    if (!response.ok) {
      return;
    }

    const systems = await response.json();

    if (!Array.isArray(systems)) return;

    systems.forEach(system => {
      const option = document.createElement("option");

      option.value =
        reportText(system.system_id);

      option.textContent =
        `${reportText(system.name) || "未命名機台"} ` +
        `(${reportText(system.system_id)})`;

      select.appendChild(option);
    });
  } catch (error) {
    console.error("機台清單讀取失敗", error);
  }
}

async function loadReport() {
  const message =
    document.getElementById("reportResultMessage");

  if (message) {
    message.textContent = "正在查詢資料...";
  }

  try {
    const params = buildReportParams();

    const response = await fetch(
      `/api/defects?${params.toString()}`,
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
        data?.message || "報表資料查詢失敗"
      );
    }

    reportRows = Array.isArray(data)
      ? data
      : [];

    updateReportSummary();
    renderReportRows();

    if (message) {
      message.textContent =
        `目前顯示 ${reportRows.length} 筆資料。`;
    }
  } catch (error) {
    reportRows = [];

    updateReportSummary();
    renderReportRows();

    if (message) {
      message.textContent =
        error.message || "報表資料查詢失敗";
    }
  }
}

async function exportReportCsv() {
  try {
    const params = buildReportParams();

    params.set("limit", "10000");

    const response = await fetch(
      `/api/defects/export.csv?${params.toString()}`,
      {
        credentials: "same-origin",
        cache: "no-store",
        headers: {
          Accept: "text/csv"
        }
      }
    );

    if (response.status === 401) {
      window.location.href = "login.html";
      return;
    }

    if (!response.ok) {
      throw new Error("CSV 匯出失敗");
    }

    const blob = await response.blob();

    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");

    link.href = url;

    link.download =
      `defect-report-${new Date()
        .toISOString()
        .slice(0, 10)}.csv`;

    document.body.appendChild(link);

    link.click();
    link.remove();

    URL.revokeObjectURL(url);
  } catch (error) {
    alert(
      error.message || "CSV 匯出失敗，請稍後再試"
    );
  }
}

function resetReportFilters() {
  document.getElementById("reportDateFrom").value = "";
  document.getElementById("reportDateTo").value = "";
  document.getElementById("reportSystem").value = "";
  document.getElementById("reportProduct").value = "";
  document.getElementById("reportStatus").value = "";

  loadReport();
}

function printReport() {
  if (!reportRows.length) {
    alert("目前沒有可列印的報表資料");
    return;
  }

  window.print();
}

document.addEventListener("DOMContentLoaded", async () => {
  document
    .getElementById("reportSearchBtn")
    ?.addEventListener("click", loadReport);

  document
    .getElementById("reportResetBtn")
    ?.addEventListener("click", resetReportFilters);

  document
    .getElementById("reportCsvBtn")
    ?.addEventListener("click", exportReportCsv);

  document
    .getElementById("reportPdfBtn")
    ?.addEventListener("click", printReport);

  await loadReportSystems();

  await loadReport();
});
