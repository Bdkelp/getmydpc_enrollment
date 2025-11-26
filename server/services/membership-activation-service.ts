/**
 * Membership Activation Scheduler
 * 
 * Automatically activates memberships when their membership_start_date is reached
 * Runs daily to check for memberships that should transition from pending_activation to active
 */

import { supabase } from '../lib/supabaseClient';
import { isMembershipActive, parseDateFromDB } from '../utils/membership-dates';

/**
 * Activate memberships whose start date has been reached
 * Transitions status from 'pending_activation' to 'active'
 */
export async function activatePendingMemberships(): Promise<{
  activated: number;
  errors: number;
}> {
  const startTime = Date.now();
  let activatedCount = 0;
  let errorCount = 0;

  try {
    console.log('[Membership Activation] Starting daily activation check...');

    // Get all members with pending_activation status
    const { data: pendingMembers, error: fetchError } = await supabase
      .from('members')
      .select('id, email, first_name, last_name, membership_start_date, enrollment_date')
      .eq('status', 'pending_activation');

    if (fetchError) {
      console.error('[Membership Activation] Error fetching pending members:', fetchError);
      return { activated: 0, errors: 1 };
    }

    if (!pendingMembers || pendingMembers.length === 0) {
      console.log('[Membership Activation] No pending memberships found');
      return { activated: 0, errors: 0 };
    }

    console.log(`[Membership Activation] Found ${pendingMembers.length} pending memberships to check`);

    // Check each pending membership
    for (const member of pendingMembers) {
      try {
        if (!member.membership_start_date) {
          console.warn(`[Membership Activation] Member ${member.id} has no membership_start_date, skipping`);
          errorCount++;
          continue;
        }

        const membershipStartDate = new Date(member.membership_start_date);
        const shouldActivate = isMembershipActive(membershipStartDate);

        if (shouldActivate) {
          console.log(`[Membership Activation] Activating member ${member.id} (${member.email})`);
          console.log(`[Membership Activation] - Start date: ${membershipStartDate.toISOString()}`);
          console.log(`[Membership Activation] - Today: ${new Date().toISOString()}`);

          // Update member status to active
          const { error: updateError } = await supabase
            .from('members')
            .update({
              status: 'active',
              is_active: true,
              updated_at: new Date().toISOString()
            })
            .eq('id', member.id);

          if (updateError) {
            console.error(`[Membership Activation] Error activating member ${member.id}:`, updateError);
            errorCount++;
          } else {
            console.log(`[Membership Activation] ✅ Successfully activated member ${member.id}`);
            activatedCount++;

            // TODO: Send welcome email when membership activates
            // await sendMembershipActivationEmail(member.email, member.first_name);
          }
        } else {
          const daysUntil = Math.ceil(
            (membershipStartDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
          );
          console.log(`[Membership Activation] Member ${member.id} not yet ready (${daysUntil} days until ${membershipStartDate.toISOString().split('T')[0]})`);
        }
      } catch (memberError: any) {
        console.error(`[Membership Activation] Error processing member ${member.id}:`, memberError);
        errorCount++;
      }
    }

    const duration = Date.now() - startTime;
    console.log(`[Membership Activation] Completed in ${duration}ms`);
    console.log(`[Membership Activation] Results: ${activatedCount} activated, ${errorCount} errors`);

    return { activated: activatedCount, errors: errorCount };
  } catch (error: any) {
    console.error('[Membership Activation] Unhandled error:', error);
    return { activated: activatedCount, errors: errorCount + 1 };
  }
}

/**
 * Schedule daily membership activation check
 * Runs at 12:00 AM UTC (configurable via ACTIVATION_CHECK_HOUR env var)
 */
export function scheduleMembershipActivation(): void {
  const checkHourUTC = parseInt(process.env.ACTIVATION_CHECK_HOUR || '0', 10); // Default: midnight UTC
  
  console.log(`[Membership Activation] Scheduler initialized`);
  console.log(`[Membership Activation] Will run daily at ${checkHourUTC}:00 UTC`);

  // Calculate time until next run
  const now = new Date();
  const nextRun = new Date();
  nextRun.setUTCHours(checkHourUTC, 0, 0, 0);
  
  // If we've passed today's run time, schedule for tomorrow
  if (nextRun <= now) {
    nextRun.setUTCDate(nextRun.getUTCDate() + 1);
  }

  const msUntilNextRun = nextRun.getTime() - now.getTime();
  console.log(`[Membership Activation] Next run scheduled for: ${nextRun.toISOString()}`);
  console.log(`[Membership Activation] Time until next run: ${Math.round(msUntilNextRun / 1000 / 60)} minutes`);

  // Schedule first run
  setTimeout(() => {
    activatePendingMemberships();
    
    // Then run every 24 hours
    setInterval(activatePendingMemberships, 24 * 60 * 60 * 1000);
  }, msUntilNextRun);

  // Optional: Run immediately on startup if enabled
  if (process.env.RUN_ACTIVATION_ON_STARTUP === 'true') {
    console.log('[Membership Activation] Running initial activation check on startup...');
    activatePendingMemberships();
  }
}

/**
 * Manual trigger endpoint (for testing or admin use)
 */
export async function manualActivationTrigger(): Promise<{
  success: boolean;
  activated: number;
  errors: number;
}> {
  console.log('[Membership Activation] Manual trigger initiated');
  const result = await activatePendingMemberships();
  return {
    success: result.errors === 0,
    ...result
  };
}
