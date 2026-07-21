// =====================================================
// 共用側邊欄：讓每一頁的左側選單長得一樣
// 放法 1：每個 HTML 加 <script src="sidebar-common.js"></script>
// 放法 2：直接把整段貼到 public/core.js 最下面，所有頁面會自動套用
// =====================================================
(function () {
  const NAV_ITEMS = [
    { href: "dashboard.html", icon: "🏠", label: "首頁", pill: "Dashboard" },
    { href: "logs.html", icon: "📋", label: "事件紀錄", pill: "Logs" },
    { href: "settings.html", icon: "⚙️", label: "系統設定", pill: "Settings" },
    { href: "ai.html", icon: "🤖", label: "AI 助理", pill: "AI" },
    { href: "admin.html", icon: "🧑‍💼", label: "管理後台", pill: "Admin", adminOnly: true }
  ];

  function getCurrentPage() {
    const name = location.pathname.split("/").pop() || "dashboard.html";
    return name.toLowerCase();
  }

  function canOpenAdmin() {
    const role = sessionStorage.getItem("role") || "user";
    return role === "super_admin" || role === "admin" || role === "tenant_admin";
  }

  function injectSidebarStyle() {
    if (document.getElementById("commonSidebarStyle")) return;

    const style = document.createElement("style");
    style.id = "commonSidebarStyle";
    style.textContent = `
      .nav{
        display:flex !important;
        flex-direction:column !important;
        gap:12px !important;
      }

      .nav a{
        display:flex !important;
        align-items:center !important;
        justify-content:space-between !important;
        gap:12px !important;
        min-height:56px !important;
        padding:0 18px !important;
        margin:0 !important;
        border-radius:20px !important;
        background:linear-gradient(180deg, rgba(40,78,130,.95), rgba(30,58,95,.95)) !important;
        color:#ffffff !important;
        border:1px solid rgba(255,255,255,.16) !important;
        font-size:16px !important;
        font-weight:800 !important;
        line-height:1.2 !important;
        text-decoration:none !important;
        box-sizing:border-box !important;
        transition:background .2s ease, border-color .2s ease, box-shadow .2s ease !important;
      }

      .nav a:hover{
        background:linear-gradient(180deg, rgba(52,100,165,.98), rgba(37,72,118,.98)) !important;
        border-color:rgba(255,255,255,.22) !important;
        box-shadow:0 8px 18px rgba(0,0,0,.18) !important;
        transform:none !important;
      }

      .nav a.active{
        background:linear-gradient(180deg, rgba(58,106,172,1), rgba(44,83,136,1)) !important;
        border-color:rgba(160,205,255,.45) !important;
        box-shadow:inset 0 0 0 1px rgba(255,255,255,.08), 0 8px 18px rgba(0,0,0,.22) !important;
      }

      .nav a,
      .nav a:hover,
      .nav a:focus,
      .nav a:active,
      .nav a *,
      .pill{
        text-decoration:none !important;
      }

      .nav-label{
        display:flex !important;
        align-items:center !important;
        gap:10px !important;
        min-width:0 !important;
        flex:1 !important;
        white-space:nowrap !important;
      }

      .pill{
        margin-left:auto !important;
        flex-shrink:0 !important;
        min-width:74px !important;
        height:32px !important;
        padding:0 12px !important;
        display:inline-flex !important;
        align-items:center !important;
        justify-content:center !important;
        border-radius:999px !important;
        background:rgba(8,20,40,.28) !important;
        border:1px solid rgba(255,255,255,.14) !important;
        color:rgba(231,238,252,.92) !important;
        font-size:13px !important;
        font-weight:600 !important;
        line-height:1 !important;
        white-space:nowrap !important;
      }

      .nav a.active .pill{
        background:rgba(9,25,48,.25) !important;
        border-color:rgba(255,255,255,.18) !important;
        color:#eaf2ff !important;
      }

      .brand p{
        display:block !important;
        font-size:12px !important;
        color:var(--muted, rgba(155,176,207,.9)) !important;
        margin:3px 0 0 !important;
      }
    `;

    document.head.appendChild(style);
  }

  function buildNavHtml(isDrawer) {
    const current = getCurrentPage();
    const adminVisible = canOpenAdmin();

    return NAV_ITEMS.map(item => {
      const isActive = current === item.href.toLowerCase();
      const adminId = item.href === "admin.html"
        ? (isDrawer ? "adminNavLinkDrawer" : "adminNavLink")
        : "";
      const hidden = item.adminOnly && !adminVisible ? "display:none;" : "";

      return `
        <a href="${item.href}" class="${isActive ? "active" : ""}" ${adminId ? `id="${adminId}"` : ""} style="${hidden}">
          <span class="nav-label">${item.icon} ${item.label}</span>
          <span class="pill">${item.pill}</span>
        </a>
      `;
    }).join("");
  }

  function renderCommonSidebar() {
    injectSidebarStyle();

    document.querySelectorAll(".sidebar .brand").forEach(brand => {
      const textWrap = brand.querySelector("div:last-child");
      if (textWrap && !textWrap.querySelector("p")) {
        const p = document.createElement("p");
        p.textContent = "Defect System";
        textWrap.appendChild(p);
      }
    });

    document.querySelectorAll(".nav").forEach(nav => {
      const isDrawer = !!nav.closest("#drawer");
      nav.innerHTML = buildNavHtml(isDrawer);
    });
  }

  window.renderCommonSidebar = renderCommonSidebar;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", renderCommonSidebar);
  } else {
    renderCommonSidebar();
  }
})();
