"use strict";

(function () {
  const PUBLIC_AUTH_KEY = "defect_public_auth_v1";
  const protectedPages = new Set(["dashboard.html", "logs.html", "settings.html", "ai.html", "admin.html", "mongo-admin.html"]);

  function currentPage() {
    return (location.pathname.split("/").pop() || "index.html").toLowerCase();
  }

  function clearPublicAuth() {
    try {
      localStorage.removeItem(PUBLIC_AUTH_KEY);
      ["token", "isLogin", "email", "loginEmail", "loginUser", "loginName", "tenant_id", "role", "system_id", "allowed_systems"].forEach(key => sessionStorage.removeItem(key));
    } catch (_) {}
  }

  function applyPublicAuth(data) {
    const user = data?.user || {};
    const systems = Array.isArray(data?.systems) ? data.systems : [];
    const publicAuth = {
      user: {
        id: user.id || "",
        email: user.email || "",
        name: user.name || "",
        company: user.company || "",
        tenant_id: user.tenant_id || "",
        role: user.role || "user"
      },
      systems,
      updatedAt: Date.now()
    };

    try {
      localStorage.setItem(PUBLIC_AUTH_KEY, JSON.stringify(publicAuth));
      sessionStorage.setItem("isLogin", "true");
      sessionStorage.setItem("email", publicAuth.user.email);
      sessionStorage.setItem("loginEmail", publicAuth.user.email);
      sessionStorage.setItem("loginUser", JSON.stringify(publicAuth.user));
      sessionStorage.setItem("loginName", publicAuth.user.name);
      sessionStorage.setItem("tenant_id", publicAuth.user.tenant_id);
      sessionStorage.setItem("role", publicAuth.user.role);
      sessionStorage.setItem("allowed_systems", JSON.stringify(systems));
      if (!sessionStorage.getItem("system_id") && systems.length) sessionStorage.setItem("system_id", systems[0]);
    } catch (_) {}
    return publicAuth;
  }

  function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async function readSession(maxAttempts = 3) {
    let lastError = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const response = await fetch("/api/session", {
          method: "GET",
          cache: "no-store",
          credentials: "include",
          headers: { "Accept": "application/json" }
        });
        if (response.status === 401 || response.status === 403) {
          const error = new Error("unauthorized");
          error.authFailure = true;
          throw error;
        }
        if (!response.ok) throw new Error(`session check failed: ${response.status}`);
        return await response.json();
      } catch (error) {
        lastError = error;
        if (error.authFailure || attempt === maxAttempts) break;
        await wait(500 * attempt);
      }
    }
    throw lastError || new Error("session check failed");
  }

  try {
    const cached = JSON.parse(localStorage.getItem(PUBLIC_AUTH_KEY) || "null");
    if (cached?.user) applyPublicAuth(cached);
  } catch (_) {}

  window.clearPublicAuth = clearPublicAuth;
  window.applyPublicAuth = applyPublicAuth;
  window.authReady = readSession().then(data => {
    applyPublicAuth(data);
    return data;
  }).catch(error => {
    clearPublicAuth();
    if (protectedPages.has(currentPage())) {
      const reason = error?.authFailure ? "session-expired" : "service";
      location.replace(`login.html?reason=${reason}`);
    }
    throw error;
  });
})();
