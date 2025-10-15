import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const neonPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function checkDashboardData() {
  console.log('🔍 Checking Dashboard Data Sources...\n');
  
  try {
    // Check Neon database (where actual data is)
    console.log('📊 NEON DATABASE (Primary Data):');
    console.log('================================');
    
    const membersResult = await neonPool.query('SELECT COUNT(*) as count FROM members WHERE status = $1', ['active']);
    console.log(`✅ Active Members: ${membersResult.rows[0].count}`);
    
    const commissionsResult = await neonPool.query('SELECT COUNT(*) as count, SUM(commission_amount) as total FROM commissions');
    console.log(`✅ Total Commissions: ${commissionsResult.rows[0].count} (Total: $${commissionsResult.rows[0].total})`);
    
    const subscriptionsResult = await neonPool.query('SELECT COUNT(*) as count FROM subscriptions');
    console.log(`✅ Total Subscriptions: ${subscriptionsResult.rows[0].count}`);
    
    // Check what the dashboard queries would return
    console.log('\n📊 DASHBOARD QUERIES (What admin sees):');
    console.log('========================================');
    
    // Simulate getAdminDashboardStats query
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.VITE_SUPABASE_URL,
      process.env.VITE_SUPABASE_ANON_KEY
    );
    
    const { data: supabaseUsers, error: usersError } = await supabase.from('users').select('*');
    const { data: supabaseSubscriptions, error: subsError } = await supabase.from('subscriptions').select('*');
    const { data: supabaseCommissions, error: commsError } = await supabase.from('commissions').select('*');
    
    console.log(`❌ Supabase Users: ${supabaseUsers?.length || 0}`);
    console.log(`❌ Supabase Subscriptions: ${supabaseSubscriptions?.length || 0}`);
    console.log(`❌ Supabase Commissions: ${supabaseCommissions?.length || 0}`);
    
    if (usersError) console.log('   Users error:', usersError.message);
    if (subsError) console.log('   Subscriptions error:', subsError.message);
    if (commsError) console.log('   Commissions error:', commsError.message);
    
    // Check agent dashboard data
    console.log('\n📊 AGENT DASHBOARD DATA:');
    console.log('========================');
    
    const agentEmail = 'michael@mypremierplans.com';
    const agentMembers = await neonPool.query(
      `SELECT 
        m.id,
        m.customer_number,
        m.first_name,
        m.last_name,
        m.email,
        m.plan_tier,
        m.coverage_type,
        m.total_plan_cost,
        m.created_at
      FROM members m
      WHERE m.enrolled_by_agent_id = $1
      AND m.status = 'active'
      ORDER BY m.created_at DESC`,
      [agentEmail]
    );
    
    console.log(`✅ Members enrolled by ${agentEmail}: ${agentMembers.rows.length}`);
    
    if (agentMembers.rows.length > 0) {
      console.log('\n📋 Sample Member Data:');
      const sample = agentMembers.rows[0];
      console.log({
        customerNumber: sample.customer_number,
        name: `${sample.first_name} ${sample.last_name}`,
        planTier: sample.plan_tier,
        coverageType: sample.coverage_type,
        totalCost: sample.total_plan_cost
      });
    }
    
    // Check commissions for this agent
    const agentUser = await supabase
      .from('users')
      .select('id')
      .eq('email', agentEmail)
      .single();
    
    if (agentUser.data) {
      const agentCommissions = await neonPool.query(
        `SELECT 
          c.id,
          c.commission_amount,
          c.total_plan_cost,
          c.plan_name,
          c.plan_type,
          c.payment_status,
          c.created_at
        FROM commissions c
        WHERE c.agent_id = $1
        ORDER BY c.created_at DESC`,
        [agentUser.data.id]
      );
      
      console.log(`\n✅ Commissions for agent: ${agentCommissions.rows.length}`);
      const totalCommission = agentCommissions.rows.reduce((sum, c) => sum + parseFloat(c.commission_amount || 0), 0);
      console.log(`💰 Total Commission Amount: $${totalCommission.toFixed(2)}`);
      
      if (agentCommissions.rows.length > 0) {
        console.log('\n📋 Sample Commission Data:');
        const sample = agentCommissions.rows[0];
        console.log({
          amount: sample.commission_amount,
          planCost: sample.total_plan_cost,
          planName: sample.plan_name,
          coverageType: sample.plan_type,
          status: sample.payment_status
        });
      }
    }
    
    console.log('\n🔧 PROBLEM IDENTIFIED:');
    console.log('======================');
    console.log('❌ Admin Dashboard queries SUPABASE (empty)');
    console.log('✅ Actual data is in NEON PostgreSQL');
    console.log('💡 Solution: Update dashboard queries to use Neon directly');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await neonPool.end();
  }
}

checkDashboardData();
