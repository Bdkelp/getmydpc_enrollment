import fetch from 'node-fetch';

async function testCommissionEndpoints() {
  console.log('🧪 Testing Commission API Endpoints');
  console.log('============================================================\n');

  const baseURL = 'http://localhost:5000';

  try {
    // Test 1: Get commission stats
    console.log('1️⃣ Testing /api/agent/commission-stats...');
    const statsResponse = await fetch(`${baseURL}/api/agent/commission-stats`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include'
    });

    console.log(`   Status: ${statsResponse.status} ${statsResponse.statusText}`);
    
    if (statsResponse.ok) {
      const statsData = await statsResponse.json();
      console.log('   Response:', JSON.stringify(statsData, null, 2));
    } else {
      const errorText = await statsResponse.text();
      console.log('   Error:', errorText);
    }
    console.log('');

    // Test 2: Get commissions
    console.log('2️⃣ Testing /api/agent/commissions...');
    const commissionsResponse = await fetch(`${baseURL}/api/agent/commissions`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include'
    });

    console.log(`   Status: ${commissionsResponse.status} ${commissionsResponse.statusText}`);
    
    if (commissionsResponse.ok) {
      const commissionsData = await commissionsResponse.json();
      console.log(`   Commissions count: ${Array.isArray(commissionsData) ? commissionsData.length : 'Not an array'}`);
      if (Array.isArray(commissionsData) && commissionsData.length > 0) {
        console.log('   Sample commission:', JSON.stringify(commissionsData[0], null, 2));
      }
    } else {
      const errorText = await commissionsResponse.text();
      console.log('   Error:', errorText);
    }
    console.log('');

    console.log('============================================================');
    console.log('ℹ️  NOTE: These endpoints require authentication');
    console.log('   401/403 errors are expected without login session');
    console.log('   Check browser console for actual logged-in errors');
    console.log('============================================================\n');

  } catch (error) {
    console.error('❌ Connection Error:', error.message);
    console.log('\n⚠️  Make sure the dev server is running on port 5000\n');
  }
}

testCommissionEndpoints();
