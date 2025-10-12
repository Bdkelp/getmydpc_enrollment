/**
 * Service Health Check Script
 * Checks Railway, Vercel, and Database connectivity
 */

console.log('🔍 CHECKING ALL SERVICES...\n');
console.log('=' .repeat(60));

// Check Railway Backend
console.log('\n📡 1. RAILWAY BACKEND (API Server)');
console.log('-'.repeat(60));

const railwayUrls = [
  'https://getmydpcenrollment-production.up.railway.app/health',
  'https://getmydpcenrollment-production.up.railway.app/api/health',
  'https://getmydpcenrollment-production.up.railway.app/api/plans',
];

for (const url of railwayUrls) {
  try {
    const response = await fetch(url);
    const text = await response.text();
    console.log(`✅ ${url}`);
    console.log(`   Status: ${response.status} ${response.statusText}`);
    console.log(`   Response: ${text.substring(0, 100)}...`);
  } catch (error) {
    console.log(`❌ ${url}`);
    console.log(`   Error: ${error.message}`);
  }
}

// Check Vercel Frontend
console.log('\n🌐 2. VERCEL FRONTEND');
console.log('-'.repeat(60));

const vercelUrl = 'https://enrollment.getmydpc.com';
try {
  const response = await fetch(vercelUrl);
  console.log(`✅ ${vercelUrl}`);
  console.log(`   Status: ${response.status} ${response.statusText}`);
  console.log(`   Content-Type: ${response.headers.get('content-type')}`);
} catch (error) {
  console.log(`❌ ${vercelUrl}`);
  console.log(`   Error: ${error.message}`);
}

// Check Database (via Railway API)
console.log('\n🗄️  3. NEON DATABASE (via Railway)');
console.log('-'.repeat(60));

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

try {
  const result = await pool.query('SELECT NOW() as current_time, version() as pg_version');
  console.log('✅ Database Connected');
  console.log(`   Current Time: ${result.rows[0].current_time}`);
  console.log(`   PostgreSQL: ${result.rows[0].pg_version.split(',')[0]}`);
  
  // Check critical tables
  const tables = await pool.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name IN ('users', 'subscriptions', 'plans', 'payments', 'commissions')
    ORDER BY table_name
  `);
  console.log(`   Tables Found: ${tables.rows.map(r => r.table_name).join(', ')}`);
  
  // Check row counts
  const counts = await pool.query(`
    SELECT 
      (SELECT COUNT(*) FROM users) as users_count,
      (SELECT COUNT(*) FROM subscriptions) as subscriptions_count,
      (SELECT COUNT(*) FROM plans) as plans_count,
      (SELECT COUNT(*) FROM payments) as payments_count,
      (SELECT COUNT(*) FROM commissions) as commissions_count
  `);
  console.log(`   Row Counts:`);
  console.log(`     - Users: ${counts.rows[0].users_count}`);
  console.log(`     - Subscriptions: ${counts.rows[0].subscriptions_count}`);
  console.log(`     - Plans: ${counts.rows[0].plans_count}`);
  console.log(`     - Payments: ${counts.rows[0].payments_count}`);
  console.log(`     - Commissions: ${counts.rows[0].commissions_count}`);
  
} catch (error) {
  console.log('❌ Database Connection Failed');
  console.log(`   Error: ${error.message}`);
} finally {
  await pool.end();
}

// Check Auth Endpoint Specifically
console.log('\n🔐 4. AUTH ENDPOINT CHECK');
console.log('-'.repeat(60));

const authEndpoints = [
  'https://getmydpcenrollment-production.up.railway.app/api/auth/login',
  'https://getmydpcenrollment-production.up.railway.app/auth/login',
];

for (const url of authEndpoints) {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'test@test.com', password: 'test' })
    });
    const text = await response.text();
    console.log(`${response.status === 404 ? '❌' : '✅'} ${url}`);
    console.log(`   Status: ${response.status} ${response.statusText}`);
    if (response.status === 404) {
      console.log(`   ⚠️  ENDPOINT NOT FOUND!`);
    }
  } catch (error) {
    console.log(`❌ ${url}`);
    console.log(`   Error: ${error.message}`);
  }
}

console.log('\n' + '='.repeat(60));
console.log('✅ Health Check Complete\n');
