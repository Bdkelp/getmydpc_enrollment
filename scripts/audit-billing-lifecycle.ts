import "dotenv/config";
import pg from "pg";

const APPLY_CONFIRMATION = "DISABLE_UNSAFE_AUTOMATIC_BILLING";
const apply = process.argv.includes("--apply");
const confirmation = process.argv
  .find((value) => value.startsWith("--confirm="))
  ?.slice(10);

if (apply && confirmation !== APPLY_CONFIRMATION) {
  throw new Error(`Apply requires --confirm=${APPLY_CONFIRMATION}`);
}
if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

try {
  await client.connect();
  await client.query(apply ? "BEGIN" : "BEGIN TRANSACTION READ ONLY");

  const schema = await client.query<{ billing_mode_exists: boolean }>(`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'subscriptions'
        AND column_name = 'billing_mode'
    ) AS billing_mode_exists
  `);
  if (!schema.rows[0]?.billing_mode_exists) {
    throw new Error(
      "billing_mode is not installed; apply 2026-09-02c_subscription_billing_mode_lifecycle.sql first",
    );
  }

  const unsafe = await client.query<{
    subscription_id: number;
    member_id: number;
    reason: string;
  }>(`
    SELECT s.id AS subscription_id, s.member_id,
      CONCAT_WS(',',
        CASE WHEN s.status <> 'active' THEN 'subscription_not_active' END,
        CASE WHEN m.status <> 'active' OR COALESCE(m.is_active, true) = false THEN 'member_not_active' END,
        CASE WHEN COALESCE(s.pending_reason, '') = 'member_cancelled' THEN 'cancellation_pending' END,
        CASE WHEN s.end_date IS NOT NULL AND s.end_date <= NOW() THEN 'access_period_ended' END,
        CASE WHEN s.next_billing_date IS NULL THEN 'missing_next_billing_date' END
      ) AS reason
    FROM public.subscriptions s
    JOIN public.members m ON m.id = s.member_id
    WHERE s.billing_mode = 'automatic'
      AND (
        s.status <> 'active'
        OR m.status <> 'active'
        OR COALESCE(m.is_active, true) = false
        OR COALESCE(s.pending_reason, '') = 'member_cancelled'
        OR (s.end_date IS NOT NULL AND s.end_date <= NOW())
        OR s.next_billing_date IS NULL
      )
    ORDER BY s.id
  `);

  const duplicateAutomatic = await client.query(`
    SELECT member_id, ARRAY_AGG(id ORDER BY id) AS subscription_ids, COUNT(*)::integer AS count
    FROM public.subscriptions
    WHERE billing_mode = 'automatic' AND status = 'active'
    GROUP BY member_id
    HAVING COUNT(*) > 1
    ORDER BY member_id
  `);

  const quarantined = await client.query(`
    SELECT state, COUNT(*)::integer AS count, MIN(updated_at) AS oldest_updated_at
    FROM public.recurring_billing_cycles
    WHERE state IN ('unknown', 'internal_sync_pending', 'submitting')
    GROUP BY state
    ORDER BY state
  `);

  let disabledCount = 0;
  if (apply && unsafe.rows.length > 0) {
    const repaired = await client.query(
      `UPDATE public.subscriptions
       SET billing_mode = 'disabled', updated_at = NOW()
       WHERE id = ANY($1::integer[]) AND billing_mode = 'automatic'
       RETURNING id`,
      [unsafe.rows.map((row) => row.subscription_id)],
    );
    disabledCount = repaired.rowCount || 0;
  }

  if (apply) await client.query("COMMIT");
  else await client.query("ROLLBACK");

  console.log(
    JSON.stringify(
      {
        mode: apply ? "apply" : "preview",
        unsafeAutomaticSubscriptions: unsafe.rows,
        duplicateAutomaticSubscriptions: duplicateAutomatic.rows,
        quarantinedCycles: quarantined.rows,
        disabledCount,
        applyConfirmation: APPLY_CONFIRMATION,
      },
      null,
      2,
    ),
  );
} catch (error) {
  await client.query("ROLLBACK").catch(() => undefined);
  throw error;
} finally {
  await client.end();
}
