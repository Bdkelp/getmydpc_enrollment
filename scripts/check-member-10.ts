import { supabase } from '../server/lib/supabaseClient';

async function checkMember10() {
  console.log('Checking member 10 details...\n');
  
  // Get member details
  const { data: member, error: memberError } = await supabase
    .from('members')
    .select('id, first_name, last_name, plan_name, coverage_type, member_type, total_monthly_price, plan_id, add_rx_valet')
    .eq('id', 10)
    .single();
    
  if (memberError) {
    console.error('Error fetching member:', memberError);
    process.exit(1);
  }
  
  console.log('Member Details:');
  console.log(JSON.stringify(member, null, 2));
  
  // Get commission details
  const { data: commissions, error: commissionError } = await supabase
    .from('agent_commissions')
    .select('*')
    .eq('member_id', '10');
    
  if (commissionError) {
    console.error('\nError fetching commissions:', commissionError);
  } else {
    console.log('\n\nCommission Details:');
    console.log(JSON.stringify(commissions, null, 2));
  }
  
  // Get plan details if plan_id exists
  if (member.plan_id) {
    const { data: plan, error: planError } = await supabase
      .from('plans')
      .select('id, name, price, description')
      .eq('id', member.plan_id)
      .single();
      
    if (planError) {
      console.error('\nError fetching plan:', planError);
    } else {
      console.log('\n\nPlan Details:');
      console.log(JSON.stringify(plan, null, 2));
    }
  }
  
  process.exit(0);
}

checkMember10();
