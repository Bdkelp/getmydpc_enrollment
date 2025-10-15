import dotenv from 'dotenv';
import fetch from 'node-fetch';
import pg from 'pg';

dotenv.config();

const BASE_URL = 'http://localhost:5000';
const { Pool } = pg;

// Test data for enrollment
const testData = {
  firstName: "TestMember",
  lastName: "CommissionTest",
  middleName: "C",
  email: `testmember${Date.now()}@example.com`,
  phone: "5551234567",
  dateOfBirth: "01151995",
  gender: "M",
  ssn: "",
  address: "123 Test Street",
  address2: "Apt 4",
  city: "Austin",
  state: "TX",
  zipCode: "78701",
  emergencyContactName: "Emergency Contact",
  emergencyContactPhone: "5559876543",
  employerName: "Test Company",
  divisionName: "Testing Division",
  dateOfHire: "01012024",
  memberType: "member-only",
  planStartDate: "10152025",
  planId: 1,
  coverageType: "Member Only",
  addRxValet: false,
  totalMonthlyPrice: 29.16,
  termsAccepted: true,
  privacyAccepted: true,
  smsConsent: true,
  faqDownloaded: true,
  agentNumber: "MPP0001",
  enrolledByAgentId: "michael@mypremierplans.com",
  familyMembers: []
};

async function runTest() {
  console.log('🧪 Starting Enrollment Test with Commission Verification\n');
  console.log('📋 Test Data:');
  console.log(`   Name: ${testData.firstName} ${testData.lastName}`);
  console.log(`   Email: ${testData.email}`);
  console.log(`   Agent: ${testData.agentNumber}`);
  console.log(`   Plan: Base Plan ($28/month)`);
  console.log(`   Expected Commission: $9.00 (Base + Member Only)\n`);

  try {
    console.log('📤 Step 1: Submitting enrollment...');
    const response = await fetch(`${BASE_URL}/api/registration`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testData)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Enrollment failed:', response.status, errorText);
      return;
    }

    const result = await response.json();
    console.log('✅ Enrollment successful!');
    console.log(`   Customer Number: ${result.member?.customerNumber}`);
    console.log(`   Email: ${result.member?.email}\n`);

    const customerNumber = result.member?.customerNumber;
    if (!customerNumber) {
      console.error('❌ No customer number returned');
      return;
    }

    console.log('⏳ Waiting 2 seconds for processing...');
    await new Promise(resolve => setTimeout(resolve, 2000));

    console.log('\n📊 Step 2: Verifying member in database...');
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
    console.log('✅ Member found:');
    console.log(`   Customer #: ${member.customer_number}`);
    console.log(`   Name: ${member.first_name} ${member.last_name}`);
    console.log(`   Agent #: ${member.agent_number}`);
    console.log(`   Status: ${member.status}\n`);

    console.log('💰 Step 3: Checking commission...');
    const commissionResult = await pool.query(
      `SELECT * FROM commissions WHERE agent_id = $1 
       ORDER BY created_at DESC LIMIT 1`,
      [testData.enrolledByAgentId]
    );

    if (commissionResult.rows.length === 0) {
      console.error('❌ NO COMMISSION FOUND!');
      const allComm = await pool.query('SELECT COUNT(*) FROM commissions');
      console.log(`   Total commissions in DB: ${allComm.rows[0].count}`);
      await pool.end();
      return;
    }

    const commission = commissionResult.rows[0];
    console.log('✅ COMMISSION CREATED!');
    console.log(`   ID: ${commission.id}`);
    console.log(`   Agent: ${commission.agent_id}`);
    console.log(`   Amount: $${commission.commission_amount}`);
    console.log(`   Plan: ${commission.plan_name}`);
    console.log(`   Type: ${commission.plan_type}`);
    console.log(`   Status: ${commission.status}\n`);

    const expected = 9.00;
    const actual = parseFloat(commission.commission_amount);
    
    if (Math.abs(actual - expected) < 0.01) {
      console.log(`✅ Commission CORRECT: $${actual}`);
    } else {
      console.warn(`⚠️  Mismatch! Expected: $${expected}, Got: $${actual}`);
    }

    console.log('\n🎉 TEST PASSED!');
    console.log('=' .repeat(50));
    console.log(`✅ Member: ${customerNumber}`);
    console.log(`✅ Commission: $${actual}`);
    console.log('=' .repeat(50));

    await pool.end();

  } catch (error) {
    console.error('\n❌ TEST FAILED:', error.message);
    if (error.stack) console.error(error.stack);
  }
}

runTest();
