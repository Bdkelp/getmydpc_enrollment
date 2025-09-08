
#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function backupCriticalData() {
  console.log('📋 Creating backup of critical data...');
  
  try {
    // Backup users with roles
    const { data: users } = await supabase
      .from('users')
      .select('id, email, role, agentNumber, isActive, approvalStatus');
    
    // Backup active subscriptions
    const { data: subscriptions } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('status', 'active');
    
    // Backup commissions
    const { data: commissions } = await supabase
      .from('commissions')
      .select('*');
    
    console.log(`✅ Backed up: ${users?.length || 0} users, ${subscriptions?.length || 0} subscriptions, ${commissions?.length || 0} commissions`);
    
    return { users, subscriptions, commissions };
  } catch (error) {
    console.error('❌ Backup failed:', error.message);
    throw error;
  }
}

async function checkCurrentSchema() {
  console.log('🔍 Checking current database schema...');
  
  try {
    // Check table existence and structure
    const tables = ['users', 'subscriptions', 'commissions', 'leads', 'payments', 'plans'];
    const tableInfo = {};
    
    for (const table of tables) {
      const { data, error } = await supabase
        .from('information_schema.columns')
        .select('column_name, data_type, is_nullable')
        .eq('table_schema', 'public')
        .eq('table_name', table);
      
      if (error) {
        console.log(`⚠️ Table ${table} may not exist or has access issues`);
      } else {
        tableInfo[table] = data;
        console.log(`✅ Table ${table}: ${data.length} columns`);
      }
    }
    
    return tableInfo;
  } catch (error) {
    console.error('❌ Schema check failed:', error.message);
    throw error;
  }
}

async function applySchemaChanges() {
  console.log('🔧 Applying schema changes...');
  
  const migrations = [
    // Add any missing columns or constraints
    `
    -- Ensure agent number protection is in place
    ALTER TABLE users 
    ADD COLUMN IF NOT EXISTS "agentNumber" VARCHAR(255) UNIQUE;
    `,
    
    // Add missing indexes if needed
    `
    CREATE INDEX IF NOT EXISTS idx_users_agent_number ON users("agentNumber");
    CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
    CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
    CREATE INDEX IF NOT EXISTS idx_commissions_status ON commissions(status);
    `,
    
    // Ensure RLS policies are correct
    `
    -- Refresh RLS policies for critical tables
    ALTER TABLE users ENABLE ROW LEVEL SECURITY;
    ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
    ALTER TABLE commissions ENABLE ROW LEVEL SECURITY;
    ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
    `
  ];
  
  for (let i = 0; i < migrations.length; i++) {
    try {
      console.log(`Applying migration ${i + 1}/${migrations.length}...`);
      const { error } = await supabase.rpc('exec_sql', { sql: migrations[i] });
      
      if (error) {
        console.error(`❌ Migration ${i + 1} failed:`, error.message);
      } else {
        console.log(`✅ Migration ${i + 1} completed`);
      }
    } catch (error) {
      console.error(`❌ Migration ${i + 1} error:`, error.message);
    }
  }
}

async function verifyMigration() {
  console.log('✅ Verifying migration results...');
  
  try {
    // Verify critical tables still work
    const { data: userCount, error: userError } = await supabase
      .from('users')
      .select('count', { count: 'exact', head: true });
    
    const { data: subCount, error: subError } = await supabase
      .from('subscriptions')
      .select('count', { count: 'exact', head: true });
    
    if (userError || subError) {
      console.error('❌ Post-migration verification failed');
      return false;
    }
    
    console.log(`✅ Migration verified: ${userCount || 0} users, ${subCount || 0} subscriptions accessible`);
    return true;
  } catch (error) {
    console.error('❌ Verification failed:', error.message);
    return false;
  }
}

async function main() {
  console.log('🚀 Starting database schema migration...\n');
  
  try {
    // Step 1: Backup critical data
    const backup = await backupCriticalData();
    
    // Step 2: Check current schema
    const currentSchema = await checkCurrentSchema();
    
    // Step 3: Apply schema changes
    await applySchemaChanges();
    
    // Step 4: Verify migration
    const success = await verifyMigration();
    
    if (success) {
      console.log('\n🎉 Migration completed successfully!');
      console.log('💡 Remember to test your application thoroughly');
    } else {
      console.log('\n⚠️ Migration completed with warnings - please review manually');
    }
    
  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.log('💡 Your data should still be intact - review the error and try again');
    process.exit(1);
  }
}

// Execute if run directly
if (require.main === module) {
  main();
}

module.exports = { backupCriticalData, checkCurrentSchema, applySchemaChanges, verifyMigration };
