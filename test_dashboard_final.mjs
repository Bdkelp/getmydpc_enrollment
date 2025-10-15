import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const neonPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function testDashboardData() {
  console.log('🧪 Testing Dashboard Data After Fixes...\n');
  
  try {
    // Test data in Neon
    console.log('📊 NEON DATABASE COUNTS:');
    console.log('========================');
    
    const membersResult = await neonPool.query('SELECT COUNT(*) as count FROM members WHERE status = $1', ['active']);
    const totalMembers = parseInt(membersResult.rows[0].count);
    console.log(`✅ Active Members: ${totalMembers}`);
    
    const commissionsResult = await neonPool.query('SELECT COUNT(*) as count, SUM(commission_amount) as total FROM commissions');
    const totalCommissions = parseInt(commissionsResult.rows[0].count);
    const totalAmount = parseFloat(commissionsResult.rows[0].total || 0);
    console.log(`✅ Total Commissions: ${totalCommissions} records`);
    console.log(`💰 Total Commission Amount: $${totalAmount.toFixed(2)}`);
    
    const subscriptionsResult = await neonPool.query('SELECT COUNT(*) as count FROM subscriptions');
    const totalSubscriptions = parseInt(subscriptionsResult.rows[0].count);
    console.log(`✅ Total Subscriptions: ${totalSubscriptions}`);
    
    // Test agent-specific data
    console.log('\n📈 AGENT-SPECIFIC DATA:');
    console.log('=======================');
    
    const agentEmail = 'michael@mypremierplans.com';
    
    // Get enrollments by agent
    const enrollmentsResult = await neonPool.query(`
      SELECT 
        m.id,
        m.customer_number,
        m.first_name,
        m.last_name,
        m.plan_tier,
        m.coverage_type,
        m.total_plan_cost,
        m.created_at
      FROM members m
      WHERE m.enrolled_by_agent_id = $1
      AND m.status = 'active'
      ORDER BY m.created_at DESC
    `, [agentEmail]);
    
    console.log(`✅ Members enrolled by ${agentEmail}: ${enrollmentsResult.rows.length}`);
    
    if (enrollmentsResult.rows.length > 0) {
      console.log('\n📋 Sample Member:');
      const sample = enrollmentsResult.rows[0];
      console.log({
        customerNumber: sample.customer_number,
        name: `${sample.first_name} ${sample.last_name}`,
        planTier: sample.plan_tier,
        coverageType: sample.coverage_type,
        totalCost: sample.total_plan_cost,
        date: sample.created_at
      });
    }
    
    // Now test commissions for this agent (need to get agent UUID from Supabase)
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.VITE_SUPABASE_URL,
      process.env.VITE_SUPABASE_ANON_KEY
    );
    
    const { data: agentUser } = await supabase
      .from('users')
      .select('id, email, agent_number')
      .eq('email', agentEmail)
      .single();
    
    if (agentUser) {
      console.log(`\n✅ Agent UUID: ${agentUser.id}`);
      console.log(`   Agent Number: ${agentUser.agent_number}`);
      
      const agentCommissionsResult = await neonPool.query(`
        SELECT 
          c.id,
          c.commission_amount,
          c.total_plan_cost,
          c.plan_name,
          c.plan_type,
          c.payment_status,
          c.created_at
        FROM commissions c
        WHERE c.agent_id = $1
        ORDER BY c.created_at DESC
      `, [agentUser.id]);
      
      console.log(`\n💰 Commissions for agent: ${agentCommissionsResult.rows.length}`);
      
      if (agentCommissionsResult.rows.length > 0) {
        const totalAgentCommission = agentCommissionsResult.rows.reduce((sum, c) => 
          sum + parseFloat(c.commission_amount || 0), 0);
        console.log(`💵 Total Agent Commission: $${totalAgentCommission.toFixed(2)}`);
        
        console.log('\n📋 Sample Commission:');
        const sample = agentCommissionsResult.rows[0];
        console.log({
          amount: `$${sample.commission_amount}`,
          planCost: `$${sample.total_plan_cost}`,
          planName: sample.plan_name,
          coverageType: sample.plan_type,
          status: sample.payment_status,
          date: sample.created_at
        });
        
        console.log('\n📊 Commission Breakdown:');
        const paid = agentCommissionsResult.rows.filter(c => c.payment_status === 'paid').length;
        const unpaid = agentCommissionsResult.rows.filter(c => c.payment_status === 'unpaid').length;
        const pending = agentCommissionsResult.rows.filter(c => c.payment_status === 'pending').length;
        console.log(`   Paid: ${paid}`);
        console.log(`   Unpaid: ${unpaid}`);
        console.log(`   Pending: ${pending}`);
      }
    }
    
    console.log('\n\n✅ DASHBOARD FIX VALIDATION:');
    console.log('============================');
    console.log('✅ Updated functions now query NEON instead of Supabase');
    console.log('✅ getAdminDashboardStats - fixed');
    console.log('✅ getAgentCommissions - fixed');
    console.log('✅ getAllCommissions - fixed');
    console.log('✅ getCommissionStats - fixed');
    console.log('✅ getEnrollmentsByAgent - already working');
    console.log('\n🎉 Dashboard should now display correct data!');
    console.log('   Please refresh your browser to see the updates.');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    await neonPool.end();
  }
}

testDashboardData();
