
#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
require('dotenv').config();

async function applySqlFile(filename) {
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  
  console.log(`📄 Reading SQL file: ${filename}`);
  const sqlContent = fs.readFileSync(filename, 'utf8');
  
  console.log('🔧 Applying SQL migration...');
  const { error } = await supabase.rpc('exec_sql', { sql: sqlContent });
  
  if (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
  
  console.log('✅ SQL migration applied successfully!');
}

// Usage: node apply_sql_migration.js your_migration.sql
if (process.argv[2]) {
  applySqlFile(process.argv[2]);
} else {
  console.error('Usage: node apply_sql_migration.js <sql_file>');
}
