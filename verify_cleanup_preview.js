
import { Pool } from '@neondatabase/serverless';
import dotenv from 'dotenv';

dotenv.config();

async function verifyCleanupPreview() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL not found in environment variables');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  
  try {
    console.log('🔍 CLEANUP PREVIEW - What will be removed/preserved:\n');
    
    // Check current data counts
    const counts = await pool.query(`
      SELECT 
        'users' as table_name, COUNT(*) as current_count FROM users
      UNION ALL
      SELECT 'subscriptions', COUNT(*) FROM subscriptions
      UNION ALL
      SELECT 'payments', COUNT(*) FROM payments
      UNION ALL
      SELECT 'family_members', COUNT(*) FROM family_members
      UNION ALL
      SELECT 'leads', COUNT(*) FROM leads
      UNION ALL
      SELECT 'lead_activities', COUNT(*) FROM lead_activities
      UNION ALL
      SELECT 'commissions', COUNT(*) FROM commissions
      UNION ALL
      SELECT 'enrollment_modifications', COUNT(*) FROM enrollment_modifications
      ORDER BY table_name;
    `);
    
    console.log('📊 Current Database State:');
    counts.rows.forEach(row => {
      console.log(`   ${row.table_name}: ${row.current_count} records`);
    });
    
    // Show which users will be kept vs removed
    const adminEmails = ['michael@mypremierplans.com', 'travis@mypremierplans.com'];
    const agentEmails = ['mdkeener@gmail.com', 'tmatheny77@gmail.com', 'svillarreal@cyariskmanagement.com'];
    const keepEmails = [...adminEmails, ...agentEmails];
    
    const usersToKeep = await pool.query(
      `SELECT email, role FROM users WHERE email IN (${keepEmails.map((_, i) => `$${i + 1}`).join(', ')})`,
      keepEmails
    );
    
    const usersToRemove = await pool.query(
      `SELECT COUNT(*) as count FROM users WHERE email NOT IN (${keepEmails.map((_, i) => `$${i + 1}`).join(', ')}) OR email IS NULL`,
      keepEmails
    );
    
    console.log('\n👥 User Account Changes:');
    console.log('   ✅ WILL KEEP (Admin/Agent accounts):');
    usersToKeep.rows.forEach(user => {
      console.log(`      - ${user.email} (${user.role})`);
    });
    console.log(`   ❌ WILL REMOVE: ${usersToRemove.rows[0].count} test member accounts`);
    
    console.log('\n📋 What will be PRESERVED:');
    console.log('   ✅ All leads and lead activities');
    console.log('   ✅ Admin and agent user accounts');
    console.log('   ✅ Database structure and plans');
    
    console.log('\n🗑️  What will be REMOVED:');
    console.log('   ❌ All test member enrollments');
    console.log('   ❌ All subscriptions and payments');
    console.log('   ❌ All family members');
    console.log('   ❌ All commissions');
    console.log('   ❌ All enrollment modifications');
    console.log('   ❌ All user sessions');
    
    console.log('\n⚠️  Ready to run production cleanup? Use: node clear_production_prep.js');
    
  } catch (error) {
    console.error('❌ Error during verification:', error);
  } finally {
    await pool.end();
  }
}

verifyCleanupPreview();
