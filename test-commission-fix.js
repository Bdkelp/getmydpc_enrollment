/**
 * Quick Commission Test Script
 * Test if commission creation is working after the UUID fix
 */

import * as storage from './server/storage.js';

async function testCommissionSystem() {
  console.log('='.repeat(50));
  console.log('COMMISSION SYSTEM QUICK TEST');
  console.log('='.repeat(50));

  try {
    // 1. Check if we have any agents
    console.log('\n[TEST 1] Finding agents in system...');
    const allUsers = await storage.getAllUsers(100, 0);
    const agents = allUsers.users.filter(u => u.role === 'agent' || u.role === 'admin');
    
    if (agents.length === 0) {
      console.log('❌ No agents found - cannot test');
      return;
    }
    
    const testAgent = agents[0];
    console.log('✓ Found test agent:', {
      id: testAgent.id,
      email: testAgent.email,
      agentNumber: testAgent.agentNumber,
      role: testAgent.role
    });

    // 2. Test UUID lookup (the core fix)
    console.log('\n[TEST 2] Testing UUID lookup with getUser()...');
    const lookupResult = await storage.getUser(testAgent.id);
    
    if (lookupResult) {
      console.log('✅ SUCCESS: UUID lookup works!');
      console.log('   Found:', lookupResult.email);
      console.log('   This means commission creation should work now');
    } else {
      console.log('❌ FAILED: UUID lookup still broken');
      console.log('   Commission creation will still fail');
    }

    // 3. Check recent commissions
    console.log('\n[TEST 3] Checking recent commission records...');
    const recentCommissions = await storage.getAllCommissions();
    console.log(`Found ${recentCommissions.length} total commissions in database`);
    
    if (recentCommissions.length > 0) {
      const latest = recentCommissions[0];
      console.log('Latest commission:', {
        id: latest.id,
        agentId: latest.agentId,
        amount: latest.commissionAmount,
        status: latest.paymentStatus,
        created: latest.createdAt
      });
    }

    // 4. Check agent commissions for our test agent
    console.log('\n[TEST 4] Checking commissions for test agent...');
    const agentCommissions = await storage.getAgentCommissions(testAgent.id);
    console.log(`Agent has ${agentCommissions.length} commission records`);
    
    if (agentCommissions.length > 0) {
      const totalEarned = agentCommissions.reduce((sum, c) => sum + c.commissionAmount, 0);
      const paid = agentCommissions.filter(c => c.paymentStatus === 'paid').length;
      const pending = agentCommissions.filter(c => c.paymentStatus === 'unpaid').length;
      
      console.log('Commission summary:', {
        total: `$${totalEarned.toFixed(2)}`,
        paid: paid,
        pending: pending
      });
    }

    console.log('\n[CONCLUSION]');
    if (lookupResult) {
      console.log('✅ Core bug appears to be FIXED');
      console.log('✅ New enrollments should now create commissions');
      console.log('📝 Next: Test with a real enrollment to confirm');
    } else {
      console.log('❌ Core bug still exists');
      console.log('❌ Need to implement fresh commission system');
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testCommissionSystem();