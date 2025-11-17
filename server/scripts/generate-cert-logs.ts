#!/usr/bin/env node
/**
 * Generate Test Certification Logs
 * 
 * This script creates sample certification logs for testing and submitting to payment processor
 * Run with: npm run cert:generate-test-logs
 */

import { certificationLogger } from '../services/certification-logger';

async function generateTestLogs() {
  console.log('🔍 Generating test certification logs...\n');

  // Test transaction 1: Successful payment creation
  const transaction1Id = `TEST_${Date.now()}_001`;
  
  certificationLogger.logCertificationEntry({
    transactionId: transaction1Id,
    customerId: 'customer-001',
    request: {
      timestamp: new Date().toISOString(),
      method: 'POST',
      endpoint: '/api/epx/hosted/create-payment',
      url: 'https://api.getmydpc.com/api/epx/hosted/create-payment',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      },
      body: {
        amount: 99.99,
        customerId: '***MASKED***',
        customerEmail: 'te***@***',
        customerName: 'Test User',
        planId: 'plan-premium',
        description: 'DPC Monthly Subscription'
      },
      ipAddress: '192.168.1.100'
    },
    response: {
      statusCode: 200,
      headers: {
        'content-type': 'application/json',
        'x-processing-time': '245ms'
      },
      body: {
        success: true,
        transactionId: transaction1Id,
        sessionId: 'sess_' + Math.random().toString(36).substr(2, 9),
        amount: 99.99,
        environment: 'sandbox',
        paymentMethod: 'hosted-checkout'
      },
      processingTimeMs: 245
    },
    amount: 99.99,
    environment: 'sandbox',
    purpose: 'payment-creation',
    sensitiveFieldsMasked: ['customerId', 'customerEmail'],
    timestamp: new Date().toISOString()
  });

  console.log('✅ Created test transaction 1 (payment-creation)');

  // Test transaction 2: Callback success
  const transaction2Id = `TEST_${Date.now()}_002`;
  
  certificationLogger.logCertificationEntry({
    transactionId: transaction2Id,
    customerId: 'customer-002',
    request: {
      timestamp: new Date().toISOString(),
      method: 'POST',
      endpoint: '/api/epx/hosted/callback',
      url: 'https://api.getmydpc.com/api/epx/hosted/callback',
      headers: {
        'content-type': 'application/json'
      },
      body: {
        status: 'approved',
        transactionId: transaction2Id,
        authCode: '****MASKED****',
        amount: 199.99
      }
    },
    response: {
      statusCode: 200,
      headers: {
        'content-type': 'application/json'
      },
      body: {
        success: true,
        transactionId: transaction2Id,
        status: 'completed',
        amount: 199.99
      },
      processingTimeMs: 156
    },
    amount: 199.99,
    environment: 'sandbox',
    purpose: 'callback-processing',
    sensitiveFieldsMasked: ['authCode'],
    timestamp: new Date().toISOString()
  });

  console.log('✅ Created test transaction 2 (callback-processing)');

  // Test transaction 3: Another payment creation
  const transaction3Id = `TEST_${Date.now()}_003`;
  
  certificationLogger.logCertificationEntry({
    transactionId: transaction3Id,
    customerId: 'customer-003',
    request: {
      timestamp: new Date().toISOString(),
      method: 'POST',
      endpoint: '/api/epx/hosted/create-payment',
      url: 'https://api.getmydpc.com/api/epx/hosted/create-payment',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'Mozilla/5.0'
      },
      body: {
        amount: 149.99,
        customerId: '***MASKED***',
        customerEmail: 'us***@***',
        customerName: 'Jane Smith',
        planId: 'plan-family',
        description: 'Family DPC Plan'
      }
    },
    response: {
      statusCode: 200,
      headers: {
        'content-type': 'application/json'
      },
      body: {
        success: true,
        transactionId: transaction3Id,
        amount: 149.99,
        environment: 'sandbox'
      },
      processingTimeMs: 234
    },
    amount: 149.99,
    environment: 'sandbox',
    purpose: 'payment-creation',
    sensitiveFieldsMasked: ['customerId', 'customerEmail'],
    timestamp: new Date().toISOString()
  });

  console.log('✅ Created test transaction 3 (payment-creation)');

  // Generate report
  const report = certificationLogger.generateCertificationReport();
  console.log('\n' + report);

  // Get summary
  const summary = certificationLogger.getLogsSummary();
  console.log('\n📊 Certification Logs Summary:');
  console.log(`   Total logs generated: ${summary.totalLogs}`);
  console.log(`   Logs directory: ${summary.rawLogsDir}`);
  console.log('\n📋 Files created:');
  summary.logFiles.forEach(file => {
    console.log(`   ✓ ${file}`);
  });

  console.log('\n✨ Next steps:');
  console.log('   1. Review the logs in: logs/certification/raw-requests/');
  console.log('   2. Export all logs: npm run cert:export-logs');
  console.log('   3. Submit to payment processor for certification');
  console.log('\n🔐 Sensitive data automatically masked in all logs');
}

generateTestLogs().catch(error => {
  console.error('❌ Error generating test logs:', error);
  process.exit(1);
});
