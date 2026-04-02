#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const cwd = process.cwd();
const envFileArg = process.argv.find((arg) => arg.startsWith('--env-file='));
const explicitEnvPath = envFileArg ? envFileArg.slice('--env-file='.length).trim() : '.env';
const envPath = path.resolve(cwd, explicitEnvPath);
const applyChanges = process.argv.includes('--apply');

const TARGET_FLAGS = {
  BILLING_SCHEDULER_ENABLED: 'true',
  BILLING_SCHEDULER_DRY_RUN: 'false',
  ACH_RECURRING_ENABLED: 'true',
  ACH_RECURRING_ALLOW_PRODUCTION: 'true',
};

if (!fs.existsSync(envPath)) {
  console.error(`Env file not found: ${envPath}`);
  process.exit(1);
}

const original = fs.readFileSync(envPath, 'utf8');
const lines = original.split(/\r?\n/);

const keyLineIndex = new Map();
for (let i = 0; i < lines.length; i += 1) {
  const line = lines[i].trim();
  if (!line || line.startsWith('#')) continue;
  const idx = line.indexOf('=');
  if (idx <= 0) continue;
  const key = line.slice(0, idx).trim();
  keyLineIndex.set(key, i);
}

const changes = [];
const nextLines = [...lines];

for (const [key, nextValue] of Object.entries(TARGET_FLAGS)) {
  if (keyLineIndex.has(key)) {
    const lineIndex = keyLineIndex.get(key);
    const currentLine = nextLines[lineIndex];
    const eqIndex = currentLine.indexOf('=');
    const currentValue = eqIndex >= 0 ? currentLine.slice(eqIndex + 1).trim() : '';
    const newLine = `${key}=${nextValue}`;
    if (currentLine !== newLine) {
      nextLines[lineIndex] = newLine;
      changes.push({ key, previous: currentValue, next: nextValue, action: 'updated' });
    }
  } else {
    nextLines.push(`${key}=${nextValue}`);
    changes.push({ key, previous: '(missing)', next: nextValue, action: 'added' });
  }
}

if (changes.length === 0) {
  console.log('No changes needed. ACH live flags are already set.');
  process.exit(0);
}

console.log(`Target env file: ${envPath}`);
for (const change of changes) {
  console.log(`- ${change.action.toUpperCase()} ${change.key}: ${change.previous} -> ${change.next}`);
}

if (!applyChanges) {
  console.log('\nDry-run only. Re-run with --apply to persist changes.');
  process.exit(0);
}

const backupPath = `${envPath}.bak-${new Date().toISOString().replace(/[:.]/g, '-')}`;
fs.writeFileSync(backupPath, original, 'utf8');
fs.writeFileSync(envPath, nextLines.join('\n'), 'utf8');

console.log(`\nApplied changes to ${envPath}`);
console.log(`Backup created at ${backupPath}`);
