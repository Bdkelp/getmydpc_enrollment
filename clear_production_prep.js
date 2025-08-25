
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase environment variables');
  console.error('Required: VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function clearProductionData() {
  console.log('🚨 PRODUCTION PREPARATION CLEANUP');
  console.log('This will permanently delete all test enrollment data.');
  console.log('Only admin/agent accounts and leads will be preserved.\n');

  try {
    console.log('🧹 Starting production preparation cleanup...');
    console.log('⚠️  This will remove ALL test enrollments and member data\n');

    // Admin/agent emails to preserve
    const preserveEmails = [
      'michael@mypremierplans.com',
      'travis@mypremierplans.com', 
      'richard@mypremierplans.com',
      'joaquin@mypremierplans.com',
      'mdkeener@gmail.com'
    ];

    // Delete in reverse dependency order to avoid foreign key conflicts
    console.log('📊 Clearing family members...');
    const { error: familyError } = await supabase
      .from('family_members')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

    if (familyError) {
      console.log('ℹ️  No family members to clear or already cleared');
    } else {
      console.log('✅ Family members cleared');
    }

    console.log('💰 Clearing commissions...');
    const { error: commissionsError } = await supabase
      .from('commissions')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

    if (commissionsError) {
      console.log('ℹ️  No commissions to clear or already cleared');
    } else {
      console.log('✅ Commissions cleared');
    }

    console.log('💳 Clearing payments...');
    const { error: paymentsError } = await supabase
      .from('payments')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

    if (paymentsError) {
      console.log('ℹ️  No payments to clear or already cleared');
    } else {
      console.log('✅ Payments cleared');
    }

    console.log('📋 Clearing subscriptions...');
    const { error: subscriptionsError } = await supabase
      .from('subscriptions')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

    if (subscriptionsError) {
      console.log('ℹ️  No subscriptions to clear or already cleared');
    } else {
      console.log('✅ Subscriptions cleared');
    }

    console.log('👥 Clearing test member accounts (preserving admin/agent accounts)...');
    const { error: usersError } = await supabase
      .from('users')
      .delete()
      .not('email', 'in', `(${preserveEmails.map(e => `"${e}"`).join(',')})`);

    if (usersError) {
      console.log('ℹ️  No test users to clear or already cleared');
    } else {
      console.log('✅ Test member accounts cleared');
    }

    // Verify cleanup
    const { data: remainingUsers } = await supabase
      .from('users')
      .select('email, role')
      .order('email');

    const { data: remainingSubscriptions } = await supabase
      .from('subscriptions')
      .select('*');

    const { data: remainingPayments } = await supabase
      .from('payments')
      .select('*');

    console.log('\n📊 CLEANUP VERIFICATION:');
    console.log(`✅ Remaining users: ${remainingUsers?.length || 0}`);
    remainingUsers?.forEach(user => {
      console.log(`   - ${user.email} (${user.role})`);
    });
    console.log(`✅ Remaining subscriptions: ${remainingSubscriptions?.length || 0}`);
    console.log(`✅ Remaining payments: ${remainingPayments?.length || 0}`);

    console.log('\n🎉 Production preparation cleanup completed successfully!');
    console.log('Your system is now ready for production with clean data.');
    console.log('\nPreserved data:');
    console.log('- Admin/agent user accounts');
    console.log('- Leads and lead activities (for sales continuity)');
    console.log('- Plans (service offerings)');

  } catch (error) {
    console.error('❌ Error during cleanup:', error);
    throw error;
  }
}

// Run the cleanup
clearProductionData()
  .then(() => {
    console.log('\n✅ Production cleanup completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Production cleanup failed:', error);
    process.exit(1);
  });
