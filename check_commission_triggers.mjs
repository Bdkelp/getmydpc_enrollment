import { config } from 'dotenv';
import pg from 'pg';
const { Pool } = pg;

config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function checkTriggers() {
  console.log('Checking for triggers on commissions table...\n');
  
  try {
    // Check for triggers
    const triggersResult = await pool.query(`
      SELECT 
        trigger_name,
        event_manipulation,
        action_statement,
        action_timing
      FROM information_schema.triggers
      WHERE event_object_table = 'commissions'
    `);
    
    console.log(`Found ${triggersResult.rows.length} triggers:`);
    triggersResult.rows.forEach(trigger => {
      console.log(`\n  Trigger: ${trigger.trigger_name}`);
      console.log(`  Event: ${trigger.event_manipulation}`);
      console.log(`  Timing: ${trigger.action_timing}`);
      console.log(`  Action: ${trigger.action_statement}`);
    });

    // Check for functions related to commissions
    const functionsResult = await pool.query(`
      SELECT 
        routine_name,
        routine_definition
      FROM information_schema.routines
      WHERE routine_name LIKE '%commission%'
      AND routine_schema = 'public'
    `);
    
    console.log(`\n\nFound ${functionsResult.rows.length} commission-related functions:`);
    functionsResult.rows.forEach(func => {
      console.log(`\n  Function: ${func.routine_name}`);
      console.log(`  Definition: ${func.routine_definition}`);
    });
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkTriggers();
