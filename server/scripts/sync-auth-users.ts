import { supabase } from "../lib/supabase";
import { storage } from "../storage";

/**
 * Sync script to import all Supabase Auth users into the application's users table
 * This ensures users who exist in Auth but not in the users table are properly synced
 */

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
        const existingUser = await storage.getUserByEmail(email);

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

        // Create user in users table
        const newUser = await storage.createUser({
          id: authUser.id,
          email: email,
          firstName: firstName,
          lastName: lastName,
          emailVerified: authUser.email_confirmed_at ? true : false,
          role: role,
          isActive: true, // Auto-activate synced users
          approvalStatus: "approved", // Auto-approve synced users
          createdAt: authUser.created_at ? new Date(authUser.created_at) : new Date(),
          updatedAt: new Date(),
        });

        console.log(`✅ Synced: ${email} → role: ${role}, id: ${newUser.id}`);
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
  .then(() => {
    console.log("\n✨ Script finished");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n💥 Script failed:", error);
    process.exit(1);
  });
