"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const publicDir = path.join(root, "public");

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

test("required pages and PWA assets exist", () => {
  [
    "public/index.html",
    "public/login.html",
    "public/dashboard.html",
    "public/logs.html",
    "public/settings.html",
    "public/ai.html",
    "public/manifest.webmanifest",
    "public/sw.js",
    "public/icon-192.png",
    "public/icon-512.png",
    "public/offline.html"
  ].forEach(file => assert.equal(exists(file), true, `${file} should exist`));
});

test("backend source and duplicate folders are not publicly exposed", () => {
  assert.equal(exists("public/server.js"), false);
  assert.equal(exists("lib/lib"), false);
  assert.equal(exists("test/test"), false);
});

test("public filenames do not contain spaces or parentheses", () => {
  const invalid = fs.readdirSync(publicDir).filter(name => /[ ()]/.test(name));
  assert.deepEqual(invalid, []);
});

test("service worker static cache only references existing assets", () => {
  const source = fs.readFileSync(path.join(publicDir, "sw.js"), "utf8");
  const block = source.match(/const STATIC_ASSETS = \[(.*?)\];/s)?.[1] || "";
  const assets = [...block.matchAll(/["'](\.\/[^"']+)["']/g)].map(match => match[1]);
  assert.ok(assets.length > 0);
  for (const asset of assets) {
    assert.equal(fs.existsSync(path.join(publicDir, asset.slice(2))), true, `${asset} should exist`);
    assert.equal(/\.html$/i.test(asset) && asset !== "./offline.html", false, `${asset} should not cache application HTML`);
  }
});

test("environment example is canonical and does not contain old providers", () => {
  const env = fs.readFileSync(path.join(root, ".env.example"), "utf8");
  assert.match(env, /GEMINI_API_KEY=/);
  assert.match(env, /BREVO_SMTP_LOGIN=/);
  assert.doesNotMatch(env, /OPENAI_API_KEY|GMAIL_USER|GMAIL_PASS/);
  assert.equal(exists("env.example"), false);
});
