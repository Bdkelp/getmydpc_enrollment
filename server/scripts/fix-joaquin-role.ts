import { storage } from "../storage";
import { supabase } from "../lib/supabaseClient";

async function fixJoaquinRole() {
  const email = "joaquin@mypremierplans.com";

  console.log(`[Fix Role] Looking up user: ${email}`);

  try {
    // Get user by email
    const user = await storage.getUserByEmail(email);

    if (!user) {
      console.log(`[Fix Role] User not found: ${email}`);
      return;
    }

    console.log(`[Fix Role] Found user:`, {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      currentRole: user.role,
      approvalStatus: user.approvalStatus
    });

    if (user.role === 'admin') {
      console.log(`[Fix Role] User is already an admin`);
      return;
    }

    // Update user role to admin
    console.log(`[Fix Role] Updating ${email} from ${user.role} to admin`);

    const updatedUser = await storage.updateUser(user.id, {
      role: 'admin',
      approvalStatus: 'approved',
      isActive: true,
      updatedAt: new Date()
    });

    console.log(`[Fix Role] ✅ Successfully updated user role:`, {
      id: updatedUser.id,
      email: updatedUser.email,
      newRole: updatedUser.role,
      approvalStatus: updatedUser.approvalStatus
    });

  } catch (error) {
    console.error(`[Fix Role] Error updating user role:`, error);
  }
}

// Run the fix
fixJoaquinRole().then(() => {
  console.log('[Fix Role] Script completed');
  process.exit(0);
}).catch((error) => {
  console.error('[Fix Role] Script failed:', error);
  process.exit(1);
});