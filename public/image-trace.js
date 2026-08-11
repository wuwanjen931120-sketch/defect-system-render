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
        `${traceText(system.name) || "未命名機台"} ` +
        `(${traceText(system.system_id)})`;

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
  await loadImageTrace();
});
