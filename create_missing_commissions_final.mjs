import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

// Supabase connection
const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Neon connection
const neonPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function createMissingCommissions() {
  try {
    console.log('\n💰 CREATING MISSING COMMISSIONS\n');
    console.log('=' .repeat(80));

    // 1. Get all members with their plan info
    console.log('\n📋 Fetching members...');
    const membersResult = await neonPool.query(`
      SELECT 
        m.id,
        m.customer_number,
        m.first_name,
        m.last_name,
        m.email,
        m.plan_id,
        m.coverage_type,
        m.total_monthly_price,
        m.enrolled_by_agent_id,
        p.name as plan_name,
        p.price as plan_price
      FROM members m
      LEFT JOIN plans p ON m.plan_id = p.id
      WHERE m.is_active = true
      ORDER BY m.id
    `);

    console.log(`✅ Found ${membersResult.rows.length} members`);

    // 2. Get existing commissions
    console.log('\n📋 Checking existing commissions...');
    const commissionsResult = await neonPool.query(`
      SELECT member_id FROM commissions
    `);
    const existingMemberIds = commissionsResult.rows.map(c => c.member_id);
    console.log(`✅ Found ${existingMemberIds.length} existing commissions for members: ${existingMemberIds.join(', ')}`);

    // 3. Find members without commissions
    const membersWithoutCommissions = membersResult.rows.filter(m => !existingMemberIds.includes(m.id));
    console.log(`\n⚠️  ${membersWithoutCommissions.length} members need commissions:`);
    console.table(membersWithoutCommissions.map(m => ({
      id: m.id,
      customer_number: m.customer_number,
      name: `${m.first_name} ${m.last_name}`,
      plan_id: m.plan_id,
      plan_name: m.plan_name,
      agent: m.enrolled_by_agent_id
    })));

    if (membersWithoutCommissions.length === 0) {
      console.log('\n✅ All members have commissions!');
      await neonPool.end();
      return;
    }

    // 4. Create commissions for each member
    console.log('\n💰 Creating commissions...');
    console.log('-'.repeat(80));

    for (const member of membersWithoutCommissions) {
      // Skip if no plan_id or no agent
      if (!member.plan_id) {
        console.log(`⏭️  Skipping member ${member.id} (${member.customer_number}): No plan_id assigned`);
        continue;
      }

      if (!member.enrolled_by_agent_id) {
        console.log(`⏭️  Skipping member ${member.id} (${member.customer_number}): No agent assigned`);
        continue;
      }

      // Get agent UUID from Supabase
      const { data: agent } = await supabase
        .from('users')
        .select('email')
        .eq('email', member.enrolled_by_agent_id)
        .single();

      if (!agent) {
        console.log(`❌ Agent ${member.enrolled_by_agent_id} not found in Supabase`);
        continue;
      }

      // Get agent UUID from Supabase Auth
      const { data: authData } = await supabase.auth.admin.listUsers();
      const authUser = authData.users.find(u => u.email === member.enrolled_by_agent_id);

      if (!authUser) {
        console.log(`❌ Agent ${member.enrolled_by_agent_id} not found in Supabase Auth`);
        continue;
      }

      const agentId = authUser.id;

      // Determine commission amount based on plan tier
      let commissionAmount = 0;
      let planTier = 'Base';
      
      if (member.plan_name) {
        if (member.plan_name.includes('Elite')) {
          commissionAmount = 18;
          planTier = 'Elite';
        } else if (member.plan_name.includes('+')) {
          commissionAmount = 12;
          planTier = 'Plus';
        } else {
          commissionAmount = 8;
          planTier = 'Base';
        }
      }

      // Create commission
      await neonPool.query(`
        INSERT INTO commissions (
          agent_id,
          member_id,
          commission_amount,
          plan_name,
          plan_type,
          plan_tier,
          status,
          payment_status,
          total_plan_cost,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
      `, [
        agentId,
        member.id,
        commissionAmount,
        planTier,
        member.coverage_type || 'Member Only',
        planTier,
        'pending',
        'unpaid',
        member.total_monthly_price || member.plan_price || 0
      ]);

      console.log(`  ✅ Created commission for ${member.customer_number} (${member.first_name} ${member.last_name})`);
      console.log(`     Plan: ${member.plan_name || 'Unknown'}`);
      console.log(`     Commission: $${commissionAmount}.00`);
      console.log(`     Agent: ${member.enrolled_by_agent_id} (${agentId})`);
      console.log('');
    }

    // 5. Verify all commissions
    console.log('\n✅ VERIFICATION - ALL COMMISSIONS:');
    console.log('-'.repeat(80));
    const allCommissions = await neonPool.query(`
      SELECT 
        c.id,
        c.member_id,
        m.customer_number,
        m.first_name,
        m.last_name,
        c.commission_amount,
        c.plan_name,
        c.plan_tier,
        c.status
      FROM commissions c
      JOIN members m ON c.member_id = m.id
      ORDER BY c.id
    `);
    console.table(allCommissions.rows);
    console.log(`\n✅ Total commissions: ${allCommissions.rows.length}`);
    console.log(`💰 Total amount: $${allCommissions.rows.reduce((sum, c) => sum + parseFloat(c.commission_amount), 0).toFixed(2)}`);

    await neonPool.end();
    console.log('\n✅ COMMISSION CREATION COMPLETE!\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    await neonPool.end();
    process.exit(1);
  }
}

createMissingCommissions();
