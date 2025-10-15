import { storage } from './server/storage.ts';
import dotenv from 'dotenv';

dotenv.config();

async function testDashboardData() {
  console.log('🧪 Testing Dashboard Data Retrieval...\n');
  
  try {
    // Test Admin Dashboard Stats
    console.log('📊 Testing Admin Dashboard Stats:');
    console.log('==================================');
    const adminStats = await storage.getAdminDashboardStats();
    console.log('Admin Stats:', JSON.stringify(adminStats, null, 2));
    
    console.log('\n✅ Expected to see:');
    console.log('- totalMembers: 7');
    console.log('- totalCommissions: 74.00');
    console.log('- Actual values match database');
    
    // Test Agent Commissions
    console.log('\n\n💰 Testing Agent Commissions:');
    console.log('=============================');
    
    // Get agent UUID
    const agentEmail = 'michael@mypremierplans.com';
    const agent = await storage.getUserByEmail(agentEmail);
    
    if (!agent) {
      console.error('❌ Agent not found!');
      return;
    }
    
    console.log(`✅ Agent found: ${agent.email} (${agent.id})`);
    
    const commissions = await storage.getAgentCommissions(agent.id);
    console.log(`\n📋 Total commissions for ${agent.email}: ${commissions.length}`);
    
    if (commissions.length > 0) {
      console.log('\nSample commission:');
      const sample = commissions[0];
      console.log(JSON.stringify(sample, null, 2));
    }
    
    // Test Commission Stats
    console.log('\n\n📈 Testing Commission Stats:');
    console.log('============================');
    const commissionStats = await storage.getCommissionStats(agent.id);
    console.log('Commission Stats:', JSON.stringify(commissionStats, null, 2));
    
    console.log('\n✅ Expected:');
    console.log('- totalEarned: ~74.00');
    console.log('- totalPending: ~74.00 (all unpaid)');
    console.log('- totalPaid: 0.00');
    
    // Test All Commissions
    console.log('\n\n💵 Testing All Commissions:');
    console.log('===========================');
    const allCommissions = await storage.getAllCommissions();
    console.log(`Total commissions in system: ${allCommissions.length}`);
    
    const totalAmount = allCommissions.reduce((sum, c) => sum + parseFloat(c.commission_amount || 0), 0);
    console.log(`Total commission amount: $${totalAmount.toFixed(2)}`);
    
    // Test Member Enrollments
    console.log('\n\n👥 Testing Member Enrollments:');
    console.log('==============================');
    const enrollments = await storage.getEnrollmentsByAgent(agentEmail);
    console.log(`Total enrollments for ${agentEmail}: ${enrollments.length}`);
    
    if (enrollments.length > 0) {
      console.log('\nSample enrollment:');
      const sample = enrollments[0];
      console.log({
        customerNumber: sample.customerNumber,
        name: `${sample.firstName} ${sample.lastName}`,
        email: sample.email,
        createdAt: sample.createdAt
      });
    }
    
    console.log('\n\n✅ DASHBOARD DATA TEST COMPLETE!');
    console.log('=================================');
    console.log('If all numbers match expectations, the dashboard should now display correctly.');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
  }
}

testDashboardData();
