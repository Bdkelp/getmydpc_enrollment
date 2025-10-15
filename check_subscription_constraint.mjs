import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function checkConstraints() {
  try {
    const result = await pool.query(`
      SELECT 
        tc.constraint_name, 
        tc.constraint_type,
        kcu.column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name,
        pgc.is_nullable
      FROM information_schema.table_constraints AS tc 
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      LEFT JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
      LEFT JOIN information_schema.columns AS pgc
        ON pgc.table_name = tc.table_name
        AND pgc.column_name = kcu.column_name
      WHERE tc.table_name = 'commissions' 
        AND kcu.column_name = 'subscription_id'
    `);

    console.log('\n🔍 Constraints on commissions.subscription_id:');
    result.rows.forEach(row => {
      console.log(`\nConstraint: ${row.constraint_name}`);
      console.log(`  Type: ${row.constraint_type}`);
      console.log(`  Column: ${row.column_name}`);
      console.log(`  Is Nullable: ${row.is_nullable}`);
      if (row.foreign_table_name) {
        console.log(`  References: ${row.foreign_table_name}.${row.foreign_column_name}`);
      }
    });
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkConstraints();
