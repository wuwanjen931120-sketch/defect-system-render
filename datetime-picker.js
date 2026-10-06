(function () {
  "use strict";

  const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];
  const pad2 = n => String(n).padStart(2, "0");

  function parseValue(value) {
    if (!value) return null;
    const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
    if (!match) return null;
    return {
      year: Number(match[1]),
      month: Number(match[2]) - 1,
      day: Number(match[3]),
      hour: Number(match[4]),
      minute: Number(match[5])
    };
  }

  function toInputValue(state) {
    return `${state.year}-${pad2(state.month + 1)}-${pad2(state.day)}T${pad2(state.hour)}:${pad2(state.minute)}`;
  }

  function toDisplayValue(state) {
    return `${state.year}/${pad2(state.month + 1)}/${pad2(state.day)}  ${pad2(state.hour)}:${pad2(state.minute)}`;
  }

  function sameDate(a, b) {
    return !!a && !!b && a.year === b.year && a.month === b.month && a.day === b.day;
  }

  function makeButton(className, text, label) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = className;
    btn.textContent = text;
    if (label) btn.setAttribute("aria-label", label);
    return btn;
  }

  function buildSelect(start, end, step = 1) {
    const select = document.createElement("select");
    for (let n = start; n <= end; n += step) {
      const option = document.createElement("option");
      option.value = String(n);
      option.textContent = pad2(n);
      select.appendChild(option);
    }
    return select;
  }

  function initPicker(input) {
    if (!input || input.dataset.dtpReady === "1") return;
    input.dataset.dtpReady = "1";

    const labelText = input.dataset.pickerLabel || "選擇日期與時間";
    const current = parseValue(input.value);
    const now = new Date();

    let selected = current || {
      year: now.getFullYear(),
      month: now.getMonth(),
      day: now.getDate(),
      hour: now.getHours(),
      minute: now.getMinutes()
    };
    let viewYear = selected.year;
    let viewMonth = selected.month;

    const wrap = document.createElement("div");
    wrap.className = "dtp-wrap";

    const trigger = makeButton("dtp-trigger", "", labelText);
    trigger.setAttribute("aria-expanded", "false");
    trigger.innerHTML = `<span class="dtp-trigger-placeholder"></span><span class="dtp-trigger-icon" aria-hidden="true">📅</span>`;

    const popover = document.createElement("div");
    popover.className = "dtp-popover";
    popover.hidden = true;

    const head = document.createElement("div");
    head.className = "dtp-head";
    const prevBtn = makeButton("dtp-nav", "‹", "上個月");
    const monthTitle = document.createElement("div");
    monthTitle.className = "dtp-month-title";
    const nextBtn = makeButton("dtp-nav", "›", "下個月");
    head.append(prevBtn, monthTitle, nextBtn);

    const weekdays = document.createElement("div");
    weekdays.className = "dtp-weekdays";
    WEEKDAYS.forEach(day => {
      const el = document.createElement("div");
      el.className = "dtp-weekday";
      el.textContent = day;
      weekdays.appendChild(el);
    });

    const days = document.createElement("div");
    days.className = "dtp-days";

    const timeRow = document.createElement("div");
    timeRow.className = "dtp-time-row";
    const timeLabel = document.createElement("div");
    timeLabel.className = "dtp-time-label";
    timeLabel.textContent = "時間";
    const hourSelect = buildSelect(0, 23);
    const colon = document.createElement("div");
    colon.className = "dtp-colon";
    colon.textContent = ":";
    const minuteSelect = buildSelect(0, 59);
    timeRow.append(timeLabel, hourSelect, colon, minuteSelect);

    const actions = document.createElement("div");
    actions.className = "dtp-actions";
    const clearBtn = makeButton("dtp-action", "清除");
    const todayBtn = makeButton("dtp-action", "今天");
    const applyBtn = makeButton("dtp-action dtp-action-primary", "確定");
    actions.append(clearBtn, todayBtn, applyBtn);

    popover.append(head, weekdays, days, timeRow, actions);
    wrap.append(trigger, popover);
    input.insertAdjacentElement("afterend", wrap);

    function refreshTrigger() {
      const parsed = parseValue(input.value);
      const text = trigger.querySelector("span:first-child");
      if (parsed) {
        text.className = "dtp-trigger-value";
        text.textContent = toDisplayValue(parsed);
      } else {
        text.className = "dtp-trigger-placeholder";
        text.textContent = labelText;
      }
    }

    function renderCalendar() {
      monthTitle.textContent = `${viewYear} 年 ${viewMonth + 1} 月`;
      days.replaceChildren();

      const firstDay = new Date(viewYear, viewMonth, 1).getDay();
      const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
      const prevMonthDays = new Date(viewYear, viewMonth, 0).getDate();
      const today = {
        year: now.getFullYear(),
        month: now.getMonth(),
        day: now.getDate()
      };

      for (let index = 0; index < 42; index++) {
        let year = viewYear;
        let month = viewMonth;
        let day = index - firstDay + 1;
        let other = false;

        if (day < 1) {
          other = true;
          month = viewMonth - 1;
          if (month < 0) { month = 11; year--; }
          day = prevMonthDays + day;
        } else if (day > daysInMonth) {
          other = true;
          month = viewMonth + 1;
          if (month > 11) { month = 0; year++; }
          day -= daysInMonth;
        }

        const dateState = { year, month, day };
        const btn = makeButton("dtp-day", String(day), `${year}/${month + 1}/${day}`);
        if (other) btn.classList.add("is-other-month");
        if (sameDate(dateState, today)) btn.classList.add("is-today");
        if (sameDate(dateState, selected)) btn.classList.add("is-selected");

        btn.addEventListener("click", () => {
          selected = { ...selected, year, month, day };
          viewYear = year;
          viewMonth = month;
          renderCalendar();
        });
        days.appendChild(btn);
      }

      hourSelect.value = String(selected.hour);
      minuteSelect.value = String(selected.minute);
    }

    function open() {
      const parsed = parseValue(input.value);
      if (parsed) selected = parsed;
      viewYear = selected.year;
      viewMonth = selected.month;
      renderCalendar();
      popover.hidden = false;
      trigger.setAttribute("aria-expanded", "true");
    }

    function close() {
      popover.hidden = true;
      trigger.setAttribute("aria-expanded", "false");
    }

    trigger.addEventListener("click", () => {
      popover.hidden ? open() : close();
    });

    prevBtn.addEventListener("click", () => {
      viewMonth--;
      if (viewMonth < 0) { viewMonth = 11; viewYear--; }
      renderCalendar();
    });

    nextBtn.addEventListener("click", () => {
      viewMonth++;
      if (viewMonth > 11) { viewMonth = 0; viewYear++; }
      renderCalendar();
    });

    hourSelect.addEventListener("change", () => { selected.hour = Number(hourSelect.value); });
    minuteSelect.addEventListener("change", () => { selected.minute = Number(minuteSelect.value); });

    todayBtn.addEventListener("click", () => {
      const d = new Date();
      selected = {
        year: d.getFullYear(), month: d.getMonth(), day: d.getDate(),
        hour: d.getHours(), minute: d.getMinutes()
      };
      viewYear = selected.year;
      viewMonth = selected.month;
      renderCalendar();
    });

    clearBtn.addEventListener("click", () => {
      input.value = "";
      input.dispatchEvent(new Event("change", { bubbles: true }));
      refreshTrigger();
      close();
    });

    applyBtn.addEventListener("click", () => {
      selected.hour = Number(hourSelect.value);
      selected.minute = Number(minuteSelect.value);
      input.value = toInputValue(selected);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      refreshTrigger();
      close();
    });

    document.addEventListener("pointerdown", event => {
      if (!wrap.contains(event.target)) close();
    });

    document.addEventListener("keydown", event => {
      if (event.key === "Escape" && !popover.hidden) {
        close();
        trigger.focus();
      }
    });

    refreshTrigger();
  }

  function initAll() {
    document.querySelectorAll("input[data-datetime-picker]").forEach(initPicker);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAll, { once: true });
  } else {
    initAll();
  }
})();
