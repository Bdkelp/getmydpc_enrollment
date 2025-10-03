
import { query } from '../lib/neonDb';

async function clearTestData() {
  try {
    console.log('🧹 Starting test data cleanup...');
    console.log('📌 This will preserve admin/agent accounts and remove all test members');

    // Preserve these admin/agent emails
    const preserveEmails = [
      'michael@mypremierplans.com',
      'travis@mypremierplans.com',
      'richard@mypremierplans.com',
      'joaquin@mypremierplans.com',
      'mdkeener@gmail.com',
      'tmatheny77@gmail.com',
      'svillarreal@cyariskmanagement.com'
    ];

    // Start transaction
    await query('BEGIN');

    // 1. Delete family members
    console.log('Clearing family members...');
    const familyResult = await query('DELETE FROM family_members RETURNING id');
    console.log(`✅ Deleted ${familyResult.rows.length} family member records`);

    // 2. Delete commissions
    console.log('Clearing commissions...');
    const commissionsResult = await query('DELETE FROM commissions RETURNING id');
    console.log(`✅ Deleted ${commissionsResult.rows.length} commission records`);

    // 3. Delete lead activities
    console.log('Clearing lead activities...');
    const leadActivitiesResult = await query('DELETE FROM lead_activities RETURNING id');
    console.log(`✅ Deleted ${leadActivitiesResult.rows.length} lead activity records`);

    // 4. Delete leads
    console.log('Clearing leads...');
    const leadsResult = await query('DELETE FROM leads RETURNING id');
    console.log(`✅ Deleted ${leadsResult.rows.length} lead records`);

    // 5. Delete payments
    console.log('Clearing payments...');
    const paymentsResult = await query('DELETE FROM payments RETURNING id');
    console.log(`✅ Deleted ${paymentsResult.rows.length} payment records`);

    // 6. Delete subscriptions
    console.log('Clearing subscriptions...');
    const subscriptionsResult = await query('DELETE FROM subscriptions RETURNING id');
    console.log(`✅ Deleted ${subscriptionsResult.rows.length} subscription records`);

    // 7. Delete enrollment modifications
    console.log('Clearing enrollment modifications...');
    const modificationsResult = await query('DELETE FROM enrollment_modifications RETURNING id');
    console.log(`✅ Deleted ${modificationsResult.rows.length} enrollment modification records`);

    // 8. Delete test users (keep only admin/agent accounts)
    console.log('Clearing test users...');
    const placeholders = preserveEmails.map((_, i) => `$${i + 1}`).join(', ');
    const usersResult = await query(
      `DELETE FROM users WHERE email NOT IN (${placeholders}) RETURNING id, email, role`,
      preserveEmails
    );
    console.log(`✅ Deleted ${usersResult.rows.length} test user records`);

    // 9. Reset sequences
    console.log('Resetting ID sequences...');
    await query('ALTER SEQUENCE IF EXISTS leads_id_seq RESTART WITH 1');
    await query('ALTER SEQUENCE IF EXISTS subscriptions_id_seq RESTART WITH 1');
    await query('ALTER SEQUENCE IF EXISTS payments_id_seq RESTART WITH 1');
    await query('ALTER SEQUENCE IF EXISTS family_members_id_seq RESTART WITH 1');
    await query('ALTER SEQUENCE IF EXISTS commissions_id_seq RESTART WITH 1');
    await query('ALTER SEQUENCE IF EXISTS lead_activities_id_seq RESTART WITH 1');
    console.log('✅ Sequences reset');

    // Commit transaction
    await query('COMMIT');
    console.log('\n✅ Test data cleanup completed successfully!');

    // Verify results
    console.log('\n📊 Verifying cleanup...');
    const userCount = await query('SELECT COUNT(*) FROM users');
    const subscriptionCount = await query('SELECT COUNT(*) FROM subscriptions');
    const paymentCount = await query('SELECT COUNT(*) FROM payments');
    const commissionCount = await query('SELECT COUNT(*) FROM commissions');
    const leadCount = await query('SELECT COUNT(*) FROM leads');

    console.log(`\nRemaining records:`);
    console.log(`  Users (admin/agents only): ${userCount.rows[0].count}`);
    console.log(`  Subscriptions: ${subscriptionCount.rows[0].count}`);
    console.log(`  Payments: ${paymentCount.rows[0].count}`);
    console.log(`  Commissions: ${commissionCount.rows[0].count}`);
    console.log(`  Leads: ${leadCount.rows[0].count}`);

    // Show preserved users
    const preservedUsers = await query(
      'SELECT id, email, role, first_name, last_name FROM users ORDER BY role, email'
    );
    console.log(`\n👥 Preserved users:`);
    preservedUsers.rows.forEach(user => {
      console.log(`  - ${user.first_name} ${user.last_name} (${user.email}) - ${user.role}`);
    });

  } catch (error: any) {
    await query('ROLLBACK');
    console.error('❌ Error clearing data:', error);
    throw error;
  }
}

clearTestData()
  .then(() => {
    console.log('\n🎉 Cleanup complete! Your database is ready for production.');
    process.exit(0);
  })
  .catch(error => {
    console.error('Cleanup failed:', error);
    process.exit(1);
  });
