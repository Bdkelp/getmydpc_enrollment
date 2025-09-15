
#!/usr/bin/env node

const https = require('https');
const http = require('http');

const RAILWAY_URL = 'https://shimmering-nourishment.up.railway.app';
const FRONTEND_URL = 'https://enrollment.getmydpc.com';

async function testEndpoint(url, options = {}) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https:') ? https : http;
    const req = protocol.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          data: data
        });
      });
    });
    
    req.on('error', reject);
    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

async function runTests() {
  console.log('🧪 Testing fixes...\n');
  
  // Test 1: CORS preflight
  try {
    console.log('Test 1: CORS Preflight Check');
    const corsTest = await testEndpoint(`${RAILWAY_URL}/api/public/leads`, {
      method: 'OPTIONS',
      headers: {
        'Origin': FRONTEND_URL,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Content-Type'
      }
    });
    
    console.log('✅ CORS Status:', corsTest.status);
    console.log('✅ CORS Headers:', {
      'access-control-allow-origin': corsTest.headers['access-control-allow-origin'],
      'access-control-allow-methods': corsTest.headers['access-control-allow-methods'],
      'access-control-allow-credentials': corsTest.headers['access-control-allow-credentials']
    });
  } catch (error) {
    console.log('❌ CORS Test Failed:', error.message);
  }
  
  // Test 2: Health check
  try {
    console.log('\nTest 2: Health Check');
    const healthTest = await testEndpoint(`${RAILWAY_URL}/health`);
    console.log('✅ Health Status:', healthTest.status);
    console.log('✅ Health Data:', JSON.parse(healthTest.data));
  } catch (error) {
    console.log('❌ Health Test Failed:', error.message);
  }
  
  // Test 3: Plans endpoint
  try {
    console.log('\nTest 3: Plans Endpoint');
    const plansTest = await testEndpoint(`${RAILWAY_URL}/api/plans`, {
      headers: { 'Origin': FRONTEND_URL }
    });
    console.log('✅ Plans Status:', plansTest.status);
    const plansData = JSON.parse(plansTest.data);
    console.log('✅ Plans Count:', Array.isArray(plansData) ? plansData.length : 'Not an array');
  } catch (error) {
    console.log('❌ Plans Test Failed:', error.message);
  }
  
  // Test 4: Lead submission
  try {
    console.log('\nTest 4: Lead Submission');
    const leadTest = await testEndpoint(`${RAILWAY_URL}/api/public/leads`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': FRONTEND_URL
      },
      body: JSON.stringify({
        firstName: 'Test',
        lastName: 'User',
        email: 'test@example.com',
        phone: '1234567890',
        message: 'Test submission'
      })
    });
    
    console.log('✅ Lead Status:', leadTest.status);
    console.log('✅ Lead Response:', JSON.parse(leadTest.data));
  } catch (error) {
    console.log('❌ Lead Test Failed:', error.message);
  }
  
  console.log('\n🏁 Test completed!');
}

runTests().catch(console.error);
