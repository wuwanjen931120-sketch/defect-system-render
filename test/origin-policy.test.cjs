"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizeOrigin,
  buildConfiguredOrigins,
  getRequestOrigin,
  isOriginAllowed
} = require("../lib/origin-policy.cjs");

test("origin normalization removes paths and trailing slashes", () => {
  assert.equal(normalizeOrigin(" https://Example.COM/path/ "), "https://example.com");
  assert.equal(normalizeOrigin("not-a-url"), "");
});

test("configured origins include app, allowlist and Render hostname", () => {
  const origins = buildConfiguredOrigins({
    APP_BASE_URL: "https://app.example.com/",
    ALLOWED_ORIGINS: "https://admin.example.com, https://app.example.com/path",
    RENDER_EXTERNAL_HOSTNAME: "service-123.onrender.com"
  });
  assert.equal(origins.has("https://app.example.com"), true);
  assert.equal(origins.has("https://admin.example.com"), true);
  assert.equal(origins.has("https://service-123.onrender.com"), true);
});

test("same Render request origin is allowed even when env URL is stale", () => {
  const req = {
    protocol: "http",
    headers: {
      host: "internal-render-host",
      "x-forwarded-host": "new-service.onrender.com",
      "x-forwarded-proto": "https"
    }
  };
  const origins = buildConfiguredOrigins({ APP_BASE_URL: "https://old-service.onrender.com" });
  assert.equal(getRequestOrigin(req), "https://new-service.onrender.com");
  assert.equal(isOriginAllowed(req, "https://new-service.onrender.com", origins), true);
  assert.equal(isOriginAllowed(req, "https://evil.example.com", origins), false);
});

test("requests without an Origin header remain supported", () => {
  assert.equal(isOriginAllowed({ headers: {} }, "", new Set()), true);
});
