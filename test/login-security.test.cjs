"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { loginSecurityKey, getLockState, nextFailureState } = require("../lib/login-security.cjs");

test("login security key is normalized and IP-specific", () => {
  assert.equal(
    loginSecurityKey("USER@EXAMPLE.COM", "1.2.3.4", "secret"),
    loginSecurityKey("user@example.com", "1.2.3.4", "secret")
  );
  assert.notEqual(
    loginSecurityKey("user@example.com", "1.2.3.4", "secret"),
    loginSecurityKey("user@example.com", "5.6.7.8", "secret")
  );
});

test("failed attempts lock after configured threshold", () => {
  const now = new Date("2026-07-27T00:00:00Z");
  let record = null;
  for (let i = 1; i <= 5; i += 1) {
    const state = nextFailureState(record, { maxFailures: 5, windowMs: 900000, lockMs: 900000 }, now);
    record = state;
    assert.equal(state.shouldLock, i === 5);
  }
  const lock = getLockState(record, now);
  assert.equal(lock.locked, true);
  assert.equal(lock.retryAfterSeconds, 900);
});

test("failure window resets after it expires", () => {
  const record = {
    failures: 4,
    firstFailedAt: new Date("2026-07-27T00:00:00Z")
  };
  const state = nextFailureState(record, { maxFailures: 5, windowMs: 60000, lockMs: 60000 }, new Date("2026-07-27T00:02:00Z"));
  assert.equal(state.failures, 1);
  assert.equal(state.shouldLock, false);
});
