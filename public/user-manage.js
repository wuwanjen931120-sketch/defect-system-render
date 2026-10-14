"use strict";

let users = [];
let selectedUser = null;
let currentSystems = [];
let viewerRole = "";
const OWNER_EMAIL = "bty931120@gmail.com";
function isProtectedOwner(user) {
  return !!user && (user.protected_owner === true ||
    [user.email, user.username].some(v => String(v || "").trim().toLowerCase() === OWNER_EMAIL));
}
function lockProtectedOwnerEditor(user) {
  const locked = isProtectedOwner(user);
  for (const id of ["name", "role", "enabled", "saveBtn"]) document.getElementById(id).disabled = locked;
  const hint = document.getElementById("rolePermissionHint");
  if (hint) {
    hint.hidden = !locked;
    hint.textContent = locked ? "此帳號受保護：其他管理員無法修改。帳號本人請使用本人角色設定頁面。" : "";
  }
  if (locked) document.getElementById("saveStatus").textContent = "受保護帳號：僅本人可透過專屬頁面變更角色";
  document.querySelectorAll('#systemsList input[type="checkbox"]').forEach(el => { if (locked) el.disabled = true; });
}


const statusEl = document.getElementById("status");
const userListEl = document.getElementById("userList");
const editForm = document.getElementById("editForm");
const emptyState = document.getElementById("emptyState");

function roleLabel(role) {
  if (role === "super_admin") return "系統管理員";
  if (role === "tenant_admin") return "客戶管理員";
  return "一般使用者";
}

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
    name.textContent = user.name || user.email || user.username || "未命名使用者";

    const company = document.createElement("span");
    company.className = "user-company";
    company.textContent = user.company || "未設定公司／單位";

    const email = document.createElement("span");
    email.className = "user-email";
    email.textContent = user.email || user.username || "-";

    const meta = document.createElement("span");
    meta.className = "user-meta";
    meta.textContent =
      `${roleLabel(user.role)}｜${user.disabled ? "停用" : "啟用"}${isProtectedOwner(user) ? "｜受保護帳號（不可修改）" : ""}`;

    button.append(name, company, email, meta);
    button.addEventListener("click", () => selectUser(user));

    userListEl.appendChild(button);
  });
}

async function loadUsers() {
  statusEl.textContent = "正在讀取使用者...";

  try {
    users = await apiFetch("/api/admin/users?limit=200");
    if (viewerRole === "tenant_admin") users = users.filter((u) => u.role === "user");
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
    container.textContent = "此客戶目前沒有建立機台；請由有權限的管理員先建立機台。這不表示其他客戶或整個網站沒有機台。";
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

  document.getElementById("name").value = user.name || "";
  document.getElementById("username").value = user.email || user.username || "";
  document.getElementById("company").value = user.company || "";
  document.getElementById("tenantId").value = user.tenant_id || "";
  document.getElementById("role").value = viewerRole === "tenant_admin" ? "user" : (user.role || "user");
  document.getElementById("enabled").checked = !user.disabled;
  document.getElementById("saveStatus").textContent = "";

  await loadSystems(user.tenant_id);
  lockProtectedOwnerEditor(user);
}

document.getElementById("role").addEventListener("change", () => {
  renderSystems();
  lockProtectedOwnerEditor(selectedUser);
});

editForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!selectedUser) return;

  const saveStatus = document.getElementById("saveStatus");
  const saveBtn = document.getElementById("saveBtn");

  if (isProtectedOwner(selectedUser)) {
    document.getElementById("saveStatus").textContent = "受保護帳號請由本人使用專屬角色設定頁面修改";
    return;
  }
  const role = document.getElementById("role").value;
  const enabled = document.getElementById("enabled").checked;
  const name = document.getElementById("name").value.trim();

  const systems =
    role === "user"
      ? Array.from(
          document.querySelectorAll(
            '#systemsList input[type="checkbox"]:checked'
          )
        ).map((input) => input.value)
      : [];

  if (viewerRole !== "super_admin" && role !== "user") {
    saveStatus.textContent = "❌ 客戶管理員只能管理一般使用者";
    return;
  }

  const payload = {
    name,
    systems,
    disabled: !enabled
  };
  if (viewerRole === "super_admin") payload.role = role;

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
    saveBtn.disabled = isProtectedOwner(selectedUser);
  }
});

document
  .getElementById("refreshBtn")
  .addEventListener("click", loadUsers);

async function initUserManagement() {
  try {
    const session = await apiFetch("/api/session");
    viewerRole = session?.user?.role || "";
    if (viewerRole !== "super_admin") {
      statusEl.textContent = "只有平台系統管理員可以管理帳號";
      editForm.hidden = true;
      window.location.replace("dashboard.html");
      return;
    }
    if (viewerRole === "tenant_admin") {
      const roleSelect = document.getElementById("role");
      roleSelect.replaceChildren();
      const option = document.createElement("option");
      option.value = "user";
      option.textContent = "一般使用者";
      roleSelect.appendChild(option);
      roleSelect.disabled = true;
      const hint = document.getElementById("rolePermissionHint");
      if (hint) hint.hidden = false;
    }
    await loadUsers();
  } catch (error) {
    statusEl.textContent = `驗證管理權限失敗：${error.message}`;
  }
}

initUserManagement();
