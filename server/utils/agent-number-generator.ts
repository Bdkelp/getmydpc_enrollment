
/**
 * Agent Number Generation Utility
 * Format: MPP + Role Code + Year + Last 4 SSN
 * Example: MPPSA231154 (MPP + SA + 23 + 1154)
 */

export interface AgentNumberComponents {
  companyCode: string; // "MPP" for MyPremierPlans
  roleCode: string;    // "SA" for Super Admin, "AG" for Agent
  year: string;        // Last 2 digits of current year
  ssnLast4: string;    // Last 4 digits of SSN
}

export function generateAgentNumber(role: string, ssnLast4: string): string {
  const currentYear = new Date().getFullYear().toString().slice(-2);
  const companyCode = "MPP";
  
  // Determine role code based on user role
  let roleCode: string;
  switch (role.toLowerCase()) {
    case 'admin':
      roleCode = 'SA'; // Super Admin
      break;
    case 'agent':
      roleCode = 'AG'; // Agent
      break;
    default:
      throw new Error('Invalid role for agent number generation. Only admin and agent roles can have agent numbers.');
  }

  // Validate SSN last 4 digits
  if (!ssnLast4 || ssnLast4.length !== 4 || !/^\d{4}$/.test(ssnLast4)) {
    throw new Error('SSN last 4 digits must be exactly 4 numeric characters');
  }

  return `${companyCode}${roleCode}${currentYear}${ssnLast4}`;
}

export function parseAgentNumber(agentNumber: string): AgentNumberComponents | null {
  const pattern = /^(MPP)(SA|AG)(\d{2})(\d{4})$/;
  const match = agentNumber.match(pattern);
  
  if (!match) {
    return null;
  }

  return {
    companyCode: match[1],
    roleCode: match[2],
    year: match[3],
    ssnLast4: match[4]
  };
}

export function validateAgentNumber(agentNumber: string): boolean {
  return parseAgentNumber(agentNumber) !== null;
}

export function getAgentNumberDescription(agentNumber: string): string {
  const components = parseAgentNumber(agentNumber);
  if (!components) {
    return 'Invalid agent number format';
  }

  const roleDescription = components.roleCode === 'SA' ? 'Super Admin' : 'Agent';
  const yearFull = `20${components.year}`;
  
  return `${components.companyCode} ${roleDescription} enrolled in ${yearFull} (SSN ending in ${components.ssnLast4})`;
}
