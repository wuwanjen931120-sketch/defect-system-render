"use strict";

(function () {
  function sanitizeHtml(value) {
    const html = String(value ?? "");
    if (!window.DOMPurify) return "";
    return window.DOMPurify.sanitize(html, {
      FORBID_TAGS: ["script", "style", "iframe", "object", "embed", "form"],
      FORBID_ATTR: ["style", "srcdoc"],
      ALLOW_DATA_ATTR: false
    });
  }

  function setSafeHtml(element, value) {
    if (!element) return;
    element.innerHTML = sanitizeHtml(value);
  }

  function appendSafeHtml(element, value) {
    if (!element) return;
    element.insertAdjacentHTML("beforeend", sanitizeHtml(value));
  }

  window.sanitizeHtml = sanitizeHtml;
  window.setSafeHtml = setSafeHtml;
  window.appendSafeHtml = appendSafeHtml;
})();
