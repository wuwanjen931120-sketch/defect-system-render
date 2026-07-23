"use strict";

const API_BASE = window.location.origin;

async function loadUsers() {
  try {
    const response = await fetch(`${API_BASE}/api/admin/users`, {
      cache: "no-store",
      credentials: "same-origin",
      headers: { "Accept": "application/json" }
    });

    if (response.status === 401) {
      window.clearPublicAuth?.();
      window.location.replace("login.html");
      return;
    }
    if (response.status === 403) {
      alert("權限不足");
      window.location.replace("dashboard.html");
      return;
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();
    const table = document.getElementById("userTable");
    const userCount = document.getElementById("userCount");
    table.replaceChildren();
    userCount.textContent = Array.isArray(data) ? String(data.length) : "0";

    if (!Array.isArray(data) || data.length === 0) {
      const row = document.createElement("tr");
      const cell = document.createElement("td");
      cell.colSpan = 4;
      cell.className = "empty";
      cell.textContent = "目前沒有客戶資料";
      row.appendChild(cell);
      table.appendChild(row);
      return;
    }

    data.forEach(user => {
      const row = document.createElement("tr");
      [user.company || "未設定公司", user.username || "-", user.role || "-", user.tenant_id || "-"].forEach((value, index) => {
        const cell = document.createElement("td");
        if (index === 1) {
          const bold = document.createElement("b");
          bold.textContent = value;
          cell.appendChild(bold);
        } else if (index === 2) {
          const badge = document.createElement("span");
          badge.className = "badge";
          badge.textContent = value;
          cell.appendChild(badge);
        } else {
          cell.textContent = value;
        }
        row.appendChild(cell);
      });
      table.appendChild(row);
    });
  } catch (error) {
    console.error(error);
    alert("無法讀取管理後台資料");
  }
}

async function initializeAdminPage() {
  let session;
  try {
    session = await window.authReady;
  } catch (_) {
    return;
  }

  const role = session?.user?.role || sessionStorage.getItem("role") || "user";
  if (!["super_admin", "tenant_admin"].includes(role)) {
    alert("你不是管理員，無法進入管理後台");
    window.location.replace("dashboard.html");
    return;
  }

  document.getElementById("roleText").textContent = role;
  const mongoButton = document.getElementById("mongoBtn");
  if (role !== "super_admin") {
    mongoButton.hidden = true;
  } else {
    mongoButton.addEventListener("click", () => { location.href = "mongo-admin.html"; });
  }

  const refreshButton = document.getElementById("refreshBtn");
  refreshButton.addEventListener("click", async () => {
    refreshButton.disabled = true;
    refreshButton.textContent = "重新整理中...";
    await loadUsers();
    refreshButton.textContent = "重新整理";
    refreshButton.disabled = false;
  });

  await loadUsers();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeAdminPage, { once: true });
} else {
  initializeAdminPage();
}
