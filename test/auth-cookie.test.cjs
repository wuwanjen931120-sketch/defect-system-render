"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  parseCookieHeader,
  getSessionToken,
  buildSessionCookie,
  buildClearCookie
} = require("../lib/auth-cookie.cjs");

test("cookie parser decodes values", () => {
  assert.deepEqual(parseCookieHeader("a=1; defect_session=abc%2E123"), {
    a: "1",
    defect_session: "abc.123"
  });
});

test("cookie token is preferred over bearer token", () => {
  const token = getSessionToken({
    headers: {
      cookie: "defect_session=cookie-token",
      authorization: "Bearer header-token"
    }
  });
  assert.equal(token, "cookie-token");
});

test("auth cookie is HttpOnly, Lax and secure in production", () => {
  const value = buildSessionCookie("abc", { secure: true, maxAgeSeconds: 3600 });
  assert.match(value, /HttpOnly/);
  assert.match(value, /SameSite=Lax/);
  assert.match(value, /Secure/);
  assert.match(value, /Max-Age=3600/);
});

test("clear cookie expires immediately", () => {
  const value = buildClearCookie({ secure: true });
  assert.match(value, /Max-Age=0/);
  assert.match(value, /Expires=Thu, 01 Jan 1970/);
});
