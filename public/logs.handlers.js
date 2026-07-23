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
    const element = document.getElementById('logs-handler-1');
    if (element) element.addEventListener('click', function(event) {
      const result = (function(event) { swHardReset() }).call(this, event);
      if (result === false) { event.preventDefault(); event.stopPropagation(); }
    });
  }
  {
    const element = document.getElementById('logs-handler-2');
    if (element) element.addEventListener('click', function(event) {
      const result = (function(event) { toggleDrawer(true) }).call(this, event);
      if (result === false) { event.preventDefault(); event.stopPropagation(); }
    });
  }
  {
    const element = document.getElementById('logs-handler-3');
    if (element) element.addEventListener('click', function(event) {
      const result = (function(event) { exportDefectsCsv() }).call(this, event);
      if (result === false) { event.preventDefault(); event.stopPropagation(); }
    });
  }
  {
    const element = document.getElementById('logs-handler-4');
    if (element) element.addEventListener('click', function(event) {
      const result = (function(event) { window.location.reload() }).call(this, event);
      if (result === false) { event.preventDefault(); event.stopPropagation(); }
    });
  }
  {
    const element = document.getElementById('imageModal');
    if (element) element.addEventListener('click', function(event) {
      const result = (function(event) { closeImagePreview(event) }).call(this, event);
      if (result === false) { event.preventDefault(); event.stopPropagation(); }
    });
  }
  {
    const element = document.getElementById('logs-handler-5');
    if (element) element.addEventListener('click', function(event) {
      const result = (function(event) { closeImagePreview(event) }).call(this, event);
      if (result === false) { event.preventDefault(); event.stopPropagation(); }
    });
  }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bindPageHandlers, { once: true });
  else bindPageHandlers();
})();
