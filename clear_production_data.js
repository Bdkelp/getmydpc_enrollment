
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

async function clearProductionData() {
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  try {
    console.log('🧹 Starting database cleanup...\n');

    // 1. Delete commissions
    console.log('Deleting commissions...');
    const { error: commError } = await supabase
      .from('commissions')
      .delete()
      .neq('id', 0); // Delete all
    if (commError) throw commError;
    console.log('✅ Commissions cleared\n');

    // 2. Delete enrollment modifications
    console.log('Deleting enrollment modifications...');
    const { error: enrollError } = await supabase
      .from('enrollment_modifications')
      .delete()
      .neq('id', 0);
    if (enrollError) throw enrollError;
    console.log('✅ Enrollment modifications cleared\n');

    // 3. Delete family members
    console.log('Deleting family members...');
    const { error: familyError } = await supabase
      .from('family_members')
      .delete()
      .neq('id', 0);
    if (familyError) throw familyError;
    console.log('✅ Family members cleared\n');

    // 4. Delete payments
    console.log('Deleting payments...');
    const { error: payError } = await supabase
      .from('payments')
      .delete()
      .neq('id', 0);
    if (payError) throw payError;
    console.log('✅ Payments cleared\n');

    // 5. Delete subscriptions
    console.log('Deleting subscriptions...');
    const { error: subError } = await supabase
      .from('subscriptions')
      .delete()
      .neq('id', 0);
    if (subError) throw subError;
    console.log('✅ Subscriptions cleared\n');

    // 6. Delete lead activities
    console.log('Deleting lead activities...');
    const { error: actError } = await supabase
      .from('lead_activities')
      .delete()
      .neq('id', 0);
    if (actError) throw actError;
    console.log('✅ Lead activities cleared\n');

    // 7. Delete leads
    console.log('Deleting leads...');
    const { error: leadError } = await supabase
      .from('leads')
      .delete()
      .neq('id', 0);
    if (leadError) throw leadError;
    console.log('✅ Leads cleared\n');

    // 8. Delete member users (keep admins and agents)
    console.log('Deleting member users (keeping admins and agents)...');
    const { error: userError } = await supabase
      .from('users')
      .delete()
      .not('role', 'in', '(admin,agent)');
    if (userError) throw userError;
    console.log('✅ Member users cleared\n');

    // Verification
    console.log('📊 Verification Report:\n');
    
    const { data: users } = await supabase.from('users').select('*');
    console.log(`Users (admins/agents only): ${users?.length || 0}`);
    
    const { data: plans } = await supabase.from('plans').select('*');
    console.log(`Plans (preserved): ${plans?.length || 0}`);
    
    const { data: subs } = await supabase.from('subscriptions').select('*');
    console.log(`Subscriptions: ${subs?.length || 0}`);
    
    const { data: payments } = await supabase.from('payments').select('*');
    console.log(`Payments: ${payments?.length || 0}`);
    
    const { data: leads } = await supabase.from('leads').select('*');
    console.log(`Leads: ${leads?.length || 0}`);
    
    const { data: comms } = await supabase.from('commissions').select('*');
    console.log(`Commissions: ${comms?.length || 0}\n`);

    // Show preserved data
    console.log('✅ Preserved Plans:');
    plans?.forEach(plan => {
      console.log(`  - ${plan.name}: $${plan.price} (${plan.billing_period})`);
    });

    console.log('\n✅ Preserved Users:');
    users?.forEach(user => {
      console.log(`  - ${user.email} (${user.role})${user.agent_number ? ` - Agent #${user.agent_number}` : ''}`);
    });

    console.log('\n🎉 Database cleanup complete!');

  } catch (error) {
    console.error('❌ Error during cleanup:', error);
    throw error;
  }
}

clearProductionData();
