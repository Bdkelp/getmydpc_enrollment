
/**
 * Agent Number Generation Utility
 * Format: MPP + Role Code + Year + Last 4 SSN
 * Example: MPPSA231154 (MPP + SA + 23 + 1154)
 */

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
