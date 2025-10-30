// Test script for new commission system
// This tests the dual-write functionality we implemented

import { createCommissionDualWrite, getAgentCommissionsNew } from './server/commission-service.js';

async function testNewCommissionSystem() {
  console.log('🧪 Testing New Commission System...');
  
  try {
    // Test commission data
    const testCommission = {
      agent_id: 'test-agent-uuid-123',
      member_id: 'test-member-uuid-456',
      commission_amount: 150.00,
      coverage_type: 'aca',
      status: 'pending',
      payment_status: 'unpaid',
      notes: 'Test commission from new dual-write system'
    };

    console.log('📝 Test Commission Data:', testCommission);

    // Test creating commission with dual-write
    console.log('\n🔄 Testing dual-write commission creation...');
    const result = await createCommissionDualWrite(testCommission);

    if (result.success) {
      console.log('✅ Commission created successfully!');
      console.log('📊 Result:', result);
      
      // Test querying the new table
      console.log('\n🔍 Testing commission query...');
      const commissions = await getAgentCommissionsNew(testCommission.agent_id);
      console.log('📋 Retrieved commissions:', commissions);
      
    } else {
      console.log('❌ Commission creation failed:', result.error);
    }

  } catch (error) {
    console.error('🚨 Test failed with error:', error);
  }
}

// Run the test
testNewCommissionSystem().then(() => {
  console.log('\n🏁 Test completed!');
  process.exit(0);
}).catch(error => {
  console.error('💥 Test crashed:', error);
  process.exit(1);
});