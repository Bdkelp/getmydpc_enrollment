#!/usr/bin/env node

import dotenv from 'dotenv';
import { Client } from 'pg';

dotenv.config();

const connectionString = String(process.env.DATABASE_URL || '').trim().replace(/^"|"$/g, '');

if (!connectionString) {
  console.error('Missing DATABASE_URL');
  process.exit(1);
}

const client = new Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

const queries = {
  columns: `
    select column_name, data_type, is_nullable
    from information_schema.columns
    where table_schema = 'public' and table_name = 'agent_commissions'
    order by ordinal_position
  `,
  typeDistribution: `
    select coalesce(nullif(commission_type, ''), '(null)') as commission_type, count(*)::int as count
    from public.agent_commissions
    group by 1
    order by 2 desc
  `,
  duplicatesForProposedKey: `
    with normalized as (
      select
        id,
        created_at,
        member_id,
        coalesce(nullif(enrollment_id, ''), '__NO_ENROLLMENT__') as enrollment_unit,
        agent_id,
        coalesce(nullif(commission_type, ''), 'direct') as unit_type,
        coalesce(override_for_agent_id::text, '__NO_OVERRIDE__') as override_for_agent_id
      from public.agent_commissions
    )
    select
      member_id,
      enrollment_unit,
      agent_id,
      unit_type,
      override_for_agent_id,
      count(*)::int as row_count,
      array_agg(id order by created_at desc) as commission_ids
    from normalized
    group by member_id, enrollment_unit, agent_id, unit_type, override_for_agent_id
    having count(*) > 1
    order by row_count desc
    limit 500
  `,
  uniqueIndex: `
    select indexname, indexdef
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'agent_commissions'
      and indexname = 'uq_agent_commissions_enrollment_unit_lane'
  `,
};

async function run() {
  await client.connect();

  const [columns, typeDistribution, duplicatesForProposedKey, uniqueIndex] = await Promise.all([
    client.query(queries.columns),
    client.query(queries.typeDistribution),
    client.query(queries.duplicatesForProposedKey),
    client.query(queries.uniqueIndex),
  ]);

  const payload = {
    generatedAt: new Date().toISOString(),
    columns: columns.rows,
    uniqueIndex: uniqueIndex.rows,
    typeDistribution: typeDistribution.rows,
    duplicateCount: duplicatesForProposedKey.rows.length,
    duplicates: duplicatesForProposedKey.rows,
  };

  console.log(JSON.stringify(payload, null, 2));
}

run()
  .catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await client.end();
    } catch {
      // no-op
    }
  });
