"use strict";

const crypto = require("crypto");

function loginSecurityKey(email, ip, secret) {
  return crypto
    .createHmac("sha256", String(secret || ""))
    .update(`${String(email || "").trim().toLowerCase()}|${String(ip || "")}`)
    .digest("hex");
}

function getLockState(record, now = new Date()) {
  const lockUntil = record?.lockUntil ? new Date(record.lockUntil) : null;
  const locked = Boolean(lockUntil && !Number.isNaN(lockUntil.getTime()) && lockUntil.getTime() > now.getTime());
  return {
    locked,
    retryAfterSeconds: locked ? Math.max(1, Math.ceil((lockUntil.getTime() - now.getTime()) / 1000)) : 0,
    lockUntil: locked ? lockUntil : null
  };
}

function nextFailureState(record, options = {}, now = new Date()) {
  const maxFailures = Math.max(2, Number(options.maxFailures || 5));
  const windowMs = Math.max(60_000, Number(options.windowMs || 15 * 60_000));
  const lockMs = Math.max(60_000, Number(options.lockMs || 15 * 60_000));
  const firstFailedAt = record?.firstFailedAt ? new Date(record.firstFailedAt) : null;
  const windowActive = Boolean(firstFailedAt && !Number.isNaN(firstFailedAt.getTime()) && now.getTime() - firstFailedAt.getTime() <= windowMs);
  const failures = windowActive ? Number(record?.failures || 0) + 1 : 1;
  const shouldLock = failures >= maxFailures;
  return {
    failures,
    firstFailedAt: windowActive ? firstFailedAt : now,
    lastFailedAt: now,
    lockUntil: shouldLock ? new Date(now.getTime() + lockMs) : null,
    expiresAt: new Date(now.getTime() + Math.max(windowMs, lockMs) * 2),
    shouldLock,
    remainingAttempts: shouldLock ? 0 : Math.max(0, maxFailures - failures)
  };
}

module.exports = {
  loginSecurityKey,
  getLockState,
  nextFailureState
};
