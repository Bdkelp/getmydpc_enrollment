import pg from 'pg';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const neonPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function createMissingCommissions() {
  try {
    console.log('\n💰 CREATING MISSING COMMISSIONS\n');
    console.log('=' .repeat(80));

    // 1. Find members without commission records
    console.log('\n🔍 Finding members without commissions...');
    const membersWithoutCommissions = await neonPool.query(`
      SELECT 
        m.id,
        m.customer_number,
        m.first_name,
        m.last_name,
        m.plan_id,
        m.enrolled_by_agent_id,
        p.name as plan_name,
        p.price as plan_price
      FROM members m
      LEFT JOIN commissions c ON c.member_id = m.id
      LEFT JOIN plans p ON p.id = m.plan_id
      WHERE c.id IS NULL 
        AND m.is_active = true
        AND m.enrolled_by_agent_id IS NOT NULL
      ORDER BY m.id
    `);
    
    console.table(membersWithoutCommissions.rows);
    console.log(`\n⚠️  Found ${membersWithoutCommissions.rows.length} members without commissions\n`);

    if (membersWithoutCommissions.rows.length === 0) {
      console.log('✅ All members have commission records!');
      await neonPool.end();
      return;
    }

    // 2. Commission calculation logic
    const calculateCommission = (planPrice) => {
      const price = parseFloat(planPrice);
      if (price <= 59) return 8;      // Base: $8
      if (price <= 99) return 12;     // Plus: $12
      return 18;                       // Elite: $18
    };

    const getPlanTier = (planName) => {
      if (planName.includes('Base')) return 'Base';
      if (planName.includes('Plus') || planName.includes('+')) return 'Plus';
      if (planName.includes('Elite')) return 'Elite';
      return 'Base';
    };

    // 3. Create commissions for each member
    console.log('\n🔄 Creating commission records...');
    console.log('-'.repeat(80));

    for (const member of membersWithoutCommissions.rows) {
      const commissionAmount = calculateCommission(member.plan_price);
      const planTier = getPlanTier(member.plan_name);
      
      // Get agent UUID from Neon users table
      const agentResult = await neonPool.query(
        'SELECT id FROM users WHERE email = $1',
        [member.enrolled_by_agent_id]
      );
      
      if (!agentResult.rows || agentResult.rows.length === 0) {
        console.log(`  ⚠️  Could not find agent UUID for ${member.enrolled_by_agent_id}, skipping member ${member.customer_number}`);
        continue;
      }
      
      const agent = agentResult.rows[0];
      
      await neonPool.query(`
        INSERT INTO commissions (
          agent_id,
          member_id,
          commission_amount,
          plan_name,
          plan_type,
          plan_tier,
          total_plan_cost,
          status,
          payment_status,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
      `, [
        agent.id,  // Use UUID from Supabase
        member.id,
        commissionAmount,
        planTier,
        'Member Only',
        planTier,
        member.plan_price,
        'pending',
        'unpaid'
      ]);
      
      console.log(`  ✅ Created commission for ${member.customer_number} (${member.first_name} ${member.last_name}): $${commissionAmount}`);
    }

    // 4. Verify all commissions
    console.log('\n✅ VERIFICATION - ALL COMMISSIONS:');
    console.log('-'.repeat(80));
    const allCommissions = await neonPool.query(`
      SELECT 
        c.id,
        m.customer_number,
        m.first_name,
        m.last_name,
        c.commission_amount,
        c.plan_tier,
        c.payment_status
      FROM commissions c
      JOIN members m ON m.id = c.member_id
      WHERE m.is_active = true
      ORDER BY c.id
    `);
    
    console.table(allCommissions.rows);

    // 5. Show summary
    console.log('\n📊 COMMISSION SUMMARY:');
    console.log('-'.repeat(80));
    const summary = await neonPool.query(`
      SELECT 
        COUNT(*) as total_commissions,
        SUM(commission_amount) as total_amount,
        COUNT(CASE WHEN payment_status = 'unpaid' THEN 1 END) as unpaid_count,
        SUM(CASE WHEN payment_status = 'unpaid' THEN commission_amount ELSE 0 END) as unpaid_amount
      FROM commissions c
      JOIN members m ON m.id = c.member_id
      WHERE m.is_active = true
    `);
    
    console.table(summary.rows);

    await neonPool.end();
    console.log('\n✅ COMMISSIONS CREATED!\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    await neonPool.end();
    process.exit(1);
  }
}

createMissingCommissions();
