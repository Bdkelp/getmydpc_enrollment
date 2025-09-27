
#!/usr/bin/env node

const https = require('https');
const http = require('http');

const endpoints = [
  'https://enrollment.getmydpc.com/health',
  'https://enrollment.getmydpc.com/api/health',
  'https://getmydpcenrollment-production.up.railway.app/health',
  'https://getmydpcenrollment-production.up.railway.app/api/health',
  'https://sgtnzhgxlkcvtrzejobx.supabase.co/rest/v1/',
  'https://keyexch.epxuap.com'
];

async function checkEndpoint(url) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const protocol = url.startsWith('https:') ? https : http;
    
    const req = protocol.get(url, (res) => {
      const responseTime = Date.now() - startTime;
      resolve({
        url,
        status: res.statusCode,
        responseTime,
        headers: {
          'content-type': res.headers['content-type'],
          'server': res.headers['server']
        }
      });
    });
    
    req.on('error', (error) => {
      resolve({
        url,
        error: error.message,
        responseTime: Date.now() - startTime
      });
    });
    
    req.setTimeout(10000, () => {
      req.destroy();
      resolve({
        url,
        error: 'Timeout',
        responseTime: Date.now() - startTime
      });
    });
  });
}

async function main() {
  console.log('🔍 Diagnosing outage...\n');
  console.log('Timestamp:', new Date().toISOString());
  
  for (const endpoint of endpoints) {
    const result = await checkEndpoint(endpoint);
    const status = result.error ? '❌' : (result.status < 400 ? '✅' : '⚠️');
    
    if (result.error) {
      console.log(`${status} ${endpoint} - ERROR: ${result.error} (${result.responseTime}ms)`);
    } else {
      console.log(`${status} ${endpoint} - ${result.status} (${result.responseTime}ms)`);
    }
  }
  
  // Test database connectivity
  console.log('\n🗄️ Testing database connectivity...');
  try {
    const dbTest = await checkEndpoint('https://enrollment.getmydpc.com/api/plans');
    if (dbTest.error) {
      console.log('❌ Database: Connection failed -', dbTest.error);
    } else if (dbTest.status === 200) {
      console.log('✅ Database: Connected and responding');
    } else {
      console.log('⚠️ Database: Connected but returning', dbTest.status);
    }
  } catch (error) {
    console.log('❌ Database: Error -', error.message);
  }
}

main().catch(console.error);
