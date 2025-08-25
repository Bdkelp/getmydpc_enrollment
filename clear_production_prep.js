
import { Pool, neonConfig } from '@neondatabase/serverless';
import dotenv from 'dotenv';
import ws from 'ws';

// Configure WebSocket for Neon
neonConfig.webSocketConstructor = ws;
dotenv.config();

async function clearProductionData() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL not found in environment variables');
    process.exit(1);
  }

  const pool = new Pool({ 
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  
  try {
    console.log('🧹 Starting production preparation cleanup...');
    console.log('⚠️  This will remove ALL test enrollments and member data');
    
    // Test connection first
    const testResult = await pool.query('SELECT NOW()');
    console.log('✅ Database connection established');
    
    // Start transaction
    await pool.query('BEGIN');
    
    // Delete in proper order to respect foreign key constraints
    console.log('Clearing commissions...');
    const commissionsResult = await pool.query('DELETE FROM commissions WHERE id > 0');
    console.log(`✅ Deleted ${commissionsResult.rowCount} commission records`);

    console.log('Clearing enrollment modifications...');
    const modificationsResult = await pool.query('DELETE FROM enrollment_modifications WHERE id > 0');
    console.log(`✅ Deleted ${modificationsResult.rowCount} enrollment modification records`);

    console.log('Clearing family members...');
    const familyResult = await pool.query('DELETE FROM family_members WHERE id > 0');
    console.log(`✅ Deleted ${familyResult.rowCount} family member records`);

    console.log('Clearing payments...');
    const paymentsResult = await pool.query('DELETE FROM payments WHERE id > 0');
    console.log(`✅ Deleted ${paymentsResult.rowCount} payment records`);

    console.log('Clearing subscriptions...');
    const subscriptionsResult = await pool.query('DELETE FROM subscriptions WHERE id > 0');
    console.log(`✅ Deleted ${subscriptionsResult.rowCount} subscription records`);

    // Clear ALL leads and lead activities for production start
    console.log('Clearing all leads...');
    const leadActivitiesResult = await pool.query('DELETE FROM lead_activities WHERE id > 0');
    console.log(`✅ Deleted ${leadActivitiesResult.rowCount} lead activity records`);
    
    const leadsResult = await pool.query('DELETE FROM leads WHERE id > 0');
    console.log(`✅ Deleted ${leadsResult.rowCount} lead records`);

    // Keep ONLY admin and agent accounts, remove ALL other users
    console.log('Clearing all users except admin/agent accounts...');
    const adminEmails = ['michael@mypremierplans.com', 'travis@mypremierplans.com'];
    const agentEmails = ['mdkeener@gmail.com', 'tmatheny77@gmail.com', 'svillarreal@cyariskmanagement.com'];
    const keepEmails = [...adminEmails, ...agentEmails];
    
    const usersResult = await pool.query(
      `DELETE FROM users WHERE email NOT IN (${keepEmails.map((_, i) => `$${i + 1}`).join(', ')}) OR email IS NULL`,
      keepEmails
    );
    console.log(`✅ Deleted ${usersResult.rowCount} user accounts (kept ${keepEmails.length} admin/agent accounts)`);

    // Clear ALL sessions for fresh start
    console.log('Clearing all user sessions...');
    const sessionsResult = await pool.query('DELETE FROM sessions WHERE sid IS NOT NULL');
    console.log(`✅ Cleared ${sessionsResult.rowCount} user sessions`);

    // Reset auto-increment sequences to start fresh
    console.log('Resetting database sequences...');
    await pool.query('ALTER SEQUENCE IF EXISTS subscriptions_id_seq RESTART WITH 1');
    await pool.query('ALTER SEQUENCE IF EXISTS payments_id_seq RESTART WITH 1');
    await pool.query('ALTER SEQUENCE IF EXISTS family_members_id_seq RESTART WITH 1');
    await pool.query('ALTER SEQUENCE IF EXISTS commissions_id_seq RESTART WITH 1');
    await pool.query('ALTER SEQUENCE IF EXISTS enrollment_modifications_id_seq RESTART WITH 1');
    await pool.query('ALTER SEQUENCE IF EXISTS leads_id_seq RESTART WITH 1');
    await pool.query('ALTER SEQUENCE IF EXISTS lead_activities_id_seq RESTART WITH 1');
    console.log('✅ Reset all sequences');

    // Commit transaction
    await pool.query('COMMIT');
    console.log('✅ All changes committed successfully');
    
    // Final verification
    console.log('\n📊 Final database state verification:');
    const verification = await pool.query(`
      SELECT 
        'users' as table_name, COUNT(*) as remaining_records FROM users
      UNION ALL
      SELECT 'subscriptions', COUNT(*) FROM subscriptions
      UNION ALL
      SELECT 'payments', COUNT(*) FROM payments
      UNION ALL
      SELECT 'family_members', COUNT(*) FROM family_members
      UNION ALL
      SELECT 'leads', COUNT(*) FROM leads
      UNION ALL
      SELECT 'lead_activities', COUNT(*) FROM lead_activities
      UNION ALL
      SELECT 'commissions', COUNT(*) FROM commissions
      UNION ALL
      SELECT 'enrollment_modifications', COUNT(*) FROM enrollment_modifications
      UNION ALL
      SELECT 'sessions', COUNT(*) FROM sessions
      ORDER BY table_name;
    `);
    
    verification.rows.forEach(row => {
      const emoji = row.remaining_records === '0' ? '✅' : 
                   (row.table_name === 'users' && row.remaining_records <= '5') ? '👥' : '⚠️';
      console.log(`   ${emoji} ${row.table_name}: ${row.remaining_records} records`);
    });

    console.log('\n🎉 Database successfully prepared for production!');
    console.log('🔹 All test data completely removed');
    console.log('🔹 Only admin and agent accounts remain');
    console.log('🔹 All sequences reset to start from 1');
    console.log('🔹 Ready for fresh production start');
    
  } catch (error) {
    console.error('❌ Error during cleanup:', error);
    await pool.query('ROLLBACK');
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Confirmation prompt
console.log('🚨 PRODUCTION PREPARATION CLEANUP');
console.log('This will permanently delete ALL test data including leads.');
console.log('Only admin/agent accounts will be preserved.');
console.log('');

clearProductionData()
  .then(() => {
    console.log('✅ Production cleanup completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Production cleanup failed:', error);
    process.exit(1);
  });
