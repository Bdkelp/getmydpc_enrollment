import 'dotenv/config';
import fetch from 'node-fetch';

const API_URL = 'http://localhost:5000';

async function testEnrollment() {
  console.log('🧪 Testing enrollment with full logging\n');
  console.log('This will trigger all the server-side logging we just added.');
  console.log('Watch the server terminal for detailed logs!\n');
  console.log('=' .repeat(80));

  const testData = {
    // Personal Info
    email: `test.member.${Date.now()}@example.com`,
    password: "TempPassword123!",
    firstName: "TestMember",
    lastName: "WithLogging",
    middleName: "Debug",
    phone: "5125551234",
    dateOfBirth: "01011990",
    gender: "M",
    ssn: null, // Optional - skip SSN to avoid format issues
    
    // Address
    address: "123 Test Street",
    address2: "Apt 4",
    city: "Austin",
    state: "TX",
    zipCode: "78701",
    
    // Employment (optional)
    employerName: "Test Company",
    divisionName: "IT Department",
    dateOfHire: "01012020",
    
    // Plan Selection - THIS IS THE KEY FIELD
    planId: 1, // Base plan
    coverageType: "Member Only",
    memberType: "Member Only",
    addRxValet: false,
    totalMonthlyPrice: 29.12, // $28 + 4% = $29.12
    planStartDate: "01012025",
    
    // Consents
    termsAccepted: true,
    privacyAccepted: true,
    privacyNoticeAcknowledged: true,
    smsConsent: true,
    communicationsConsent: true,
    faqDownloaded: true,
    
    // Agent Info - THIS IS IMPORTANT FOR COMMISSION
    agentNumber: "MPP0001",
    enrolledByAgentId: "michael@mypremierplans.com",
    
    // Family Members
    familyMembers: []
  };

  console.log('\n📤 Submitting enrollment with:');
  console.log('   planId:', testData.planId);
  console.log('   agentNumber:', testData.agentNumber);
  console.log('   enrolledByAgentId:', testData.enrolledByAgentId);
  console.log('   totalMonthlyPrice:', testData.totalMonthlyPrice);
  console.log('\n🔍 Check the SERVER TERMINAL for detailed logs!\n');

  try {
    const response = await fetch(`${API_URL}/api/registration`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testData)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.log('❌ Registration failed');
      console.log('Status:', response.status);
      console.log('Error:', errorText);
      return;
    }

    const result = await response.json();
    console.log('\n✅ Registration successful!');
    console.log('Member ID:', result.member?.id);
    console.log('Customer Number:', result.member?.customerNumber);
    
    console.log('\n📋 Now checking database for commission...\n');
    
    // Wait a moment for commission to be created
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Check database
    const { Pool } = await import('pg');
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    });
    
    const commissionCheck = await pool.query(`
      SELECT * FROM commissions 
      WHERE subscription_id = (
        SELECT id FROM members WHERE customer_number = $1
      )
    `, [result.member.customerNumber]);
    
    if (commissionCheck.rows.length > 0) {
      console.log('✅ COMMISSION FOUND!');
      console.log('   Amount: $' + commissionCheck.rows[0].commission_amount);
      console.log('   Agent: ' + commissionCheck.rows[0].agent_id);
      console.log('   Status: ' + commissionCheck.rows[0].status);
    } else {
      console.log('❌ NO COMMISSION FOUND');
      console.log('   Check server logs for [Commission Check] messages');
    }
    
    await pool.end();
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testEnrollment();
