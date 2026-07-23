"use strict";
(function () {
  function bindPageHandlers() {
  {
    const element = document.getElementById('register-handler-1');
    if (element) element.addEventListener('click', function(event) {
      const result = (function(event) { location.href='login.html' }).call(this, event);
      if (result === false) { event.preventDefault(); event.stopPropagation(); }
    });
  }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bindPageHandlers, { once: true });
  else bindPageHandlers();
})();
