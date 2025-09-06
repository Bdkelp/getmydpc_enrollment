
import { createClient } from "@supabase/supabase-js";

// --- Grab env vars (must be set in Replit Secrets) ---
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("❌ Missing Supabase env vars. Did you add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Replit Secrets?");
  process.exit(1);
}

console.log("🔧 Environment check:");
console.log(`  SUPABASE_URL: ${supabaseUrl ? '✅ Set' : '❌ Missing'}`);
console.log(`  SUPABASE_ANON_KEY: ${supabaseAnonKey ? '✅ Set' : '❌ Missing'}`);

const supabase = createClient(supabaseUrl, supabaseAnonKey);

(async () => {
  try {
    console.log("\n🔎 Testing Supabase connection...");

    // 1. Test basic connection with users table (read-only)
    console.log("\n📊 Testing read access to users table...");
    const { data: users, error: usersError } = await supabase
      .from("users")
      .select("id, email, role")
      .limit(3);

    if (usersError) {
      console.error("❌ Users query error:", usersError.message);
    } else {
      console.log(`✅ Users query succeeded. Found ${users.length} users`);
      users.forEach((user, i) => {
        console.log(`  ${i + 1}. ${user.email} (${user.role})`);
      });
    }

    // 2. Test plans table access (should be readable by all)
    console.log("\n📋 Testing read access to plans table...");
    const { data: plans, error: plansError } = await supabase
      .from("plans")
      .select("id, name, price")
      .limit(3);

    if (plansError) {
      console.error("❌ Plans query error:", plansError.message);
    } else {
      console.log(`✅ Plans query succeeded. Found ${plans.length} plans`);
      plans.forEach((plan, i) => {
        console.log(`  ${i + 1}. ${plan.name} - $${plan.price}`);
      });
    }

    // 3. Test RLS policies - try to insert without authentication
    console.log("\n🔐 Testing RLS policies (should block unauthenticated inserts)...");
    const { error: insertError } = await supabase
      .from("users")
      .insert([{ 
        email: "test-rls@example.com", 
        firstName: "RLS", 
        lastName: "Test",
        role: "member"
      }]);

    if (insertError) {
      console.log("✅ RLS working correctly - insert blocked:", insertError.message);
    } else {
      console.log("⚠️ WARNING: Insert succeeded without authentication. RLS may not be configured properly.");
    }

    // 4. Test authentication flow
    console.log("\n🔑 Testing authentication...");
    const { data: session, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError) {
      console.log("❌ Session check error:", sessionError.message);
    } else if (session.session) {
      console.log("✅ Active session found:", session.session.user.email);
    } else {
      console.log("ℹ️ No active session (expected for anonymous connection)");
    }

    // 5. Test real-time subscription capability
    console.log("\n📡 Testing real-time capabilities...");
    const channel = supabase
      .channel('test-channel')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'users'
      }, (payload) => {
        console.log('Real-time event received:', payload);
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('✅ Real-time subscription successful');
        } else if (status === 'CHANNEL_ERROR') {
          console.log('❌ Real-time subscription failed');
        }
        
        // Cleanup after test
        setTimeout(() => {
          supabase.removeChannel(channel);
          console.log('🧹 Real-time test cleanup completed');
        }, 2000);
      });

    console.log("\n🎉 Connection test completed!");
    
  } catch (err) {
    console.error("❌ Unexpected error:", err);
  }
})();
