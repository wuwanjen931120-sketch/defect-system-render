"use strict";

let imageTraceRows = [];

function traceText(value) {
  return String(value ?? "");
}

function formatTraceTime(value) {
  if (!value) return "-";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return date.toLocaleString("zh-TW", {
    hour12: false
  });
}

function toTraceIso(value) {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toISOString();
}

function normalizeTraceImageUrl(item) {
  const raw = String(
    item?.image_url ||
    item?.imageUrl ||
    item?.snapshot_url ||
    item?.snapshotUrl ||
    item?.ng_image_url ||
    item?.ngImageUrl ||
    ""
  ).trim();

  if (!raw) return "";

  if (raw.startsWith("/")) {
    return new URL(raw, window.location.origin).href;
  }

  if (/^https?:\/\//i.test(raw)) {
    return raw;
  }

  return "";
}

function buildTraceParams() {
  const params = new URLSearchParams();

  params.set("status", "NG");
  params.set("limit", "1000");
  const mode = document.getElementById("imageTraceDataMode")?.value;
  if (mode) params.set("data_mode", mode);

  const systemId =
    document.getElementById("imageTraceSystem")?.value || "";

  const product =
    document.getElementById("imageTraceProduct")?.value.trim() || "";

  const dateFrom =
    document.getElementById("imageTraceDateFrom")?.value || "";

  const dateTo =
    document.getElementById("imageTraceDateTo")?.value || "";

  if (systemId) {
    params.set("system_id", systemId);
  }

  if (product) {
    params.set("products", product);
  }

  const fromIso = toTraceIso(dateFrom);
  const toIso = toTraceIso(dateTo);

  if (fromIso) {
    params.set("date_from", fromIso);
  }

  if (toIso) {
    params.set("date_to", toIso);
  }

  return params;
}

function filteredTraceRows() {
  const caseId =
    document.getElementById("imageTraceCaseId")
      ?.value.trim()
      .toLowerCase() || "";

  if (!caseId) {
    return imageTraceRows;
  }

  return imageTraceRows.filter(item =>
    traceText(item.id)
      .toLowerCase()
      .includes(caseId)
  );
}

function updateTraceSummary(rows) {
  const withImage = rows.filter(
    item => Boolean(normalizeTraceImageUrl(item))
  ).length;

  const withoutImage = rows.length - withImage;

  document.getElementById("imageTraceNgCount").textContent =
    String(rows.length);

  document.getElementById("imageTraceWithImage").textContent =
    String(withImage);

  document.getElementById("imageTraceWithoutImage").textContent =
    String(withoutImage);
}

function createTraceInfoRow(label, value, className = "") {
  const row = document.createElement("div");
  row.className = "imageTraceInfoRow";

  const labelEl = document.createElement("span");
  labelEl.className = "imageTraceInfoLabel";
  labelEl.textContent = label;

  const valueEl = document.createElement("span");
  valueEl.className =
    `imageTraceInfoValue ${className}`.trim();
  valueEl.textContent = value;

  row.append(labelEl, valueEl);

  return row;
}

function openTraceModal(item, imageUrl) {
  const modal =
    document.getElementById("imageTraceModal");

  const image =
    document.getElementById("imageTraceModalImage");

  const info =
    document.getElementById("imageTraceModalInfo");

  if (!modal || !image || !info) return;

  image.src = imageUrl;

  info.textContent = [
    `Case ID：${traceText(item.id) || "-"}`,
    `機台：${traceText(item.system_id) || "-"}`,
    `產品：${traceText(item.product) || "未分類"}`,
    `狀態：${traceText(item.status) || "-"}`,
    `時間：${formatTraceTime(item.timestamp)}`
  ].join("\n");

  modal.hidden = false;
}

function closeTraceModal() {
  const modal =
    document.getElementById("imageTraceModal");

  const image =
    document.getElementById("imageTraceModalImage");

  if (modal) {
    modal.hidden = true;
  }

  if (image) {
    image.removeAttribute("src");
  }
}

function renderTraceRows() {
  const grid =
    document.getElementById("imageTraceGrid");

  const message =
    document.getElementById("imageTraceMessage");

  if (!grid) return;

  grid.replaceChildren();

  const rows = filteredTraceRows();

  updateTraceSummary(rows);

  if (message) {
    message.textContent =
      `目前顯示 ${rows.length} 筆 NG 紀錄。`;
  }

  if (!rows.length) {
    const empty = document.createElement("div");

    empty.className = "imageTraceEmpty";
    empty.textContent =
      "目前沒有符合條件的 NG 圖片紀錄。";

    grid.appendChild(empty);
    return;
  }

  rows.forEach(item => {
    const card = document.createElement("article");
    card.className = "imageTraceCard";

    const imageWrap = document.createElement("div");
    imageWrap.className = "imageTraceImageWrap";

    const imageUrl = normalizeTraceImageUrl(item);

    if (imageUrl) {
      const button = document.createElement("button");

      button.type = "button";
      button.className = "imageTraceImageButton";

      const image = document.createElement("img");

      image.className = "imageTraceImage";
      image.src = imageUrl;
      image.alt = "NG 瑕疵圖片";
      image.loading = "lazy";

      image.addEventListener("error", () => {
        button.replaceChildren();

        const text = document.createElement("div");
        text.className = "imageTraceNoImage";
        text.textContent = "圖片讀取失敗";

        button.appendChild(text);
      });

      button.addEventListener("click", () => {
        openTraceModal(item, imageUrl);
      });

      button.appendChild(image);
      imageWrap.appendChild(button);
    } else {
      const noImage = document.createElement("div");

      noImage.className = "imageTraceNoImage";
      noImage.textContent = "未提供瑕疵圖片";

      imageWrap.appendChild(noImage);
    }

    const body = document.createElement("div");
    body.className = "imageTraceBody";

    const caseId = document.createElement("div");

    caseId.className = "imageTraceCaseId";
    caseId.textContent =
      traceText(item.id) || "未提供 Case ID";

    const info = document.createElement("div");
    info.className = "imageTraceInfo";

    info.append(
      createTraceInfoRow(
        "機台",
        traceText(item.system_id) || "-"
      ),
      createTraceInfoRow(
        "產品",
        traceText(item.product) || "未分類"
      ),
      createTraceInfoRow(
        "狀態",
        traceText(item.status) || "-",
        "imageTraceStatusNg"
      ),
      createTraceInfoRow(
        "時間",
        formatTraceTime(item.timestamp)
      )
    );

    body.append(caseId, info);

    card.append(imageWrap, body);

    grid.appendChild(card);
  });
}

async function loadTraceSystems() {
  const select =
    document.getElementById("imageTraceSystem");

  if (!select) return;

  try {
    const response = await fetch(
      "/api/systems?limit=1000",
      {
        credentials: "same-origin",
        cache: "no-store"
      }
    );

    if (response.status === 401) {
      window.location.href = "login.html";
      return;
    }

    if (!response.ok) return;

    const systems = await response.json();

    if (!Array.isArray(systems)) return;

    systems.forEach(system => {
      const option = document.createElement("option");

      option.value =
        traceText(system.system_id);

      option.textContent =
        traceText(system.name) || "未命名機台";
      option.title = `system_id：${traceText(system.system_id)}`;

      select.appendChild(option);
    });
  } catch (error) {
    console.error("機台清單讀取失敗", error);
  }
}

async function loadImageTrace() {
  const message =
    document.getElementById("imageTraceMessage");

  if (message) {
    message.textContent = "正在讀取 NG 紀錄...";
  }

  try {
    const params = buildTraceParams();

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
        data?.message || "NG 紀錄讀取失敗"
      );
    }

    imageTraceRows = Array.isArray(data)
      ? data
      : [];

    renderTraceRows();
  } catch (error) {
    imageTraceRows = [];

    renderTraceRows();

    if (message) {
      message.textContent =
        error.message || "NG 紀錄讀取失敗";
    }
  }
}

function resetTraceFilters() {
  document.getElementById("imageTraceDateFrom").value = "";
  document.getElementById("imageTraceDateTo").value = "";
  document.getElementById("imageTraceSystem").value = "";
  document.getElementById("imageTraceProduct").value = "";
  document.getElementById("imageTraceCaseId").value = "";

  loadImageTrace();
}

document.addEventListener("DOMContentLoaded", async () => {
  document
    .getElementById("imageTraceRefreshBtn")
    ?.addEventListener("click", loadImageTrace);

  document
    .getElementById("imageTraceSearchBtn")
    ?.addEventListener("click", loadImageTrace);

  document
    .getElementById("imageTraceResetBtn")
    ?.addEventListener("click", resetTraceFilters);

  document
    .getElementById("imageTraceCaseId")
    ?.addEventListener("input", renderTraceRows);

  document
    .getElementById("imageTraceModalClose")
    ?.addEventListener("click", closeTraceModal);

  document
    .querySelector(".imageTraceModalBackdrop")
    ?.addEventListener("click", closeTraceModal);

  document.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      closeTraceModal();
    }
  });

  await loadTraceSystems();
  await initDemoImageAdmin();
  await loadImageTrace();
});

// 管理員模擬圖片功能：角色與開關均由後端驗證；JS 隱藏不是安全界線。
async function initDemoImageAdmin() {
  try {
    const sessionResponse = await fetch("/api/session", { credentials: "same-origin", cache: "no-store" });
    if (!sessionResponse.ok) return;
    const session = await sessionResponse.json();
    if (session?.user?.role !== "super_admin") return;
    document.getElementById("demoImagePanel").hidden = false;
    document.getElementById("adminTraceDataModePanel").hidden = false;
    document.getElementById("imageTraceDataMode").value = "TEST";
    document.getElementById("imageTraceDataMode").addEventListener("change", loadImageTrace);
    const response = await fetch("/api/admin/demo-image-settings", { credentials: "same-origin", cache: "no-store" });
    if (!response.ok) throw new Error("無法讀取模擬功能設定");
    const settings = await response.json();
    const toggle = document.getElementById("demoImageEnabled");
    toggle.checked = settings.enabled === true;
    document.getElementById("demoImageForm").hidden = !toggle.checked;
    toggle.addEventListener("change", async () => {
      toggle.disabled = true;
      try {
        const r = await fetch("/api/admin/demo-image-settings", { method: "PUT", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled: toggle.checked }) });
        const data = await r.json();
        if (!r.ok) throw new Error(data.message || "設定失敗");
        document.getElementById("demoImageForm").hidden = !data.enabled;
        setDemoImageStatus(data.enabled ? "模擬上傳已啟用" : "模擬上傳已停用，不影響既有圖片與正式上傳");
      } catch (error) { toggle.checked = !toggle.checked; setDemoImageStatus(error.message); }
      finally { toggle.disabled = false; }
    });
    const systemsResponse = await fetch("/api/systems?limit=1000", { credentials: "same-origin", cache: "no-store" });
    if (systemsResponse.ok) {
      const systems = await systemsResponse.json();
      const select = document.getElementById("demoImageSystem");
      for (const system of (Array.isArray(systems) ? systems : [])) {
        if (!system.system_id || !system.tenant_id) continue;
        const opt = new Option(`${system.name || system.system_id} (${system.system_id})`, system.system_id);
        opt.dataset.tenantId = system.tenant_id;
        select.add(opt);
      }
    }
    document.getElementById("demoImageForm").addEventListener("submit", uploadDemoImage);
  } catch (error) { setDemoImageStatus(error.message || "管理員功能載入失敗"); }
}
function setDemoImageStatus(message) {
  const target = document.getElementById("demoImageStatus");
  if (target) target.textContent = message;
}
async function uploadDemoImage(event) {
  event.preventDefault();
  const select = document.getElementById("demoImageSystem");
  const tenantId = select.selectedOptions[0]?.dataset.tenantId || "";
  const product = document.getElementById("demoImageProduct").value.trim();
  const file = document.getElementById("demoImageFile").files[0];
  if (!select.value || !tenantId || !product || !file) { setDemoImageStatus("請選擇機台、填寫產品及圖片"); return; }
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) { setDemoImageStatus("請選擇 5 MB 以下的 JPG、PNG 或 WebP 圖片"); return; }
  const button = document.getElementById("demoImageUploadBtn");
  button.disabled = true;
  try {
    const params = new URLSearchParams({ tenant_id: tenantId, system_id: select.value, product });
    const response = await fetch(`/api/admin/demo-ng-image?${params}`, { method: "POST", credentials: "same-origin", headers: { "Content-Type": file.type }, body: file });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || "圖片上傳失敗");
    setDemoImageStatus(`上傳完成：${result.case_id}（測試資料）。可在下方查詢。`);
    document.getElementById("imageTraceSystem").value = select.value;
    document.getElementById("imageTraceProduct").value = "";
    document.getElementById("imageTraceCaseId").value = "";
    document.getElementById("imageTraceDataMode").value = "TEST";
    document.getElementById("demoImageFile").value = "";
    await loadImageTrace();
  } catch (error) { setDemoImageStatus(error.message || "圖片上傳失敗"); }
  finally { button.disabled = false; }
}
