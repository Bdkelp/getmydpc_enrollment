#!/usr/bin/env node

// Test Supabase connection using Replit Secrets
const { createClient } = require('@supabase/supabase-js');

async function testSupabaseConnection() {
  console.log('🔍 Testing Supabase connection using Replit Secrets...\n');

  try {
    // Get environment variables from Replit Secrets (no dotenv needed)
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    console.log('Environment variables check:');
    console.log(`SUPABASE_URL: ${supabaseUrl ? '✅ Set' : '❌ Missing'}`);
    console.log(`SUPABASE_KEY: ${supabaseKey ? '✅ Set (length: ' + supabaseKey.length + ')' : '❌ Missing'}\n`);

    if (!supabaseUrl || !supabaseKey) {
      console.log('❌ Missing Supabase environment variables');
      console.log('   Make sure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in Replit Secrets');
      return {
        success: false,
        message: "Missing Supabase environment variables"
      };
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Test 1: Simple query to verify connection
    console.log('📊 Testing connection with users table...');
    const { data: usersData, error: usersError, count: usersCount } = await supabase
      .from("users")
      .select("*", { count: "exact", head: true });

    if (usersError) {
      console.log('❌ Users table query failed:', usersError.message);
    } else {
      console.log('✅ Users table connection successful');
      console.log(`   Users count: ${usersCount || 0}`);
    }

    // Test 2: Check plans table
    console.log('\n📋 Testing plans table...');
    const { data: plansData, error: plansError, count: plansCount } = await supabase
      .from("plans")
      .select("*", { count: "exact", head: true });

    if (plansError) {
      console.log('❌ Plans table query failed:', plansError.message);
    } else {
      console.log('✅ Plans table connection successful');
      console.log(`   Plans count: ${plansCount || 0}`);
    }

    // Test 3: Check leads table
    console.log('\n📊 Testing leads table...');
    const { data: leadsData, error: leadsError, count: leadsCount } = await supabase
      .from("leads")
      .select("*", { count: "exact", head: true });

    if (leadsError) {
      console.log('❌ Leads table query failed:', leadsError.message);
    } else {
      console.log('✅ Leads table connection successful');
      console.log(`   Leads count: ${leadsCount || 0}`);
    }

    // Test 4: Check payments table
    console.log('\n💳 Testing payments table...');
    const { data: paymentsData, error: paymentsError, count: paymentsCount } = await supabase
      .from("payments")
      .select("*", { count: "exact", head: true });

    if (paymentsError) {
      console.log('❌ Payments table query failed:', paymentsError.message);
    } else {
      console.log('✅ Payments table connection successful');
      console.log(`   Payments count: ${paymentsCount || 0}`);
    }

    // Test 5: Get recent payments to check if they're being stored
    console.log('\n🔍 Checking recent payments (last 30 days)...');
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: recentPayments, error: recentPaymentsError } = await supabase
      .from("payments")
      .select("id, amount, status, created_at, transaction_id")
      .gte("created_at", thirtyDaysAgo.toISOString())
      .order("created_at", { ascending: false })
      .limit(10);

    if (recentPaymentsError) {
      console.log('❌ Recent payments query failed:', recentPaymentsError.message);
    } else {
      console.log(`✅ Found ${recentPayments.length} recent payments`);
      if (recentPayments.length === 0) {
        console.log('   ⚠️ No payments found in the last 30 days');
      } else {
        recentPayments.forEach((payment, index) => {
          console.log(`   ${index + 1}. $${payment.amount} - ${payment.status} - ${new Date(payment.created_at).toLocaleString()}`);
        });
      }
    }

    // Test 6: Check for all_members view
    console.log('\n👥 Testing all_members view...');
    const { data: membersData, error: membersError, count: membersCount } = await supabase
      .from("all_members")
      .select("*", { count: "exact", head: true });

    if (membersError) {
      console.log('❌ all_members view query failed:', membersError.message);
      console.log('   This view might not exist and may need to be created');
    } else {
      console.log('✅ all_members view connection successful');
      console.log(`   Members count: ${membersCount || 0}`);
    }

    const successfulTests = [
      !usersError,
      !plansError, 
      !leadsError,
      !paymentsError,
      !recentPaymentsError,
      !membersError
    ].filter(Boolean).length;

    console.log(`\n📈 Test Summary: ${successfulTests}/6 tests passed`);

    return {
      success: true,
      message: "Supabase connection test completed",
      results: {
        usersCount: usersCount || 0,
        plansCount: plansCount || 0,
        leadsCount: leadsCount || 0,
        paymentsCount: paymentsCount || 0,
        membersCount: membersCount || 0,
        recentPaymentsCount: recentPayments?.length || 0
      }
    };

  } catch (error) {
    console.error('❌ Connection error:', error.message);
    return {
      success: false,
      message: "Failed to connect to Supabase",
      error: error.message
    };
  }
}

// Run the test
testSupabaseConnection().then(result => {
  console.log('\n🏁 Final result:', JSON.stringify(result, null, 2));
}).catch(error => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});