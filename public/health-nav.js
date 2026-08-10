"use strict";

function ensureHealthNav() {
  const navs = document.querySelectorAll(".nav");

  navs.forEach((nav) => {
    if (nav.querySelector('a[href="health.html"]')) {
      return;
    }

    const link = document.createElement("a");
    link.href = "health.html";
    link.className =
      window.location.pathname.endsWith("/health.html") ? "active" : "";

    const label = document.createElement("span");
    label.className = "nav-label";
    label.textContent = "🩺 系統健康";

    const pill = document.createElement("span");
    pill.className = "pill";
    pill.textContent = "Health";

    link.appendChild(label);
    link.appendChild(pill);

    const adminLink = nav.querySelector('a[href="admin.html"]');

    if (adminLink) {
      adminLink.insertAdjacentElement("afterend", link);
    } else {
      nav.appendChild(link);
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  ensureHealthNav();

  setTimeout(ensureHealthNav, 300);
  setTimeout(ensureHealthNav, 1000);
});
