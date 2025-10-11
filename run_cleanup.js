/**
 * ONE-TIME DATABASE CLEANUP SCRIPT
 * 
 * Purpose: Clean test data while keeping last 20 enrollments for EPX
 * 
 * How to use:
 * 1. Push this file to Railway (git add, commit, push)
 * 2. Railway will deploy automatically
 * 3. Go to Railway dashboard → Your service → Deployments
 * 4. Click on latest deployment → "View Logs"
 * 5. In the "Settings" tab, find "Custom Start Command"
 * 6. Temporarily change it to: node run_cleanup.js
 * 7. Redeploy
 * 8. Watch the logs for results
 * 9. Change start command back to normal
 * 10. Delete this file from your repo
 * 
 * OR run locally:
 * 1. Make sure you have .env with DATABASE_URL
 * 2. Run: node run_cleanup.js
 * 
 * ⚠️ SECURITY: Delete this file after use!
 */

import pg from 'pg';
import * as readline from 'readline';

const { Pool } = pg;

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

const log = {
  info: (msg) => console.log(`${colors.blue}ℹ ${msg}${colors.reset}`),
  success: (msg) => console.log(`${colors.green}✅ ${msg}${colors.reset}`),
  warning: (msg) => console.log(`${colors.yellow}⚠️  ${msg}${colors.reset}`),
  error: (msg) => console.log(`${colors.red}❌ ${msg}${colors.reset}`),
  header: (msg) => console.log(`\n${colors.bright}${colors.cyan}${'='.repeat(60)}\n${msg}\n${'='.repeat(60)}${colors.reset}\n`),
};

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Helper to run queries
async function query(sql, params = []) {
  const client = await pool.connect();
  try {
    const result = await client.query(sql, params);
    return result;
  } finally {
    client.release();
  }
}

// Step 1: Verify current state
async function verifyBeforeCleanup() {
  log.header('STEP 1: PRE-CLEANUP VERIFICATION');

  try {
    // Get counts
    const counts = await query(`
      SELECT 
        (SELECT COUNT(*) FROM users WHERE role IN ('member', 'user')) as member_users,
        (SELECT COUNT(*) FROM subscriptions) as total_subscriptions,
        (SELECT COUNT(*) FROM payments) as total_payments,
        (SELECT COUNT(*) FROM commissions) as total_commissions,
        (SELECT COUNT(*) FROM family_members) as total_family_members
    `);

    log.info('Current Data Counts:');
    console.log(counts.rows[0]);

    // Get subscription date range
    const dateRange = await query(`
      SELECT 
        MIN(created_at) as oldest_enrollment,
        MAX(created_at) as newest_enrollment,
        COUNT(*) as total_count
      FROM subscriptions
    `);

    log.info('\nSubscription Date Range:');
    console.log(dateRange.rows[0]);

    // Show newest 20 (will be kept)
    const toKeep = await query(`
      SELECT 
        s.id,
        s.plan_name,
        s.member_type,
        s.created_at,
        u.email
      FROM subscriptions s
      LEFT JOIN users u ON s.user_id = u.id
      ORDER BY s.created_at DESC
      LIMIT 20
    `);

    log.success('\nThese 20 NEWEST enrollments will be KEPT:');
    console.table(toKeep.rows.map((r, i) => ({
      '#': i + 1,
      ID: r.id,
      Plan: r.plan_name,
      Type: r.member_type,
      Date: new Date(r.created_at).toLocaleDateString(),
      Email: r.email
    })));

    // Show oldest 10 (will be deleted)
    const toDelete = await query(`
      SELECT 
        s.id,
        s.plan_name,
        s.member_type,
        s.created_at,
        u.email
      FROM subscriptions s
      LEFT JOIN users u ON s.user_id = u.id
      ORDER BY s.created_at ASC
      LIMIT 10
    `);

    if (toDelete.rows.length > 0) {
      log.warning('\nThese OLDEST enrollments will be DELETED (showing first 10):');
      console.table(toDelete.rows.map((r, i) => ({
        '#': i + 1,
        ID: r.id,
        Plan: r.plan_name,
        Type: r.member_type,
        Date: new Date(r.created_at).toLocaleDateString(),
        Email: r.email
      })));
    }

    // Calculate what will be deleted
    const impact = await query(`
      WITH enrollments_to_delete AS (
        SELECT id, user_id
        FROM subscriptions
        ORDER BY created_at ASC
        OFFSET 20
      )
      SELECT 
        'Subscriptions' as item, COUNT(*) as to_delete FROM enrollments_to_delete
      UNION ALL
      SELECT 'Payments', COUNT(*) FROM payments 
        WHERE subscription_id IN (SELECT id FROM enrollments_to_delete)
      UNION ALL
      SELECT 'Commissions', COUNT(*) FROM commissions 
        WHERE subscription_id IN (SELECT id FROM enrollments_to_delete)
      UNION ALL
      SELECT 'Family Members', COUNT(*) FROM family_members 
        WHERE primary_user_id IN (SELECT user_id FROM enrollments_to_delete)
    `);

    log.warning('\nEstimated Deletion Impact:');
    console.table(impact.rows);

    // Check if we should proceed
    const totalSubs = counts.rows[0].total_subscriptions;
    if (totalSubs <= 20) {
      log.warning(`\n⚠️  You have ${totalSubs} subscriptions. Cleanup not needed (≤20).`);
      return false;
    }

    log.success(`\n✅ Verification complete. ${totalSubs - 20} old enrollments will be deleted.`);
    return true;

  } catch (error) {
    log.error('Verification failed:');
    console.error(error);
    return false;
  }
}

// Step 2: Execute cleanup
async function executeCleanup() {
  log.header('STEP 2: EXECUTING CLEANUP');

  const client = await pool.connect();
  try {
    // Start transaction
    await client.query('BEGIN');

    // Create temp tables
    log.info('Creating temporary tables...');
    await client.query(`
      CREATE TEMP TABLE enrollments_to_keep AS
      SELECT id as subscription_id, user_id, created_at
      FROM subscriptions
      ORDER BY created_at DESC
      LIMIT 20
    `);

    await client.query(`
      CREATE TEMP TABLE enrollments_to_delete AS
      SELECT id as subscription_id, user_id
      FROM subscriptions
      WHERE id NOT IN (SELECT subscription_id FROM enrollments_to_keep)
    `);

    // Delete in order (respect foreign keys)
    
    log.info('Deleting commissions...');
    const delCommissions = await client.query(`
      DELETE FROM commissions
      WHERE subscription_id IN (SELECT subscription_id FROM enrollments_to_delete)
    `);
    log.success(`Deleted ${delCommissions.rowCount} commissions`);

    log.info('Deleting payments...');
    const delPayments = await client.query(`
      DELETE FROM payments
      WHERE subscription_id IN (SELECT subscription_id FROM enrollments_to_delete)
    `);
    log.success(`Deleted ${delPayments.rowCount} payments`);

    log.info('Deleting family members...');
    const delFamily = await client.query(`
      DELETE FROM family_members
      WHERE primary_user_id IN (SELECT user_id FROM enrollments_to_delete)
    `);
    log.success(`Deleted ${delFamily.rowCount} family members`);

    log.info('Deleting subscriptions...');
    const delSubs = await client.query(`
      DELETE FROM subscriptions
      WHERE id IN (SELECT subscription_id FROM enrollments_to_delete)
    `);
    log.success(`Deleted ${delSubs.rowCount} subscriptions`);

    log.info('Deleting member users (without remaining subscriptions)...');
    const delUsers = await client.query(`
      DELETE FROM users
      WHERE id IN (
        SELECT user_id 
        FROM enrollments_to_delete
        WHERE user_id NOT IN (SELECT DISTINCT user_id FROM subscriptions WHERE user_id IS NOT NULL)
      )
      AND role IN ('member', 'user')
    `);
    log.success(`Deleted ${delUsers.rowCount} member users`);

    // Commit transaction
    await client.query('COMMIT');
    log.success('\n✅ Transaction committed successfully!');

  } catch (error) {
    await client.query('ROLLBACK');
    log.error('Cleanup failed - transaction rolled back:');
    console.error(error);
    throw error;
  } finally {
    client.release();
  }
}

// Step 3: Verify after cleanup
async function verifyAfterCleanup() {
  log.header('STEP 3: POST-CLEANUP VERIFICATION');

  try {
    // Get final counts
    const counts = await query(`
      SELECT 
        (SELECT COUNT(*) FROM users WHERE role IN ('member', 'user')) as member_users,
        (SELECT COUNT(*) FROM subscriptions) as subscriptions,
        (SELECT COUNT(*) FROM payments) as payments,
        (SELECT COUNT(*) FROM commissions) as commissions,
        (SELECT COUNT(*) FROM family_members) as family_members,
        (SELECT COUNT(*) FROM users WHERE role IN ('agent', 'admin', 'super_admin')) as staff_preserved
    `);

    log.info('Final Data Counts:');
    console.log(counts.rows[0]);

    // Verify exactly 20 subscriptions
    const subCount = counts.rows[0].subscriptions;
    if (subCount === 20) {
      log.success(`✅ PASS - Exactly 20 subscriptions remain`);
    } else {
      log.error(`❌ FAIL - Expected 20 subscriptions, got ${subCount}`);
    }

    // Check for orphans
    const orphans = await query(`
      SELECT 
        (SELECT COUNT(*) FROM payments 
         WHERE subscription_id NOT IN (SELECT id FROM subscriptions)) as orphaned_payments,
        (SELECT COUNT(*) FROM commissions 
         WHERE subscription_id NOT IN (SELECT id FROM subscriptions)) as orphaned_commissions
    `);

    if (orphans.rows[0].orphaned_payments === 0) {
      log.success('✅ PASS - No orphaned payments');
    } else {
      log.error(`❌ FAIL - ${orphans.rows[0].orphaned_payments} orphaned payments`);
    }

    if (orphans.rows[0].orphaned_commissions === 0) {
      log.success('✅ PASS - No orphaned commissions');
    } else {
      log.error(`❌ FAIL - ${orphans.rows[0].orphaned_commissions} orphaned commissions`);
    }

    // Show what was kept
    const kept = await query(`
      SELECT 
        s.id,
        s.plan_name,
        s.created_at,
        u.email
      FROM subscriptions s
      LEFT JOIN users u ON s.user_id = u.id
      ORDER BY s.created_at DESC
    `);

    log.success('\nFinal 20 Enrollments Kept for EPX:');
    console.table(kept.rows.map((r, i) => ({
      '#': i + 1,
      ID: r.id,
      Plan: r.plan_name,
      Date: new Date(r.created_at).toLocaleDateString(),
      Email: r.email
    })));

    log.success('\n✅ CLEANUP COMPLETE AND VERIFIED!');
    return true;

  } catch (error) {
    log.error('Verification failed:');
    console.error(error);
    return false;
  }
}

// Main execution
async function main() {
  console.log('\n');
  log.header('🗑️  TEST DATA CLEANUP - Keep Last 20 for EPX');

  try {
    // Step 1: Verify before
    const shouldProceed = await verifyBeforeCleanup();
    
    if (!shouldProceed) {
      log.warning('Cleanup not needed or verification failed. Exiting.');
      await pool.end();
      process.exit(0);
    }

    // Check if running interactively (has stdin)
    if (process.stdin.isTTY) {
      // Interactive mode - ask for confirmation
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });

      const answer = await new Promise((resolve) => {
        rl.question('\n⚠️  Proceed with cleanup? Type "YES" to continue: ', resolve);
      });
      rl.close();

      if (answer.trim().toUpperCase() !== 'YES') {
        log.warning('Cleanup cancelled by user.');
        await pool.end();
        process.exit(0);
      }
    } else {
      // Non-interactive mode (Railway) - check for environment flag
      if (process.env.CONFIRM_CLEANUP !== 'YES') {
        log.warning('Non-interactive mode: Set CONFIRM_CLEANUP=YES to proceed.');
        await pool.end();
        process.exit(0);
      }
    }

    // Step 2: Execute cleanup
    await executeCleanup();

    // Step 3: Verify after
    await verifyAfterCleanup();

    log.success('\n🎉 All done! Remember to:');
    console.log('   1. ✅ Verify your app still works');
    console.log('   2. ✅ Notify EPX that cleanup is complete');
    console.log('   3. ✅ Delete this script file from your repo');
    console.log('   4. ✅ Remove CONFIRM_CLEANUP from Railway env vars\n');

  } catch (error) {
    log.error('Fatal error during cleanup:');
    console.error(error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Check for DATABASE_URL
if (!process.env.DATABASE_URL) {
  log.error('DATABASE_URL environment variable is not set!');
  log.info('Make sure you have a .env file or Railway environment variables configured.');
  process.exit(1);
}

// Run it
main().catch((error) => {
  log.error('Unhandled error:');
  console.error(error);
  process.exit(1);
});
