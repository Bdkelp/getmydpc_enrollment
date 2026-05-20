<!-- markdownlint-disable MD009 MD029 MD032 MD038 -->

# SQL INJECTION AUDIT

Date: 2026-05-18  
Scope: static code audit only (no code changes), focused on server/storage.ts, server/lib/neonDb.ts, route files, service files, and script-level SQL execution surfaces.

## Executive Summary

- Critical findings: 0
- High findings: 1
- Medium findings: 3
- Low findings: 2
- No direct runtime path was found where raw user-provided SQL text is executed as-is.
- Highest risk is dynamic SQL identifier construction in update paths where column names are assembled from object keys.

## Findings

## Finding 1

1. File path: server/storage.ts (around line 9564-9582)
2. Function name: storage.updateMember
3. Query type: UPDATE
4. Parameterized queries used: Partially (values are parameterized, identifiers are not)
5. User-controlled input reaches query: Potentially yes (update payload keys can flow into column selection)
6. Query text dynamically constructed: Yes
7. ORDER BY / WHERE / LIMIT / FILTER dynamically injected: No (SET clause is dynamically injected)
8. Risk level: High
9. Exact vulnerable snippet:

   const dbField = columnMapping[key] || key;
   updates.push(`${dbField} = $${paramIndex}`);

   const result = await query(
   `UPDATE members SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
   values
   );

10. Recommended safe pattern:

- Enforce strict allowlist for updatable keys before SQL assembly.
- Reject unknown keys instead of falling back to raw key text.
- Keep dynamic values parameterized as already done.

11. Immediate remediation required: Yes

## Finding 2

1. File path: server/storage.ts (around line 6580-6608)
2. Function name: updatePayment
3. Query type: UPDATE
4. Parameterized queries used: Partially (values are parameterized, identifiers are not)
5. User-controlled input reaches query: Potentially yes (depends on caller payload shape)
6. Query text dynamically constructed: Yes
7. ORDER BY / WHERE / LIMIT / FILTER dynamically injected: No (SET clause is dynamically injected)
8. Risk level: Medium
9. Exact vulnerable snippet:

   const dbField = fieldMapping[field] || field;
   return `${dbField} = $${index + 2}`;

   const updateQuery = `  UPDATE payments 
SET ${setClause}, updated_at = NOW()
WHERE id = $1
RETURNING *;`;

10. Recommended safe pattern:

- Enforce strict allowlist for fields and fail closed on unknown keys.
- Do not use raw fallback field names in SQL identifier positions.

11. Immediate remediation required: Yes

## Finding 3

1. File path: server/storage.ts (around line 3011-3063)
2. Function name: getAllLeads
3. Query type: SELECT via RPC
4. Parameterized queries used: Yes for filter values (params array)
5. User-controlled input reaches query: Yes (statusFilter, assignedAgentFilter)
6. Query text dynamically constructed: Yes (WHERE clause appended conditionally)
7. ORDER BY / WHERE / LIMIT / FILTER dynamically injected: WHERE is dynamically assembled (from fixed templates)
8. Risk level: Medium
9. Exact vulnerable snippet:

   if (conditions.length > 0) {
   query += ' WHERE ' + conditions.join(' AND ');
   }

   const { data, error } = await supabase
   .rpc('execute_sql', {
   sql_query: query,
   params: params
   });

10. Recommended safe pattern:

- Replace generic execute_sql RPC usage with typed table/query builder calls when possible.
- If RPC is required, lock function to parameterized statements only and deny multi-statement execution.
- Keep dynamic clause templates fixed and never concatenate raw user text.

11. Immediate remediation required: Yes

## Finding 4

1. File path: server/storage.ts (around line 6657-6685)
2. Function name: getRecentPaymentsDetailed
3. Query type: SELECT
4. Parameterized queries used: Partial (WHERE values parameterized, LIMIT interpolated)
5. User-controlled input reaches query: Yes (limit and status via route path)
6. Query text dynamically constructed: Yes
7. ORDER BY / WHERE / LIMIT / FILTER dynamically injected: LIMIT is injected as text
8. Risk level: Low
9. Exact vulnerable snippet:

   const limit = Math.min(Math.max(options.limit ?? 25, 1), 200);

   const sql = `  ...
ORDER BY p.created_at DESC
LIMIT ${limit}`;

10. Recommended safe pattern:

- Use LIMIT $n with explicit numeric cast in SQL (for example LIMIT $2::int).
- Retain existing numeric bounds validation.

11. Immediate remediation required: No

## Finding 5

1. File path: server/routes/debug-recent-payments.ts (around line 40)
2. Function name: GET /api/debug/recent-payments handler
3. Query type: PostgREST filter expression
4. Parameterized queries used: No (string expression passed to .or)
5. User-controlled input reaches query: No in current code path (username list is static)
6. Query text dynamically constructed: Yes
7. ORDER BY / WHERE / LIMIT / FILTER dynamically injected: FILTER expression is dynamically injected
8. Risk level: Low
9. Exact vulnerable snippet:

   .or(`email.ilike.%${username}%,first_name.ilike.%${username}%,last_name.ilike.%${username}%`)

10. Recommended safe pattern:

- Keep debug search tokens static or escape wildcard/control characters before interpolation.
- Prefer fixed query-builder predicates over dynamic expression strings.

11. Immediate remediation required: No

## Finding 6

1. File path: server/lib/neonDb.ts (around line 62-66)
2. Function name: query
3. Query type: Generic raw SQL execution wrapper
4. Parameterized queries used: Depends on caller
5. User-controlled input reaches query: Indirectly possible through callers
6. Query text dynamically constructed: Potentially (at caller layer)
7. ORDER BY / WHERE / LIMIT / FILTER dynamically injected: Potentially (at caller layer)
8. Risk level: Medium
9. Exact vulnerable snippet:

   export async function query(text: string, params?: any[]) {
   const result = await neonPool.query(text, params);
   return result;
   }

10. Recommended safe pattern:

- Add wrapper-level guardrails (reject obvious multi-statement payloads in app runtime paths, optional query shape checks, query source tagging).
- Keep using bind parameters for all values.

11. Immediate remediation required: No

## Finding 7

1. File path: scripts/apply-payment-date-migrations.mjs, scripts/ensure-commission-ledger-schema.mjs, scripts/apply-rls-fix.mjs
2. Function name: migration helpers (script context)
3. Query type: RPC exec_sql and pg.Client.query
4. Parameterized queries used: No (full SQL text execution)
5. User-controlled input reaches query: Not from HTTP routes; SQL sourced from local migration files
6. Query text dynamically constructed: Yes (script composes/passes SQL text)
7. ORDER BY / WHERE / LIMIT / FILTER dynamically injected: Not applicable (full statement execution)
8. Risk level: Medium (operational), Low (runtime API exposure)
9. Exact vulnerable snippet:

   await supabase.rpc('exec_sql', { sql_query: migration1 });

   return await supabase.rpc('exec_sql', { sql_query: sqlText });

   await client.query(migrationSQL);

10. Recommended safe pattern:

- Restrict exec_sql RPC to admin-only operational contexts.
- Disable or remove broad SQL-exec RPC functions from production API surfaces.
- Prefer direct migration tooling over runtime-exposed SQL execution functions.

11. Immediate remediation required: No (for application runtime), Yes (if exec_sql is reachable outside trusted operator workflows)

## Specifically Requested Pattern Coverage

- Template literal SQL: Found in storage update/query builders and multiple route query blocks.
- Concatenated SQL strings: Found in getAllLeads and conditional SQL assembly patterns.
- Unescaped query params: No direct value concatenation into SQL value positions was found in audited runtime paths.
- Unsafe dynamic filters: Found in debug-recent-payments PostgREST .or expression string building.
- Unsafe sort fields: Not found as user-controlled ORDER BY column injection in audited runtime paths.
- Unsafe raw query execution: Present as capability via neonDb.query wrapper and script SQL execution utilities.
- RPC execution risk: Present where execute_sql and exec_sql are used.
- Direct execution of user-provided SQL: Not found in runtime route handlers; script/RPC pathways execute full SQL text but currently from trusted local sources in observed code paths.

## Immediate Remediation Priority

1. Lock down dynamic column selection in storage.updateMember.
2. Lock down dynamic column selection in updatePayment.
3. Reduce/replace generic execute_sql usage in runtime request paths.
4. Convert interpolated LIMIT usage to bind parameter form for consistency.
