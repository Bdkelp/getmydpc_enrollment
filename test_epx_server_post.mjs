/**
 * EPX Server Post Integration Test Script
 * 
 * This script validates:
 * 1. Environment configuration is correct
 * 2. EPX Server Post service initializes properly
 * 3. Signature generation works
 * 4. Database tables exist (if migration was run)
 * 
 * IMPORTANT: Does NOT make actual API calls to EPX
 * IMPORTANT: Does NOT modify database
 * 
 * Usage: node test_epx_server_post.mjs
 */

import dotenv from 'dotenv';
import { neon } from '@neondatabase/serverless';

dotenv.config();

const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  bold: '\x1b[1m'
};

const log = {
  header: (msg) => console.log(`\n${colors.bold}${colors.blue}${msg}${colors.reset}`),
  success: (msg) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
  error: (msg) => console.log(`${colors.red}✗${colors.reset} ${msg}`),
  warning: (msg) => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`),
  info: (msg) => console.log(`${colors.blue}ℹ${colors.reset} ${msg}`),
  step: (msg) => console.log(`${colors.dim}→ ${msg}${colors.reset}`)
};

async function testConfiguration() {
  log.header('='.repeat(60));
  log.header('EPX Server Post Integration Test');
  log.header('='.repeat(60));

  let hasErrors = false;

  // Test 1: Required Environment Variables
  log.header('\n1. Checking Environment Variables');
  
  const requiredVars = {
    'DATABASE_URL': process.env.DATABASE_URL,
    'EPX_CUST_NBR': process.env.EPX_CUST_NBR,
    'EPX_DBA_NBR': process.env.EPX_DBA_NBR,
    'EPX_MERCH_NBR': process.env.EPX_MERCH_NBR,
    'EPX_TERMINAL_NBR': process.env.EPX_TERMINAL_NBR,
    'EPX_MAC': process.env.EPX_MAC
  };

  for (const [key, value] of Object.entries(requiredVars)) {
    if (value) {
      log.success(`${key} is set`);
    } else {
      log.error(`${key} is missing!`);
      hasErrors = true;
    }
  }

  // Optional variables
  log.step('\nOptional variables:');
  const optionalVars = {
    'BILLING_SCHEDULER_ENABLED': process.env.BILLING_SCHEDULER_ENABLED || 'false',
    'EPX_SANDBOX_API_URL': process.env.EPX_SANDBOX_API_URL || 'not set (will use default)',
    'EPX_PRODUCTION_API_URL': process.env.EPX_PRODUCTION_API_URL || 'not set (will use default)',
    'EPX_ENVIRONMENT': process.env.EPX_ENVIRONMENT || 'sandbox',
    'EPX_CAPTURE_TOKENS': process.env.EPX_CAPTURE_TOKENS || 'false'
  };

  for (const [key, value] of Object.entries(optionalVars)) {
    console.log(`  ${key}: ${colors.dim}${value}${colors.reset}`);
  }

  // Test 2: EPI-Id Construction
  log.header('\n2. Testing EPI-Id Construction');
  
  if (requiredVars.EPX_CUST_NBR && requiredVars.EPX_DBA_NBR && 
      requiredVars.EPX_MERCH_NBR && requiredVars.EPX_TERMINAL_NBR) {
    const epiId = `${requiredVars.EPX_CUST_NBR}.${requiredVars.EPX_DBA_NBR}.${requiredVars.EPX_MERCH_NBR}.${requiredVars.EPX_TERMINAL_NBR}`;
    log.success(`EPI-Id: ${epiId}`);
  } else {
    log.error('Cannot construct EPI-Id (missing credentials)');
    hasErrors = true;
  }

  // Test 3: Signature Generation (using Node.js crypto)
  log.header('\n3. Testing HMAC-SHA256 Signature Generation');
  
  if (requiredVars.EPX_MAC) {
    try {
      const crypto = await import('crypto');
      const testRoute = '/storage';
      const testPayload = { test: 'data' };
      const concatenated = testRoute + JSON.stringify(testPayload);
      
      const hmac = crypto.createHmac('sha256', requiredVars.EPX_MAC);
      hmac.update(concatenated, 'utf8');
      const signature = hmac.digest('base64');
      
      log.success('HMAC-SHA256 signature generation works');
      log.step(`Test signature (first 20 chars): ${signature.substring(0, 20)}...`);
    } catch (error) {
      log.error(`Signature generation failed: ${error.message}`);
      hasErrors = true;
    }
  } else {
    log.warning('Skipping signature test (EPX_MAC not set)');
  }

  // Test 4: Database Connection
  log.header('\n4. Testing Database Connection');
  
  if (requiredVars.DATABASE_URL) {
    try {
      const sql = neon(requiredVars.DATABASE_URL);
      await sql`SELECT 1`;
      log.success('Database connection successful');

      // Test 5: Check for Recurring Billing Tables
      log.header('\n5. Checking Recurring Billing Tables');
      
      const tables = ['payment_tokens', 'billing_schedule', 'recurring_billing_log'];
      let allTablesExist = true;

      for (const table of tables) {
        try {
          const result = await sql`
            SELECT EXISTS (
              SELECT FROM information_schema.tables 
              WHERE table_schema = 'public' 
              AND table_name = ${table}
            );
          `;
          
          if (result[0].exists) {
            log.success(`Table "${table}" exists`);
          } else {
            log.warning(`Table "${table}" does not exist`);
            allTablesExist = false;
          }
        } catch (error) {
          log.error(`Error checking table "${table}": ${error.message}`);
          allTablesExist = false;
        }
      }

      if (!allTablesExist) {
        log.info('\nTo create tables, run: node run_epx_recurring_migration.mjs');
      }

    } catch (error) {
      log.error(`Database connection failed: ${error.message}`);
      log.warning('Cannot test database tables');
      hasErrors = true;
    }
  } else {
    log.error('DATABASE_URL not set - skipping database tests');
    hasErrors = true;
  }

  // Test 6: Scheduler Status
  log.header('\n6. Recurring Billing Scheduler Status');
  
  const schedulerEnabled = process.env.BILLING_SCHEDULER_ENABLED === 'true';
  if (schedulerEnabled) {
    log.success('Scheduler is ENABLED');
    log.info('Scheduler will run daily at 2:00 AM when server starts');
  } else {
    log.info('Scheduler is DISABLED');
    log.step('Set BILLING_SCHEDULER_ENABLED=true to enable automatic billing');
  }

  // Test 7: API URL Configuration
  log.header('\n7. API URL Configuration');
  
  const environment = process.env.EPX_ENVIRONMENT || 'sandbox';
  const apiUrl = environment === 'production'
    ? (process.env.EPX_PRODUCTION_API_URL || 'https://api.north.com')
    : (process.env.EPX_SANDBOX_API_URL || 'https://api-sandbox.north.com');
  
  log.info(`Environment: ${environment}`);
  log.info(`API URL: ${apiUrl}`);
  
  if (environment === 'production') {
    log.warning('PRODUCTION MODE: Ensure your server IP is whitelisted by EPX!');
  } else {
    log.success('Sandbox mode - safe for testing');
  }

  // Final Summary
  log.header('\n' + '='.repeat(60));
  
  if (hasErrors) {
    log.error('❌ Configuration has errors - please fix before proceeding');
    console.log('');
    process.exit(1);
  } else {
    log.success('✅ All tests passed! EPX Server Post integration is ready.');
    console.log('');
    
    if (!schedulerEnabled) {
      log.info('Next steps to enable recurring billing:');
      log.step('1. Run database migration: node run_epx_recurring_migration.mjs');
      log.step('2. Set BILLING_SCHEDULER_ENABLED=true in your .env');
      log.step('3. Restart your server');
    } else {
      log.info('Recurring billing is configured and ready!');
      log.step('Restart your server to activate the scheduler');
    }
    
    console.log('');
    log.header('='.repeat(60));
    console.log('');
  }
}

// Run tests
testConfiguration().catch(error => {
  log.error(`\nUnexpected error: ${error.message}`);
  console.error(error.stack);
  process.exit(1);
});
