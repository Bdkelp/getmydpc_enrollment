// Commission rates by plan and type
export const commissionRates = {
  base: {
    member: 9.00,
    memSpouse: 15.00,
    memChildren: 17.00,
    family: 17.00
  },
  plus: {
    member: 20.00,
    memSpouse: 40.00,
    memChildren: 40.00,
    family: 40.00
  },
  elite: {
    member: 20.00,
    memSpouse: 40.00,
    memChildren: 40.00,
    family: 40.00
  },
  rx: {
    member: 2.50,
    memSpouse: 2.50,
    memChildren: 2.50,
    family: 2.50
  }
};

/**
 * Gets the plan tier from the plan name
 * @param planName - Full plan name from database
 * @returns Plan tier (base, plus, elite)
 */
export function getPlanTier(planName: string): 'base' | 'plus' | 'elite' | null {
  const lowerName = planName.toLowerCase();
  if (lowerName.includes('base')) return 'base';
  if (lowerName.includes('plus')) return 'plus';
  if (lowerName.includes('elite')) return 'elite';
  return null;
}

/**
 * Normalizes member type to match commission structure
 * @param memberType - Member type from database
 * @returns Normalized member type key
 */
export function normalizeMemberType(memberType: string): 'member' | 'memSpouse' | 'memChildren' | 'family' {
  const normalized = memberType.toLowerCase().replace(/[^a-z]/g, '');
  
  if (normalized.includes('spouse') || normalized === 'memspouse') return 'memSpouse';
  if (normalized.includes('children') || normalized === 'memchildren') return 'memChildren';
  if (normalized.includes('family')) return 'family';
  return 'member'; // Default to member only
}

/**
 * Calculates commission for a single enrollment
 * @param planName - Full plan name
 * @param memberType - Member type (e.g., "Member only", "Mem/Spouse", etc.)
 * @param hasRx - Whether RxValet is included
 * @returns Commission amount
 */
export function calculateEnrollmentCommission(
  planName: string,
  memberType: string,
  hasRx: boolean = false
): number {
  const tier = getPlanTier(planName);
  if (!tier) return 0;
  
  const normalizedType = normalizeMemberType(memberType);
  const baseCommission = commissionRates[tier][normalizedType] || 0;
  const rxCommission = hasRx ? commissionRates.rx[normalizedType] || 0 : 0;
  
  return baseCommission + rxCommission;
}

/**
 * Calculates total commission for multiple enrollments
 * @param enrollments - Array of enrollment objects with plan and member info
 * @returns Total commission amount
 */
export function calculateTotalCommission(enrollments: Array<{
  planName: string;
  memberType: string;
  hasRx?: boolean;
}>): number {
  return enrollments.reduce((total, enrollment) => {
    return total + calculateEnrollmentCommission(
      enrollment.planName,
      enrollment.memberType,
      enrollment.hasRx
    );
  }, 0);
}