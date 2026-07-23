"use strict";
(function () {
  function bindPageHandlers() {
  {
    const element = document.getElementById('overlay');
    if (element) element.addEventListener('click', function(event) {
      const result = (function(event) { toggleDrawer(false) }).call(this, event);
      if (result === false) { event.preventDefault(); event.stopPropagation(); }
    });
  }
  {
    const element = document.getElementById('dashboard-handler-1');
    if (element) element.addEventListener('click', function(event) {
      const result = (function(event) { handleHardReset(event) }).call(this, event);
      if (result === false) { event.preventDefault(); event.stopPropagation(); }
    });
  }
  {
    const element = document.getElementById('dashboard-handler-2');
    if (element) element.addEventListener('click', function(event) {
      const result = (function(event) { logout() }).call(this, event);
      if (result === false) { event.preventDefault(); event.stopPropagation(); }
    });
  }
  {
    const element = document.getElementById('dashboard-handler-3');
    if (element) element.addEventListener('click', function(event) {
      const result = (function(event) { swHardReset() }).call(this, event);
      if (result === false) { event.preventDefault(); event.stopPropagation(); }
    });
  }
  {
    const element = document.getElementById('dashboard-handler-4');
    if (element) element.addEventListener('click', function(event) {
      const result = (function(event) { logout() }).call(this, event);
      if (result === false) { event.preventDefault(); event.stopPropagation(); }
    });
  }
  {
    const element = document.getElementById('dashboard-handler-5');
    if (element) element.addEventListener('click', function(event) {
      const result = (function(event) { toggleDrawer(true) }).call(this, event);
      if (result === false) { event.preventDefault(); event.stopPropagation(); }
    });
  }
  {
    const element = document.getElementById('dashboard-handler-6');
    if (element) element.addEventListener('click', function(event) {
      const result = (function(event) { forceReload(event) }).call(this, event);
      if (result === false) { event.preventDefault(); event.stopPropagation(); }
    });
  }
  {
    const element = document.getElementById('dashboard-handler-7');
    if (element) element.addEventListener('click', function(event) {
      const result = (function(event) { addProduct() }).call(this, event);
      if (result === false) { event.preventDefault(); event.stopPropagation(); }
    });
  }
  {
    const element = document.getElementById('dashboard-handler-8');
    if (element) element.addEventListener('click', function(event) {
      const result = (function(event) { demoEstop() }).call(this, event);
      if (result === false) { event.preventDefault(); event.stopPropagation(); }
    });
  }
  {
    const element = document.getElementById('dashboard-handler-9');
    if (element) element.addEventListener('click', function(event) {
      const result = (function(event) { downloadCSV() }).call(this, event);
      if (result === false) { event.preventDefault(); event.stopPropagation(); }
    });
  }
  {
    const element = document.getElementById('trendProductSelect');
    if (element) element.addEventListener('change', function(event) {
      const result = (function(event) { renderYieldTrend() }).call(this, event);
      if (result === false) { event.preventDefault(); event.stopPropagation(); }
    });
  }
  {
    const element = document.getElementById('trendLimitSelect');
    if (element) element.addEventListener('change', function(event) {
      const result = (function(event) { renderYieldTrend() }).call(this, event);
      if (result === false) { event.preventDefault(); event.stopPropagation(); }
    });
  }
  {
    const element = document.getElementById('dashboard-handler-10');
    if (element) element.addEventListener('click', function(event) {
      const result = (function(event) { saveYieldAlertSettingsFromUI() }).call(this, event);
      if (result === false) { event.preventDefault(); event.stopPropagation(); }
    });
  }
  {
    const element = document.getElementById('dashboard-handler-11');
    if (element) element.addEventListener('click', function(event) {
      const result = (function(event) { requestBrowserNotification() }).call(this, event);
      if (result === false) { event.preventDefault(); event.stopPropagation(); }
    });
  }
  {
    const element = document.getElementById('dashboard-handler-12');
    if (element) element.addEventListener('click', function(event) {
      const result = (function(event) { clearYieldAlertLogs() }).call(this, event);
      if (result === false) { event.preventDefault(); event.stopPropagation(); }
    });
  }
  {
    const element = document.getElementById('dashboard-handler-13');
    if (element) element.addEventListener('click', function(event) {
      const result = (function(event) { renderNgImageArchive() }).call(this, event);
      if (result === false) { event.preventDefault(); event.stopPropagation(); }
    });
  }
  {
    const element = document.getElementById('dashboard-handler-14');
    if (element) element.addEventListener('click', function(event) {
      const result = (function(event) { loadMachineRanking(true) }).call(this, event);
      if (result === false) { event.preventDefault(); event.stopPropagation(); }
    });
  }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bindPageHandlers, { once: true });
  else bindPageHandlers();
})();
