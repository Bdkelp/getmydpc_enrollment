import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function checkTriggers() {
  try {
    const result = await pool.query(`
      SELECT 
        t.tgname AS trigger_name,
        t.tgenabled AS is_enabled,
        pg_get_triggerdef(t.oid) AS trigger_definition
      FROM pg_trigger t
      JOIN pg_class c ON t.tgrelid = c.oid
      WHERE c.relname = 'commissions'
        AND t.tgisinternal = false
    `);

    console.log('🔍 Triggers on commissions table:\n');
    if (result.rows.length === 0) {
      console.log('No triggers found');
    } else {
      result.rows.forEach(row => {
        console.log(`Trigger: ${row.trigger_name}`);
        console.log(`Enabled: ${row.is_enabled === 'O' ? 'Yes' : 'No'}`);
        console.log(`Definition: ${row.trigger_definition}\n`);
      });
    }
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkTriggers();
