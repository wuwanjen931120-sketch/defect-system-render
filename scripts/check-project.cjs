"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const jsFiles = [];
const htmlFiles = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".git") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(?:js|cjs)$/.test(entry.name) && !entry.name.endsWith(".min.js") && entry.name !== "marked.umd.js") jsFiles.push(full);
    else if (entry.name.endsWith(".html")) htmlFiles.push(full);
  }
}

walk(root);

for (const file of jsFiles) {
  const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout || `語法檢查失敗：${file}\n`);
    process.exit(result.status || 1);
  }
}

for (const file of htmlFiles) {
  const text = fs.readFileSync(file, "utf8");
  if (/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/i.test(text)) {
    throw new Error(`CSP 檢查失敗：${path.relative(root, file)} 仍含 inline script`);
  }
  if (/<style\b[^>]*>[\s\S]*?<\/style>/i.test(text)) {
    throw new Error(`CSP 檢查失敗：${path.relative(root, file)} 仍含 inline style`);
  }
  if (/\sstyle\s*=|\son[a-z]+\s*=/i.test(text)) {
    throw new Error(`CSP 檢查失敗：${path.relative(root, file)} 仍含 style 或事件屬性`);
  }
}

console.log(`專案檢查完成：${jsFiles.length} 個 JavaScript、${htmlFiles.length} 個 HTML。`);
