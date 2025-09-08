
#!/usr/bin/env node
// CommonJS scanner that's ESM-safe (runs even with "type":"module")
const fs = require("fs");
const path = require("path");

const root = process.argv[2] || ".";
const exts = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
const files = [];
(function walk(dir) {
  for (const item of fs.readdirSync(dir)) {
    const p = path.join(dir, item);
    const st = fs.statSync(p);
    if (st.isDirectory()) {
      if (["node_modules", ".next", "dist", "build", ".turbo", ".vercel", ".output"].includes(item)) continue;
      walk(p);
    } else if (exts.has(path.extname(item))) {
      files.push(p);
    }
  }
})(root);

// Looser regex: match ANY ".from('table')" (not just "supabase.from")
// Handles: .from<Table>('leads'), .from('leads')
const fromRe = /\.\s*from\s*<[^>]*>\s*\(\s*['"`]([^'"`]+)['"`]\s*\)|\.\s*from\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g;
// .select('a,b,c') basic
const selectRe = /\.\s*select\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g;
// .insert({ ... }) possibly multi-line
const insertRe = /\.\s*insert\s*\(\s*\{([\s\S]*?)\}\s*\)/g;

const results = [];

for (const file of files) {
  let src;
  try { src = fs.readFileSync(file, "utf8"); } catch { continue; }

  let m;
  while ((m = fromRe.exec(src))) {
    const table = m[1] || m[2];
    const slice = src.slice(m.index, m.index + 3000);

    const selects = [];
    const inserts = [];

    let s;
    selectRe.lastIndex = 0;
    while ((s = selectRe.exec(slice))) {
      const cols = s[1]
        .split(",")
        .map(x => x.trim())
        .filter(Boolean);
      if (cols.length) selects.push(cols);
    }

    let i;
    insertRe.lastIndex = 0;
    while ((i = insertRe.exec(slice))) {
      const obj = i[1];
      const keys = Array.from(obj.matchAll(/([A-Za-z0-9_]+)\s*:/g)).map(mm => mm[1]);
      if (keys.length) inserts.push({ keys });
    }

    results.push({ file, table, selects, inserts });
  }
}

process.stdout.write(JSON.stringify(results, null, 2));
