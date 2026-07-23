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
    const element = document.getElementById('settings-handler-1');
    if (element) element.addEventListener('click', function(event) {
      const result = (function(event) { swHardReset() }).call(this, event);
      if (result === false) { event.preventDefault(); event.stopPropagation(); }
    });
  }
  {
    const element = document.getElementById('settings-handler-2');
    if (element) element.addEventListener('click', function(event) {
      const result = (function(event) { toggleDrawer(true) }).call(this, event);
      if (result === false) { event.preventDefault(); event.stopPropagation(); }
    });
  }
  {
    const element = document.getElementById('settings-handler-3');
    if (element) element.addEventListener('click', function(event) {
      const result = (function(event) { logout() }).call(this, event);
      if (result === false) { event.preventDefault(); event.stopPropagation(); }
    });
  }
  {
    const element = document.getElementById('settings-handler-4');
    if (element) element.addEventListener('click', function(event) {
      const result = (function(event) { saveSettings() }).call(this, event);
      if (result === false) { event.preventDefault(); event.stopPropagation(); }
    });
  }
  {
    const element = document.getElementById('settings-handler-5');
    if (element) element.addEventListener('click', function(event) {
      const result = (function(event) { loadSettings() }).call(this, event);
      if (result === false) { event.preventDefault(); event.stopPropagation(); }
    });
  }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bindPageHandlers, { once: true });
  else bindPageHandlers();
})();
