#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const cwd = process.cwd();
const envPath = path.join(cwd, '.env');
const sampleLimitArg = process.argv.find((arg) => arg.startsWith('--sample='));
const sampleLimit = sampleLimitArg ? Math.max(1, Number.parseInt(sampleLimitArg.split('=')[1], 10) || 20) : 20;

if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    if (!line || line.trim().startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim().replace(/^"|"$/g, '');
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

const normalize = (value) => String(value || '').replace(/["']/g, '').trim();
const supabaseUrl = normalize(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL);
const supabaseServiceKey = normalize(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY/SUPABASE_SERVICE_KEY in environment');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
  db: { schema: 'public' },
});

const normalizeText = (value) => String(value || '').trim().toLowerCase();
const isDobValid = (value) => /^\d{8}$/.test(String(value || '').trim());
const pickValue = (row, keys) => {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(row, key) && row[key] !== undefined && row[key] !== null) {
      return row[key];
    }
  }
  return null;
};

function relationshipExpectedForTier(tier) {
  const normalizedTier = normalizeText(tier);
  if (normalizedTier === 'child') return 'dependent';
  if (normalizedTier === 'spouse') return 'spouse';
  return null;
}

function driftIssueForRecord(member) {
  const status = normalizeText(pickValue(member, ['status']));
  if (status === 'terminated') {
    return null;
  }

  const tier = normalizeText(pickValue(member, ['tier', 'coverage_type', 'coverageType']));
  const relationship = normalizeText(pickValue(member, ['relationship', 'relation', 'member_relationship']));
  const expectedRelationship = relationshipExpectedForTier(tier);
  const dob = String(pickValue(member, ['date_of_birth', 'dateOfBirth']) || '').trim();

  if (!dob) {
    return 'missing_dob';
  }

  if (!isDobValid(dob)) {
    return 'invalid_dob_format';
  }

  if (expectedRelationship && relationship !== expectedRelationship) {
    return `relationship_mismatch:${expectedRelationship}`;
  }

  return null;
}

async function run() {
  const { data, error } = await supabase
    .from('group_members')
    .select('*')
    .order('id', { ascending: true });

  if (error) {
    throw new Error(`Failed to query group_members: ${error.message}`);
  }

  const rows = data || [];
  const issues = [];
  const counts = new Map();

  for (const member of rows) {
    const issue = driftIssueForRecord(member);
    if (!issue) continue;

    counts.set(issue, (counts.get(issue) || 0) + 1);
    issues.push({
      issue,
      id: pickValue(member, ['id']),
      groupId: pickValue(member, ['group_id', 'groupId']),
      name: `${pickValue(member, ['first_name', 'firstName']) || ''} ${pickValue(member, ['last_name', 'lastName']) || ''}`.trim() || '(unknown)',
      email: pickValue(member, ['email']) || '',
      status: pickValue(member, ['status']) || '',
      tier: pickValue(member, ['tier', 'coverage_type', 'coverageType']) || '',
      relationship: pickValue(member, ['relationship', 'relation', 'member_relationship']) || '',
      dateOfBirth: pickValue(member, ['date_of_birth', 'dateOfBirth']) || '',
      updatedAt: pickValue(member, ['updated_at', 'updatedAt']) || '',
    });
  }

  console.log('\nGroup Member Drift Audit');
  console.log('========================');
  console.log(`Scanned members: ${rows.length}`);
  console.log(`Issues found: ${issues.length}`);

  if (issues.length === 0) {
    console.log('Result: No drift issues detected.');
    return;
  }

  console.log('\nIssue counts:');
  for (const [issue, count] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`- ${issue}: ${count}`);
  }

  console.log(`\nSample issues (first ${Math.min(sampleLimit, issues.length)}):`);
  for (const issue of issues.slice(0, sampleLimit)) {
    console.log(
      `- memberId=${issue.id}, groupId=${issue.groupId}, issue=${issue.issue}, ` +
      `tier=${issue.tier || '(blank)'}, relationship=${issue.relationship || '(blank)'}, dob=${issue.dateOfBirth || '(blank)'}, ` +
      `name=${issue.name}`,
    );
  }

  console.log('\nTip: run with --sample=100 to view a larger sample.');
}

run().catch((error) => {
  console.error('Group member drift audit failed:', error.message || error);
  process.exit(1);
});
