"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const security = require("../lib/security.cjs");

test("normalize email", () => {
  assert.equal(security.normalizeEmail(" Test@Example.COM "), "test@example.com");
});

test("password policy", () => {
  assert.equal(security.validatePassword("123456").valid, false);
  assert.equal(security.validatePassword("password123").valid, false);
  assert.equal(security.validatePassword("SafePassword2026").valid, true);
});

test("MQTT payload supports case_id and timestamp", () => {
  const result = security.normalizeDefectPayload({
    system_id: "S1",
    case_id: "A1",
    status: "ok",
    timestamp: "2026-07-21T12:00:00+08:00"
  });
  assert.equal(result.items[0].id, "A1");
  assert.equal(result.items[0].status, "OK");
  assert.equal(result.items[0].timestamp.toISOString(), "2026-07-21T04:00:00.000Z");
});

test("MQTT payload rejects invalid status and image URL", () => {
  assert.throws(() => security.normalizeDefectPayload({ system_id: "S1", id: "A1", status: "BAD" }));
  assert.throws(() => security.normalizeDefectPayload({ system_id: "S1", id: "A1", status: "NG", image_url: "javascript:alert(1)" }));
});

test("OTP hash is normalized", () => {
  assert.equal(
    security.hashOtp("A@B.COM", "123456", "secret"),
    security.hashOtp("a@b.com", "123456", "secret")
  );
});

test("timing safe text comparison", () => {
  assert.equal(security.timingSafeTextEqual("invite-123", "invite-123"), true);
  assert.equal(security.timingSafeTextEqual("invite-123", "invite-456"), false);
});

test("CSV cell prevents formula injection", () => {
  assert.equal(security.csvCell("=1+1"), '"\'=1+1"');
  assert.equal(security.csvCell('a"b'), '"a""b"');
});

test("clamp", () => {
  assert.equal(security.clampInt("999", 20, 1, 100), 100);
});
