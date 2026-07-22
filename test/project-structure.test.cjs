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

test("required pages, login assets and PWA assets exist", () => {
  [
    "public/index.html",
    "public/login.html",
    "public/login.js",
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

test("backend source, duplicate folders and stale files are not publicly exposed", () => {
  [
    "public/server.js",
    "lib/lib",
    "test/test",
    "env.example",
    "gitignore.txt",
    "lib/validators.cjs",
    "public/script.js"
  ].forEach(file => assert.equal(exists(file), false, `${file} should not exist`));
});

test("public filenames do not contain spaces or parentheses", () => {
  const invalid = fs.readdirSync(publicDir).filter(name => /[ ()]/.test(name));
  assert.deepEqual(invalid, []);
});

test("service worker static cache only references existing non-application assets", () => {
  const source = fs.readFileSync(path.join(publicDir, "sw.js"), "utf8");
  const block = source.match(/const STATIC_ASSETS = \[(.*?)\];/s)?.[1] || "";
  const assets = [...block.matchAll(/["'](\.\/[^"']+)["']/g)].map(match => match[1]);
  assert.ok(assets.length > 0);
  for (const asset of assets) {
    assert.equal(fs.existsSync(path.join(publicDir, asset.slice(2))), true, `${asset} should exist`);
    assert.equal(/\.html$/i.test(asset) && asset !== "./offline.html", false, `${asset} should not cache application HTML`);
  }
  assert.doesNotMatch(block, /login\.html|dashboard\.html|logs\.html|settings\.html|ai\.html/);
  assert.match(source, /url\.pathname\.startsWith\("\/api\/"\)/);
});

test("login page uses the unified two-step login script", () => {
  const html = fs.readFileSync(path.join(publicDir, "login.html"), "utf8");
  const js = fs.readFileSync(path.join(publicDir, "login.js"), "utf8");
  assert.match(html, /src="login\.js\?v=/);
  assert.match(js, /\/api\/login\/send-code/);
  assert.match(js, /\/api\/login\/verify-code/);
  assert.match(js, /\/api\/login\/status/);
  assert.doesNotMatch(js, /window\.location\.origin/);
});

test("environment example documents current SMTP, Gemini and deployment variables", () => {
  const env = fs.readFileSync(path.join(root, ".env.example"), "utf8");
  assert.match(env, /MONGODB_URI=/);
  assert.match(env, /JWT_SECRET=/);
  assert.match(env, /SMTP_USER=/);
  assert.match(env, /SMTP_PASS=/);
  assert.match(env, /SMTP_FROM=/);
  assert.match(env, /GEMINI_API_KEY=/);
  assert.doesNotMatch(env, /OPENAI_API_KEY/);
});

test("GitHub Actions CI and review status document exist", () => {
  assert.equal(exists(".github/workflows/ci.yml"), true);
  assert.equal(exists("docs/REVIEW_REQUIREMENTS_STATUS.md"), true);
  assert.equal(exists("docs/LOGIN_TROUBLESHOOTING.md"), true);
});

test("npm installation uses the public registry only", () => {
  const lock = fs.readFileSync(path.join(root, "package-lock.json"), "utf8");
  const npmrc = fs.readFileSync(path.join(root, ".npmrc"), "utf8");
  const build = fs.readFileSync(path.join(root, "render-build.sh"), "utf8");
  assert.match(npmrc, /registry=https:\/\/registry\.npmjs\.org\//);
  assert.match(build, /registry https:\/\/registry\.npmjs\.org\//);
  assert.doesNotMatch(lock, /applied-caas|internal\.api\.openai\.org|artifactory\/api\/npm/);
});
