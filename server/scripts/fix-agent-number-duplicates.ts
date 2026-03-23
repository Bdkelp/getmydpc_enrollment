#!/usr/bin/env node
/**
 * One-time fix for duplicate active agent numbers.
 *
 * Current targeted remediation requested:
 * - Teven Villarreal and Ana Vasquez both have MPP0006.
 * - Reassign Ana to MPP0002 only if no active agent already uses MPP0002.
 *
 * Run with:
 *   npm run fix:agent-duplicates
 */

import { supabase } from '../lib/supabaseClient';

type UserRow = {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  role: string | null;
  is_active: boolean | null;
  agent_number: string | null;
};

const TARGET_DUPLICATE = 'MPP0006';
const TARGET_REASSIGN = 'MPP0002';

async function loadUserByName(first: string, last: string): Promise<UserRow | null> {
  const { data, error } = await supabase
    .from('users')
    .select('id, email, first_name, last_name, role, is_active, agent_number')
    .ilike('first_name', first)
    .ilike('last_name', last)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load ${first} ${last}: ${error.message}`);
  }

  return (data as UserRow | null) ?? null;
}

async function getActiveAgentsByNumber(agentNumber: string): Promise<UserRow[]> {
  const normalized = agentNumber.trim().toUpperCase();

  const { data, error } = await supabase
    .from('users')
    .select('id, email, first_name, last_name, role, is_active, agent_number')
    .eq('role', 'agent')
    .eq('is_active', true)
    .eq('agent_number', normalized);

  if (error) {
    throw new Error(`Failed to check active agent number ${normalized}: ${error.message}`);
  }

  return (data as UserRow[] | null) ?? [];
}

async function setAgentNumber(userId: string, agentNumber: string): Promise<void> {
  const normalized = agentNumber.trim().toUpperCase();
  const { error } = await supabase
    .from('users')
    .update({ agent_number: normalized, updated_at: new Date().toISOString() })
    .eq('id', userId);

  if (error) {
    throw new Error(`Failed to update user ${userId} to ${normalized}: ${error.message}`);
  }
}

function fullName(user: UserRow | null): string {
  if (!user) return 'Unknown';
  return `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email || user.id;
}

async function main() {
  console.log('Checking duplicate active agent numbers...');

  const teven = await loadUserByName('Teven', 'Villarreal');
  const ana = await loadUserByName('Ana', 'Vasquez');

  if (!teven) {
    throw new Error('Teven Villarreal not found in users table.');
  }
  if (!ana) {
    throw new Error('Ana Vasquez not found in users table.');
  }

  console.log(`Found Teven: ${fullName(teven)} (${teven.email || 'no-email'}) -> ${teven.agent_number}`);
  console.log(`Found Ana:   ${fullName(ana)} (${ana.email || 'no-email'}) -> ${ana.agent_number}`);

  const activeDupes = await getActiveAgentsByNumber(TARGET_DUPLICATE);
  console.log(`Active agents currently using ${TARGET_DUPLICATE}: ${activeDupes.length}`);

  if (activeDupes.length > 0) {
    for (const row of activeDupes) {
      console.log(` - ${fullName(row)} (${row.email || row.id})`);
    }
  }

  const activeUsingTarget = await getActiveAgentsByNumber(TARGET_REASSIGN);

  const targetHeldByAnother = activeUsingTarget.some((u) => u.id !== ana.id);
  if (targetHeldByAnother) {
    console.log(`Cannot assign ${TARGET_REASSIGN} to Ana because another active agent already uses it:`);
    activeUsingTarget
      .filter((u) => u.id !== ana.id)
      .forEach((u) => console.log(` - ${fullName(u)} (${u.email || u.id})`));
    process.exit(2);
  }

  if (ana.agent_number?.toUpperCase() === TARGET_REASSIGN) {
    console.log(`Ana already has ${TARGET_REASSIGN}. No update required.`);
    process.exit(0);
  }

  await setAgentNumber(ana.id, TARGET_REASSIGN);

  const updatedAna = await loadUserByName('Ana', 'Vasquez');
  console.log(`Updated Ana to ${updatedAna?.agent_number || '(unknown)'}`);
  console.log('Done.');
}

main().catch((err) => {
  console.error('Agent number fix failed:', err.message);
  process.exit(1);
});
