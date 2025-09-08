
#!/usr/bin/env node
/**
 * check-supabase-schema.mjs
 * Fetches column info from Supabase for the tables you specify and compares
 * against an "expected" definition (usually derived from scan-supabase-queries.js).
 *
 * Requires: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY in env.
 *
 * Usage:
 *   node check-supabase-schema.mjs --tables leads,lead_queue
 *   node check-supabase-schema.mjs --expect found-queries.json
 */
import fs from "fs";
import process from "process";
import { createClient } from "@supabase/supabase-js";

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { tables: [], expect: null };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--tables") {
      out.tables = args[++i].split(",").map(s => s.trim()).filter(Boolean);
    } else if (args[i] === "--expect") {
      out.expect = args[++i];
    }
  }
  return out;
}

function buildExpectations(expectPath) {
  const raw = JSON.parse(fs.readFileSync(expectPath, "utf8"));
  const expected = {};
  for (const entry of raw) {
    if (!expected[entry.table]) expected[entry.table] = { select: new Set(), insert: new Set() };
    for (const sel of entry.selects || []) {
      for (const col of sel) expected[entry.table].select.add(col);
    }
    for (const ins of entry.inserts || []) {
      for (const key of ins.keys || []) expected[entry.table].insert.add(key);
    }
  }
  const simple = {};
  for (const [table, obj] of Object.entries(expected)) {
    simple[table] = {
      select: Array.from(obj.select),
      insert: Array.from(obj.insert),
    };
  }
  return simple;
}

function normalizeCamelVsSnake(name) {
  const snake = name.replace(/([A-Z])/g, "_$1").toLowerCase();
  const camel = name.replace(/[_-]([a-z])/g, (_, c) => c.toUpperCase());
  return new Set([name, snake, camel]);
}

async function getDbColumns(supabase, table) {
  const { data, error } = await supabase
    .from("information_schema.columns")
    .select("column_name, data_type, is_nullable")
    .eq("table_schema", "public")
    .eq("table_name", table);
  if (error) throw new Error(`Failed to fetch columns for ${table}: ${error.message}`);
  return data.map(r => ({
    column_name: r.column_name,
    data_type: r.data_type,
    is_nullable: r.is_nullable,
  }));
}

function diffTable(table, dbCols, exp) {
  const dbSet = new Set(dbCols.map(c => c.column_name));
  const report = { table, missingInDb: [], extraInDb: [], notes: [] };

  const checkList = [];
  if (exp?.select?.length) checkList.push(...exp.select);
  if (exp?.insert?.length) checkList.push(...exp.insert);

  const uniqueCheck = Array.from(new Set(checkList));

  for (const name of uniqueCheck) {
    const variants = normalizeCamelVsSnake(name);
    const has = Array.from(variants).some(v => dbSet.has(v));
    if (!has) report.missingInDb.push(name);
  }

  for (const c of dbSet) {
    const variants = normalizeCamelVsSnake(c);
    const used = uniqueCheck.some(n => variants.has(n) || Array.from(variants).some(v => normalizeCamelVsSnake(n).has(v)));
    if (!used) report.extraInDb.push(c);
  }

  if (report.missingInDb.length === 0 && report.extraInDb.length === 0) {
    report.notes.push("No obvious name mismatches (camelCase vs snake_case handled loosely).");
  }
  return report;
}

async function main() {
  const { tables, expect } = parseArgs();
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars.");
    process.exit(1);
  }
  const supabase = createClient(url, key, { db: { schema: "public" } });

  let expectations = null;
  if (expect) expectations = buildExpectations(expect);

  const tablesToCheck = new Set(tables);
  if (expectations) Object.keys(expectations).forEach(t => tablesToCheck.add(t));

  const finalReport = [];
  for (const table of Array.from(tablesToCheck)) {
    try {
      const cols = await getDbColumns(supabase, table);
      const exp = expectations ? expectations[table] : null;
      const report = exp ? diffTable(table, cols, exp) : { table, columns: cols };
      finalReport.push(report);
    } catch (e) {
      finalReport.push({ table, error: String(e) });
    }
  }
  console.log(JSON.stringify(finalReport, null, 2));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
