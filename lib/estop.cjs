"use strict";

const ACK_STATUSES = new Set(["acknowledged", "executed", "rejected", "failed"]);

function normalizeAckStatus(value) {
  const status = String(value || "acknowledged").trim().toLowerCase();
  if (!ACK_STATUSES.has(status)) throw new Error("E-stop ACK status 不正確");
  return status;
}

function topicSystemId(topic, prefix) {
  const cleanPrefix = String(prefix || "").replace(/\+.*$/, "");
  if (!cleanPrefix || !String(topic || "").startsWith(cleanPrefix)) return "";
  return decodeURIComponent(String(topic).slice(cleanPrefix.length).replace(/^\/+/, "").split("/")[0] || "");
}

function commandStatus(log, timeoutSeconds, now = new Date()) {
  if (!log) return { status: "not_found", timedOut: false };
  if (log.status !== "pending_ack") return { status: log.status, timedOut: false };
  const requestedAt = new Date(log.createdAt || log.requested_at || 0);
  const timedOut = !Number.isNaN(requestedAt.getTime()) && now.getTime() - requestedAt.getTime() >= Math.max(1, Number(timeoutSeconds || 30)) * 1000;
  return { status: timedOut ? "timed_out" : "pending_ack", timedOut };
}

module.exports = {
  ACK_STATUSES,
  normalizeAckStatus,
  topicSystemId,
  commandStatus
};
