
const { Client } = require('pg');
require('dotenv').config();

async function clearAllData() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    await client.connect();
    console.log('Connected to database');

    // Start transaction
    await client.query('BEGIN');

    console.log('Clearing family members...');
    const familyResult = await client.query('DELETE FROM family_members');
    console.log(`Deleted ${familyResult.rowCount} family member records`);

    console.log('Clearing commissions...');
    const commissionsResult = await client.query('DELETE FROM commissions');
    console.log(`Deleted ${commissionsResult.rowCount} commission records`);

    console.log('Clearing lead activities...');
    const leadActivitiesResult = await client.query('DELETE FROM lead_activities');
    console.log(`Deleted ${leadActivitiesResult.rowCount} lead activity records`);

    console.log('Clearing leads...');
    const leadsResult = await client.query('DELETE FROM leads');
    console.log(`Deleted ${leadsResult.rowCount} lead records`);

    console.log('Clearing payments...');
    const paymentsResult = await client.query('DELETE FROM payments');
    console.log(`Deleted ${paymentsResult.rowCount} payment records`);

    console.log('Clearing subscriptions...');
    const subscriptionsResult = await client.query('DELETE FROM subscriptions');
    console.log(`Deleted ${subscriptionsResult.rowCount} subscription records`);

    console.log('Clearing test users (keeping only admin/agent accounts)...');
    // Keep only admin and agent accounts by email
    const adminEmails = [
      'michael@mypremierplans.com',
      'travis@mypremierplans.com',
      'richard@mypremierplans.com',
      'joaquin@mypremierplans.com'
    ];
    const agentEmails = [
      'mdkeener@gmail.com',
      'tmatheny77@gmail.com',
      'svillarreal@cyariskmanagement.com'
    ];
    const keepEmails = [...adminEmails, ...agentEmails];
    
    const usersResult = await client.query(
      `DELETE FROM users WHERE email NOT IN (${keepEmails.map((_, i) => `$${i + 1}`).join(', ')})`,
      keepEmails
    );
    console.log(`Deleted ${usersResult.rowCount} user records (kept admin/agent accounts)`);

    // Reset auto-incrementing sequences
    console.log('Resetting sequences...');
    await client.query('ALTER SEQUENCE IF EXISTS leads_id_seq RESTART WITH 1');
    await client.query('ALTER SEQUENCE IF EXISTS subscriptions_id_seq RESTART WITH 1');
    await client.query('ALTER SEQUENCE IF EXISTS payments_id_seq RESTART WITH 1');
    await client.query('ALTER SEQUENCE IF EXISTS family_members_id_seq RESTART WITH 1');
    await client.query('ALTER SEQUENCE IF EXISTS commissions_id_seq RESTART WITH 1');
    await client.query('ALTER SEQUENCE IF EXISTS lead_activities_id_seq RESTART WITH 1');

    // Commit transaction
    await client.query('COMMIT');
    console.log('✅ All test data cleared successfully!');

    // Verify results
    console.log('\nVerifying cleanup...');
    const userCount = await client.query('SELECT COUNT(*) FROM users');
    const subscriptionCount = await client.query('SELECT COUNT(*) FROM subscriptions');
    const paymentCount = await client.query('SELECT COUNT(*) FROM payments');
    const commissionCount = await client.query('SELECT COUNT(*) FROM commissions');
    
    console.log(`Remaining users: ${userCount.rows[0].count}`);
    console.log(`Remaining subscriptions: ${subscriptionCount.rows[0].count}`);
    console.log(`Remaining payments: ${paymentCount.rows[0].count}`);
    console.log(`Remaining commissions: ${commissionCount.rows[0].count}`);

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error clearing data:', error);
  } finally {
    await client.end();
  }
}

clearAllData();
