(function(){
  const role = sessionStorage.getItem("role") || "";
  const tenantId = sessionStorage.getItem("tenant_id") || "";
  const defaultSystemId = sessionStorage.getItem("system_id") || "";

  const chatBox = document.getElementById("chatBox");
  const chatForm = document.getElementById("chatForm");
  const messageInput = document.getElementById("messageInput");
  const sendBtn = document.getElementById("sendBtn");

  const systemInput = document.getElementById("systemInput");
  const systemValue = document.getElementById("systemValue");
  const systemSuggestions = document.getElementById("systemSuggestions");
  const productsInput = document.getElementById("productsInput");
  const productsSuggestions = document.getElementById("productsSuggestions");
  const dateFromInput = document.getElementById("dateFromInput");
  const dateToInput = document.getElementById("dateToInput");

  const aiDot = document.getElementById("aiDot");
  const aiMode = document.getElementById("aiMode");
  const searchSummaryBtn = document.getElementById("searchSummary");
  const clearSummaryBtn = document.getElementById("clearSummary");
  const refreshSummaryBtn = document.getElementById("refreshSummary");

  let systemsCache = [];
  let productsCache = [];
  let selectedSystemId = defaultSystemId || "";
  let selectedProduct = "";
  let currentConversationId = "";

  const aiHistoryBtn = document.getElementById("aiHistoryBtn");
  const aiNewChatBtn = document.getElementById("aiNewChatBtn");
  const aiHistoryPanel = document.getElementById("aiHistoryPanel");
  const aiHistoryOverlay = document.getElementById("aiHistoryOverlay");
  const aiHistoryClose = document.getElementById("aiHistoryClose");
  const aiHistoryNewBtn = document.getElementById("aiHistoryNewBtn");
  const aiHistoryList = document.getElementById("aiHistoryList");

  function authHeaders(extra){
    return Object.assign({ "Content-Type": "application/json" }, extra || {});
  }

  function renderBotMarkdown(element, text){
    const safeText = String(text ?? "");
    if (!window.marked || !window.DOMPurify) {
      element.textContent = safeText;
      return;
    }
    try {
      const rawHtml = window.marked.parse(safeText, { breaks: true, gfm: true });
      element.innerHTML = window.DOMPurify.sanitize(rawHtml, { USE_PROFILES: { html: true } });
    } catch (err) {
      console.error("Markdown 解析失敗", err);
      element.textContent = safeText;
    }
  }

  function setMessageContent(element, text, who){
    if ((who || "bot") === "bot") renderBotMarkdown(element, text);
    else element.textContent = String(text ?? "");
  }

  function addMessage(text, who){
    const messageWho = who || "bot";
    const div = document.createElement("div");
    div.className = "msg " + messageWho;
    setMessageContent(div, text, messageWho);
    chatBox.appendChild(div);
    chatBox.scrollTop = chatBox.scrollHeight;
    return div;
  }

  function resetChat(){
    currentConversationId = "";
    chatBox.replaceChildren();
    addMessage("你好，我是這個瑕疵辨識網站的 AI 助理。你可以問我良率、NG率、事件紀錄、產品分類、機台資料或 MQTT 測試格式。", "bot");
  }

  function openHistoryPanel(){
    aiHistoryPanel?.classList.add("show");
    aiHistoryOverlay?.classList.add("show");
    loadAiHistory();
  }

  function closeHistoryPanel(){
    aiHistoryPanel?.classList.remove("show");
    aiHistoryOverlay?.classList.remove("show");
  }

  function formatHistoryTime(value){
    if (!value) return "";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleString("zh-TW", { hour12: false, month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  }

  async function loadAiHistory(){
    if (!aiHistoryList) return;
    aiHistoryList.innerHTML = '<div class="aiHistoryEmpty">載入中...</div>';
    try {
      const res = await fetch("/api/ai/history?limit=40", { credentials: "same-origin", cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || "讀取對話紀錄失敗");
      aiHistoryList.replaceChildren();
      if (!Array.isArray(data) || !data.length) {
        aiHistoryList.innerHTML = '<div class="aiHistoryEmpty">目前沒有對話紀錄</div>';
        return;
      }
      data.forEach(item => {
        const wrap = document.createElement("div");
        wrap.className = "aiHistoryItem";
        const openBtn = document.createElement("button");
        openBtn.type = "button";
        openBtn.className = "aiHistoryOpen";
        const title = document.createElement("b");
        title.textContent = item.title || "AI 品質問答";
        const time = document.createElement("span");
        time.textContent = formatHistoryTime(item.updatedAt || item.createdAt);
        openBtn.append(title, time);
        openBtn.addEventListener("click", () => loadConversation(item.conversation_id));
        const delBtn = document.createElement("button");
        delBtn.type = "button";
        delBtn.className = "aiHistoryDelete";
        delBtn.textContent = "×";
        delBtn.title = "刪除對話";
        delBtn.addEventListener("click", async () => {
          await deleteConversation(item.conversation_id);
        });
        wrap.append(openBtn, delBtn);
        aiHistoryList.appendChild(wrap);
      });
    } catch (err) {
      aiHistoryList.innerHTML = `<div class="aiHistoryEmpty">${escapeHtml(err.message || "讀取失敗")}</div>`;
    }
  }

  async function loadConversation(conversationId){
    if (!conversationId) return;
    try {
      const res = await fetch(`/api/ai/history/${encodeURIComponent(conversationId)}`, { credentials: "same-origin", cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || "讀取對話失敗");
      currentConversationId = conversationId;
      chatBox.replaceChildren();
      (Array.isArray(data.messages) ? data.messages : []).forEach(msg => {
        addMessage(msg.text || "", msg.role === "user" ? "user" : "bot");
      });
      if (!chatBox.children.length) resetChat();
      closeHistoryPanel();
    } catch (err) {
      addMessage(`對話紀錄讀取失敗：${err.message}`, "bot");
    }
  }

  async function deleteConversation(conversationId){
    if (!conversationId) return;
    try {
      await fetch(`/api/ai/history/${encodeURIComponent(conversationId)}`, { method: "DELETE", credentials: "same-origin" });
      if (currentConversationId === conversationId) resetChat();
      await loadAiHistory();
    } catch (err) {
      console.error("刪除 AI 對話失敗", err);
    }
  }

  function escapeHtml(text){
    return String(text ?? "").replace(/[&<>"']/g, function(ch){
      return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[ch];
    });
  }

  function toIsoDateTime(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toISOString();
  }

  function getFilters(options){
    const opts = options || {};
    return {
      system_id: opts.ignoreSystem ? "" : (selectedSystemId || ""),
      tenant_id: role === "super_admin" ? tenantId : "",
      products: opts.ignoreProduct ? "" : ((selectedProduct || productsInput.value || "").trim()),
      date_from: toIsoDateTime(dateFromInput?.value || ""),
      date_to: toIsoDateTime(dateToInput?.value || "")
    };
  }

  async function checkAiStatus(){
    try{
      const res = await fetch("/api/ai/status", { credentials: "same-origin", headers: {} });
      const data = await res.json();
      aiDot.classList.toggle("on", !!data.enabled);
      aiMode.textContent = data.enabled ? `Gemini API 免費層｜${data.model}` : "本機統計模式｜未設定 GEMINI_API_KEY";
    }catch(err){
      console.error(err);
      aiMode.textContent = "AI 狀態讀取失敗";
    }
  }

  function normalizeMachine(system){
    const id = String(system?.system_id || "").trim();
    const name = String(system?.name || "").trim();
    return {
      id,
      name,
      label: name ? `${name}（${id}）` : id,
      searchText: `${name} ${id}`.toLowerCase()
    };
  }

  function openMenu(menu){
    menu.classList.add("show");
  }

  function closeMenu(menu){
    menu.classList.remove("show");
  }

  function buildAutocomplete(config){
    const state = { items: [], activeIndex: -1 };
    const { input, menu, getItems, renderItem, onSelect, onRawEnter } = config;

    function refreshItems(keyword){
      const rawList = getItems(keyword || "") || [];
      state.items = rawList;
      state.activeIndex = rawList.length ? 0 : -1;
      if (!rawList.length) {
        menu.innerHTML = '<div class="autocompleteEmpty">找不到符合的資料</div>';
        openMenu(menu);
        return;
      }
      menu.innerHTML = rawList.map((item, index) => {
        const html = renderItem(item, index === state.activeIndex);
        return `<button type="button" class="autocompleteOption${index === state.activeIndex ? ' active' : ''}" data-index="${index}">${html}</button>`;
      }).join("");
      openMenu(menu);
    }

    function selectIndex(index){
      const item = state.items[index];
      if (!item) return;
      onSelect(item);
      closeMenu(menu);
    }

    menu.addEventListener("mousedown", (e) => {
      const option = e.target.closest(".autocompleteOption");
      if (!option) return;
      e.preventDefault();
      selectIndex(Number(option.dataset.index));
    });

    input.addEventListener("focus", () => refreshItems(input.value.trim()));
    input.addEventListener("input", () => refreshItems(input.value.trim()));

    input.addEventListener("keydown", (e) => {
      const max = state.items.length - 1;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (!menu.classList.contains("show")) refreshItems(input.value.trim());
        else {
          state.activeIndex = max < 0 ? -1 : Math.min(max, state.activeIndex + 1);
          refreshItems(input.value.trim());
        }
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (!menu.classList.contains("show")) refreshItems(input.value.trim());
        else {
          state.activeIndex = max < 0 ? -1 : Math.max(0, state.activeIndex - 1);
          refreshItems(input.value.trim());
        }
      } else if (e.key === "Enter") {
        if (menu.classList.contains("show")) {
          e.preventDefault();
          if (state.activeIndex >= 0 && state.items[state.activeIndex]) {
            selectIndex(state.activeIndex);
          } else if (typeof onRawEnter === "function") {
            onRawEnter(input.value.trim());
            closeMenu(menu);
          }
        } else if (typeof onRawEnter === "function") {
          onRawEnter(input.value.trim());
        }
      } else if (e.key === "Escape") {
        closeMenu(menu);
      }
    });

    document.addEventListener("click", (e) => {
      if (!menu.contains(e.target) && e.target !== input) {
        closeMenu(menu);
      }
    });

    return { refreshItems, close: () => closeMenu(menu) };
  }

  function updateSystemInputById(systemId){
    selectedSystemId = systemId || "";
    systemValue.value = selectedSystemId;
    if (!selectedSystemId) {
      systemInput.value = "全部可查看機台";
      return;
    }
    const found = systemsCache.find(item => item.id === selectedSystemId);
    systemInput.value = found ? found.label : selectedSystemId;
  }

  function updateProductInput(productName){
    selectedProduct = String(productName || "").trim();
    productsInput.value = selectedProduct;
  }

  async function loadSystems(){
    try{
      const url = role === "super_admin" && tenantId
        ? `/api/systems?tenant_id=${encodeURIComponent(tenantId)}`
        : "/api/systems";
      const res = await fetch(url, { credentials: "same-origin", headers: {} });
      const systems = await res.json();
      if (!Array.isArray(systems)) return;
      systemsCache = systems.map(normalizeMachine).filter(item => item.id);
      updateSystemInputById(defaultSystemId || "");
    }catch(err){
      console.error("讀取機台失敗", err);
    }
  }

  async function loadProducts(){
    try {
      const params = new URLSearchParams();
      const f = getFilters({ ignoreProduct: true });
      if (f.system_id) params.set("system_id", f.system_id);
      if (f.date_from) params.set("date_from", f.date_from);
      if (f.date_to) params.set("date_to", f.date_to);
      if (role === "super_admin" && f.tenant_id) params.set("tenant_id", f.tenant_id);
      const res = await fetch(`/api/summary?${params.toString()}`, { headers: {} });
      const data = await res.json();
      productsCache = Object.keys(data.byProduct || {}).filter(Boolean).sort((a,b)=>a.localeCompare(b, 'zh-Hant'));
    } catch (err) {
      console.error("讀取產品清單失敗", err);
      productsCache = [];
    }
  }

  async function refreshSummary(){
    try{
      const params = new URLSearchParams();
      const f = getFilters();
      if (f.system_id) params.set("system_id", f.system_id);
      if (f.products) params.set("products", f.products);
      if (f.date_from) params.set("date_from", f.date_from);
      if (f.date_to) params.set("date_to", f.date_to);
      if (role === "super_admin" && f.tenant_id) params.set("tenant_id", f.tenant_id);

      const res = await fetch(`/api/summary?${params.toString()}`, { headers: {} });
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
        body: JSON.stringify(Object.assign({ message, conversation_id: currentConversationId }, getFilters()))
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "AI 回覆失敗");

      setMessageContent(loading, data.reply || "沒有收到回覆", "bot");
      if (data.conversation_id) currentConversationId = data.conversation_id;
      loadAiHistory();
      if (data.mode === "local-summary-fallback") {
        aiDot.classList.remove("on");
        aiMode.textContent = "本機備援模式｜Gemini 暫時無法使用";
      } else if (data.mode === "gemini") {
        aiDot.classList.add("on");
        aiMode.textContent = `Gemini API 免費層｜${data.model || "Gemini"}`;
      }
      if (data.summary) {
        document.getElementById("statTotal").textContent = data.summary.total ?? "0";
        document.getElementById("statOk").textContent = data.summary.okCount ?? "0";
        document.getElementById("statNg").textContent = data.summary.ngCount ?? "0";
        document.getElementById("statYield").textContent = (data.summary.yieldRate ?? "0") + "%";
      }
    }catch(err){
      console.error(err);
      setMessageContent(loading, "AI 助理暫時無法回覆：" + err.message, "bot");
    }finally{
      sendBtn.disabled = false;
      sendBtn.textContent = "送出";
      chatBox.scrollTop = chatBox.scrollHeight;
    }
  }

  const systemAutocomplete = buildAutocomplete({
    input: systemInput,
    menu: systemSuggestions,
    getItems(keyword){
      const all = [{ id: "", name: "全部可查看機台", label: "全部可查看機台", searchText: "全部 可查看機台 all" }, ...systemsCache];
      const q = String(keyword || "").trim().toLowerCase();
      if (!q || q === "全部可查看機台") return all;
      return all.filter(item => item.searchText.includes(q) || item.label.toLowerCase().includes(q));
    },
    renderItem(item, active){
      return `<div class="optionLine"><b>${escapeHtml(item.name || item.label)}</b>${item.id ? `<span>${escapeHtml(item.id)}</span>` : ""}</div>`;
    },
    onSelect(item){
      updateSystemInputById(item.id || "");
      loadProducts().then(() => {
        if (selectedProduct && !productsCache.includes(selectedProduct)) updateProductInput("");
      });
    },
    onRawEnter(){
      const q = systemInput.value.trim().toLowerCase();
      const match = systemsCache.find(item => item.searchText.includes(q) || item.label.toLowerCase().includes(q));
      if (match) updateSystemInputById(match.id);
    }
  });

  const productAutocomplete = buildAutocomplete({
    input: productsInput,
    menu: productsSuggestions,
    getItems(keyword){
      const all = ["全部產品", ...productsCache];
      const q = String(keyword || "").trim().toLowerCase();
      if (!q) return all;
      return all.filter(item => item.toLowerCase().includes(q));
    },
    renderItem(item){
      return `<div class="optionLine"><b>${escapeHtml(item)}</b></div>`;
    },
    onSelect(item){
      updateProductInput(item === "全部產品" ? "" : item);
    },
    onRawEnter(rawText){
      const text = String(rawText || "").trim();
      if (!text || text === "全部產品") updateProductInput("");
      else updateProductInput(text);
    }
  });

  async function doSearch(triggerMessage){
    await loadProducts();
    await refreshSummary();
    if (triggerMessage) addMessage(triggerMessage, "bot");
  }

  function clearFilters(){
    updateSystemInputById("");
    updateProductInput("");
    dateFromInput.value = "";
    dateToInput.value = "";
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

  searchSummaryBtn?.addEventListener("click", () => doSearch("已依目前機台、產品與時間條件更新統計。"));
  clearSummaryBtn?.addEventListener("click", async () => {
    clearFilters();
    await loadProducts();
    await refreshSummary();
    addMessage("已清除條件，切換成查看全部可查看機台與全部產品。", "bot");
  });
  refreshSummaryBtn?.addEventListener("click", () => doSearch("已重新讀取目前條件的統計資料。"));

  dateFromInput?.addEventListener("change", () => loadProducts());
  dateToInput?.addEventListener("change", () => loadProducts());

  aiHistoryBtn?.addEventListener("click", openHistoryPanel);
  aiHistoryClose?.addEventListener("click", closeHistoryPanel);
  aiHistoryOverlay?.addEventListener("click", closeHistoryPanel);
  aiNewChatBtn?.addEventListener("click", resetChat);
  aiHistoryNewBtn?.addEventListener("click", () => { resetChat(); closeHistoryPanel(); });

  Promise.resolve()
    .then(checkAiStatus)
    .then(loadSystems)
    .then(loadProducts)
    .then(refreshSummary);
})();
