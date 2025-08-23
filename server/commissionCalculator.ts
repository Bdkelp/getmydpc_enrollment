export interface CommissionRate {
  planTier: string;
  planType: string;
  agentCommission: number;
  totalCost: number;
}

// Commission rates based on the provided table
const commissionRates: CommissionRate[] = [
  // MyPremierPlan
  { planTier: 'MyPremierPlan', planType: 'IE', agentCommission: 9.00, totalCost: 59.00 },
  { planTier: 'MyPremierPlan', planType: 'C', agentCommission: 15.00, totalCost: 99.00 },
  { planTier: 'MyPremierPlan', planType: 'CH', agentCommission: 17.00, totalCost: 129.00 },
  { planTier: 'MyPremierPlan', planType: 'AM', agentCommission: 17.00, totalCost: 149.00 },
  
  // MyPremierPlan Plus
  { planTier: 'MyPremierPlan Plus', planType: 'IE', agentCommission: 20.00, totalCost: 99.00 },
  { planTier: 'MyPremierPlan Plus', planType: 'C', agentCommission: 40.00, totalCost: 209.00 },
  { planTier: 'MyPremierPlan Plus', planType: 'CH', agentCommission: 40.00, totalCost: 229.00 },
  { planTier: 'MyPremierPlan Plus', planType: 'AM', agentCommission: 40.00, totalCost: 279.00 },
  
  // MyPremierElite Plan
  { planTier: 'MyPremierElite Plan', planType: 'IE', agentCommission: 20.00, totalCost: 119.00 },
  { planTier: 'MyPremierElite Plan', planType: 'C', agentCommission: 40.00, totalCost: 259.00 },
  { planTier: 'MyPremierElite Plan', planType: 'CH', agentCommission: 40.00, totalCost: 279.00 },
  { planTier: 'MyPremierElite Plan', planType: 'AM', agentCommission: 40.00, totalCost: 349.00 },
];

export function calculateCommission(planName: string, memberType: string): { commission: number; totalCost: number } | null {
  // Determine plan tier from plan name
  let planTier = '';
  if (planName.toLowerCase().includes('elite')) {
    planTier = 'MyPremierElite Plan';
  } else if (planName.toLowerCase().includes('plus')) {
    planTier = 'MyPremierPlan Plus';
  } else {
    planTier = 'MyPremierPlan';
  }
  
  // Map member type to plan type
  let planType = '';
  const memberTypeLower = memberType.toLowerCase();
  
  if (memberTypeLower === 'employee' || memberTypeLower === 'individual' || memberTypeLower === 'member only') {
    planType = 'IE';
  } else if (memberTypeLower === 'couple' || memberTypeLower === 'employee + spouse') {
    planType = 'C';
  } else if (memberTypeLower === 'child' || memberTypeLower === 'employee + child' || memberTypeLower === 'parent/child') {
    planType = 'CH';
  } else if (memberTypeLower === 'family' || memberTypeLower === 'employee + family' || memberTypeLower === 'adult member') {
    planType = 'AM';
  }
  
  // Find matching commission rate
  const rate = commissionRates.find(r => r.planTier === planTier && r.planType === planType);
  
  if (rate) {
    return {
      commission: rate.agentCommission,
      totalCost: rate.totalCost
    };
  }
  
  // Default fallback for unknown combinations
  console.warn(`No commission rate found for plan: ${planName}, member type: ${memberType}`);
  return null;
}

export function getPlanTierFromName(planName: string): string {
  if (planName.toLowerCase().includes('elite')) {
    return 'MyPremierElite Plan';
  } else if (planName.toLowerCase().includes('plus')) {
    return 'MyPremierPlan Plus';
  } else {
    return 'MyPremierPlan';
  }
}

export function getPlanTypeFromMemberType(memberType: string): string {
  const memberTypeLower = memberType.toLowerCase();
  
  if (memberTypeLower === 'employee' || memberTypeLower === 'individual' || memberTypeLower === 'member only') {
    return 'IE';
  } else if (memberTypeLower === 'couple' || memberTypeLower === 'employee + spouse') {
    return 'C';
  } else if (memberTypeLower === 'child' || memberTypeLower === 'employee + child' || memberTypeLower === 'parent/child') {
    return 'CH';
  } else if (memberTypeLower === 'family' || memberTypeLower === 'employee + family' || memberTypeLower === 'adult member') {
    return 'AM';
  }
  
  return 'IE'; // Default to individual/employee
}