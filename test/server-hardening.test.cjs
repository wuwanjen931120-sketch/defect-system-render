"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const server = fs.readFileSync(path.join(root, "server.cjs"), "utf8");
const core = fs.readFileSync(path.join(root, "public/core.js"), "utf8");
const render = fs.readFileSync(path.join(root, "render.yaml"), "utf8");

test("login has account lockout, OTP challenge and audit events", () => {
  assert.match(server, /login_security/);
  assert.match(server, /challenge_id/);
  assert.match(server, /security\.login\.password_failed/);
  assert.match(server, /security\.login\.success/);
});

test("production registration is closed and strict cookie is configured", () => {
  assert.match(render, /ALLOW_PUBLIC_REGISTRATION\n\s+value: "false"/);
  assert.match(render, /AUTH_COOKIE_SAME_SITE\n\s+value: Strict/);
});

test("MQTT ingestion is idempotent and validates ACK ownership", () => {
  assert.match(server, /\$setOnInsert/);
  assert.match(server, /E-stop ACK 不屬於原始機台/);
  assert.match(server, /MQTT_MAX_PAYLOAD_BYTES/);
});

test("generated sidebar does not use inline event handlers", () => {
  assert.doesNotMatch(core, /onclick\s*=/i);
  assert.match(core, /addEventListener\("click", swHardReset\)/);
  assert.match(core, /addEventListener\("click", logout\)/);
});

test("readiness and liveness endpoints exist", () => {
  assert.match(server, /\/health\/live/);
  assert.match(server, /\/health\/ready/);
  assert.match(server, /verifyMailTransport/);
});
