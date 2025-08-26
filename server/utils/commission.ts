
export interface CommissionResult {
  commission: number;
  totalCost: number;
}

export function calculateCommission(planName: string, memberType: string): CommissionResult | null {
  const planType = getPlanTypeFromMemberType(memberType);
  const planTier = getPlanTierFromName(planName);
  
  // Commission rates based on plan type and tier
  const commissionRates: Record<string, Record<string, number>> = {
    individual: {
      basic: 30,
      premium: 35,
      family: 40
    },
    family: {
      basic: 40,
      premium: 45,
      family: 50
    }
  };
  
  // Plan costs (these should match your actual plan pricing)
  const planCosts: Record<string, Record<string, number>> = {
    individual: {
      basic: 79,
      premium: 99,
      family: 119
    },
    family: {
      basic: 149,
      premium: 179,
      family: 199
    }
  };
  
  const rate = commissionRates[planType]?.[planTier];
  const cost = planCosts[planType]?.[planTier];
  
  if (rate === undefined || cost === undefined) {
    return null;
  }
  
  return {
    commission: rate,
    totalCost: cost
  };
}

export function getPlanTypeFromMemberType(memberType: string): string {
  switch (memberType.toLowerCase()) {
    case 'individual':
    case 'single':
      return 'individual';
    case 'family':
    case 'couple':
      return 'family';
    default:
      return 'individual';
  }
}

export function getPlanTierFromName(planName: string): string {
  const name = planName.toLowerCase();
  
  if (name.includes('family')) {
    return 'family';
  } else if (name.includes('premium')) {
    return 'premium';
  } else {
    return 'basic';
  }
}
