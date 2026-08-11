const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const PUBLIC = path.join(ROOT, "public");

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

test("new feature pages exist", () => {
  const pages = [
    "public/alerts.html",
    "public/machine-status.html",
    "public/report.html",
    "public/image-trace.html",
    "public/audit.html"
  ];

  for (const page of pages) {
    assert.equal(
      fs.existsSync(path.join(ROOT, page)),
      true,
      `${page} should exist`
    );
  }
});

test("new feature pages use unified sidebar", () => {
  const pages = [
    "alerts.html",
    "machine-status.html",
    "report.html",
    "image-trace.html",
    "audit.html"
  ];

  for (const page of pages) {
    const html = fs.readFileSync(
      path.join(PUBLIC, page),
      "utf8"
    );

    assert.match(
      html,
      /unified-sidebar\.css/,
      `${page} should use unified sidebar CSS`
    );

    assert.match(
      html,
      /core\.js/,
      `${page} should load core.js`
    );
  }
});

test("shared sidebar contains current feature links", () => {
  const core = read("public/core.js");

  const requiredLinks = [
    "health.html",
    "alerts.html",
    "machine-status.html",
    "report.html",
    "image-trace.html",
    "audit.html",
    "user-manage.html",
    "admin.html"
  ];

  for (const link of requiredLinks) {
    assert.match(
      core,
      new RegExp(link.replace(".", "\\.")),
      `core.js should contain ${link}`
    );
  }
});

test("AI supports machine product and date range filters", () => {
  const html = read("public/ai.html");
  const js = read("public/ai.js");

  assert.match(html, /id="systemSelect"/);
  assert.match(html, /id="productsInput"/);
  assert.match(html, /id="dateFromInput"/);
  assert.match(html, /id="dateToInput"/);

  assert.match(js, /date_from/);
  assert.match(js, /date_to/);
  assert.match(js, /\/api\/ai\/chat/);
  assert.match(js, /\/api\/summary/);
});

test("health page uses backend health field names", () => {
  const js = read("public/health.js");

  assert.match(js, /database_connected/);
  assert.match(js, /mail_ready/);
  assert.match(js, /mqtt_connected/);
  assert.match(js, /gemini_configured/);
  assert.match(js, /uptime_seconds/);

  assert.doesNotMatch(js, /data\.database\b/);
  assert.doesNotMatch(js, /data\.email\b/);
  assert.doesNotMatch(js, /data\.mqtt\b/);
  assert.doesNotMatch(js, /data\.gemini\b/);
  assert.doesNotMatch(js, /data\.uptime\b/);
});

test("server exposes recent feature APIs", () => {
  const server = read("server.cjs");

  assert.match(server, /app\.get\("\/api\/alerts"/);
  assert.match(server, /app\.patch\("\/api\/alerts\/:id"/);
  assert.match(server, /app\.get\("\/api\/machine-status"/);
  assert.match(server, /app\.get\("\/api\/defects\/export\.csv"/);
  assert.match(server, /app\.post\("\/api\/ai\/chat"/);
  assert.match(server, /app\.get\("\/api\/health"/);
});

test("defect traceability keeps case id and image url", () => {
  const server = read("server.cjs");
  const trace = read("public/image-trace.js");

  assert.match(server, /image_url/);
  assert.match(server, /id:\s*\{\s*type:\s*String/);

  assert.match(trace, /image_url/);
  assert.match(trace, /item\.id/);
  assert.match(trace, /system_id/);
  assert.match(trace, /product/);
  assert.match(trace, /timestamp/);
});
