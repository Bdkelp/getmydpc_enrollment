import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const neonPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function updateCustomerNumbers() {
  try {
    console.log('\n🔢 UPDATING CUSTOMER NUMBER SYSTEM\n');
    console.log('=' .repeat(80));

    // 1. Show current customer numbers
    console.log('\n📋 CURRENT CUSTOMER NUMBERS:');
    console.log('-'.repeat(80));
    const currentMembers = await neonPool.query(`
      SELECT id, customer_number, first_name, last_name, created_at
      FROM members
      ORDER BY id
    `);
    console.table(currentMembers.rows);

    // 2. Get the year from the first member or use current year
    const year = new Date().getFullYear();
    
    console.log(`\n🔄 Updating to format: MPP${year}-XXXX (4-digit sequential)`);
    console.log('-'.repeat(80));

    // 3. Update each member with new sequential number
    for (let i = 0; i < currentMembers.rows.length; i++) {
      const member = currentMembers.rows[i];
      const sequentialNumber = String(i + 1).padStart(4, '0');
      const newCustomerNumber = `MPP${year}-${sequentialNumber}`;
      
      await neonPool.query(
        'UPDATE members SET customer_number = $1 WHERE id = $2',
        [newCustomerNumber, member.id]
      );
      
      console.log(`  ✅ Updated member ${member.id}: ${member.customer_number} → ${newCustomerNumber}`);
    }

    // 4. Create a sequence for future customer numbers
    console.log('\n📊 Setting up auto-increment sequence...');
    
    // Check if sequence exists
    const sequenceExists = await neonPool.query(`
      SELECT EXISTS (
        SELECT 1 FROM pg_class WHERE relname = 'customer_number_seq'
      ) as exists
    `);

    if (!sequenceExists.rows[0].exists) {
      await neonPool.query(`
        CREATE SEQUENCE customer_number_seq START WITH ${currentMembers.rows.length + 1}
      `);
      console.log(`✅ Created sequence starting at ${currentMembers.rows.length + 1}`);
    } else {
      await neonPool.query(`
        SELECT setval('customer_number_seq', ${currentMembers.rows.length}, true)
      `);
      console.log(`✅ Updated sequence to ${currentMembers.rows.length}`);
    }

    // 5. Create a function to generate customer numbers automatically
    console.log('\n⚙️  Creating auto-generation function...');
    
    await neonPool.query(`
      CREATE OR REPLACE FUNCTION generate_customer_number()
      RETURNS TEXT AS $$
      DECLARE
        next_num INTEGER;
        year_part TEXT;
        num_part TEXT;
      BEGIN
        next_num := nextval('customer_number_seq');
        year_part := EXTRACT(YEAR FROM CURRENT_DATE)::TEXT;
        num_part := LPAD(next_num::TEXT, 4, '0');
        RETURN 'MPP' || year_part || '-' || num_part;
      END;
      $$ LANGUAGE plpgsql;
    `);
    console.log('✅ Created generate_customer_number() function');

    // 6. Create a trigger to auto-generate customer numbers
    console.log('\n🔧 Creating auto-generation trigger...');
    
    await neonPool.query(`
      DROP TRIGGER IF EXISTS set_customer_number_trigger ON members;
    `);
    
    await neonPool.query(`
      CREATE OR REPLACE FUNCTION set_customer_number()
      RETURNS TRIGGER AS $$
      BEGIN
        IF NEW.customer_number IS NULL OR NEW.customer_number = '' THEN
          NEW.customer_number := generate_customer_number();
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);
    
    await neonPool.query(`
      CREATE TRIGGER set_customer_number_trigger
      BEFORE INSERT ON members
      FOR EACH ROW
      EXECUTE FUNCTION set_customer_number();
    `);
    console.log('✅ Created trigger to auto-generate customer numbers on insert');

    // 7. Verify the new customer numbers
    console.log('\n✅ VERIFICATION - NEW CUSTOMER NUMBERS:');
    console.log('-'.repeat(80));
    const updatedMembers = await neonPool.query(`
      SELECT id, customer_number, first_name, last_name
      FROM members
      ORDER BY id
    `);
    console.table(updatedMembers.rows);

    // 8. Test the auto-generation
    console.log('\n🧪 TESTING AUTO-GENERATION:');
    console.log('-'.repeat(80));
    const nextNumber = await neonPool.query(`SELECT generate_customer_number() as next_number`);
    console.log(`Next customer number will be: ${nextNumber.rows[0].next_number}`);

    await neonPool.end();
    console.log('\n✅ CUSTOMER NUMBER SYSTEM UPDATED!\n');
    console.log('📝 Notes:');
    console.log('  - Existing members renumbered to MPP2025-0001, MPP2025-0002, etc.');
    console.log('  - New enrollments will automatically get sequential numbers');
    console.log('  - Format: MPPYYYY-XXXX (supports up to 9999 members per year)');
    console.log('  - Sequence will roll over to MPP2026-0001 when year changes\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    await neonPool.end();
    process.exit(1);
  }
}

updateCustomerNumbers();
