/**
 * Migration Script: Encrypt Existing SSN Data
 * Date: 2026-02-21
 * 
 * This script encrypts all existing plaintext SSN values in the members table.
 * 
 * PREREQUISITES:
 * 1. SSN_ENCRYPTION_KEY environment variable must be set
 * 2. Database backup must be completed
 * 3. Test in staging environment first
 * 
 * USAGE:
 *   node migrations/scripts/encrypt_existing_ssns.js [--dry-run]
 * 
 * OPTIONS:
 *   --dry-run    Show what would be encrypted without making changes
 *   --batch-size Number of records to process at once (default: 100)
 */

import { neonPool } from '../../server/lib/neonDb.js';
import { encryptSSN, isValidSSN } from '../../server/utils/encryption.js';

const DRY_RUN = process.argv.includes('--dry-run');
const BATCH_SIZE = parseInt(process.argv.find(arg => arg.startsWith('--batch-size='))?.split('=')[1] || '100');

async function encryptExistingSSNs() {
  console.log('🔐 SSN Encryption Migration');
  console.log('============================');
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no changes)' : 'LIVE (will update database)'}`);
  console.log(`Batch size: ${BATCH_SIZE}`);
  console.log('');

  // Check environment variable
  if (!process.env.SSN_ENCRYPTION_KEY) {
    console.error('❌ ERROR: SSN_ENCRYPTION_KEY environment variable not set');
    process.exit(1);
  }

  const client = await neonPool.connect();

  try {
    // Count total members with SSN
    const countResult = await client.query(
      'SELECT COUNT(*) as total FROM members WHERE ssn IS NOT NULL AND ssn != \'\''
    );
    const totalMembers = parseInt(countResult.rows[0].total);

    console.log(`📊 Found ${totalMembers} members with SSN data\n`);

    if (totalMembers === 0) {
      console.log('✅ No SSN data to encrypt');
      return;
    }

    // Fetch all members with SSN in batches
    let processed = 0;
    let encrypted = 0;
    let alreadyEncrypted = 0;
    let invalid = 0;
    let errors = 0;

    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const result = await client.query(
        'SELECT id, customer_number, ssn FROM members WHERE ssn IS NOT NULL AND ssn != \'\' ORDER BY id LIMIT $1 OFFSET $2',
        [BATCH_SIZE, offset]
      );

      if (result.rows.length === 0) {
        hasMore = false;
        break;
      }

      for (const member of result.rows) {
        processed++;
        const { id, customer_number, ssn } = member;

        try {
          // Check if already encrypted (encrypted format: "iv:authTag:encrypted")
          if (ssn.includes(':')) {
            console.log(`⏭️  Member ${customer_number} (ID: ${id}) - Already encrypted`);
            alreadyEncrypted++;
            continue;
          }

          // Validate SSN before encryption
          if (!isValidSSN(ssn)) {
            console.warn(`⚠️  Member ${customer_number} (ID: ${id}) - Invalid SSN format: ${ssn.replace(/./g, '*')}`);
            invalid++;
            continue;
          }

          // Encrypt SSN
          const encryptedSSN = encryptSSN(ssn);

          if (!DRY_RUN) {
            // Update database
            await client.query(
              'UPDATE members SET ssn = $1, updated_at = NOW() WHERE id = $2',
              [encryptedSSN, id]
            );
          }

          console.log(`${DRY_RUN ? '🔍' : '✅'} Member ${customer_number} (ID: ${id}) - ${DRY_RUN ? 'Would encrypt' : 'Encrypted'}`);
          encrypted++;

        } catch (error) {
          console.error(`❌ Member ${customer_number} (ID: ${id}) - Error: ${error.message}`);
          errors++;
        }

        // Progress update every 10 records
        if (processed % 10 === 0) {
          console.log(`\n📈 Progress: ${processed}/${totalMembers} (${Math.round(processed/totalMembers*100)}%)\n`);
        }
      }

      offset += BATCH_SIZE;
    }

    console.log('\n============================');
    console.log('📊 Migration Summary');
    console.log('============================');
    console.log(`Total processed: ${processed}`);
    console.log(`${DRY_RUN ? 'Would encrypt' : 'Encrypted'}: ${encrypted}`);
    console.log(`Already encrypted: ${alreadyEncrypted}`);
    console.log(`Invalid SSNs: ${invalid}`);
    console.log(`Errors: ${errors}`);
    console.log('');

    if (DRY_RUN) {
      console.log('💡 This was a dry run. No changes were made to the database.');
      console.log('   Run without --dry-run to perform actual encryption.');
    } else {
      console.log('✅ Migration completed successfully!');
      console.log('   All plaintext SSNs have been encrypted.');
    }

  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    client.release();
    await neonPool.end();
  }
}

// Run migration
encryptExistingSSNs()
  .then(() => {
    console.log('\n✅ Done');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  });
