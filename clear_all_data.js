
const { Client } = require('pg');

const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

async function clearAllData() {
  try {
    await client.connect();
    console.log('Connected to database');

    // Start transaction
    await client.query('BEGIN');

    // Delete in correct order (child tables first)
    console.log('Clearing commissions...');
    const commissionsResult = await client.query('DELETE FROM commissions WHERE 1=1');
    console.log(`Deleted ${commissionsResult.rowCount} commissions`);

    console.log('Clearing enrollment modifications...');
    const modificationsResult = await client.query('DELETE FROM enrollment_modifications WHERE 1=1');
    console.log(`Deleted ${modificationsResult.rowCount} enrollment modifications`);

    console.log('Clearing family members...');
    const familyResult = await client.query('DELETE FROM family_members WHERE 1=1');
    console.log(`Deleted ${familyResult.rowCount} family members`);

    console.log('Clearing payments...');
    const paymentsResult = await client.query('DELETE FROM payments WHERE 1=1');
    console.log(`Deleted ${paymentsResult.rowCount} payments`);

    console.log('Clearing subscriptions...');
    const subscriptionsResult = await client.query('DELETE FROM subscriptions WHERE 1=1');
    console.log(`Deleted ${subscriptionsResult.rowCount} subscriptions`);

    console.log('Clearing all users (keeping only the current admin/agent accounts)...');
    // Keep only admin and agent accounts by email
    const adminEmails = ['michael@mypremierplans.com', 'travis@mypremierplans.com'];
    const agentEmails = ['mdkeener@gmail.com', 'tmatheny77@gmail.com', 'svillarreal@cyariskmanagement.com'];
    const keepEmails = [...adminEmails, ...agentEmails];
    
    const usersResult = await client.query(
      `DELETE FROM users WHERE email NOT IN (${keepEmails.map((_, i) => `$${i + 1}`).join(', ')})`,
      keepEmails
    );
    console.log(`Deleted ${usersResult.rowCount} user records (kept admin/agent accounts)`);

    console.log('Keeping leads and lead activities - no deletion needed');

    // Reset auto-incrementing sequences (keeping leads sequence intact)
    console.log('Resetting sequences...');
    await client.query('ALTER SEQUENCE IF EXISTS subscriptions_id_seq RESTART WITH 1');
    await client.query('ALTER SEQUENCE IF EXISTS payments_id_seq RESTART WITH 1');
    await client.query('ALTER SEQUENCE IF EXISTS family_members_id_seq RESTART WITH 1');
    await client.query('ALTER SEQUENCE IF EXISTS commissions_id_seq RESTART WITH 1');

    // Commit transaction
    await client.query('COMMIT');
    console.log('✅ All data cleared successfully!');

    // Verify cleanup
    console.log('\n📊 Verification - checking remaining data:');
    const verification = await Promise.all([
      client.query('SELECT COUNT(*) FROM users'),
      client.query('SELECT COUNT(*) FROM subscriptions'),
      client.query('SELECT COUNT(*) FROM payments'),
      client.query('SELECT COUNT(*) FROM family_members'),
      client.query('SELECT COUNT(*) FROM leads'),
      client.query('SELECT COUNT(*) FROM lead_activities'),
      client.query('SELECT COUNT(*) FROM commissions'),
    ]);

    console.log(`Users remaining: ${verification[0].rows[0].count}`);
    console.log(`Subscriptions: ${verification[1].rows[0].count}`);
    console.log(`Payments: ${verification[2].rows[0].count}`);
    console.log(`Family members: ${verification[3].rows[0].count}`);
    console.log(`Leads preserved: ${verification[4].rows[0].count}`);
    console.log(`Lead activities preserved: ${verification[5].rows[0].count}`);
    console.log(`Commissions: ${verification[6].rows[0].count}`);

    console.log('\n🎯 Database is now clean with leads preserved and ready for production!');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error clearing data:', error);
    throw error;
  } finally {
    await client.end();
  }
}

clearAllData()
  .then(() => {
    console.log('✅ Database cleanup completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Cleanup failed:', error);
    process.exit(1);
  });
