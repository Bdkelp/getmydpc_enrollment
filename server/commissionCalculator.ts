export interface CommissionRate {
  planTier: string;
  planType: string;
  agentCommission: number;
  totalCost: number;
}

// Commission rates based on the provided table
// Plan Types: EE = Employee/Member Only, ESP = Employee+Spouse, ECH = Employee+Child, FAM = Family
const commissionRates: CommissionRate[] = [
  // MyPremierPlan Base
  { planTier: 'MyPremierPlan Base', planType: 'EE', agentCommission: 9.00, totalCost: 59.00 },
  { planTier: 'MyPremierPlan Base', planType: 'ESP', agentCommission: 15.00, totalCost: 99.00 },
  { planTier: 'MyPremierPlan Base', planType: 'ECH', agentCommission: 17.00, totalCost: 129.00 },
  { planTier: 'MyPremierPlan Base', planType: 'FAM', agentCommission: 17.00, totalCost: 149.00 },
  
  // MyPremierPlan+ (Plus)
  { planTier: 'MyPremierPlan+', planType: 'EE', agentCommission: 20.00, totalCost: 99.00 },
  { planTier: 'MyPremierPlan+', planType: 'ESP', agentCommission: 40.00, totalCost: 179.00 },
  { planTier: 'MyPremierPlan+', planType: 'ECH', agentCommission: 40.00, totalCost: 229.00 },
  { planTier: 'MyPremierPlan+', planType: 'FAM', agentCommission: 40.00, totalCost: 279.00 },
  
  // MyPremierPlan Elite
  { planTier: 'MyPremierPlan Elite', planType: 'EE', agentCommission: 20.00, totalCost: 119.00 },
  { planTier: 'MyPremierPlan Elite', planType: 'ESP', agentCommission: 40.00, totalCost: 209.00 },
  { planTier: 'MyPremierPlan Elite', planType: 'ECH', agentCommission: 40.00, totalCost: 279.00 },
  { planTier: 'MyPremierPlan Elite', planType: 'FAM', agentCommission: 40.00, totalCost: 349.00 },
];

// ProChoice Rx add-on commission: $2.50 for all plan types
export const RX_VALET_COMMISSION = 2.50;

export function calculateCommission(planName: string, memberType: string, addRxValet: boolean = false): { commission: number; totalCost: number } | null {
  // Determine plan tier from plan name
  let planTier = '';
  const planLower = planName.toLowerCase();
  
  if (planLower.includes('elite')) {
    planTier = 'MyPremierPlan Elite';
  } else if (planLower.includes('plus') || planLower.includes('+')) {
    planTier = 'MyPremierPlan+';
  } else if (planLower.includes('base')) {
    planTier = 'MyPremierPlan Base';
  } else {
    planTier = 'MyPremierPlan Base'; // Default to Base
  }
  
  // Map member type to plan type
  let planType = '';
  const memberTypeLower = memberType.toLowerCase();
  
  // EE = Employee/Member Only
  if (memberTypeLower.includes('member only') || memberTypeLower === 'employee' || memberTypeLower === 'individual' || memberTypeLower === 'ee') {
    planType = 'EE';
  } 
  // ESP = Employee + Spouse / Member/Spouse
  else if (memberTypeLower.includes('spouse') || memberTypeLower.includes('member/spouse') || memberTypeLower === 'couple' || memberTypeLower === 'esp') {
    planType = 'ESP';
  } 
  // ECH = Employee + Child / Member/Child
  else if (memberTypeLower.includes('child') || memberTypeLower.includes('member/child') || memberTypeLower === 'parent/child' || memberTypeLower === 'ech') {
    planType = 'ECH';
  } 
  // FAM = Family
  else if (memberTypeLower.includes('family') || memberTypeLower === 'fam') {
    planType = 'FAM';
  }
  else {
    planType = 'EE'; // Default to Employee/Member Only
  }
  
  // Find matching commission rate
  const rate = commissionRates.find(r => r.planTier === planTier && r.planType === planType);
  
  if (rate) {
    let baseCommission = rate.agentCommission;
    
    // Add ProChoice Rx commission if applicable
    if (addRxValet) {
      baseCommission += RX_VALET_COMMISSION;
    }
    
    return {
      commission: baseCommission,
      totalCost: rate.totalCost
    };
  }
  
  // Default fallback for unknown combinations
  console.warn(`No commission rate found for plan: ${planName}, member type: ${memberType}, planTier: ${planTier}, planType: ${planType}`);
  return null;
}

export function getPlanTierFromName(planName: string): string {
  const planLower = planName.toLowerCase();
  
  if (planLower.includes('elite')) {
    return 'MyPremierPlan Elite';
  } else if (planLower.includes('plus') || planLower.includes('+')) {
    return 'MyPremierPlan+';
  } else if (planLower.includes('base')) {
    return 'MyPremierPlan Base';
  } else {
    return 'MyPremierPlan Base'; // Default to Base
  }
}

export function getPlanTypeFromMemberType(memberType: string): string {
  const memberTypeLower = memberType.toLowerCase();
  
  // EE = Employee/Member Only
  if (memberTypeLower.includes('member only') || memberTypeLower === 'employee' || memberTypeLower === 'individual' || memberTypeLower === 'ee') {
    return 'EE';
  } 
  // ESP = Employee + Spouse / Member/Spouse
  else if (memberTypeLower.includes('spouse') || memberTypeLower.includes('member/spouse') || memberTypeLower === 'couple' || memberTypeLower === 'esp') {
    return 'ESP';
  } 
  // ECH = Employee + Child / Member/Child
  else if (memberTypeLower.includes('child') || memberTypeLower.includes('member/child') || memberTypeLower === 'parent/child' || memberTypeLower === 'ech') {
    return 'ECH';
  } 
  // FAM = Family
  else if (memberTypeLower.includes('family') || memberTypeLower === 'fam') {
    return 'FAM';
  }
  
  return 'EE'; // Default to Employee/Member Only
}