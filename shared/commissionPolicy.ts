export const COMMISSION_POLICY_VERSION = 'mpp-2026-03-v1';

export const commissionPolicy = {
  version: COMMISSION_POLICY_VERSION,
  effectiveFrom: '2026-03-01',
  effectiveThrough: '2027-02-28',
  writing: {
    cycles: ['1st', '15th'],
    payRule: 'first_friday_strictly_after_effective_date',
    federalHolidayAdjustment: 'prior_business_day',
    minimumThreshold: 25,
    carryForward: true,
  },
  overrides: {
    cycle: 'monthly',
    payRule: 'first_friday_following_earned_month',
    federalHolidayAdjustment: 'next_business_day',
    minimumThreshold: 25,
    carryForward: true,
  },
} as const;

export type CommissionPolicy = typeof commissionPolicy;
