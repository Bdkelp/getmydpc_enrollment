import pkg from "pg";
import dotenv from "dotenv";
import { resolve } from "path";

const { Pool } = pkg;

// Load environment variables
dotenv.config({ path: resolve(process.cwd(), '../../.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const plans = [
  // MyPremierPlan Base - Member Only
  {
    name: "MyPremierPlan Base - Member Only",
    description: "Unlimited virtual/telehealth visits, primary care with $10 office visit fee",
    price: 59,
    features: [
      "Unlimited virtual/telehealth visits",
      "Unlimited primary care office visits",
      "$10 office visit fee",
      "Access to Patient Advocate Line (PAL)",
      "Prescription coordination",
      "Wellcard benefits included",
      "Optional ProChoice Rx add-on: +$21/month"
    ],
    isActive: true,
    maxMembers: 1
  },
  
  // MyPremierPlan Base - Member/Spouse
  {
    name: "MyPremierPlan Base - Member/Spouse",
    description: "Unlimited virtual/telehealth visits, primary care with $10 office visit fee for member and spouse",
    price: 99,
    features: [
      "Unlimited virtual/telehealth visits",
      "Unlimited primary care office visits",
      "$10 office visit fee",
      "Access to Patient Advocate Line (PAL)",
      "Prescription coordination",
      "Wellcard benefits included",
      "Optional ProChoice Rx add-on: +$21/month"
    ],
    isActive: true,
    maxMembers: 2
  },

  // MyPremierPlan Base - Member/Child
  {
    name: "MyPremierPlan Base - Member/Child",
    description: "Unlimited virtual/telehealth visits, primary care with $10 office visit fee for member and children",
    price: 129,
    features: [
      "Unlimited virtual/telehealth visits",
      "Unlimited primary care office visits",
      "$10 office visit fee",
      "Access to Patient Advocate Line (PAL)",
      "Prescription coordination",
      "Wellcard benefits included",
      "Optional ProChoice Rx add-on: +$21/month"
    ],
    isActive: true,
    maxMembers: 3
  },

  // MyPremierPlan Base - Family
  {
    name: "MyPremierPlan Base - Family",
    description: "Unlimited virtual/telehealth visits, primary care with $10 office visit fee for entire family",
    price: 149,
    features: [
      "Unlimited virtual/telehealth visits",
      "Unlimited primary care office visits",
      "$10 office visit fee",
      "Access to Patient Advocate Line (PAL)",
      "Prescription coordination",
      "Wellcard benefits included",
      "Optional ProChoice Rx add-on: +$21/month"
    ],
    isActive: true,
    maxMembers: 5
  },

  // MyPremierPlan+ - Member Only
  {
    name: "MyPremierPlan+ - Member Only",
    description: "Primary care plus urgent care with visit fees",
    price: 99,
    features: [
      "Unlimited virtual/telemed visits",
      "Unlimited in-office doctor visits",
      "$10 office visit fee",
      "Unlimited urgent care visits",
      "$25 urgent care visit fee",
      "Wellcard benefits included",
      "Optional ProChoice Rx add-on: +$21/month"
    ],
    isActive: true,
    maxMembers: 1
  },

  // MyPremierPlan+ - Member/Spouse
  {
    name: "MyPremierPlan+ - Member/Spouse",
    description: "Primary care plus urgent care with visit fees for member and spouse",
    price: 179,
    features: [
      "Unlimited virtual/telemed visits",
      "Unlimited in-office doctor visits",
      "$10 office visit fee",
      "Unlimited urgent care visits",
      "$25 urgent care visit fee",
      "Wellcard benefits included",
      "Optional ProChoice Rx add-on: +$21/month"
    ],
    isActive: true,
    maxMembers: 2
  },

  // MyPremierPlan+ - Member/Child
  {
    name: "MyPremierPlan+ - Member/Child",
    description: "Primary care plus urgent care with visit fees for member and children",
    price: 229,
    features: [
      "Unlimited virtual/telemed visits",
      "Unlimited in-office doctor visits",
      "$10 office visit fee",
      "Unlimited urgent care visits",
      "$25 urgent care visit fee",
      "Wellcard benefits included",
      "Optional ProChoice Rx add-on: +$21/month"
    ],
    isActive: true,
    maxMembers: 3
  },

  // MyPremierPlan+ - Family
  {
    name: "MyPremierPlan+ - Family",
    description: "Primary care plus urgent care with visit fees for entire family",
    price: 279,
    features: [
      "Unlimited virtual/telemed visits",
      "Unlimited in-office doctor visits",
      "$10 office visit fee",
      "Unlimited urgent care visits",
      "$25 urgent care visit fee",
      "Wellcard benefits included",
      "Optional ProChoice Rx add-on: +$21/month"
    ],
    isActive: true,
    maxMembers: 5
  },

  // MyPremierPlan Elite - Member Only
  {
    name: "MyPremierPlan Elite - Member Only",
    description: "Comprehensive coverage with no visit fees",
    price: 119,
    features: [
      "Unlimited virtual/telemed visits",
      "Unlimited in-office doctor visits",
      "NO office visit fee",
      "Unlimited urgent care visits",
      "NO urgent care visit fee",
      "Premium care coordination",
      "Priority scheduling",
      "Wellcard benefits included",
      "Optional ProChoice Rx add-on: +$21/month"
    ],
    isActive: true,
    maxMembers: 1
  },

  // MyPremierPlan Elite - Member/Spouse
  {
    name: "MyPremierPlan Elite - Member/Spouse",
    description: "Comprehensive coverage with no visit fees for member and spouse",
    price: 209,
    features: [
      "Unlimited virtual/telemed visits",
      "Unlimited in-office doctor visits",
      "NO office visit fee",
      "Unlimited urgent care visits",
      "NO urgent care visit fee",
      "Premium care coordination",
      "Priority scheduling",
      "Wellcard benefits included",
      "Optional ProChoice Rx add-on: +$21/month"
    ],
    isActive: true,
    maxMembers: 2
  },

  // MyPremierPlan Elite - Member/Child
  {
    name: "MyPremierPlan Elite - Member/Child",
    description: "Comprehensive coverage with no visit fees for member and children",
    price: 279,
    features: [
      "Unlimited virtual/telemed visits",
      "Unlimited in-office doctor visits",
      "NO office visit fee",
      "Unlimited urgent care visits",
      "NO urgent care visit fee",
      "Premium care coordination",
      "Priority scheduling",
      "Wellcard benefits included",
      "Optional ProChoice Rx add-on: +$21/month"
    ],
    isActive: true,
    maxMembers: 3
  },

  // MyPremierPlan Elite - Family
  {
    name: "MyPremierPlan Elite - Family",
    description: "Comprehensive coverage with no visit fees for entire family",
    price: 349,
    features: [
      "Unlimited virtual/telemed visits",
      "Unlimited in-office doctor visits",
      "NO office visit fee",
      "Unlimited urgent care visits",
      "NO urgent care visit fee",
      "Premium care coordination",
      "Priority scheduling",
      "Wellcard benefits included",
      "Optional ProChoice Rx add-on: +$21/month"
    ],
    isActive: true,
    maxMembers: 5
  }
];

async function seedPlans() {
  console.log("🌱 Seeding plans into database...\n");

  try {
    // Clear existing plans
    await pool.query('DELETE FROM plans');
    console.log("✓ Cleared existing plans\n");

    for (const plan of plans) {
      const result = await pool.query(`
        INSERT INTO plans (
          name, description, price, features, 
          max_members, is_active, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
        RETURNING id, name, price
      `, [
        plan.name,
        plan.description,
        plan.price,
        JSON.stringify(plan.features),
        plan.maxMembers,
        plan.isActive
      ]);

      console.log(`✅ ${result.rows[0].name} - $${result.rows[0].price}/month`);
    }

    console.log(`\n🎉 Successfully seeded ${plans.length} plans!`);

  } catch (error) {
    console.error("❌ Error seeding plans:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

seedPlans();
