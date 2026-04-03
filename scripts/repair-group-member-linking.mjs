#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const cwd = process.cwd();
const envPath = path.join(cwd, '.env');

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

const APPLY = process.argv.includes('--apply');
const groupIdArg = process.argv.find((arg) => arg.startsWith('--group-id='));
const groupNameArg = process.argv.find((arg) => arg.startsWith('--group-name='));
const groupIdFilter = groupIdArg ? groupIdArg.split('=')[1].trim() : '';
const groupNameFilter = groupNameArg ? groupNameArg.split('=')[1].trim().toLowerCase() : '';

const normalizeText = (value) => String(value || '').trim().toLowerCase();
const toTrimmedOrNull = (value) => {
  const text = String(value || '').trim();
  return text ? text : null;
};
const toObject = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? { ...value } : {});
const roundCurrency = (value) => Math.round(Number(value || 0) * 100) / 100;
const parseAmount = (value) => {
  if (value === null || value === undefined || value === '') return 0;
  const parsed = Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? roundCurrency(parsed) : 0;
};
const pickFirst = (obj, keys) => {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(obj, key) && obj[key] !== undefined && obj[key] !== null) {
      return obj[key];
    }
  }
  return null;
};

const normalizeMemberTier = (value) => {
  const normalized = normalizeText(value);
  if (normalized === 'dependent' || normalized === 'dep') return 'child';
  if (normalized === 'employee' || normalized === 'ee' || normalized === 'primary') return 'member';
  if (normalized === 'member' || normalized === 'spouse' || normalized === 'child' || normalized === 'family') return normalized;
  return 'member';
};

const normalizeMemberRelationship = (value, fallbackTier) => {
  const normalized = normalizeText(value);
  if (normalized === 'primary' || normalized === 'spouse' || normalized === 'dependent') return normalized;
  if (normalized === 'child' || normalized === 'dep') return 'dependent';
  if (normalized === 'employee' || normalized === 'member' || normalized === 'self' || normalized === 'subscriber' || normalized === 'ee') {
    return 'primary';
  }

  const normalizedTier = normalizeMemberTier(fallbackTier);
  if (normalizedTier === 'spouse') return 'spouse';
  if (normalizedTier === 'child') return 'dependent';
  return 'primary';
};

const relationshipExpectedForTier = (tier) => {
  const normalizedTier = normalizeMemberTier(tier);
  if (normalizedTier === 'spouse') return 'spouse';
  if (normalizedTier === 'child') return 'dependent';
  return null;
};

const extractHouseholdBaseFromMemberNumber = (value) => {
  const normalized = toTrimmedOrNull(value);
  if (!normalized) return null;
  const idx = normalized.lastIndexOf('-');
  return idx > 0 ? normalized.slice(0, idx) : null;
};

const parseDependentSuffix = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed < 1) return null;
  return parsed;
};

const formatHouseholdMemberNumber = (baseNumber, dependentSuffix) => `${baseNumber}-${String(dependentSuffix).padStart(2, '0')}`;

const resolveHouseholdFromRecord = (member) => {
  const metadata = toObject(member.metadata);
  const registrationPayload = toObject(member.registration_payload);
  const metadataHousehold = toObject(metadata.householdLink);
  const payloadHousehold = toObject(registrationPayload.householdLink);

  const householdBaseNumber =
    toTrimmedOrNull(pickFirst(member, ['household_base_number', 'householdBaseNumber']))
    || toTrimmedOrNull(metadata.householdBaseNumber)
    || toTrimmedOrNull(metadataHousehold.householdBaseNumber)
    || toTrimmedOrNull(registrationPayload.householdBaseNumber)
    || toTrimmedOrNull(payloadHousehold.householdBaseNumber)
    || null;

  const householdMemberNumber =
    toTrimmedOrNull(pickFirst(member, ['household_member_number', 'householdMemberNumber']))
    || toTrimmedOrNull(metadata.householdMemberNumber)
    || toTrimmedOrNull(metadataHousehold.householdMemberNumber)
    || toTrimmedOrNull(registrationPayload.householdMemberNumber)
    || toTrimmedOrNull(payloadHousehold.householdMemberNumber)
    || null;

  const dependentSuffix =
    parseDependentSuffix(pickFirst(member, ['dependent_suffix', 'dependentSuffix']))
    ?? parseDependentSuffix(metadata.dependentSuffix)
    ?? parseDependentSuffix(metadataHousehold.dependentSuffix)
    ?? parseDependentSuffix(registrationPayload.dependentSuffix)
    ?? parseDependentSuffix(payloadHousehold.dependentSuffix)
    ?? null;

  return {
    householdBaseNumber,
    householdMemberNumber,
    dependentSuffix,
  };
};

const upsertHouseholdLink = (metadataInput, payloadInput, link) => {
  const metadata = toObject(metadataInput);
  const payload = toObject(payloadInput);

  metadata.householdBaseNumber = link.householdBaseNumber;
  metadata.householdMemberNumber = link.householdMemberNumber;
  metadata.dependentSuffix = link.dependentSuffix;
  metadata.householdLink = {
    ...(toObject(metadata.householdLink)),
    householdBaseNumber: link.householdBaseNumber,
    householdMemberNumber: link.householdMemberNumber,
    dependentSuffix: link.dependentSuffix,
  };

  payload.householdBaseNumber = link.householdBaseNumber;
  payload.householdMemberNumber = link.householdMemberNumber;
  payload.dependentSuffix = link.dependentSuffix;
  payload.householdLink = {
    ...(toObject(payload.householdLink)),
    householdBaseNumber: link.householdBaseNumber,
    householdMemberNumber: link.householdMemberNumber,
    dependentSuffix: link.dependentSuffix,
  };

  return { metadata, registrationPayload: payload };
};

const COMMISSION_MATRIX = {
  base: { EE: 59, ESP: 99, ECH: 129, FAM: 149 },
  plus: { EE: 99, ESP: 179, ECH: 229, FAM: 279 },
  elite: { EE: 119, ESP: 209, ECH: 279, FAM: 349 },
};

const planTierFromName = (planName) => {
  const normalized = normalizeText(planName);
  if (normalized.includes('elite')) return 'elite';
  if (normalized.includes('plus') || normalized.includes('+')) return 'plus';
  return 'base';
};

const memberTypeFromMember = (member) => {
  const relationship = normalizeMemberRelationship(member.relationship, member.tier);
  const normalizedTier = normalizeMemberTier(member.tier);

  if (normalizedTier === 'family') return 'FAM';
  if (relationship === 'spouse' || normalizedTier === 'spouse') return 'ESP';
  if (relationship === 'dependent' || normalizedTier === 'child') return 'ECH';
  return 'EE';
};

const resolvePlanName = (group, member) => {
  const payload = toObject(member.registration_payload);
  const metadata = toObject(member.metadata);
  const groupMeta = toObject(group.metadata);

  return toTrimmedOrNull(
    payload.selectedPlanName
    || payload.planName
    || metadata.selectedPlanName
    || metadata.planName
    || pickFirst(toObject(groupMeta.groupProfile).planSelection || {}, ['planName'])
    || groupMeta.planName
  );
};

const resolvePbmEnabled = (group, member) => {
  const payload = toObject(member.registration_payload);
  const metadata = toObject(member.metadata);
  const groupMeta = toObject(group.metadata);
  const groupPlan = toObject(toObject(groupMeta.groupProfile).planSelection);

  return Boolean(
    groupPlan.pbmEnabled
    ?? payload.pbmEnabled
    ?? payload.pbm
    ?? metadata.pbmEnabled
    ?? metadata.pbm
    ?? groupMeta.pbmEnabled
    ?? groupMeta.pbm
  );
};

const resolvePbmAmount = (group, member) => {
  const payload = toObject(member.registration_payload);
  const metadata = toObject(member.metadata);
  const groupMeta = toObject(group.metadata);
  const groupPlan = toObject(toObject(groupMeta.groupProfile).planSelection);

  const candidates = [
    groupPlan.pbmAmount,
    groupMeta.pbmAmount,
    payload.pbmAmount,
    metadata.pbmAmount,
  ];

  for (const candidate of candidates) {
    const parsed = parseAmount(candidate);
    if (parsed > 0) {
      return parsed;
    }
  }

  return 0;
};

const buildPrimaryPricingPatch = (group, member) => {
  const planName = resolvePlanName(group, member);
  if (!planName) {
    return null;
  }

  const tierKey = planTierFromName(planName);
  const memberType = memberTypeFromMember(member);
  const baseTotal = COMMISSION_MATRIX[tierKey][memberType];
  if (!Number.isFinite(baseTotal)) {
    return null;
  }

  const pbmEnabled = resolvePbmEnabled(group, member);
  const pbmAmount = pbmEnabled ? resolvePbmAmount(group, member) : 0;
  const total = roundCurrency(baseTotal + pbmAmount);
  const payorType = normalizeText(member.payor_type) === 'member' ? 'member' : 'full';
  const employerAmount = payorType === 'full' ? total : 0;
  const memberAmount = payorType === 'member' ? total : 0;

  return {
    employer_amount: employerAmount.toFixed(2),
    member_amount: memberAmount.toFixed(2),
    discount_amount: '0.00',
    total_amount: total.toFixed(2),
  };
};

const amountsDiffer = (currentValue, nextValue) => {
  const current = parseAmount(currentValue);
  const next = parseAmount(nextValue);
  return Math.abs(current - next) >= 0.01;
};

async function main() {
  console.log('[Repair] Group member household/pricing repair');
  console.log(`[Repair] Mode: ${APPLY ? 'APPLY' : 'DRY RUN'}`);
  if (groupIdFilter) {
    console.log(`[Repair] Filter group id: ${groupIdFilter}`);
  }
  if (groupNameFilter) {
    console.log(`[Repair] Filter group name contains: ${groupNameFilter}`);
  }

  const relationshipProbe = await supabase
    .from('group_members')
    .select('id,relationship')
    .limit(1);
  const supportsRelationshipColumn = !relationshipProbe.error;
  const householdBaseProbe = await supabase
    .from('group_members')
    .select('id,household_base_number')
    .limit(1);
  const householdMemberProbe = await supabase
    .from('group_members')
    .select('id,household_member_number')
    .limit(1);
  const dependentSuffixProbe = await supabase
    .from('group_members')
    .select('id,dependent_suffix')
    .limit(1);
  const supportsHouseholdBaseColumn = !householdBaseProbe.error;
  const supportsHouseholdMemberColumn = !householdMemberProbe.error;
  const supportsDependentSuffixColumn = !dependentSuffixProbe.error;

  const [{ data: groups, error: groupsError }, { data: members, error: membersError }] = await Promise.all([
    supabase.from('groups').select('id,name,metadata').order('id', { ascending: true }),
    supabase.from('group_members').select('*').order('group_id', { ascending: true }).order('id', { ascending: true }),
  ]);

  if (groupsError) {
    throw new Error(`Failed to query groups: ${groupsError.message}`);
  }
  if (membersError) {
    throw new Error(`Failed to query group_members: ${membersError.message}`);
  }

  const groupById = new Map();
  for (const group of groups || []) {
    if (groupIdFilter && String(group.id) !== groupIdFilter) {
      continue;
    }
    if (groupNameFilter && !String(group.name || '').toLowerCase().includes(groupNameFilter)) {
      continue;
    }
    groupById.set(String(group.id), group);
  }

  const membersByGroup = new Map();
  for (const member of members || []) {
    const groupId = String(member.group_id || '');
    if (!groupById.has(groupId)) {
      continue;
    }
    if (!membersByGroup.has(groupId)) {
      membersByGroup.set(groupId, []);
    }
    membersByGroup.get(groupId).push(member);
  }

  const stats = {
    groupsScanned: 0,
    membersScanned: 0,
    membersChanged: 0,
    relationshipFixed: 0,
    householdRelinked: 0,
    pricingFixed: 0,
    failed: 0,
  };

  for (const [groupId, group] of groupById.entries()) {
    const groupMembers = membersByGroup.get(groupId) || [];
    if (!groupMembers.length) {
      continue;
    }

    stats.groupsScanned += 1;
    const activeMembers = groupMembers.filter((member) => normalizeText(member.status) !== 'terminated');
    const primaryMember = activeMembers.find((member) => normalizeMemberRelationship(member.relationship, member.tier) === 'primary');

    const primaryHousehold = primaryMember ? resolveHouseholdFromRecord(primaryMember) : null;
    const primaryBase = primaryHousehold
      ? (
        toTrimmedOrNull(primaryHousehold.householdBaseNumber)
        || extractHouseholdBaseFromMemberNumber(primaryHousehold.householdMemberNumber)
      )
      : null;

    const usedSuffixes = new Set();
    if (primaryBase) {
      for (const member of activeMembers) {
        const household = resolveHouseholdFromRecord(member);
        const base = toTrimmedOrNull(household.householdBaseNumber) || extractHouseholdBaseFromMemberNumber(household.householdMemberNumber);
        if (base !== primaryBase) {
          continue;
        }
        const suffix = parseDependentSuffix(household.dependentSuffix)
          ?? parseDependentSuffix(String(household.householdMemberNumber || '').split('-').pop());
        if (suffix) {
          usedSuffixes.add(suffix);
        }
      }
    }

    let nextSuffix = 1;
    const reserveNextSuffix = () => {
      while (usedSuffixes.has(nextSuffix)) {
        nextSuffix += 1;
      }
      const reserved = nextSuffix;
      usedSuffixes.add(reserved);
      nextSuffix += 1;
      return reserved;
    };

    for (const member of activeMembers) {
      stats.membersScanned += 1;
      const patch = {};
      const normalizedRelationship = normalizeMemberRelationship(member.relationship, member.tier);
      const rawRelationship = normalizeText(pickFirst(member, ['relationship', 'relation', 'member_relationship']));
      const expectedRelationship = relationshipExpectedForTier(member.tier);

      if (supportsRelationshipColumn && expectedRelationship && rawRelationship !== expectedRelationship) {
        patch.relationship = expectedRelationship;
      }

      if (primaryBase && primaryMember && Number(member.id) !== Number(primaryMember.id) && normalizedRelationship !== 'primary') {
        const currentHousehold = resolveHouseholdFromRecord(member);
        const currentBase = toTrimmedOrNull(currentHousehold.householdBaseNumber)
          || extractHouseholdBaseFromMemberNumber(currentHousehold.householdMemberNumber);
        let suffix = parseDependentSuffix(currentHousehold.dependentSuffix)
          ?? parseDependentSuffix(String(currentHousehold.householdMemberNumber || '').split('-').pop());

        if (!suffix || usedSuffixes.has(suffix)) {
          suffix = reserveNextSuffix();
        } else {
          usedSuffixes.add(suffix);
        }

        const nextMemberNumber = formatHouseholdMemberNumber(primaryBase, suffix);
        const needsRelink =
          currentBase !== primaryBase
          || String(currentHousehold.householdMemberNumber || '') !== nextMemberNumber
          || parseDependentSuffix(currentHousehold.dependentSuffix) !== suffix;

        if (needsRelink) {
          if (supportsHouseholdBaseColumn) {
            patch.household_base_number = primaryBase;
          }
          if (supportsHouseholdMemberColumn) {
            patch.household_member_number = nextMemberNumber;
          }
          if (supportsDependentSuffixColumn) {
            patch.dependent_suffix = suffix;
          }

          const linked = upsertHouseholdLink(member.metadata, member.registration_payload, {
            householdBaseNumber: primaryBase,
            householdMemberNumber: nextMemberNumber,
            dependentSuffix: suffix,
          });
          patch.metadata = linked.metadata;
          patch.registration_payload = linked.registrationPayload;
        }

        if (amountsDiffer(member.employer_amount, 0)) patch.employer_amount = '0.00';
        if (amountsDiffer(member.member_amount, 0)) patch.member_amount = '0.00';
        if (amountsDiffer(member.discount_amount, 0)) patch.discount_amount = '0.00';
        if (amountsDiffer(member.total_amount, 0)) patch.total_amount = '0.00';
      }

      if (normalizeMemberRelationship(member.relationship, member.tier) === 'primary') {
        const pricingPatch = buildPrimaryPricingPatch(group, member);
        if (pricingPatch) {
          if (amountsDiffer(member.employer_amount, pricingPatch.employer_amount)) {
            patch.employer_amount = pricingPatch.employer_amount;
          }
          if (amountsDiffer(member.member_amount, pricingPatch.member_amount)) {
            patch.member_amount = pricingPatch.member_amount;
          }
          if (amountsDiffer(member.discount_amount, pricingPatch.discount_amount)) {
            patch.discount_amount = pricingPatch.discount_amount;
          }
          if (amountsDiffer(member.total_amount, pricingPatch.total_amount)) {
            patch.total_amount = pricingPatch.total_amount;
          }
        }
      }

      const patchKeys = Object.keys(patch);
      if (!patchKeys.length) {
        continue;
      }

      if (patch.relationship) {
        stats.relationshipFixed += 1;
      }
      if (
        patch.household_base_number
        || patch.household_member_number
        || patch.dependent_suffix
        || patch.metadata
        || patch.registration_payload
      ) {
        stats.householdRelinked += 1;
      }
      if (patch.total_amount || patch.employer_amount || patch.member_amount) {
        stats.pricingFixed += 1;
      }

      if (!APPLY) {
        stats.membersChanged += 1;
        continue;
      }

      const { error } = await supabase
        .from('group_members')
        .update(patch)
        .eq('id', member.id);

      if (error) {
        stats.failed += 1;
        console.error(`[Repair] Failed member ${member.id} (${group.name}): ${error.message}`);
        continue;
      }

      stats.membersChanged += 1;
    }
  }

  console.log('\nRepair summary');
  console.log('==============');
  console.log(`Groups scanned: ${stats.groupsScanned}`);
  console.log(`Members scanned: ${stats.membersScanned}`);
  console.log(`Members changed: ${stats.membersChanged}`);
  console.log(`Relationship fixes: ${stats.relationshipFixed}`);
  console.log(`Household relinks: ${stats.householdRelinked}`);
  console.log(`Pricing fixes: ${stats.pricingFixed}`);
  console.log(`Failures: ${stats.failed}`);
  console.log(`Result mode: ${APPLY ? 'APPLY' : 'DRY RUN'}`);
}

main().catch((error) => {
  console.error('[Repair] Failed:', error.message || error);
  process.exit(1);
});
