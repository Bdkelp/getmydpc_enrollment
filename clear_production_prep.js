
import { Pool } from '@neondatabase/serverless';
import dotenv from 'dotenv';

dotenv.config();

async function clearProductionData() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL not found in environment variables');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  
  try {
    console.log('🧹 Starting production preparation cleanup...');
    console.log('⚠️  This will remove ALL test enrollments and member data');
    
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

    // Keep admin and agent accounts, remove test members
    console.log('Clearing test member users (keeping admin/agent accounts)...');
    const adminEmails = ['michael@mypremierplans.com', 'travis@mypremierplans.com'];
    const agentEmails = ['mdkeener@gmail.com', 'tmatheny77@gmail.com', 'svillarreal@cyariskmanagement.com'];
    const keepEmails = [...adminEmails, ...agentEmails];
    
    const usersResult = await pool.query(
      `DELETE FROM users WHERE email NOT IN (${keepEmails.map((_, i) => `$${i + 1}`).join(', ')}) OR email IS NULL`,
      keepEmails
    );
    console.log(`✅ Deleted ${usersResult.rowCount} test member accounts (kept admin/agent accounts)`);

    // Clear sessions for fresh start
    console.log('Clearing user sessions...');
    const sessionsResult = await pool.query('DELETE FROM sessions WHERE sid IS NOT NULL');
    console.log(`✅ Cleared ${sessionsResult.rowCount} user sessions`);

    // Keep leads and lead activities - these are valuable for production
    console.log('📋 Keeping leads and lead activities for production use');

    // Reset auto-increment sequences
    console.log('Resetting database sequences...');
    await pool.query('ALTER SEQUENCE IF EXISTS subscriptions_id_seq RESTART WITH 1');
    await pool.query('ALTER SEQUENCE IF EXISTS payments_id_seq RESTART WITH 1');
    await pool.query('ALTER SEQUENCE IF EXISTS family_members_id_seq RESTART WITH 1');
    await pool.query('ALTER SEQUENCE IF EXISTS commissions_id_seq RESTART WITH 1');
    await pool.query('ALTER SEQUENCE IF EXISTS enrollment_modifications_id_seq RESTART WITH 1');
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
      const emoji = row.table_name === 'leads' || row.table_name === 'lead_activities' ? '📋' : 
                   row.remaining_records === '0' ? '✅' : '👥';
      console.log(`   ${emoji} ${row.table_name}: ${row.remaining_records} records`);
    });

    console.log('\n🎉 Database successfully prepared for production!');
    console.log('🔹 All test enrollments and member data removed');
    console.log('🔹 Admin and agent accounts preserved');
    console.log('🔹 Lead data preserved for sales continuity');
    console.log('🔹 Ready for live member enrollments');
    
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
console.log('This will permanently delete all test enrollment data.');
console.log('Only admin/agent accounts and leads will be preserved.');
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
