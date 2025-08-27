
import { db } from "../db";
import { plans } from "@shared/schema";

const testPlans = [
  // MyPremierPlan Base - Individual
  {
    name: "MyPremierPlan Base - Member Only",
    description: "Unlimited virtual/telehealth visits, primary care with $10 office visit fee",
    price: 59,
    memberType: "member-only",
    features: [
      "Unlimited virtual/telehealth visits",
      "Unlimited primary care office visits", 
      "$10 office visit fee",
      "Access to Patient Advocate Line (PAL)",
      "Prescription coordination",
      "Wellcard benefits included"
    ],
    isActive: true,
    planType: "base"
  },
  
  // MyPremierPlan Base - Spouse
  {
    name: "MyPremierPlan Base - Member/Spouse", 
    description: "Unlimited virtual/telehealth visits, primary care with $10 office visit fee for member and spouse",
    price: 109,
    memberType: "member-spouse",
    features: [
      "Unlimited virtual/telehealth visits",
      "Unlimited primary care office visits",
      "$10 office visit fee", 
      "Access to Patient Advocate Line (PAL)",
      "Prescription coordination",
      "Wellcard benefits included"
    ],
    isActive: true,
    planType: "base"
  },

  // MyPremierPlan Base - Family
  {
    name: "MyPremierPlan Base - Family",
    description: "Unlimited virtual/telehealth visits, primary care with $10 office visit fee for entire family",
    price: 149,
    memberType: "family",
    features: [
      "Unlimited virtual/telehealth visits", 
      "Unlimited primary care office visits",
      "$10 office visit fee",
      "Access to Patient Advocate Line (PAL)",
      "Prescription coordination",
      "Wellcard benefits included"
    ],
    isActive: true,
    planType: "base"
  },

  // MyPremierPlan+ Individual
  {
    name: "MyPremierPlan+ - Member Only",
    description: "Primary care plus urgent care with visit fees",
    price: 99,
    memberType: "member-only", 
    features: [
      "Unlimited virtual/telemed visits",
      "Unlimited in-office doctor visits",
      "$10 office visit fee",
      "Unlimited urgent care visits",
      "$25 urgent care visit fee",
      "Wellcard benefits included"
    ],
    isActive: true,
    planType: "plus"
  },

  // MyPremierPlan+ Spouse
  {
    name: "MyPremierPlan+ - Member/Spouse",
    description: "Primary care plus urgent care with visit fees for member and spouse", 
    price: 199,
    memberType: "member-spouse",
    features: [
      "Unlimited virtual/telemed visits",
      "Unlimited in-office doctor visits", 
      "$10 office visit fee",
      "Unlimited urgent care visits",
      "$25 urgent care visit fee", 
      "Wellcard benefits included"
    ],
    isActive: true,
    planType: "plus"
  },

  // MyPremierPlan+ Family
  {
    name: "MyPremierPlan+ - Family",
    description: "Primary care plus urgent care with visit fees for entire family",
    price: 279,
    memberType: "family",
    features: [
      "Unlimited virtual/telemed visits",
      "Unlimited in-office doctor visits",
      "$10 office visit fee", 
      "Unlimited urgent care visits",
      "$25 urgent care visit fee",
      "Wellcard benefits included"
    ],
    isActive: true,
    planType: "plus"
  },

  // MyPremierPlan Elite Individual
  {
    name: "MyPremierPlan Elite - Member Only",
    description: "Premium plan with no visit fees and Quest diagnostics",
    price: 119,
    memberType: "member-only",
    features: [
      "All Plus plan benefits",
      "NO office or visit fees", 
      "200 Quest diagnostics procedures**",
      "**Restrictions apply",
      "Wellcard benefits included"
    ],
    isActive: true,
    planType: "elite"
  },

  // MyPremierPlan Elite Spouse  
  {
    name: "MyPremierPlan Elite - Member/Spouse",
    description: "Premium plan with no visit fees and Quest diagnostics for member and spouse",
    price: 249,
    memberType: "member-spouse", 
    features: [
      "All Plus plan benefits",
      "NO office or visit fees",
      "200 Quest diagnostics procedures**", 
      "**Restrictions apply",
      "Wellcard benefits included"
    ],
    isActive: true,
    planType: "elite"
  },

  // MyPremierPlan Elite Family
  {
    name: "MyPremierPlan Elite - Family", 
    description: "Premium plan with no visit fees and Quest diagnostics for entire family",
    price: 349,
    memberType: "family",
    features: [
      "All Plus plan benefits",
      "NO office or visit fees",
      "200 Quest diagnostics procedures**",
      "**Restrictions apply", 
      "Wellcard benefits included"
    ],
    isActive: true,
    planType: "elite"
  }
];

async function seedPlans() {
  try {
    console.log("Clearing existing plans...");
    await db.delete(plans);
    
    console.log("Seeding plans...");
    for (const plan of testPlans) {
      await db.insert(plans).values({
        ...plan,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      console.log(`✓ Created plan: ${plan.name} - $${plan.price}`);
    }
    
    console.log(`Successfully seeded ${testPlans.length} plans!`);
    process.exit(0);
  } catch (error) {
    console.error("Error seeding plans:", error);
    process.exit(1);
  }
}

seedPlans();
