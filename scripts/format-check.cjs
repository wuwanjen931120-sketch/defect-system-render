"use strict";

const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const extensions = new Set([".js", ".cjs", ".json", ".md", ".txt", ".html", ".css", ".yaml", ".yml", ".sh"]);
const failures = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", ".git"].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (extensions.has(path.extname(entry.name)) || [".env.example", ".gitignore", ".npmrc"].includes(entry.name)) {
      const buffer = fs.readFileSync(full);
      const text = buffer.toString("utf8");
      if (text.includes("\r\n")) failures.push(`${path.relative(root, full)} 使用 CRLF`);
      if (text && !text.endsWith("\n")) failures.push(`${path.relative(root, full)} 缺少檔尾換行`);
      if (text.split("\n").some(line => /[ \t]+$/.test(line))) failures.push(`${path.relative(root, full)} 有行尾空白`);
    }
  }
}
walk(root);
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("格式檢查完成。 ");
