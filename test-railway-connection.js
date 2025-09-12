
#!/usr/bin/env node

const RAILWAY_URL = 'https://shimmering-nourishment.up.railway.app';

async function testConnection() {
  console.log('Testing Railway Backend Connection...\n');
  
  // Test 1: Health Check
  try {
    const healthResponse = await fetch(`${RAILWAY_URL}/health`);
    const healthData = await healthResponse.json();
    console.log('✅ Health Check:', healthData);
  } catch (error) {
    console.log('❌ Health Check Failed:', error.message);
  }
  
  // Test 2: CORS Debug
  try {
    const corsResponse = await fetch(`${RAILWAY_URL}/api/debug/cors`, {
      headers: {
        'Origin': 'https://getmydpc-enrollment.vercel.app'
      }
    });
    const corsData = await corsResponse.json();
    console.log('✅ CORS Debug:', corsData);
  } catch (error) {
    console.log('❌ CORS Debug Failed:', error.message);
  }
  
  // Test 3: Plans Endpoint
  try {
    const plansResponse = await fetch(`${RAILWAY_URL}/api/plans`);
    const plansData = await plansResponse.json();
    console.log('✅ Plans Endpoint:', plansData.length, 'plans found');
  } catch (error) {
    console.log('❌ Plans Endpoint Failed:', error.message);
  }
  
  // Test 4: Contact Form (should work without auth)
  try {
    const contactResponse = await fetch(`${RAILWAY_URL}/api/public/leads`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'https://getmydpc-enrollment.vercel.app'
      },
      body: JSON.stringify({
        firstName: 'Test',
        lastName: 'User',
        email: 'test@example.com',
        phone: '555-0123',
        message: 'Connection test - please ignore'
      })
    });
    
    if (contactResponse.ok) {
      console.log('✅ Contact Form Endpoint: Working');
    } else {
      const errorText = await contactResponse.text();
      console.log('❌ Contact Form Failed:', contactResponse.status, errorText);
    }
  } catch (error) {
    console.log('❌ Contact Form Failed:', error.message);
  }
}

testConnection();
