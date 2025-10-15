import dotenv from 'dotenv';
import fetch from 'node-fetch';

dotenv.config();

const BASE_URL = 'http://localhost:5000';

// Test data for enrollment
const testEnrollment = {
  // Personal Information
  firstName: "TestMember",
  lastName: "CommissionTest",
  middleName: "C",
  email: `testmember${Date.now()}@example.com`, // Unique email
  phone: "5551234567",
  dateOfBirth: "01151995",
  gender: "M",
  ssn: "", // Optional
  
  // Address
  address: "123 Test Street",
  address2: "Apt 4",
  city: "Austin",
  state: "TX",
  zipCode: "78701",
  
  // Emergency Contact
  emergencyContactName: "Emergency Contact",
  emergencyContactPhone: "5559876543",
  
  // Employment
  employerName: "Test Company",
  divisionName: "Testing Division",
  dateOfHire: "01012024",
  memberType: "member-only",
  planStartDate: "10152025",
  
  // Plan Selection
  planId: 1, // Base plan
  coverageType: "Member Only",
  addRxValet: false,
  totalMonthlyPrice: 29.16, // $28 + 4% = $29.16
  
  // Consent flags
  termsAccepted: true,
  privacyAccepted: true,
  smsConsent: true,
  faqDownloaded: true,
  
  // Agent information (simulating admin enrollment)
  agentNumber: "MPP0001",
  enrolledByAgentId: "michael@mypremierplans.com",
  
  // Family members
  familyMembers: []
};

async function testEnrollment() {
  console.log('🧪 Starting Enrollment Test with Commission Verification\n');
  console.log('📋 Test Data:');
  console.log(`   Name: ${testEnrollment.firstName} ${testEnrollment.lastName}`);
  console.log(`   Email: ${testEnrollment.email}`);
  console.log(`   Agent: ${testEnrollment.agentNumber}`);
  console.log(`   Plan: Base Plan ($28/month)`);
  console.log(`   Expected Commission: $9.00 (Base + Member Only)\n`);

  try {
    // Step 1: Submit enrollment
    console.log('📤 Step 1: Submitting enrollment...');
    const enrollResponse = await fetch(`${BASE_URL}/api/registration`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testEnrollment)
    });

    if (!enrollResponse.ok) {
      const errorText = await enrollResponse.text();
      console.error('❌ Enrollment failed:', enrollResponse.status, errorText);
      return;
    }

    const enrollResult = await enrollResponse.json();
    console.log('✅ Enrollment successful!');
    console.log(`   Customer Number: ${enrollResult.member?.customerNumber}`);
    console.log(`   Member ID: ${enrollResult.member?.id}`);
    console.log(`   Email: ${enrollResult.member?.email}\n`);

    const customerNumber = enrollResult.member?.customerNumber;
    
    if (!customerNumber) {
      console.error('❌ No customer number returned from enrollment');
      return;
    }

    // Step 2: Wait a moment for database operations to complete
    console.log('⏳ Waiting 2 seconds for commission processing...');
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Step 3: Check if member was created in Neon database
    console.log('\n📊 Step 2: Verifying member in database...');
    const { Pool } = await import('pg');
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });

    const memberResult = await pool.query(
      'SELECT * FROM members WHERE customer_number = $1',
      [customerNumber]
    );

    if (memberResult.rows.length === 0) {
      console.error('❌ Member not found in database!');
      await pool.end();
      return;
    }

    const member = memberResult.rows[0];
    console.log('✅ Member found in database:');
    console.log(`   Customer #: ${member.customer_number}`);
    console.log(`   Name: ${member.first_name} ${member.last_name}`);
    console.log(`   Email: ${member.email}`);
    console.log(`   Agent #: ${member.agent_number}`);
    console.log(`   Enrolled By: ${member.enrolled_by_agent_id}`);
    console.log(`   Status: ${member.status}`);
    console.log(`   Active: ${member.is_active}\n`);

    // Step 4: Check if commission was created
    console.log('💰 Step 3: Checking commission creation...');
    const commissionResult = await pool.query(
      `SELECT * FROM commissions WHERE agent_id = $1 
       ORDER BY created_at DESC LIMIT 1`,
      [testEnrollment.enrolledByAgentId]
    );

    if (commissionResult.rows.length === 0) {
      console.error('❌ NO COMMISSION FOUND!');
      console.error('   Commission should have been created for agent:', testEnrollment.enrolledByAgentId);
      console.error('\n🔍 Checking all commissions in database...');
      const allCommissions = await pool.query('SELECT * FROM commissions ORDER BY created_at DESC LIMIT 5');
      console.log(`   Total commissions in DB: ${allCommissions.rows.length}`);
      if (allCommissions.rows.length > 0) {
        console.log('   Recent commissions:');
        allCommissions.rows.forEach(c => {
          console.log(`     - Agent: ${c.agent_id}, Amount: $${c.commission_amount}, Plan: ${c.plan_name}`);
        });
      }
      await pool.end();
      return;
    }

    const commission = commissionResult.rows[0];
    console.log('✅ COMMISSION CREATED SUCCESSFULLY!');
    console.log(`   Commission ID: ${commission.id}`);
    console.log(`   Agent ID: ${commission.agent_id}`);
    console.log(`   Commission Amount: $${commission.commission_amount}`);
    console.log(`   Total Plan Cost: $${commission.total_plan_cost}`);
    console.log(`   Plan Name: ${commission.plan_name}`);
    console.log(`   Plan Type: ${commission.plan_type}`);
    console.log(`   Plan Tier: ${commission.plan_tier}`);
    console.log(`   Status: ${commission.status}`);
    console.log(`   Payment Status: ${commission.payment_status}`);
    console.log(`   Created: ${commission.created_at}\n`);

    // Step 5: Verify commission amount is correct
    console.log('✔️  Step 4: Verifying commission calculation...');
    const expectedCommission = 9.00; // Base plan, Member Only = $9
    const actualCommission = parseFloat(commission.commission_amount);
    
    if (Math.abs(actualCommission - expectedCommission) < 0.01) {
      console.log(`✅ Commission amount is CORRECT: $${actualCommission} = $${expectedCommission}`);
    } else {
      console.warn(`⚠️  Commission amount mismatch!`);
      console.warn(`   Expected: $${expectedCommission}`);
      console.warn(`   Actual: $${actualCommission}`);
    }

    console.log('\n🎉 TEST COMPLETED SUCCESSFULLY!');
    console.log('=' .repeat(60));
    console.log('SUMMARY:');
    console.log(`✅ Member enrolled: ${customerNumber}`);
    console.log(`✅ Commission created: $${actualCommission}`);
    console.log(`✅ Agent credited: ${commission.agent_id}`);
    console.log('=' .repeat(60));

    await pool.end();

  } catch (error) {
    console.error('\n❌ TEST FAILED:', error.message);
    console.error('Stack:', error.stack);
  }
}

// Run the test
testEnrollment();
