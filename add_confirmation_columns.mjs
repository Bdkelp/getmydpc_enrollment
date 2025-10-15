import 'dotenv/config';
import pkg from 'pg';
import fs from 'fs';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function addConfirmationColumns() {
  console.log('🔧 Adding confirmation columns to members table...\n');
  
  try {
    // Add the columns
    await pool.query(`
      ALTER TABLE members 
        ADD COLUMN IF NOT EXISTS plan_id INTEGER,
        ADD COLUMN IF NOT EXISTS coverage_type VARCHAR(50),
        ADD COLUMN IF NOT EXISTS total_monthly_price DECIMAL(10,2),
        ADD COLUMN IF NOT EXISTS add_rx_valet BOOLEAN DEFAULT false;
    `);

    console.log('✅ Columns added successfully!\n');

    // Verify the columns were added
    const result = await pool.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'members'
        AND column_name IN ('plan_id', 'coverage_type', 'total_monthly_price', 'add_rx_valet')
      ORDER BY ordinal_position;
    `);

    console.log('📋 Verification - New columns in members table:');
    result.rows.forEach(col => {
      console.log(`  - ${col.column_name} (${col.data_type}) - Nullable: ${col.is_nullable}, Default: ${col.column_default || 'none'}`);
    });

    console.log('\n✅ Migration complete!');
    console.log('\n📝 Next steps:');
    console.log('  1. Update server/routes.ts to save these fields during enrollment');
    console.log('  2. Update confirmation.tsx to fetch data from database');
    console.log('  3. Test with a new enrollment');

  } catch (error) {
    console.error('❌ Error adding columns:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    await pool.end();
  }
}

addConfirmationColumns();
