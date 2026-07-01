(function(){
  const token = sessionStorage.getItem("token");
  const role = sessionStorage.getItem("role") || "";
  const tenantId = sessionStorage.getItem("tenant_id") || "";
  const defaultSystemId = sessionStorage.getItem("system_id") || "";

  const chatBox = document.getElementById("chatBox");
  const chatForm = document.getElementById("chatForm");
  const messageInput = document.getElementById("messageInput");
  const sendBtn = document.getElementById("sendBtn");
  const systemSelect = document.getElementById("systemSelect");
  const productsInput = document.getElementById("productsInput");
  const aiDot = document.getElementById("aiDot");
  const aiMode = document.getElementById("aiMode");

  if (role === "super_admin" || role === "tenant_admin") {
    const adminNav = document.getElementById("adminNav");
    if (adminNav) adminNav.style.display = "flex";
  }

  function authHeaders(extra){
    return Object.assign({
      "Authorization": "Bearer " + token,
      "Content-Type": "application/json"
    }, extra || {});
  }

  function addMessage(text, who){
    const div = document.createElement("div");
    div.className = "msg " + (who || "bot");
    div.textContent = text;
    chatBox.appendChild(div);
    chatBox.scrollTop = chatBox.scrollHeight;
    return div;
  }

  function getFilters(){
    return {
      system_id: systemSelect.value || "",
      tenant_id: role === "super_admin" ? tenantId : "",
      products: productsInput.value.trim()
    };
  }

  async function checkAiStatus(){
    try{
      const res = await fetch("/api/ai/status", { headers: { Authorization: "Bearer " + token } });
      const data = await res.json();
      aiDot.classList.toggle("on", !!data.enabled);
      aiMode.textContent = data.enabled ? `OpenAI 模式｜${data.model}` : "本機統計模式｜未設定 OPENAI_API_KEY";
    }catch(err){
      console.error(err);
      aiMode.textContent = "AI 狀態讀取失敗";
    }
  }

  async function loadSystems(){
    try{
      const url = role === "super_admin" && tenantId
        ? `/api/systems?tenant_id=${encodeURIComponent(tenantId)}`
        : "/api/systems";
      const res = await fetch(url, { headers: { Authorization: "Bearer " + token } });
      const systems = await res.json();
      if (!Array.isArray(systems)) return;

      systems.forEach(s => {
        const id = s.system_id || "";
        if (!id) return;
        const opt = document.createElement("option");
        opt.value = id;
        opt.textContent = `${id}${s.name ? "｜" + s.name : ""}`;
        systemSelect.appendChild(opt);
      });

      if (defaultSystemId) systemSelect.value = defaultSystemId;
    }catch(err){
      console.error("讀取機台失敗", err);
    }
  }

  async function refreshSummary(){
    try{
      const params = new URLSearchParams();
      const f = getFilters();
      if (f.system_id) params.set("system_id", f.system_id);
      if (f.products) params.set("products", f.products);
      if (role === "super_admin" && f.tenant_id) params.set("tenant_id", f.tenant_id);

      const res = await fetch(`/api/summary?${params.toString()}`, {
        headers: { Authorization: "Bearer " + token }
      });
      const data = await res.json();
      document.getElementById("statTotal").textContent = data.total ?? "0";
      document.getElementById("statOk").textContent = data.okCount ?? "0";
      document.getElementById("statNg").textContent = data.ngCount ?? "0";
      document.getElementById("statYield").textContent = (data.yieldRate ?? "0.0") + "%";
    }catch(err){
      console.error(err);
      if (window.showError) window.showError("統計讀取失敗", err.message);
    }
  }

  async function askAi(message){
    addMessage(message, "user");
    const loading = addMessage("分析中...", "bot");
    sendBtn.disabled = true;
    sendBtn.textContent = "分析中";

    try{
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(Object.assign({ message }, getFilters()))
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "AI 回覆失敗");

      loading.textContent = data.reply || "沒有收到回覆";
      if (data.summary) {
        document.getElementById("statTotal").textContent = data.summary.total ?? "0";
        document.getElementById("statOk").textContent = data.summary.okCount ?? "0";
        document.getElementById("statNg").textContent = data.summary.ngCount ?? "0";
        document.getElementById("statYield").textContent = (data.summary.yieldRate ?? "0") + "%";
      }
    }catch(err){
      console.error(err);
      loading.textContent = "AI 助理暫時無法回覆：" + err.message;
    }finally{
      sendBtn.disabled = false;
      sendBtn.textContent = "送出";
      chatBox.scrollTop = chatBox.scrollHeight;
    }
  }

  chatForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const msg = messageInput.value.trim();
    if (!msg) return;
    messageInput.value = "";
    askAi(msg);
  });

  document.querySelectorAll(".quickBtn").forEach(btn => {
    btn.addEventListener("click", () => askAi(btn.dataset.q || btn.textContent));
  });

  document.getElementById("refreshSummary").addEventListener("click", refreshSummary);
  systemSelect.addEventListener("change", refreshSummary);

  Promise.resolve()
    .then(checkAiStatus)
    .then(loadSystems)
    .then(refreshSummary);
})();
