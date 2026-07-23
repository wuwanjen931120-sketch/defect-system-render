"use strict";

const API_BASE = window.location.origin;

async function apiFetch(url) {
  const response = await fetch(url, {
    cache: "no-store",
    credentials: "same-origin",
    headers: { "Accept": "application/json" }
  });
  if (response.status === 401) {
    window.clearPublicAuth?.();
    location.replace("login.html");
    throw new Error("登入已過期");
  }
  if (!response.ok) throw new Error(`API 錯誤：${response.status}`);
  return response.json();
}

async function loadCollections() {
  const select = document.getElementById("collectionSelect");
  const data = await apiFetch(`${API_BASE}/api/admin/collections`);
  select.replaceChildren();
  data.forEach(name => {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    select.appendChild(option);
  });
}

async function loadCollection() {
  const name = document.getElementById("collectionSelect").value;
  const output = document.getElementById("output");
  output.textContent = "資料讀取中...";
  try {
    const data = await apiFetch(`${API_BASE}/api/admin/collection/${encodeURIComponent(name)}`);
    output.textContent = JSON.stringify(data, null, 2);
  } catch (error) {
    console.error(error);
    output.textContent = `讀取失敗：${error.message}`;
  }
}
window.loadCollection = loadCollection;

async function initializeMongoAdmin() {
  let session;
  try { session = await window.authReady; } catch (_) { return; }
  if (session?.user?.role !== "super_admin") {
    alert("只有 super_admin 可以查看 MongoDB 管理頁");
    location.replace("dashboard.html");
    return;
  }
  await loadCollections();
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initializeMongoAdmin, { once: true });
else initializeMongoAdmin();
