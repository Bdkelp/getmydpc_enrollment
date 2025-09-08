
#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

async function compareSchemas() {
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  
  console.log('🔍 Comparing current schema with expected schema...');
  
  // Get current schema
  const { data: currentTables } = await supabase
    .from('information_schema.tables')
    .select('table_name')
    .eq('table_schema', 'public');
  
  // Expected tables based on your codebase
  const expectedTables = [
    'users', 'subscriptions', 'plans', 'family_members',
    'leads', 'lead_activities', 'payments', 'commissions',
    'enrollment_modifications', 'sessions'
  ];
  
  console.log('\n📊 Schema Comparison:');
  
  expectedTables.forEach(table => {
    const exists = currentTables?.find(t => t.table_name === table);
    console.log(`${exists ? '✅' : '❌'} Table: ${table}`);
  });
  
  // Check for extra tables
  const extraTables = currentTables?.filter(t => 
    !expectedTables.includes(t.table_name) && 
    !t.table_name.startsWith('_')
  );
  
  if (extraTables?.length > 0) {
    console.log('\n🔍 Additional tables found:');
    extraTables.forEach(t => console.log(`ℹ️ ${t.table_name}`));
  }
}

compareSchemas();
