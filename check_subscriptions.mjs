import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function checkSubscriptions() {
  try {
    const result = await pool.query(`
      SELECT id, user_id, stripe_subscription_id, status, created_at
      FROM subscriptions
      ORDER BY created_at
    `);

    console.log(`\n📋 Subscriptions in database: ${result.rows.length}`);
    if (result.rows.length > 0) {
      result.rows.forEach(s => {
        console.log(`  ID: ${s.id}, user_id: ${s.user_id}, stripe: ${s.stripe_subscription_id}, status: ${s.status}`);
      });
    } else {
      console.log('  No subscriptions found!');
    }

    // Check members
    const members = await pool.query(`
      SELECT id, customer_number, first_name, last_name
      FROM members
      ORDER BY created_at
    `);

    console.log(`\n📋 Members in database: ${members.rows.length}`);
    members.rows.forEach(m => {
      console.log(`  ID: ${m.id}, customer_number: ${m.customer_number}`);
    });

    console.log('\n💡 Commission.subscription_id must reference a record in the subscriptions table');
    console.log('💡 But these members may not have Stripe subscriptions yet');
    console.log('💡 We might need to use NULL or the member ID as user_id instead');
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkSubscriptions();
