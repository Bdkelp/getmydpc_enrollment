/**
 * Group Enrollment Utilities and Constants
 * Extracted constants, types, and helper functions for group enrollment forms and workflows
 */

export type CensusTemplateConfig = {
  source: "default" | "custom";
  fileName: string;
  url?: string;
  mimeType?: string;
  base64?: string;
  updatedAt?: string;
};

export type CoveragePricingRow = {
  coverageLabel: string;
  monthlyPrice: number;
  agentCommission: number;
};

export const CENSUS_TEMPLATE_PATH = "/templates/MyPremierPlans_Census_Template.csv";

export const payorMixOptions = [
  { value: "full", label: "Employer Pays All" },
  { value: "member", label: "Member Pays All" },
  { value: "fixed", label: "Fixed Dollar Split" },
  { value: "percentage", label: "Percentage Split" },
];

export const preferredPaymentMethodOptions = [
  { value: "card", label: "Card" },
  { value: "ach", label: "ACH" },
];

export const paymentResponsibilityModeOptions = [
  { value: "group_invoice", label: "Employer Pays Group Invoice" },
  { value: "member_self_pay", label: "Employer Enables Only (Member Self-Pay)" },
  { value: "hybrid_split", label: "Hybrid (Employer + Member Split)" },
  { value: "payroll_external", label: "Payroll Deduction Managed Externally" },
];

export const INDUSTRY_NOT_SET_VALUE = "__not_set__";
export const INDUSTRY_OTHER_VALUE = "__other__";
export const industryOptions = [
  { value: "Healthcare", label: "Healthcare" },
  { value: "Logistics", label: "Logistics" },
  { value: "Retail", label: "Retail" },
  { value: "Manufacturing", label: "Manufacturing" },
  { value: "Construction", label: "Construction" },
  { value: "Hospitality", label: "Hospitality" },
  { value: "Professional Services", label: "Professional Services" },
  { value: "Technology", label: "Technology" },
  { value: "Education", label: "Education" },
  { value: "Nonprofit", label: "Nonprofit" },
  { value: "Government", label: "Government" },
  { value: "Other", label: "Other" },
];

export const statusOptions = [
  { value: "draft", label: "Draft" },
  { value: "ready", label: "Ready" },
  { value: "registered", label: "Registered" },
  { value: "terminated", label: "Terminated" },
];

export const tierLabels: Record<string, string> = {
  member: "Member Only",
  spouse: "Member + Spouse",
  child: "Member + Child(ren)",
  family: "Member + Family",
};

export const GROUP_COMMISSION_MATRIX: Record<string, CoveragePricingRow[]> = {
  base: [
    { coverageLabel: "Member Only (EE)", monthlyPrice: 59, agentCommission: 9 },
    { coverageLabel: "Member + Spouse (ESP)", monthlyPrice: 99, agentCommission: 15 },
    { coverageLabel: "Member + Child (ECH)", monthlyPrice: 129, agentCommission: 17 },
    { coverageLabel: "Family (FAM)", monthlyPrice: 149, agentCommission: 17 },
  ],
  plus: [
    { coverageLabel: "Member Only (EE)", monthlyPrice: 99, agentCommission: 20 },
    { coverageLabel: "Member + Spouse (ESP)", monthlyPrice: 179, agentCommission: 40 },
    { coverageLabel: "Member + Child (ECH)", monthlyPrice: 229, agentCommission: 40 },
    { coverageLabel: "Family (FAM)", monthlyPrice: 279, agentCommission: 40 },
  ],
  elite: [
    { coverageLabel: "Member Only (EE)", monthlyPrice: 119, agentCommission: 20 },
    { coverageLabel: "Member + Spouse (ESP)", monthlyPrice: 209, agentCommission: 40 },
    { coverageLabel: "Member + Child (ECH)", monthlyPrice: 279, agentCommission: 40 },
    { coverageLabel: "Family (FAM)", monthlyPrice: 349, agentCommission: 40 },
  ],
};

// Helper Functions
export const isPresetIndustryValue = (value: string): boolean =>
  industryOptions.some((option) => option.value.toLowerCase() === value.trim().toLowerCase());

export const derivePlanTierFromName = (planName: string): string => {
  const normalized = String(planName || "").toLowerCase();
  if (normalized.includes("elite")) return "Elite";
  if (normalized.includes("plus") || normalized.includes("+")) return "Plus";
  return "Base";
};

export const isMemberOnlyPlanName = (planName: string | undefined | null): boolean => {
  const normalized = String(planName || "").toLowerCase();
  return normalized.includes("member only") || /\(ee\)|\bee\b/.test(normalized);
};

export const normalizeRelationshipForPlan = (
  relationship: string,
  selectedPlanName: string,
): string => {
  if (isMemberOnlyPlanName(selectedPlanName)) {
    return "primary";
  }
  return relationship;
};

export const toPlanTierMatrixKey = (value: string | undefined | null): "base" | "plus" | "elite" => {
  const normalized = String(value || "").toLowerCase();
  if (normalized.includes("elite")) return "elite";
  if (normalized.includes("plus")) return "plus";
  return "base";
};

export const resolveCoverageBucketFromPlanName = (
  value: string,
): "member" | "spouse" | "child" | "family" | null => {
  const normalized = String(value || "").toLowerCase();

  if (!normalized) {
    return null;
  }

  if (
    normalized.includes("family") ||
    normalized.includes(" fam ") ||
    normalized.endsWith(" fam")
  ) {
    return "family";
  }

  if (normalized.includes("spouse")) {
    return "spouse";
  }

  if (normalized.includes("child") || normalized.includes("children")) {
    return "child";
  }

  if (normalized.includes("member only") || /\(ee\)|\bee\b/.test(normalized)) {
    return "member";
  }

  return null;
};

export const doesTierRequirePrimaryEmail = (tier: string | undefined | null): boolean => {
  const normalized = String(tier || "").trim().toLowerCase();
  return normalized !== "spouse" && normalized !== "child";
};
