import { supabase } from '../lib/supabaseClient';

async function activatePlans() {
  try {
    console.log("🔧 Checking and activating plans...");
    
    // First, get all existing plans
    const { data: existingPlans, error: fetchError } = await supabase
      .from('plans')
      .select('*');
    
    if (fetchError) {
      console.error("Error fetching plans:", fetchError);
      throw fetchError;
    }

    if (!existingPlans || existingPlans.length === 0) {
      console.log("No plans found in database. You may need to run the seed script.");
      return;
    }

    console.log(`Found ${existingPlans.length} plans in database:`);
    
    // Display current status
    existingPlans.forEach(plan => {
      console.log(`  - ${plan.name}: $${plan.price} (${plan.is_active ? '✓ Active' : '✗ Inactive'})`);
    });

    // Update all plans to be active
    const { data: updatedPlans, error: updateError } = await supabase
      .from('plans')
      .update({ 
        is_active: true,
        updated_at: new Date().toISOString()
      })
      .gte('id', 0) // Update all plans
      .select();
    
    if (updateError) {
      console.error("Error activating plans:", updateError);
      throw updateError;
    }
    
    console.log(`\n✅ Successfully activated ${updatedPlans?.length || 0} plans!`);
    
    // Display updated plans
    if (updatedPlans) {
      console.log("\nActivated plans:");
      updatedPlans.forEach(plan => {
        console.log(`  ✓ ${plan.name}: $${plan.price}/month`);
      });
    }
    
    process.exit(0);
  } catch (error) {
    console.error("❌ Error activating plans:", error);
    process.exit(1);
  }
}

// Run the activation function
activatePlans();