import { createClient } from "@supabase/supabase-js";
import pkg from "pg";
import dotenv from "dotenv";
import { resolve } from "path";

const { Pool } = pkg;

// Load environment variables from parent directory
dotenv.config({ path: resolve(process.cwd(), '../../.env') });

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

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

async function checkUsers() {
  console.log("🔍 Checking users in both Supabase Auth and Users table...\n");

  try {
    // Get all users from Supabase Auth
    console.log("📥 Fetching from Supabase Auth...");
    const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers();

    if (authError) {
      console.error("❌ Error fetching auth users:", authError);
      process.exit(1);
    }

    console.log(`✅ Found ${authUsers.users.length} users in Supabase Auth\n`);

    // Get all users from users table
    console.log("📥 Fetching from Users table...");
    const result = await pool.query('SELECT id, email, role, is_active, approval_status FROM users ORDER BY email');
    
    console.log(`✅ Found ${result.rows.length} users in Users table\n`);

    console.log("=" + "=".repeat(80));
    console.log("SUPABASE AUTH USERS:");
    console.log("=" + "=".repeat(80));
    authUsers.users.forEach((user, i) => {
      console.log(`${i + 1}. ${user.email}`);
      console.log(`   ID: ${user.id}`);
      console.log(`   Created: ${user.created_at}`);
      console.log(`   Email Confirmed: ${user.email_confirmed_at ? 'Yes' : 'No'}`);
      console.log();
    });

    console.log("=" + "=".repeat(80));
    console.log("USERS TABLE:");
    console.log("=" + "=".repeat(80));
    result.rows.forEach((user, i) => {
      console.log(`${i + 1}. ${user.email}`);
      console.log(`   ID: ${user.id}`);
      console.log(`   Role: ${user.role}`);
      console.log(`   Active: ${user.is_active}`);
      console.log(`   Approval: ${user.approval_status}`);
      console.log();
    });

    console.log("=" + "=".repeat(80));
    console.log("COMPARISON:");
    console.log("=" + "=".repeat(80));
    
    // Find users in Auth but not in Users table
    const authEmails = authUsers.users.map(u => u.email);
    const tableEmails = result.rows.map(u => u.email);
    
    const missingFromTable = authEmails.filter(email => !tableEmails.includes(email));
    const missingFromAuth = tableEmails.filter(email => !authEmails.includes(email));

    if (missingFromTable.length > 0) {
      console.log("\n⚠️  Users in Supabase Auth but NOT in Users table:");
      missingFromTable.forEach(email => console.log(`   - ${email}`));
    }

    if (missingFromAuth.length > 0) {
      console.log("\n⚠️  Users in Users table but NOT in Supabase Auth:");
      missingFromAuth.forEach(email => console.log(`   - ${email}`));
    }

    if (missingFromTable.length === 0 && missingFromAuth.length === 0) {
      console.log("\n✅ All users are in sync!");
    }

    console.log("\n");

  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

checkUsers();
