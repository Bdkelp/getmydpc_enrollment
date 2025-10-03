
import { storage } from '../storage';

async function seedTestData() {
  console.log('🌱 Seeding test data for Analytics and Database Viewer...');

  try {
    // Create test plans if they don't exist
    const existingPlans = await storage.getPlans();
    let testPlan = existingPlans.find(p => p.name === 'Test Individual Plan');
    
    if (!testPlan) {
      testPlan = await storage.createPlan({
        name: 'Test Individual Plan',
        description: 'Test plan for analytics',
        price: '99.00',
        billingPeriod: 'monthly',
        features: ['Primary Care', 'Lab Services'],
        maxMembers: 1,
        isActive: true
      });
      console.log('✅ Created test plan:', testPlan.id);
    }

    // Create test member
    const testMember = await storage.createUser({
      email: `testmember${Date.now()}@example.com`,
      firstName: 'Test',
      lastName: 'Member',
      phone: '555-0100',
      role: 'member',
      isActive: true,
      approvalStatus: 'approved',
      memberType: 'member-only'
    });
    console.log('✅ Created test member:', testMember.id);

    // Create subscription for test member
    const subscription = await storage.createSubscription({
      userId: testMember.id,
      planId: testPlan.id,
      status: 'active',
      amount: testPlan.price,
      startDate: new Date(),
      nextBillingDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    });
    console.log('✅ Created subscription:', subscription.id);

    // Create test payment
    const payment = await storage.createPayment({
      userId: testMember.id,
      subscriptionId: subscription.id.toString(),
      amount: testPlan.price,
      currency: 'USD',
      status: 'succeeded',
      paymentMethod: 'card',
      transactionId: `TEST_${Date.now()}`
    });
    console.log('✅ Created payment:', payment.id);

    // Create test lead
    const lead = await storage.createLead({
      firstName: 'Test',
      lastName: 'Lead',
      email: `testlead${Date.now()}@example.com`,
      phone: '555-0200',
      message: 'Test lead for analytics',
      source: 'contact_form',
      status: 'new'
    });
    console.log('✅ Created lead:', lead.id);

    console.log('🎉 Test data seeded successfully!');
    console.log('📊 You should now see data in:');
    console.log('   - Analytics Tab (members, revenue, subscriptions)');
    console.log('   - Database Viewer Tab (all tables)');

  } catch (error) {
    console.error('❌ Error seeding test data:', error);
    throw error;
  }
}

seedTestData()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
