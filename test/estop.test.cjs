"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeAckStatus, topicSystemId, commandStatus } = require("../lib/estop.cjs");

test("E-stop ACK status is allowlisted", () => {
  assert.equal(normalizeAckStatus("EXECUTED"), "executed");
  assert.throws(() => normalizeAckStatus("unknown"));
});

test("system id is extracted from ACK topic", () => {
  assert.equal(topicSystemId("factory/control/estop/ack/S001", "factory/control/estop/ack/+"), "S001");
  assert.equal(topicSystemId("other/topic/S001", "factory/control/estop/ack/+"), "");
});

test("pending E-stop command becomes timed out", () => {
  const log = { status: "pending_ack", createdAt: new Date("2026-07-27T00:00:00Z") };
  assert.deepEqual(commandStatus(log, 30, new Date("2026-07-27T00:00:29Z")), { status: "pending_ack", timedOut: false });
  assert.deepEqual(commandStatus(log, 30, new Date("2026-07-27T00:00:30Z")), { status: "timed_out", timedOut: true });
});
