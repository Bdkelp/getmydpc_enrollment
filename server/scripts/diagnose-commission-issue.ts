/**
 * Diagnostic script to understand commission creation issues
 * This script will test the actual data flow without making changes
 */

import { storage } from '../storage';
import { calculateCommission } from '../commissionCalculator';

async function diagnose() {
  console.log('='.repeat(60));
  console.log('COMMISSION TRACKING DIAGNOSTIC');
  console.log('='.repeat(60));
  
  try {
    // Test 1: Check if we can get users by email
    console.log('\n[TEST 1] getUserByEmail - Testing agent lookup');
    const testAgents = await storage.getAllUsers();
    const agents = testAgents.filter(u => u.role === 'agent' || u.role === 'admin');
    
    if (agents.length === 0) {
      console.log('❌ No agents found in database');
      return;
    }
    
    const testAgent = agents[0];
    console.log('✓ Found test agent:', {
      id: testAgent.id,
      email: testAgent.email,
      agentNumber: testAgent.agentNumber,
      role: testAgent.role
    });
    
    // Test 2: Try to look up agent by email
    console.log('\n[TEST 2] Lookup agent by email');
    const agentByEmail = await storage.getUserByEmail(testAgent.email!);
    console.log('Result:', agentByEmail ? '✓ Found' : '❌ Not found');
    if (agentByEmail) {
      console.log('  ID:', agentByEmail.id);
      console.log('  Email:', agentByEmail.email);
    }
    
    // Test 3: Try to look up agent by ID (UUID)
    console.log('\n[TEST 3] Lookup agent by ID (current getUser implementation)');
    const agentById = await storage.getUser(testAgent.id);
    console.log('Result:', agentById ? '✓ Found' : '❌ Not found');
    if (agentById) {
      console.log('  ID:', agentById.id);
      console.log('  Email:', agentById.email);
    }
    
    // Test 4: What happens if we pass UUID to getUserByEmail?
    console.log('\n[TEST 4] Pass UUID to getUserByEmail (simulating the bug)');
    const uuidAsEmail = await storage.getUserByEmail(testAgent.id);
    console.log('Result:', uuidAsEmail ? '✓ Found (unexpected!)' : '❌ Not found (expected)');
    if (uuidAsEmail) {
      console.log('  This should not happen - UUID found as email!');
    } else {
      console.log('  ✓ Confirmed: UUID cannot be looked up as email');
      console.log('  This explains why commission creation fails!');
    }
    
    // Test 5: Commission calculation
    console.log('\n[TEST 5] Test commission calculation');
    const testCases = [
      { plan: 'MyPremierPlan Base', coverage: 'Member Only', rxValet: false },
      { plan: 'MyPremierPlan+', coverage: 'Family', rxValet: true },
      { plan: 'Base', coverage: 'Member/Spouse', rxValet: false },
    ];
    
    for (const test of testCases) {
      const result = calculateCommission(test.plan, test.coverage, test.rxValet);
      console.log(`  ${test.plan} + ${test.coverage}${test.rxValet ? ' + RxValet' : ''}:`);
      if (result) {
        console.log(`    ✓ Commission: $${result.commission}, Total: $${result.totalCost}`);
      } else {
        console.log(`    ❌ No commission rate found`);
      }
    }
    
    // Test 6: Check existing commissions
    console.log('\n[TEST 6] Check existing commissions');
    const allCommissions = await storage.getAgentCommissions(testAgent.id);
    console.log(`Found ${allCommissions.length} commissions for test agent`);
    if (allCommissions.length > 0) {
      console.log('Latest commission:', {
        id: allCommissions[0].id,
        amount: allCommissions[0].commissionAmount,
        status: allCommissions[0].status,
        paymentStatus: allCommissions[0].paymentStatus,
        createdAt: allCommissions[0].createdAt
      });
    }
    
    // Test 7: Check members enrolled by this agent
    console.log('\n[TEST 7] Check members enrolled by agent');
    const allMembers = await storage.getAllMembers();
    const agentMembers = allMembers.filter(m => 
      m.enrolledByAgentId === testAgent.id || 
      m.agentNumber === testAgent.agentNumber
    );
    console.log(`Found ${agentMembers.length} members enrolled by this agent`);
    if (agentMembers.length > 0) {
      console.log('Latest member:', {
        id: agentMembers[0].id,
        customerNumber: agentMembers[0].customerNumber,
        enrolledByAgentId: agentMembers[0].enrolledByAgentId,
        agentNumber: agentMembers[0].agentNumber,
        planId: agentMembers[0].planId,
        coverageType: agentMembers[0].coverageType
      });
      
      // Check if this member has a commission
      const memberCommissions = allCommissions.filter(c => c.memberId === agentMembers[0].id);
      console.log(`  Commissions for this member: ${memberCommissions.length}`);
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('DIAGNOSTIC COMPLETE');
    console.log('='.repeat(60));
    
  } catch (error) {
    console.error('Error during diagnostic:', error);
  }
}

diagnose().then(() => {
  console.log('\nDiagnostic finished. Review the output above.');
  process.exit(0);
}).catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
