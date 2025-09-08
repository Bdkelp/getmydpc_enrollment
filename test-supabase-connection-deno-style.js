
#!/usr/bin/env node

// Adapted from Deno code to test Supabase connection
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

async function testSupabaseConnection() {
  console.log('🔍 Testing Supabase connection (Deno-style adapted for Node.js)...\n');

  try {
    // Create Supabase client using environment variables
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
    
    console.log('Environment variables check:');
    console.log(`SUPABASE_URL: ${supabaseUrl ? '✅ Set' : '❌ Missing'}`);
    console.log(`SUPABASE_KEY: ${supabaseKey ? '✅ Set' : '❌ Missing'}\n`);
    
    if (!supabaseUrl || !supabaseKey) {
      console.log('❌ Missing Supabase environment variables');
      return {
        success: false,
        message: "Missing Supabase environment variables"
      };
    }
    
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Test 1: Simple query to verify connection (using users table instead of all_members)
    console.log('📊 Testing connection with users table...');
    const { data: usersData, error: usersError } = await supabase
      .from("users")
      .select("count(*)", { count: "exact", head: true });
      
    if (usersError) {
      console.log('❌ Users table query failed:', usersError.message);
    } else {
      console.log('✅ Users table connection successful');
      console.log(`   Users count: ${usersData || 0}`);
    }

    // Test 2: Check if all_members view exists
    console.log('\n📊 Testing all_members view...');
    const { data: membersData, error: membersError } = await supabase
      .from("all_members")
      .select("count(*)", { count: "exact", head: true });
      
    if (membersError) {
      console.log('❌ all_members view query failed:', membersError.message);
      console.log('   This might indicate the view doesn\'t exist or needs to be created');
    } else {
      console.log('✅ all_members view connection successful');
      console.log(`   Members count: ${membersData || 0}`);
    }

    // Test 3: Check leads table
    console.log('\n📊 Testing leads table...');
    const { data: leadsData, error: leadsError } = await supabase
      .from("leads")
      .select("count(*)", { count: "exact", head: true });
      
    if (leadsError) {
      console.log('❌ Leads table query failed:', leadsError.message);
    } else {
      console.log('✅ Leads table connection successful');
      console.log(`   Leads count: ${leadsData || 0}`);
    }

    // Test 4: Check payments table
    console.log('\n💳 Testing payments table...');
    const { data: paymentsData, error: paymentsError } = await supabase
      .from("payments")
      .select("count(*)", { count: "exact", head: true });
      
    if (paymentsError) {
      console.log('❌ Payments table query failed:', paymentsError.message);
    } else {
      console.log('✅ Payments table connection successful');
      console.log(`   Payments count: ${paymentsData || 0}`);
    }

    // Test 5: Get recent payments to check if they're being stored
    console.log('\n🔍 Checking recent payments (last 7 days)...');
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const { data: recentPayments, error: recentPaymentsError } = await supabase
      .from("payments")
      .select("id, amount, status, created_at, transaction_id")
      .gte("created_at", sevenDaysAgo.toISOString())
      .order("created_at", { ascending: false })
      .limit(10);
      
    if (recentPaymentsError) {
      console.log('❌ Recent payments query failed:', recentPaymentsError.message);
    } else {
      console.log(`✅ Found ${recentPayments.length} recent payments`);
      if (recentPayments.length === 0) {
        console.log('   ⚠️ No payments found in the last 7 days - this matches your observation');
      } else {
        recentPayments.forEach((payment, index) => {
          console.log(`   ${index + 1}. $${payment.amount} - ${payment.status} - ${new Date(payment.created_at).toLocaleString()}`);
        });
      }
    }

    const successfulTests = [
      !usersError,
      !membersError,
      !leadsError,
      !paymentsError
    ].filter(Boolean).length;

    console.log(`\n📈 Test Summary: ${successfulTests}/4 tests passed`);
    
    return {
      success: true,
      message: "Supabase connection test completed",
      results: {
        usersCount: usersData || 0,
        membersCount: membersData || 0,
        leadsCount: leadsData || 0,
        paymentsCount: paymentsData || 0,
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
});
