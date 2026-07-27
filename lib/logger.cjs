"use strict";

function safeDetails(details) {
  if (!details || typeof details !== "object") return details;
  const blocked = /pass|password|secret|token|authorization|cookie|otp|code/i;
  const output = {};
  for (const [key, value] of Object.entries(details)) {
    output[key] = blocked.test(key) ? "[REDACTED]" : value;
  }
  return output;
}

function write(level, message, details) {
  const entry = {
    time: new Date().toISOString(),
    level,
    message: String(message || "")
  };
  if (details !== undefined) entry.details = safeDetails(details);
  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

module.exports = {
  info(message, details) { write("info", message, details); },
  warn(message, details) { write("warn", message, details); },
  error(message, details) { write("error", message, details); }
};
