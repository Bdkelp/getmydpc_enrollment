import { createClient } from "@supabase/supabase-js";
import pkg from "pg";
import dotenv from "dotenv";
import { resolve } from "path";

const { Pool } = pkg;

// Load environment variables from parent directory
dotenv.config({ path: resolve(process.cwd(), '../../.env') });

/**
 * Sync script to import all Supabase Auth users into the application's users table
 * This ensures users who exist in Auth but not in the users table are properly synced
 */

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("❌ Missing environment variables: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  console.error("   SUPABASE_URL:", supabaseUrl ? "✓" : "✗");
  console.error("   SUPABASE_SERVICE_ROLE_KEY:", supabaseServiceKey ? "✓" : "✗");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// Initialize database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function query(text: string, params?: any[]) {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  console.log('[DB Query]', { text, duration, rows: res.rowCount });
  return res;
}

async function getUserByEmail(email: string) {
  const result = await pool.query(
    'SELECT * FROM users WHERE email = $1',
    [email]
  );
  return result.rows[0];
}

function determineUserRole(email: string): "admin" | "agent" | "member" {
  const adminEmails = [
    "michael@mypremierplans.com",
    "travis@mypremierplans.com",
    "richard@mypremierplans.com",
    "joaquin@mypremierplans.com",
  ];

  const agentEmails = [
    "mdkeener@gmail.com",
    "tmatheny77@gmail.com",
    "svillarreal@cyariskmanagement.com",
  ];

  if (adminEmails.includes(email.toLowerCase())) return "admin";
  if (agentEmails.includes(email.toLowerCase())) return "agent";
  return "agent"; // Default to agent for new registrations
}

async function syncAuthUsers() {
  console.log("🔄 Starting Supabase Auth to Users table sync...\n");

  try {
    // Get all users from Supabase Auth (admin API)
    console.log("📥 Fetching all users from Supabase Auth...");
    const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers();

    if (authError) {
      console.error("❌ Error fetching auth users:", authError);
      process.exit(1);
    }

    console.log(`✅ Found ${authUsers.users.length} users in Supabase Auth\n`);

    let syncedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    // Process each auth user
    for (const authUser of authUsers.users) {
      const email = authUser.email;
      if (!email) {
        console.log(`⚠️  Skipping user ${authUser.id} - no email`);
        skippedCount++;
        continue;
      }

      try {
        // Check if user already exists in users table
        const existingUser = await getUserByEmail(email);

        if (existingUser) {
          console.log(`⏭️  User already exists: ${email} (${existingUser.role})`);
          skippedCount++;
          continue;
        }

        // Determine role based on email
        const role = determineUserRole(email);

        // Extract name from metadata or email
        const firstName = 
          authUser.user_metadata?.firstName ||
          authUser.user_metadata?.first_name ||
          authUser.user_metadata?.name?.split(' ')[0] ||
          email.split('@')[0];
        
        const lastName = 
          authUser.user_metadata?.lastName ||
          authUser.user_metadata?.last_name ||
          authUser.user_metadata?.name?.split(' ').slice(1).join(' ') ||
          "";

        // Get the next agent number
        const agentNumberResult = await pool.query(`
          SELECT COALESCE(MAX(CAST(SUBSTRING(agent_number FROM 4) AS INTEGER)), 0) + 1 as next_num
          FROM users
          WHERE agent_number ~ '^MPP[0-9]+$'
        `);
        const nextNum = agentNumberResult.rows[0].next_num;
        const agentNumber = `MPP${String(nextNum).padStart(4, '0')}`;

        // Create user in users table
        const result = await pool.query(`
          INSERT INTO users (
            id, email, first_name, last_name, email_verified, 
            role, agent_number, is_active, approval_status, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          RETURNING *
        `, [
          authUser.id,
          email,
          firstName,
          lastName,
          authUser.email_confirmed_at ? true : false,
          role,
          agentNumber,
          true, // Auto-activate synced users
          'approved', // Auto-approve synced users
          authUser.created_at ? new Date(authUser.created_at) : new Date(),
          new Date()
        ]);

        console.log(`✅ Synced: ${email} → role: ${role}, id: ${authUser.id}`);
        syncedCount++;

      } catch (error) {
        console.error(`❌ Error syncing user ${email}:`, error);
        errorCount++;
      }
    }

    // Summary
    console.log("\n" + "=".repeat(60));
    console.log("📊 SYNC SUMMARY");
    console.log("=".repeat(60));
    console.log(`Total Auth Users: ${authUsers.users.length}`);
    console.log(`✅ Synced: ${syncedCount}`);
    console.log(`⏭️  Skipped (already exist): ${skippedCount}`);
    console.log(`❌ Errors: ${errorCount}`);
    console.log("=".repeat(60) + "\n");

    if (errorCount === 0) {
      console.log("🎉 Sync completed successfully!");
    } else {
      console.log("⚠️  Sync completed with errors. Please review the output above.");
    }

  } catch (error) {
    console.error("❌ Fatal error during sync:", error);
    process.exit(1);
  }
}

// Run the sync
syncAuthUsers()
  .then(async () => {
    console.log("\n✨ Script finished");
    await pool.end();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error("\n💥 Script failed:", error);
    await pool.end();
    process.exit(1);
  });
