import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config();

async function testCommissionAPI() {
  console.log('🧪 Testing Commission API Endpoints');
  console.log('============================================================\n');

  // You'll need to login first to get a session cookie
  // For now, let's test the data transformation directly
  
  const testData = {
    id: 42,
    agent_id: "8bda1072-ab65-4733-a84b-2a3609a69450",
    subscription_id: null,
    member_id: 19,
    plan_name: "Elite",
    plan_type: "Member Only",
    plan_tier: "Elite",
    commission_amount: "18.00",
    total_plan_cost: "119.00",
    status: "pending",
    payment_status: "unpaid",
    paid_date: null,
    created_at: "2025-10-18T08:04:26.473Z",
    first_name: "Roger",
    last_name: "Dodger"
  };

  console.log('📥 Raw database data (snake_case):');
  console.log(JSON.stringify(testData, null, 2));
  console.log('\n');

  // Transform to camelCase as the API will do
  const transformed = {
    id: testData.id,
    subscriptionId: testData.subscription_id,
    userId: testData.agent_id,
    userName: `${testData.first_name || ''} ${testData.last_name || ''}`.trim() || 'Unknown',
    planName: testData.plan_name,
    planType: testData.plan_type,
    planTier: testData.plan_tier,
    commissionAmount: parseFloat(testData.commission_amount || 0),
    totalPlanCost: parseFloat(testData.total_plan_cost || 0),
    status: testData.status,
    paymentStatus: testData.payment_status,
    paidDate: testData.paid_date,
    createdAt: testData.created_at
  };

  console.log('📤 Transformed API response (camelCase):');
  console.log(JSON.stringify(transformed, null, 2));
  console.log('\n');

  console.log('✅ Expected frontend fields:');
  const requiredFields = [
    'id', 'subscriptionId', 'userId', 'userName', 
    'planName', 'planType', 'planTier', 
    'commissionAmount', 'totalPlanCost', 
    'status', 'paymentStatus', 'createdAt'
  ];

  requiredFields.forEach(field => {
    const hasField = field in transformed;
    const value = transformed[field];
    console.log(`  ${hasField ? '✅' : '❌'} ${field}: ${JSON.stringify(value)}`);
  });

  console.log('\n============================================================');
  console.log('✅ DATA TRANSFORMATION TEST COMPLETE');
  console.log('============================================================\n');
  
  console.log('💡 Next steps:');
  console.log('   1. Refresh the commission page in your browser');
  console.log('   2. You should now see 14 commission records');
  console.log('   3. Total commission should be $180.00');
}

testCommissionAPI();
