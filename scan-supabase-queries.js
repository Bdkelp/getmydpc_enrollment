
#!/usr/bin/env node
/**
 * scan-supabase-queries.js
 * Quick-and-dirty static scan of your repo to find Supabase table usage and selected fields.
 *
 * Usage:
 *   node scan-supabase-queries.js ./path/to/your/repo > found-queries.json
 *
 * Notes:
 * - This is a regex scanner, not a parser. It will miss complex cases.
 * - It looks for: supabase.from('table') ... .select('a,b,c') and .insert({ ... })
 * - Good enough to quickly see which tables/columns your app expects.
 */
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
      if (["node_modules", ".next", "dist", "build", ".turbo", ".vercel"].includes(item)) continue;
      walk(p);
    } else if (exts.has(path.extname(item))) {
      files.push(p);
    }
  }
})(root);

// regexes
const fromRe = /supabase\s*\.\s*from\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g;
const selectRe = /\.\s*select\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g;
const insertRe = /\.\s*insert\s*\(\s*\{([^}]+)\}\s*\)/gs;

const results = [];

for (const file of files) {
  const src = fs.readFileSync(file, "utf8");
  let m;
  while ((m = fromRe.exec(src))) {
    const table = m[1];
    const slice = src.slice(m.index, m.index + 2000); // read ahead
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

console.log(JSON.stringify(results, null, 2));
