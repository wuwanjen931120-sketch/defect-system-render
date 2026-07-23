function handleHardReset(e){
  e.preventDefault();
  e.stopPropagation();

  try{
    // 只清除 Service Worker 和快取
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistrations().then(regs => {
        regs.forEach(reg => reg.unregister());  // 取消 Service Worker 註冊
      });
    }

    if (window.caches) {
      caches.keys().then(keys => {
        keys.forEach(key => caches.delete(key));  // 清除快取
      });
    }

    // 顯示統一通知
    toast("✅ 已清除修復快取", "OK");  // 這行會顯示提示訊息

    // 重整頁面，但保持登入狀態
    location.reload();

  } catch(err){
    console.error("清快取失敗：", err);
    toast("❌ 清除快取失敗", "WARN");  // 錯誤提示
    location.reload();
  }

}





    const KEY = "aiot_settings_v2"; // ✅ 版本 bump，避免舊快取格式污染


    function validateInt(value, min, max, name) {
  const text = String(value ?? "").trim();

  if (text === "") {
    return { ok: false, message: `${name} 不可為空` };
  }

  const n = Number(text);

  if (!Number.isInteger(n)) {
    return { ok: false, message: `${name} 必須是整數` };
  }

  if (n < min || n > max) {
    return { ok: false, message: `${name} 必須介於 ${min} ~ ${max}` };
  }

  return { ok: true, value: n };
}


  function saveSettings(e) {
  if (e) e.preventDefault();

  const ngInput = document.getElementById("ngThreshold");
  const fpsInput = document.getElementById("fpsMin"); // ✅ 修正

  const ng = validateInt(ngInput.value, 1, 20, "瑕疵門檻");
  if (!ng.ok) {
    alert(ng.message);
    return;
  }

  const fps = validateInt(fpsInput.value, 5, 60, "FPS 下限");
  if (!fps.ok) {
    alert(fps.message);
    return;
  }

  const data = {
    ngThreshold: ng.value,
    fpsMin: fps.value,
    updatedAt: Date.now()
  };

  // ✅ 真正存進 localStorage
  localStorage.setItem(KEY, JSON.stringify(data));

  renderPreview(data);

toast("設定已儲存", "OK");
}

  function loadSettings(showMessage = true){
  try{
    const raw = localStorage.getItem(KEY);

    if(!raw){
      document.getElementById("ngThreshold").value = "";
      document.getElementById("fpsMin").value = "";

      renderPreview({
        ngThreshold: "-",
        fpsMin: "-",
        updatedAt: Date.now()
      });

      if (showMessage) {
        alert("目前沒有已儲存的設定");
      }
      return;
    }

    const data = JSON.parse(raw);

    document.getElementById("ngThreshold").value = data.ngThreshold ?? "";
    document.getElementById("fpsMin").value = data.fpsMin ?? "";

    renderPreview(data);

    if (showMessage) {
      alert("✅ 設定已載入");
    }

  }catch(e){
    console.error(e);
    showError("載入失敗");
  }
}

    function renderPreview(data){
      const box = document.getElementById("previewBox");
      if(!box) return;
      box.textContent =
        `瑕疵門檻：${safeText(data.ngThreshold)}\n` +
        `FPS 下限：${safeText(data.fpsMin)}\n` +
        `更新時間：${new Date(data.updatedAt || Date.now()).toLocaleString("zh-TW")}`;
    }




    window.addEventListener("load", () => {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(console.error);
  }

  killErrorOverlay();  // ⭐ 放這裡
});

    function killErrorOverlay(){
  document.querySelectorAll(
    ".runtime-error-modal, .error-overlay, .white-screen-guard"
  ).forEach(el => el.remove());
}


// 防止錯誤觸發
window.addEventListener("error", e => {
  console.warn("已攔截錯誤", e.message);
  e.preventDefault();
});

window.addEventListener("unhandledrejection", e => {
  console.warn("Promise錯誤", e.reason);
  e.preventDefault();
});

document.addEventListener("DOMContentLoaded", () => {
  loadSettings(false); // 自動載入，但不跳提示
});

document.addEventListener("DOMContentLoaded", () => {
  const role = sessionStorage.getItem("role") || "user";

  const canOpenAdmin =
    role === "super_admin" ||
    role === "admin" ||
    role === "tenant_admin";
["adminNavLinkDesktop", "adminNavLinkDrawer"].forEach(id => {
  const link = document.getElementById(id);
  if (link) {
    link.style.display = canOpenAdmin ? "flex" : "none";
  }
});

});
