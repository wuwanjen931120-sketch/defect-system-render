"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { collectEnvironmentErrors, validateEnvironment } = require("../lib/env-validation.cjs");

function validEnv(overrides = {}) {
  return {
    NODE_ENV: "production",
    MONGODB_URI: "mongodb+srv://account:secret@example.mongodb.net/defects",
    JWT_SECRET: "a-strong-random-secret-that-is-longer-than-32-characters",
    APP_BASE_URL: "https://example.onrender.com",
    ALLOWED_ORIGINS: "https://example.onrender.com",
    AUTH_COOKIE_SAME_SITE: "Strict",
    AUTH_COOKIE_SECURE: "true",
    REQUIRE_EMAIL_LOGIN: "true",
    SMTP_USER: "smtp-user",
    SMTP_PASS: "smtp-password",
    SMTP_FROM: "sender@example.com",
    ALLOW_PUBLIC_REGISTRATION: "false",
    ...overrides
  };
}

test("valid production environment passes", () => {
  assert.equal(validateEnvironment(validEnv()), true);
});

test("production public registration requires a strong invite code", () => {
  const errors = collectEnvironmentErrors(validEnv({
    ALLOW_PUBLIC_REGISTRATION: "true",
    REGISTRATION_INVITE_CODE: "short"
  }));
  assert.ok(errors.some(message => message.includes("REGISTRATION_INVITE_CODE")));
});

test("partial MQTT configuration is rejected", () => {
  const errors = collectEnvironmentErrors(validEnv({ MQTT_URL: "mqtts://broker.example.com" }));
  assert.ok(errors.some(message => message.includes("MQTT_URL、HIVEMQ_USER、HIVEMQ_PASS")));
});

test("production requires HTTPS origins and SMTP for OTP login", () => {
  const errors = collectEnvironmentErrors(validEnv({
    APP_BASE_URL: "http://example.com",
    ALLOWED_ORIGINS: "http://example.com",
    SMTP_PASS: ""
  }));
  assert.ok(errors.some(message => message.includes("APP_BASE_URL")));
  assert.ok(errors.some(message => message.includes("ALLOWED_ORIGINS")));
  assert.ok(errors.some(message => message.includes("SMTP_PASS")));
});
