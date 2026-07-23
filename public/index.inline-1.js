window.addEventListener("load", () => {
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.register("./sw.js").catch(console.error);
      }
    });

    document.getElementById("btnGo").addEventListener("click", () => {
      try {
        const ok =
          sessionStorage.getItem("isLogin") === "true" &&
          !!sessionStorage.getItem("isLogin");

        location.href = ok ? "dashboard.html" : "login.html";
      } catch (_) {
        location.href = "login.html";
      }
    });

    document.getElementById("btnFix").addEventListener("click", async () => {
      try {
        if (typeof window.swHardReset === "function") {
          await window.swHardReset();
        }
        if (typeof window.toast === "function") {
          window.toast("已清快取，請按 Ctrl + F5", "OK");
        } else {
          alert("已清快取，請按 Ctrl + F5");
        }
      } catch (error) {
        console.error(error);
        alert("清除快取失敗，請手動按 Ctrl + F5");
      }
    });

    document.getElementById("btnEstop").addEventListener("click", async () => {
      try {
        const token = sessionStorage.getItem("isLogin") || "";
        const role = sessionStorage.getItem("role") || "user";
        const system_id = sessionStorage.getItem("system_id") || "";
        const tenant_id = sessionStorage.getItem("tenant_id") || "";
        if (!token) { location.href = "login.html"; return; }
        if (!["super_admin", "tenant_admin"].includes(role)) throw new Error("只有管理員可以使用緊急停止");
        if (!system_id) throw new Error("請先進入系統並選擇機台");
        if (!confirm(`確定要停止機台 ${system_id} 嗎？`)) return;
        const response = await fetch("/api/estop", {
          method: "POST",
          headers: { "Content-Type": "application/json", },
          body: JSON.stringify({ system_id, tenant_id })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || "急停失敗");
        alert(data.message || "緊急停止指令已送出");
      } catch (error) {
        console.error(error);
        alert(error.message || "緊急停止傳送失敗");
      }
    });

    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false
        });
        document.getElementById("camera").srcObject = stream;
      } catch (error) {
        console.error("無法開啟鏡頭：", error);
        const hint = document.querySelector(".liveHint");
        if (hint) hint.textContent = "無法開啟鏡頭：請檢查瀏覽器權限";
      }
    }

    startCamera();
