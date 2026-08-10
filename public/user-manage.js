"use strict";

let users = [];
let selectedUser = null;
let currentSystems = [];

const statusEl = document.getElementById("status");
const userListEl = document.getElementById("userList");
const editForm = document.getElementById("editForm");
const emptyState = document.getElementById("emptyState");

async function apiFetch(url, options = {}) {
  const response = await fetch(url, {
    credentials: "include",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    ...options
  });

  if (response.status === 401) {
    window.location.href = "login.html";
    throw new Error("未登入");
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || `HTTP ${response.status}`);
  }

  return data;
}

function renderUserList() {
  userListEl.replaceChildren();

  if (!users.length) {
    const p = document.createElement("p");
    p.textContent = "目前沒有使用者";
    userListEl.appendChild(p);
    return;
  }

  users.forEach((user) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "user-item";

    if (selectedUser?.id === user.id) {
      button.classList.add("active");
    }

    const name = document.createElement("span");
    name.className = "user-name";
    name.textContent = user.username || "-";

    const meta = document.createElement("span");
    meta.className = "user-meta";
    meta.textContent =
      `${user.company || "-"}｜${user.role || "-"}｜` +
      `${user.disabled ? "停用" : "啟用"}`;

    button.append(name, meta);
    button.addEventListener("click", () => selectUser(user));

    userListEl.appendChild(button);
  });
}

async function loadUsers() {
  statusEl.textContent = "正在讀取使用者...";

  try {
    users = await apiFetch("/api/admin/users?limit=200");
    statusEl.textContent = `共 ${users.length} 個帳號`;
    renderUserList();
  } catch (error) {
    statusEl.textContent = `讀取使用者失敗：${error.message}`;
  }
}

async function loadSystems(tenantId) {
  currentSystems = [];

  if (!tenantId) {
    renderSystems();
    return;
  }

  try {
    const url =
      `/api/systems?tenant_id=${encodeURIComponent(tenantId)}&limit=1000`;

    const data = await apiFetch(url);
    currentSystems = Array.isArray(data) ? data : [];
  } catch (error) {
    currentSystems = [];
    document.getElementById("systemsList").textContent =
      `讀取機台失敗：${error.message}`;
    return;
  }

  renderSystems();
}

function renderSystems() {
  const container = document.getElementById("systemsList");
  container.replaceChildren();

  const isUser = document.getElementById("role").value === "user";

  if (!currentSystems.length) {
    container.textContent = "此租戶目前沒有機台";
    return;
  }

  currentSystems.forEach((system) => {
    const label = document.createElement("label");
    label.className = "system-option";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = system.system_id || "";
    checkbox.disabled = !isUser;

    if (
      isUser &&
      Array.isArray(selectedUser?.systems) &&
      selectedUser.systems.includes(system.system_id)
    ) {
      checkbox.checked = true;
    }

    const text = document.createElement("span");
    const name =
      system.name ||
      system.system_name ||
      system.label ||
      "未命名機台";

    text.textContent = `${name}｜${system.system_id || "-"}`;

    label.append(checkbox, text);
    container.appendChild(label);
  });
}

async function selectUser(user) {
  selectedUser = user;
  renderUserList();

  emptyState.hidden = true;
  editForm.hidden = false;

  document.getElementById("username").value = user.username || "";
  document.getElementById("company").value = user.company || "";
  document.getElementById("tenantId").value = user.tenant_id || "";
  document.getElementById("role").value = user.role || "user";
  document.getElementById("enabled").checked = !user.disabled;
  document.getElementById("saveStatus").textContent = "";

  await loadSystems(user.tenant_id);
}

document.getElementById("role").addEventListener("change", () => {
  renderSystems();
});

editForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!selectedUser) return;

  const saveStatus = document.getElementById("saveStatus");
  const saveBtn = document.getElementById("saveBtn");

  const role = document.getElementById("role").value;
  const enabled = document.getElementById("enabled").checked;

  const systems =
    role === "user"
      ? Array.from(
          document.querySelectorAll(
            '#systemsList input[type="checkbox"]:checked'
          )
        ).map((input) => input.value)
      : [];

  const payload = {
    role,
    systems,
    disabled: !enabled
  };

  saveBtn.disabled = true;
  saveStatus.textContent = "儲存中...";

  try {
    await apiFetch(
      `/api/admin/users/${encodeURIComponent(selectedUser.id)}`,
      {
        method: "PATCH",
        body: JSON.stringify(payload)
      }
    );

    saveStatus.textContent = "✅ 儲存成功";

    await loadUsers();

    const refreshed = users.find(
      (user) => user.id === selectedUser.id
    );

    if (refreshed) {
      await selectUser(refreshed);
    }
  } catch (error) {
    saveStatus.textContent = `❌ ${error.message}`;
  } finally {
    saveBtn.disabled = false;
  }
});

document
  .getElementById("refreshBtn")
  .addEventListener("click", loadUsers);

loadUsers();
