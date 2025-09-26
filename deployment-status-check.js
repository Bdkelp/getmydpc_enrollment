
#!/usr/bin/env node

const https = require('https');

const endpoints = [
  'https://getmydpcenrollment-production.up.railway.app/health',
  'https://getmydpcenrollment-production.up.railway.app/api/plans',
  'https://enrollment.getmydpc.com' // Will test once Vercel is deployed
];

async function checkEndpoint(url) {
  return new Promise((resolve) => {
    const req = https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          url,
          status: res.statusCode,
          ok: res.statusCode >= 200 && res.statusCode < 300,
          data: data.substring(0, 200)
        });
      });
    });
    
    req.on('error', (err) => {
      resolve({
        url,
        status: 'ERROR',
        ok: false,
        error: err.message
      });
    });
    
    req.setTimeout(10000, () => {
      req.destroy();
      resolve({
        url,
        status: 'TIMEOUT',
        ok: false,
        error: 'Request timeout'
      });
    });
  });
}

async function main() {
  console.log('🚀 Checking deployment status...\n');
  
  for (const endpoint of endpoints) {
    const result = await checkEndpoint(endpoint);
    const status = result.ok ? '✅' : '❌';
    console.log(`${status} ${result.url} - ${result.status}`);
    if (result.error) {
      console.log(`   Error: ${result.error}`);
    }
  }
  
  console.log('\n📋 Next steps:');
  console.log('1. Deploy frontend to Vercel with updated config');
  console.log('2. Verify EPX URLs are using enrollment.getmydpc.com');
  console.log('3. Test payment flow end-to-end');
}

main().catch(console.error);
