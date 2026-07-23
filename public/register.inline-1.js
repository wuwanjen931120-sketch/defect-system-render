const API_BASE = window.location.origin;

    function showErr(msg){
      const errBox = document.getElementById("errBox");
      const okBox = document.getElementById("okBox");
      okBox.style.display = "none";
      errBox.style.display = "block";
      errBox.textContent = "⚠️ " + msg;
    }

    function showOk(msg){
      const errBox = document.getElementById("errBox");
      const okBox = document.getElementById("okBox");
      errBox.style.display = "none";
      okBox.style.display = "block";
      okBox.textContent = "✅ " + msg;
    }

    function clearMsg(){
      document.getElementById("errBox").style.display = "none";
      document.getElementById("okBox").style.display = "none";
    }

    async function doRegister(){
      clearMsg();

      const company = document.getElementById("company").value.trim();
      const username = document.getElementById("username").value.trim();
      const password = document.getElementById("password").value;
      const invite_code = document.getElementById("inviteCode").value.trim();

      if(!company || !username || !password){
        showErr("請完整輸入公司名稱、帳號、密碼");
        return;
      }
      if(password.length < 10 || !/[A-Za-z]/.test(password) || !/\d/.test(password)){
        showErr("密碼至少 10 碼，且需包含英文字母與數字");
        return;
      }

      try{
        const res = await fetch(`${API_BASE}/api/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            company,
            username,
            password,
            invite_code
          })
        });

        const data = await res.json();

        if(!res.ok){
          showErr(data.message || "註冊失敗");
          return;
        }

        showOk("註冊成功，2 秒後前往登入頁");
        setTimeout(() => {
          location.href = "login.html";
        }, 2000);

      }catch(err){
        console.error(err);
        showErr("無法連線後端或後端尚未部署最新版本");
      }
    }

    document.getElementById("btnRegister").addEventListener("click", doRegister);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Enter") doRegister();
    });
