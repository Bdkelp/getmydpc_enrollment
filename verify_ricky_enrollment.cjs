const { Pool } = require('pg');

// Connect to Neon database
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function verifyEnrollment() {
  console.log('\n🔍 VERIFYING RICKY JOHNSTON ENROLLMENT\n');
  console.log('=' .repeat(60));
  
  try {
    // Check user creation
    console.log('\n1️⃣  CHECKING USER...');
    const userResult = await pool.query(`
      SELECT id, email, role, first_name, last_name, agent_number, created_at
      FROM users 
      WHERE email = 'ricky.johnston012@gmail.com'
      ORDER BY created_at DESC
      LIMIT 1
    `);
    
    if (userResult.rows.length === 0) {
      console.log('❌ User NOT found');
      return;
    }
    
    const user = userResult.rows[0];
    console.log('✅ User found:');
    console.log(`   ID: ${user.id}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Name: ${user.first_name} ${user.last_name}`);
    console.log(`   Role: ${user.role}`);
    console.log(`   Agent Number: ${user.agent_number || 'NULL'}`);
    console.log(`   Created: ${user.created_at}`);
    
    // Check subscription creation
    console.log('\n2️⃣  CHECKING SUBSCRIPTION...');
    const subResult = await pool.query(`
      SELECT id, user_id, plan_id, status, amount, 
             current_period_start, current_period_end, created_at
      FROM subscriptions 
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 1
    `, [user.id]);
    
    if (subResult.rows.length === 0) {
      console.log('❌ Subscription NOT created - createSubscription may still be a stub!');
      return;
    }
    
    const subscription = subResult.rows[0];
    console.log('✅ Subscription created:');
    console.log(`   ID: ${subscription.id}`);
    console.log(`   User ID: ${subscription.user_id}`);
    console.log(`   Plan ID: ${subscription.plan_id}`);
    console.log(`   Status: ${subscription.status}`);
    console.log(`   Amount: $${subscription.amount}`);
    console.log(`   Period: ${subscription.current_period_start} to ${subscription.current_period_end}`);
    console.log(`   Created: ${subscription.created_at}`);
    
    // Check commission creation
    console.log('\n3️⃣  CHECKING COMMISSION...');
    const commResult = await pool.query(`
      SELECT id, agent_id, subscription_id, member_id, 
             plan_name, coverage_type, commission_amount, agent_number, created_at
      FROM commissions 
      WHERE subscription_id = $1
      ORDER BY created_at DESC
      LIMIT 1
    `, [subscription.id]);
    
    if (commResult.rows.length === 0) {
      console.log('⚠️  Commission NOT created (may be normal if no enrolling agent)');
    } else {
      const commission = commResult.rows[0];
      console.log('✅ Commission created:');
      console.log(`   ID: ${commission.id}`);
      console.log(`   Agent ID: ${commission.agent_id}`);
      console.log(`   Subscription ID: ${commission.subscription_id}`);
      console.log(`   Member ID: ${commission.member_id}`);
      console.log(`   Plan: ${commission.plan_name}`);
      console.log(`   Coverage: ${commission.coverage_type}`);
      console.log(`   Commission: $${commission.commission_amount}`);
      console.log(`   Agent Number: ${commission.agent_number || 'NULL'}`);
      console.log(`   Created: ${commission.created_at}`);
    }
    
    // Check payment
    console.log('\n4️⃣  CHECKING PAYMENT...');
    const paymentResult = await pool.query(`
      SELECT id, user_id, amount, status, created_at
      FROM payments 
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 1
    `, [user.id]);
    
    if (paymentResult.rows.length === 0) {
      console.log('⚠️  Payment NOT found (may be pending)');
    } else {
      const payment = paymentResult.rows[0];
      console.log('✅ Payment found:');
      console.log(`   ID: ${payment.id}`);
      console.log(`   Amount: $${payment.amount}`);
      console.log(`   Status: ${payment.status}`);
      console.log(`   Created: ${payment.created_at}`);
    }
    
    // Get total counts for context
    console.log('\n5️⃣  DATABASE TOTALS (for context):');
    const totalsResult = await pool.query(`
      SELECT 
        (SELECT COUNT(*) FROM users WHERE role IN ('member', 'user')) as total_users,
        (SELECT COUNT(*) FROM subscriptions) as total_subscriptions,
        (SELECT COUNT(*) FROM commissions) as total_commissions,
        (SELECT COUNT(*) FROM payments) as total_payments
    `);
    const totals = totalsResult.rows[0];
    console.log(`   Total Users: ${totals.total_users}`);
    console.log(`   Total Subscriptions: ${totals.total_subscriptions}`);
    console.log(`   Total Commissions: ${totals.total_commissions}`);
    console.log(`   Total Payments: ${totals.total_payments}`);
    
    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 SUMMARY:');
    console.log(`   User: ${userResult.rows.length > 0 ? '✅' : '❌'}`);
    console.log(`   Subscription: ${subResult.rows.length > 0 ? '✅' : '❌'}`);
    console.log(`   Commission: ${commResult.rows.length > 0 ? '✅' : '⚠️  (optional)'}`);
    console.log(`   Payment: ${paymentResult.rows.length > 0 ? '✅' : '⚠️  (may be pending)'}`);
    console.log('='.repeat(60));
    
    if (subResult.rows.length > 0) {
      console.log('\n🎉 SUCCESS! The createSubscription fix is working!');
      console.log('   Previous state: 0 subscriptions despite 81 users');
      console.log(`   Current state: ${totals.total_subscriptions} subscription(s) created`);
    }
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error);
  } finally {
    await pool.end();
  }
}

verifyEnrollment();
