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





    function validateInt(value,min,max,name) {
      const n=Number(String(value??"").trim());
      if(!Number.isInteger(n)||n<min||n>max) return {ok:false,message:`${name} 必須是 ${min}～${max} 的整數`};
      return {ok:true,value:n};
    }
    async function saveSettings(e) {
      e?.preventDefault?.();
      const system_id=document.getElementById("thresholdSystemSelect")?.value;
      if(!system_id){alert("請先選擇機台");return;}
      const ng=validateInt(document.getElementById("ngThreshold").value,1,20,"連續 NG 門檻");
      const fps=validateInt(document.getElementById("fpsMin").value,5,60,"FPS 下限");
      if(!ng.ok||!fps.ok){alert(!ng.ok?ng.message:fps.message);return;}
      const status=document.getElementById("thresholdStatus");
      try{
        const r=await fetch("/api/machine-settings",{method:"PUT",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({system_id,ngThreshold:ng.value,fpsMin:fps.value})});
        const d=await r.json();if(!r.ok)throw Error(d.message||"儲存失敗");
        status.textContent="設定已保存至 MongoDB（"+system_id+"）";
        toast("設定已儲存至後端","OK");
        await loadSettings(false);
      }catch(err){status.textContent="儲存失敗："+err.message;alert(err.message);}
    }
    async function loadSettings(showMessage=true) {
      const system_id=document.getElementById("thresholdSystemSelect")?.value;
      const status=document.getElementById("thresholdStatus");
      const live=document.getElementById("fpsLiveState");
      if(!system_id){if(status)status.textContent="請先選擇機台";if(live)live.textContent="無資料";return;}
      try {
        const r=await fetch("/api/machine-settings?system_id="+encodeURIComponent(system_id),{credentials:"include",cache:"no-store"});
        const d=await r.json();if(!r.ok)throw Error(d.message||"載入失敗");
        document.getElementById("ngThreshold").value=d.ngThreshold;
        document.getElementById("fpsMin").value=d.fpsMin;
        if(status)status.textContent="目前機台："+system_id+"（設定取自 MongoDB）";
        if(live)live.textContent=d.fps_state==="no_data"?"無資料（尚無近期現場 FPS 回報）":`實測 FPS：${d.fps} ｜ ${d.fps_state==="low"?"低於警戒門檻":"正常"} ｜ 下限 ${d.fpsMin}`;
        if(showMessage)toast("已載入機台設定","OK");
      }catch(err){if(status)status.textContent="載入失敗："+err.message;if(live)live.textContent="無資料";}
    }
    async function loadThresholdMachines(){
      const sel=document.getElementById("thresholdSystemSelect");if(!sel)return;
      try{
        const r=await fetch("/api/systems?limit=500",{credentials:"include"});
        const list=await r.json();if(!r.ok)throw Error(list.message||"機台取得失敗");
        sel.replaceChildren(new Option("請選擇機台",""));
        for(const x of (Array.isArray(list)?list:[])){if(x.system_id)sel.add(new Option(`${x.name||x.system_id} (${x.system_id})`,x.system_id));}
        sel.addEventListener("change",()=>loadSettings(false));
        if(sel.options.length===2){sel.selectedIndex=1;await loadSettings(false);}
      }catch(err){document.getElementById("thresholdStatus").textContent="機台清單取得失敗："+err.message;}
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
  loadThresholdMachines(); // 按機台載入 MongoDB 門檻
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

let renameSystemsCache=[];
function professionalMachineName(index){
  const letters="ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const suffix=index<letters.length?letters[index]:String(index+1);
  return `AI 視覺分流站 ${suffix}`;
}
async function loadRenameSystems(){
  const sel=document.getElementById("renameSystemSelect");
  if(!sel)return;
  try{
    const tenantId=sessionStorage.getItem("tenant_id")||"";
    const role=sessionStorage.getItem("role")||"";
    const url=role==="super_admin"&&tenantId?`/api/systems?tenant_id=${encodeURIComponent(tenantId)}`:"/api/systems";
    const r=await fetch(url,{credentials:"include"});
    const list=await r.json();
    renameSystemsCache=(Array.isArray(list)?list:[]).filter(m=>m&&m.system_id);
    sel.innerHTML='<option value="">請選擇機台</option>';
    renameSystemsCache.forEach((m,index)=>{
      if(!m.system_id)return;
      const opt=document.createElement("option");
      opt.value=m.system_id;
      opt.dataset.name=m.name||"";
      const displayName=(m.name&&m.name!=="預設機台")?m.name:professionalMachineName(index);
      opt.textContent=displayName;
      opt.title=`system_id：${m.system_id}`;
      sel.appendChild(opt);
    });
  }catch(e){console.error(e);}
}
async function createMachine(){const id=document.getElementById("newSystemId")?.value.trim(),name=document.getElementById("newSystemName")?.value.trim(),out=document.getElementById("machineCreateStatus");if(!id||!name){out.textContent="請輸入機台 ID 與名稱";return;}try{const r=await fetch("/api/systems",{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({system_id:id,name})});const d=await r.json();if(!r.ok)throw new Error(d.message||"新增失敗");out.textContent=`新增成功：${name}（${id}）。MQTT payload 請繼續使用機台 ID：${id}`;document.getElementById("newSystemId").value="";document.getElementById("newSystemName").value="";await loadRenameSystems();}catch(e){out.textContent=e.message;}}
async function renameMachine(){
  const sel=document.getElementById("renameSystemSelect"), input=document.getElementById("renameSystemName"), out=document.getElementById("machineRenameStatus");
  const id=sel?.value||"", name=input?.value.trim()||"";
  if(!id||!name){if(out)out.textContent="請選擇機台並輸入新的顯示名稱";return;}
  try{
    const body={name};
    const role=sessionStorage.getItem("role")||"", tenantId=sessionStorage.getItem("tenant_id")||"";
    if(role==="super_admin"&&tenantId)body.tenant_id=tenantId;
    const r=await fetch(`/api/systems/${encodeURIComponent(id)}/name`,{method:"PATCH",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
    const d=await r.json();
    if(!r.ok)throw new Error(d.message||"修改失敗");
    if(out)out.textContent=`已更新為：${name}`;
    input.value="";
    await loadRenameSystems();
  }catch(e){if(out)out.textContent=e.message;}
}
document.getElementById("renameSystemSelect")?.addEventListener("change",e=>{const opt=e.target.selectedOptions?.[0];const input=document.getElementById("renameSystemName");if(input)input.value=opt?.dataset?.name||"";});
document.getElementById("createSystemBtn")?.addEventListener("click",createMachine);
document.getElementById("renameSystemBtn")?.addEventListener("click",renameMachine);
document.getElementById("applyProfessionalNamesBtn")?.addEventListener("click",applyProfessionalNames);
async function applyProfessionalNames(){
  const out=document.getElementById("machineRenameStatus");
  const targets=renameSystemsCache.filter(m=>!String(m.name||"").trim()||String(m.name||"").trim()==="預設機台");
  if(!targets.length){if(out)out.textContent="目前所有機台都已經有自訂名稱，不需修改。";return;}
  const role=sessionStorage.getItem("role")||"", tenantId=sessionStorage.getItem("tenant_id")||"";
  try{
    for(let i=0;i<targets.length;i++){
      const m=targets[i];
      const originalIndex=Math.max(0,renameSystemsCache.findIndex(x=>x.system_id===m.system_id));
      const name=professionalMachineName(originalIndex);
      const body={name};
      if(role==="super_admin"&&tenantId)body.tenant_id=tenantId;
      const r=await fetch(`/api/systems/${encodeURIComponent(m.system_id)}/name`,{method:"PATCH",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
      const d=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(d.message||`修改 ${m.system_id} 失敗`);
    }
    if(out)out.textContent=`已套用 ${targets.length} 台機台的專業名稱；system_id 維持不變。`;
    await loadRenameSystems();
  }catch(e){if(out)out.textContent=e.message;}
}

document.addEventListener("DOMContentLoaded",loadRenameSystems);

// 輕量更新觀測值，不刷新表單；避免覆蓋操作人員尚未儲存的編輯。
setInterval(async()=>{const id=document.getElementById("thresholdSystemSelect")?.value;if(!id)return;try{const r=await fetch("/api/machine-settings?system_id="+encodeURIComponent(id),{credentials:"include",cache:"no-store"});if(!r.ok)return;const d=await r.json();const el=document.getElementById("fpsLiveState");if(el)el.textContent=d.fps_state==="no_data"?"無資料（尚無近期現場 FPS 回報）":`實測 FPS：${d.fps} ｜ ${d.fps_state==="low"?"低於警戒門檻":"正常"} ｜ 下限 ${d.fpsMin}`;}catch(_){}},10000);

// Admin-only server-controlled data mode selector.
(() => {
  const role = sessionStorage.getItem("role");
  if (role !== "super_admin") return;
  const panel=document.getElementById("machineDataModePanel"), machine=document.getElementById("thresholdSystemSelect");
  const sel=document.getElementById("machineDataMode"), status=document.getElementById("machineDataModeStatus"),save=document.getElementById("saveMachineDataMode");
  if(!panel||!machine||!sel||!save) return;
  panel.hidden=false;
  async function load(){
    const id=machine.value; if(!id){status.textContent="請先選擇機台";return;}
    try{const r=await fetch("/api/admin/data-mode?system_id="+encodeURIComponent(id),{credentials:"include",cache:"no-store"});const d=await r.json();if(!r.ok)throw new Error(d.message||"讀取失敗");sel.value=d.mode;status.textContent="目前機台："+id+"｜模式："+d.mode;}catch(e){status.textContent=e.message;}
  }
  machine.addEventListener("change",load);
  save.addEventListener("click",async()=>{
    if(!machine.value){status.textContent="請先選擇機台";return;}
    if(sel.value==="PRODUCTION"&&!confirm("確定啟用正式模式？此機台後續的新事件將計入正式統計，請先確認 MQTT 模擬程式已停止。"))return;
    try{const r=await fetch("/api/admin/data-mode",{method:"PUT",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({system_id:machine.value,mode:sel.value})});const d=await r.json();if(!r.ok)throw new Error(d.message||"儲存失敗");status.textContent="已儲存至 MongoDB："+d.mode;}catch(e){status.textContent=e.message;}
  });
  setTimeout(load,1200);
})();
