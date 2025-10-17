// Test script to verify analytics endpoint is working correctly
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

// Database connection - using connection string from .env
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function testAnalyticsData() {
  try {
    console.log('\n📊 Testing Analytics Data Source\n');
    console.log('='.repeat(60));

    // Test members table
    const membersResult = await pool.query('SELECT COUNT(*) as count, SUM(CAST(total_monthly_price AS NUMERIC)) as revenue FROM members WHERE is_active = true');
    console.log('\n✅ MEMBERS TABLE (Neon):');
    console.log(`   Total Active Members: ${membersResult.rows[0].count}`);
    console.log(`   Total Monthly Revenue: $${parseFloat(membersResult.rows[0].revenue || 0).toFixed(2)}`);

    // Test agents
    const agentsResult = await pool.query("SELECT COUNT(*) as count FROM users WHERE role = 'agent'");
    console.log('\n✅ AGENTS:');
    console.log(`   Total Agents: ${agentsResult.rows[0].count}`);

    // Test commissions
    const commissionsResult = await pool.query('SELECT COUNT(*) as count, SUM(CAST(commission_amount AS NUMERIC)) as total FROM commissions');
    console.log('\n✅ COMMISSIONS:');
    console.log(`   Total Commission Records: ${commissionsResult.rows[0].count}`);
    console.log(`   Total Commission Amount: $${parseFloat(commissionsResult.rows[0].total || 0).toFixed(2)}`);

    // Test plans
    const plansResult = await pool.query('SELECT COUNT(*) as count FROM plans WHERE is_active = true');
    console.log('\n✅ PLANS:');
    console.log(`   Active Plans: ${plansResult.rows[0].count}`);

    // Test plan breakdown
    console.log('\n📋 PLAN BREAKDOWN:');
    const planBreakdown = await pool.query(`
      SELECT p.name, COUNT(m.id) as member_count, SUM(CAST(m.total_monthly_price AS NUMERIC)) as revenue
      FROM plans p
      LEFT JOIN members m ON m.plan_id = p.id AND m.status = 'active'
      WHERE p.is_active = true
      GROUP BY p.id, p.name
      ORDER BY revenue DESC
    `);
    planBreakdown.rows.forEach(plan => {
      console.log(`   ${plan.name}: ${plan.member_count} members, $${parseFloat(plan.revenue || 0).toFixed(2)}/month`);
    });

    // Test recent enrollments
    console.log('\n📅 RECENT ENROLLMENTS (Last 30 days):');
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 30);
    const recentResult = await pool.query(
      'SELECT COUNT(*) as count FROM members WHERE created_at >= $1',
      [cutoffDate]
    );
    console.log(`   New Enrollments: ${recentResult.rows[0].count}`);

    console.log('\n' + '='.repeat(60));
    console.log('✅ All analytics data sources verified!\n');
    
    await pool.end();
  } catch (error) {
    console.error('❌ Error testing analytics:', error);
    await pool.end();
    process.exit(1);
  }
}

testAnalyticsData();
