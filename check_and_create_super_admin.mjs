import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

// Neon database connection
const neonPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function checkAndCreateSuperAdmin() {
  try {
    console.log('\n🔍 CHECKING SUPER ADMIN USER...\n');
    
    const email = 'michael@mypremierplans.com';
    const agentNumber = 'MPP0001';
    
    // Check if user exists
    console.log('1️⃣ Checking if user exists in users table...');
    const checkResult = await neonPool.query(
      'SELECT * FROM users WHERE email = $1 OR agent_number = $2',
      [email, agentNumber]
    );
    
    if (checkResult.rows.length > 0) {
      console.log('✅ User found in users table:');
      const user = checkResult.rows[0];
      console.log({
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role,
        agentNumber: user.agent_number,
        isActive: user.is_active
      });
    } else {
      console.log('❌ User NOT found in users table');
      console.log('\n2️⃣ Creating super admin user...\n');
      
      // Create the super admin user
      const insertResult = await neonPool.query(`
        INSERT INTO users (
          email,
          username,
          first_name,
          last_name,
          role,
          agent_number,
          is_active,
          approval_status,
          email_verified,
          created_at,
          updated_at
        ) VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          true,
          'approved',
          true,
          NOW(),
          NOW()
        )
        RETURNING *
      `, [
        email,
        'michael',
        'Michael',
        'Administrator',
        'super_admin',
        agentNumber
      ]);
      
      console.log('✅ Super admin user created successfully:');
      const newUser = insertResult.rows[0];
      console.log({
        id: newUser.id,
        email: newUser.email,
        firstName: newUser.first_name,
        lastName: newUser.last_name,
        role: newUser.role,
        agentNumber: newUser.agent_number,
        isActive: newUser.is_active
      });
    }
    
    console.log('\n3️⃣ Verifying members reference this agent...\n');
    const membersResult = await neonPool.query(
      'SELECT id, customer_number, first_name, last_name, enrolled_by_agent_id, agent_number FROM members WHERE enrolled_by_agent_id = $1',
      [email]
    );
    
    console.log(`Found ${membersResult.rows.length} members enrolled by this agent:`);
    membersResult.rows.forEach(member => {
      console.log(`  - ${member.customer_number}: ${member.first_name} ${member.last_name}`);
    });
    
    console.log('\n4️⃣ Testing commission creation...\n');
    
    // Get the user ID
    const userCheck = await neonPool.query('SELECT id FROM users WHERE email = $1', [email]);
    const userId = userCheck.rows[0]?.id;
    
    if (!userId) {
      console.log('❌ Could not find user ID');
      return;
    }
    
    // Try test insert
    try {
      await neonPool.query(`
        INSERT INTO commissions (
          agent_id,
          subscription_id,
          user_id,
          plan_name,
          plan_type,
          plan_tier,
          commission_amount,
          total_plan_cost,
          status,
          payment_status,
          created_at,
          updated_at
        ) VALUES (
          $1,
          1,
          1,
          'Test Plan',
          'individual',
          'standard',
          50.00,
          250.00,
          'active',
          'pending',
          NOW(),
          NOW()
        )
      `, [email]);
      
      console.log('✅ TEST COMMISSION INSERT SUCCESSFUL!');
      
      // Clean up test commission
      await neonPool.query(
        "DELETE FROM commissions WHERE agent_id = $1 AND plan_name = 'Test Plan'",
        [email]
      );
      console.log('🧹 Test commission cleaned up');
      
    } catch (error) {
      console.log('❌ TEST COMMISSION INSERT FAILED:', error.message);
      console.log('Error code:', error.code);
      console.log('Error detail:', error.detail);
    }
    
    console.log('\n✅ CHECK COMPLETE\n');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    await neonPool.end();
  }
}

checkAndCreateSuperAdmin();
