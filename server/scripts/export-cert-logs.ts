#!/usr/bin/env node
/**
 * Export Certification Logs
 * 
 * This script exports all certification logs to a single file for easy submission
 * Run with: npm run cert:export-logs
 */

import { certificationLogger } from '../services/certification-logger';
import * as fs from 'fs';
import * as path from 'path';

async function exportLogs() {
  console.log('📦 Exporting certification logs...\n');

  try {
    // Generate timestamp for filename
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `EPX_CERTIFICATION_EXPORT_${timestamp}.txt`;

    // Export logs
    const filepath = certificationLogger.exportAllLogs(filename);

    // Get file size
    const stats = fs.statSync(filepath);
    const sizeKb = (stats.size / 1024).toFixed(2);

    console.log('✅ Export successful!');
    console.log(`\n📄 File Details:`);
    console.log(`   Filename: ${filename}`);
    console.log(`   Location: ${filepath}`);
    console.log(`   Size: ${sizeKb} KB`);
    console.log(`   Created: ${stats.mtime.toISOString()}`);

    // Show summary
    const summary = certificationLogger.getLogsSummary();
    console.log(`\n📊 Logs Included:`);
    console.log(`   Total transactions: ${summary.totalLogs}`);

    console.log(`\n💾 How to use:`);
    console.log(`   1. The file has been created in: logs/certification/summaries/`);
    console.log(`   2. Download/copy the .txt file`);
    console.log(`   3. Submit to your payment processor for certification review`);
    console.log(`   4. All sensitive data is automatically masked`);

    // Also show individual files
    console.log(`\n📋 Individual Transaction Logs:`);
    console.log(`   Location: ${summary.rawLogsDir}`);
    console.log(`   Files:`);
    summary.logFiles.forEach(file => {
      console.log(`      • ${file}`);
    });

    console.log('\n✨ Export complete!');
  } catch (error: any) {
    console.error('❌ Export failed:', error.message);
    process.exit(1);
  }
}

exportLogs();
