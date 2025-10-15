import { supabase } from '../lib/supabaseClient';

const testPlans = [
  // MyPremierPlan Base - Individual
  {
    name: "MyPremierPlan Base - Member Only",
    description: "Unlimited virtual/telehealth visits, primary care with $10 office visit fee",
    price: 59,
    billingPeriod: "monthly",
    features: [
      "Unlimited virtual/telehealth visits",
      "Unlimited primary care office visits", 
      "$10 office visit fee",
      "Access to Patient Advocate Line (PAL)",
      "Prescription coordination",
      "Wellcard benefits included"
    ],
    maxMembers: 1,
    isActive: true
  },
  
  // MyPremierPlan Base - Spouse
  {
    name: "MyPremierPlan Base - Member/Spouse", 
    description: "Unlimited virtual/telehealth visits, primary care with $10 office visit fee for member and spouse",
    price: 109,
    billingPeriod: "monthly",
    features: [
      "Unlimited virtual/telehealth visits",
      "Unlimited primary care office visits",
      "$10 office visit fee", 
      "Access to Patient Advocate Line (PAL)",
      "Prescription coordination",
      "Wellcard benefits included"
    ],
    maxMembers: 2,
    isActive: true
  },

  // MyPremierPlan Base - Family
  {
    name: "MyPremierPlan Base - Family",
    description: "Unlimited virtual/telehealth visits, primary care with $10 office visit fee for entire family",
    price: 149,
    billingPeriod: "monthly",
    features: [
      "Unlimited virtual/telehealth visits", 
      "Unlimited primary care office visits",
      "$10 office visit fee",
      "Access to Patient Advocate Line (PAL)",
      "Prescription coordination",
      "Wellcard benefits included"
    ],
    maxMembers: 5,
    isActive: true
  },

  // MyPremierPlan+ Individual
  {
    name: "MyPremierPlan+ - Member Only",
    description: "Primary care plus urgent care with visit fees",
    price: 99,
    billingPeriod: "monthly",
    features: [
      "Unlimited virtual/telemed visits",
      "Unlimited in-office doctor visits",
      "$10 office visit fee",
      "Unlimited urgent care visits",
      "$25 urgent care visit fee",
      "Wellcard benefits included"
    ],
    maxMembers: 1,
    isActive: true
  },

  // MyPremierPlan+ Spouse
  {
    name: "MyPremierPlan+ - Member/Spouse",
    description: "Primary care plus urgent care with visit fees for member and spouse", 
    price: 199,
    billingPeriod: "monthly",
    features: [
      "Unlimited virtual/telemed visits",
      "Unlimited in-office doctor visits", 
      "$10 office visit fee",
      "Unlimited urgent care visits",
      "$25 urgent care visit fee",
      "Wellcard benefits included"
    ],
    maxMembers: 2,
    isActive: true
  },

  // MyPremierPlan+ Family
  {
    name: "MyPremierPlan+ - Family",
    description: "Primary care plus urgent care with visit fees for entire family",
    price: 299,
    billingPeriod: "monthly",
    features: [
      "Unlimited virtual/telemed visits",
      "Unlimited in-office doctor visits",
      "$10 office visit fee", 
      "Unlimited urgent care visits",
      "$25 urgent care visit fee",
      "Wellcard benefits included"
    ],
    maxMembers: 5,
    isActive: true
  },

  // MyPremierPlan Elite - Individual
  {
    name: "MyPremierPlan Elite - Member Only",
    description: "Comprehensive coverage with no visit fees",
    price: 199,
    billingPeriod: "monthly",
    features: [
      "Unlimited virtual/telemed visits",
      "Unlimited in-office doctor visits",
      "NO office visit fee",
      "Unlimited urgent care visits",
      "NO urgent care visit fee",
      "Premium care coordination",
      "Priority scheduling",
      "Wellcard benefits included"
    ],
    maxMembers: 1,
    isActive: true
  },

  // MyPremierPlan Elite - Spouse
  {
    name: "MyPremierPlan Elite - Member/Spouse",
    description: "Comprehensive coverage with no visit fees for member and spouse",
    price: 399,
    billingPeriod: "monthly",
    features: [
      "Unlimited virtual/telemed visits",
      "Unlimited in-office doctor visits",
      "NO office visit fee",
      "Unlimited urgent care visits",
      "NO urgent care visit fee",
      "Premium care coordination",
      "Priority scheduling",
      "Wellcard benefits included"
    ],
    maxMembers: 2,
    isActive: true
  },

  // MyPremierPlan Elite - Family  
  {
    name: "MyPremierPlan Elite - Family",
    description: "Comprehensive coverage with no visit fees for entire family",
    price: 599,
    billingPeriod: "monthly",
    features: [
      "Unlimited virtual/telemed visits",
      "Unlimited in-office doctor visits",
      "NO office visit fee",
      "Unlimited urgent care visits", 
      "NO urgent care visit fee",
      "Premium care coordination",
      "Priority scheduling",
      "Wellcard benefits included"
    ],
    maxMembers: 5,
    isActive: true
  }
];

async function seedPlans() {
  try {
    console.log("🌱 Starting to seed plans...");
    
    // First, check if plans already exist
    const { data: existingPlans, error: checkError } = await supabase
      .from('plans')
      .select('id');
    
    if (checkError) {
      console.error("Error checking existing plans:", checkError);
      throw checkError;
    }

    if (existingPlans && existingPlans.length > 0) {
      console.log("⚠️  Plans already exist in the database. Clearing existing plans...");
      
      // Delete existing plans
      const { error: deleteError } = await supabase
        .from('plans')
        .delete()
        .gte('id', 0); // Delete all plans
      
      if (deleteError) {
        console.error("Error deleting existing plans:", deleteError);
        throw deleteError;
      }
      
      console.log("✓ Cleared existing plans");
    }

    // Insert new plans
    console.log(`Inserting ${testPlans.length} plans...`);
    
    const plansWithTimestamps = testPlans.map(plan => ({
      ...plan,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }));

    const { data: insertedPlans, error: insertError } = await supabase
      .from('plans')
      .insert(plansWithTimestamps)
      .select();
    
    if (insertError) {
      console.error("Error inserting plans:", insertError);
      throw insertError;
    }
    
    console.log(`✓ Successfully inserted ${insertedPlans?.length || 0} plans!`);
    
    // Display inserted plans
    if (insertedPlans) {
      insertedPlans.forEach(plan => {
        console.log(`  - ${plan.name}: $${plan.price}/month (${plan.is_active ? 'Active' : 'Inactive'})`);
      });
    }
    
    console.log("\n✅ Plans seeding completed successfully!");
    process.exit(0);
  } catch (error) {
    console.error("❌ Error seeding plans:", error);
    process.exit(1);
  }
}

// Run the seed function
seedPlans();
