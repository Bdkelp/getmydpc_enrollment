import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { hasAtLeastRole } from "@/lib/roles";
import { apiRequest } from "@/lib/queryClient";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { formatDistanceToNow } from "date-fns";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertTriangle,
  Plus,
  Users,
  Layers,
  CheckCircle2,
  ArrowLeft,
  UserPlus,
  Pencil,
  Trash2,
  ClipboardCheck,
  Upload,
  Download,
} from "lucide-react";

const CENSUS_TEMPLATE_PATH = "/templates/MyPremierPlans_Census_Template.csv";

type CensusTemplateConfig = {
  source: "default" | "custom";
  fileName: string;
  url?: string;
  mimeType?: string;
  base64?: string;
  updatedAt?: string;
};

const payorMixOptions = [
  { value: "full", label: "Employer Pays All" },
  { value: "member", label: "Member Pays All" },
  { value: "fixed", label: "Fixed Dollar Split" },
  { value: "percentage", label: "Percentage Split" },
];

const preferredPaymentMethodOptions = [
  { value: "card", label: "Card" },
  { value: "ach", label: "ACH" },
];

const paymentResponsibilityModeOptions = [
  { value: "group_invoice", label: "Employer Pays Group Invoice" },
  { value: "member_self_pay", label: "Employer Enables Only (Member Self-Pay)" },
  { value: "hybrid_split", label: "Hybrid (Employer + Member Split)" },
  { value: "payroll_external", label: "Payroll Deduction Managed Externally" },
];

const INDUSTRY_NOT_SET_VALUE = "__not_set__";
const INDUSTRY_OTHER_VALUE = "__other__";
const industryOptions = [
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

const isPresetIndustryValue = (value: string): boolean =>
  industryOptions.some((option) => option.value.toLowerCase() === value.trim().toLowerCase());

const statusOptions = [
  { value: "draft", label: "Draft" },
  { value: "ready", label: "Ready" },
  { value: "registered", label: "Registered" },
  { value: "terminated", label: "Terminated" },
];

const tierLabels: Record<string, string> = {
  member: "Member Only",
  spouse: "Member + Spouse",
  child: "Member + Child(ren)",
  family: "Member + Family",
};

const doesTierRequirePrimaryEmail = (tier: string | undefined | null): boolean => {
  const normalized = String(tier || "").trim().toLowerCase();
  return normalized !== "spouse" && normalized !== "child";
};

const isPrimaryRelationshipValue = (relationship: string | undefined | null): boolean => {
  const normalized = String(relationship || "").trim().toLowerCase();
  if (!normalized) return true;
  if (normalized === "primary") return true;
  if (normalized === "spouse" || normalized === "dependent" || normalized === "child") return false;
  return true;
};

const deriveTierFromRelationship = (relationship: string | undefined | null, fallbackTier = "member"): string => {
  const normalized = String(relationship || "").trim().toLowerCase();
  if (normalized === "spouse") return "spouse";
  if (normalized === "dependent" || normalized === "child") return "child";
  if (isPrimaryRelationshipValue(normalized)) return "member";
  return fallbackTier || "member";
};

const formatRelationshipLabel = (value?: string | null): string => {
  if (!value) return "Primary";
  const normalized = value.trim().toLowerCase();
  if (!normalized) return "Primary";
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
};

const getDisplayRelationshipLabel = (member: Pick<GroupMemberRecord, "relationship" | "tier">): string => {
  if (member.relationship && String(member.relationship).trim()) {
    return formatRelationshipLabel(member.relationship);
  }

  if (member.tier === "spouse") return "Spouse";
  if (member.tier === "child") return "Dependent";
  return "Primary";
};

const formatHouseholdMemberNumber = (member: GroupMemberRecord): string => {
  if (member.householdMemberNumber) return member.householdMemberNumber;
  if (member.householdBaseNumber && member.dependentSuffix !== null && member.dependentSuffix !== undefined) {
    return `${member.householdBaseNumber}-${member.dependentSuffix}`;
  }
  return member.householdBaseNumber || "-";
};

const formatMemberPhone = (value?: string | null): string => {
  if (!value) return "-";
  const digits = value.replace(/\D/g, "");
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return value;
};

const formatMemberDateOfBirth = (value?: string | null): string => {
  if (!value) return "-";

  const digits = value.replace(/\D/g, "");
  if (digits.length === 8) {
    return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
  }

  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    const month = `${parsed.getMonth() + 1}`.padStart(2, "0");
    const day = `${parsed.getDate()}`.padStart(2, "0");
    const year = parsed.getFullYear();
    return `${month}/${day}/${year}`;
  }

  return value;
};

const formatCurrencyDisplay = (value?: string | null): string => {
  if (value === null || value === undefined || value === "") {
    return "-";
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return value;
  }

  return `$${numeric.toFixed(2)}`;
};

const parseCurrencyValue = (value?: string | null): number => {
  if (value === null || value === undefined || value === "") {
    return 0;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};

type GroupRecord = {
  id: string;
  name: string;
  groupType?: string | null;
  payorType: string;
  discountCode?: string | null;
  status: string;
  createdAt?: string | null;
  updatedAt?: string | null;
  hostedCheckoutLink?: string | null;
  hostedCheckoutStatus?: string | null;
  registrationCompletedAt?: string | null;
  metadata?: Record<string, any> | null;
  groupProfileComplete?: boolean;
  currentAssignedAgentId?: string | null;
  originalAssignedAgentId?: string | null;
  hasReassignmentHistory?: boolean;
};

type GroupAssignmentHistoryRecord = {
  id: number;
  old_agent_id?: string | null;
  new_agent_id?: string | null;
  changed_by?: string | null;
  changed_at?: string | null;
  effective_date?: string | null;
  reason?: string | null;
  notes?: string | null;
  transfer_linked_employees?: boolean;
  transfer_open_workflows?: boolean;
  previous_agent_read_only?: boolean;
  cascade_summary?: {
    linkedEmployeesTransferred?: number;
    openWorkflowsTransferred?: number;
  } | null;
};

type GroupProfile = {
  ein: string;
  selectedPlanId: string;
  selectedPlanName: string;
  selectedPlanTier: string;
  pbmProgram: string;
  pbmEnabled: boolean;
  pbmAmount: string;
  businessAddressLine1: string;
  businessAddressLine2: string;
  businessCity: string;
  businessState: string;
  businessZipCode: string;
  responsiblePersonName: string;
  responsiblePersonEmail: string;
  responsiblePersonPhone: string;
  contactPersonName: string;
  contactPersonEmail: string;
  contactPersonPhone: string;
  payorMixMode: "full" | "member" | "fixed" | "percentage";
  employerFixedAmount: string;
  memberFixedAmount: string;
  employerPercentage: string;
  memberPercentage: string;
  paymentResponsibilityMode: "group_invoice" | "member_self_pay" | "hybrid_split" | "payroll_external";
  preferredPaymentMethod: "card" | "ach";
  achRoutingNumber: string;
  achAccountNumber: string;
  achBankName: string;
  achAccountType: "checking" | "savings";
};

type GroupProfileContext = {
  profile: {
    ein: string | null;
    planSelection: {
      planId: number | null;
      planName: string | null;
      planTier: string | null;
      pbmProgram: string | null;
      pbmEnabled: boolean | null;
      pbmAmount: number | null;
    };
    businessAddress: {
      line1: string | null;
      line2: string | null;
      city: string | null;
      state: string | null;
      zipCode: string | null;
    };
    responsiblePerson: { name: string | null; email: string | null; phone: string | null };
    contactPerson: { name: string | null; email: string | null; phone: string | null };
    payorMix: {
      mode: "full" | "member" | "fixed" | "percentage";
      employerFixedAmount: string | null;
      memberFixedAmount: string | null;
      employerPercentage: number | null;
      memberPercentage: number | null;
    };
    paymentResponsibilityMode: "group_invoice" | "member_self_pay" | "hybrid_split" | "payroll_external";
    preferredPaymentMethod: "card" | "ach" | null;
    achDetails: {
      routingNumber: string | null;
      accountNumber: string | null;
      bankName: string | null;
      accountType: string | null;
    };
  };
  isComplete: boolean;
  missingFields: string[];
};

type GroupDetailResponse = {
  data: GroupRecord;
  members?: GroupMemberRecord[];
  groupFinancialSummary?: {
    asOf: string;
    activeMemberCount: number;
    terminatedMemberCount: number;
    monthlyRevenue: number;
    yearlyProjectedRevenue: number;
    projectedMonthlyCommission: number;
    projectedYearlyCommission: number;
    employerTotal: number;
    memberTotal: number;
    discountTotal: number;
  };
  assignmentHistory?: GroupAssignmentHistoryRecord[];
  effectiveDateContext?: GroupEffectiveDateContext;
  groupProfileContext?: GroupProfileContext;
};

type GroupReassignmentFormState = {
  newAgentId: string;
  effectiveDate: string;
  reason: string;
  notes: string;
  transferOpenWorkflows: boolean;
  previousAgentReadOnly: boolean;
};

type GroupSetupFormState = {
  name: string;
  groupType: string;
  industry: string;
  discountCode: string;
};

type GroupEffectiveDateContext = {
  availableEffectiveDates: string[];
  defaultEffectiveDate: string | null;
  selectedEffectiveDate: string | null;
  isOverride: boolean;
  overrideReason: string | null;
  canOverride: boolean;
};

type GroupMemberRecord = {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  middleName?: string | null;
  suffix?: string | null;
  preferredName?: string | null;
  sex?: string | null;
  phone?: string | null;
  dateOfBirth?: string | null;
  tier: string;
  relationship?: string | null;
  householdBaseNumber?: string | null;
  householdMemberNumber?: string | null;
  dependentSuffix?: number | null;
  terminatedAt?: string | null;
  status?: string | null;
  paymentStatus?: string | null;
  registeredAt?: string | null;
  payorType?: string | null;
  employerAmount?: string | null;
  memberAmount?: string | null;
  discountAmount?: string | null;
  totalAmount?: string | null;
  metadata?: Record<string, any> | null;
  registrationPayload?: Record<string, any> | null;
  ssn?: string | null;
  hasSsn?: boolean;
};

type GroupDocumentRecord = {
  id: string;
  type: string;
  fileName: string;
  contentType?: string;
  sizeBytes?: number;
  uploadedAt?: string;
  uploadedBy?: string;
  uploadedByRole?: string;
};

type AgentOption = {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  agentNumber?: string | null;
  isActive?: boolean;
};

type MemberFormState = {
  id?: number;
  relationship: string;
  firstName: string;
  middleName: string;
  lastName: string;
  suffix: string;
  preferredName: string;
  dateOfBirth: string;
  sex: string;
  hireDate: string;
  className: string;
  department: string;
  division: string;
  businessUnit: string;
  workEmail: string;
  personalEmail: string;
  payrollGroup: string;
  annualBaseSalary: string;
  hoursPerWeek: string;
  salaryEffectiveDate: string;
  address1: string;
  address2: string;
  city: string;
  state: string;
  zipCode: string;
  county: string;
  country: string;
  homePhone: string;
  mobilePhone: string;
  workPhone: string;
  employmentType: string;
  jobTitle: string;
  retireDate: string;
  originalHireDate: string;
  terminationDate: string;
  terminationReason: string;
  rehireDate: string;
  ssn: string;
  selectedPlanId: string;
  selectedPlanName: string;
  selectedPlanTier: string;
  pbmEnabled: boolean;
  pbmAmount: string;
  tier: string;
  payorType: string;
  status: string;
};

type EmploymentProfileState = {
  middleName: string;
  suffix: string;
  preferredName: string;
  sex: string;
  hireDate: string;
  className: string;
  department: string;
  division: string;
  businessUnit: string;
  workEmail: string;
  personalEmail: string;
  payrollGroup: string;
  annualBaseSalary: string;
  hoursPerWeek: string;
  salaryEffectiveDate: string;
  address1: string;
  address2: string;
  city: string;
  state: string;
  zipCode: string;
  county: string;
  country: string;
  homePhone: string;
  mobilePhone: string;
  workPhone: string;
  employmentType: string;
  jobTitle: string;
  retireDate: string;
  originalHireDate: string;
  terminationDate: string;
  terminationReason: string;
  rehireDate: string;
};

const REQUIRED_MEMBER_PROFILE_FIELDS: Array<keyof EmploymentProfileState> = [
  "sex",
  "hireDate",
  "className",
  "division",
  "payrollGroup",
  "annualBaseSalary",
  "hoursPerWeek",
  "salaryEffectiveDate",
  "address1",
  "address2",
  "city",
  "state",
  "zipCode",
  "mobilePhone",
  "employmentType",
  "originalHireDate",
];

const OPTIONAL_EMPTY_TOKENS = new Set([
  "n/a",
  "na",
  "none",
  "null",
  "not applicable",
  "not available",
]);

const normalizeOptionalEmailInput = (value: unknown): string => {
  const normalized = sanitizeImportValue(value).toLowerCase();
  if (!normalized || OPTIONAL_EMPTY_TOKENS.has(normalized)) {
    return "";
  }
  return normalized;
};

const REQUIRED_DEPENDENT_PROFILE_FIELDS: Array<keyof EmploymentProfileState> = [
  "sex",
];

const REQUIRED_MEMBER_BASE_FIELDS: Array<keyof Pick<MemberFormState, "relationship" | "firstName" | "lastName" | "dateOfBirth">> = [
  "relationship",
  "firstName",
  "lastName",
  "dateOfBirth",
];

const emptyEmploymentProfile: EmploymentProfileState = {
  middleName: "",
  suffix: "",
  preferredName: "",
  sex: "",
  hireDate: "",
  className: "",
  department: "",
  division: "",
  businessUnit: "",
  workEmail: "",
  personalEmail: "",
  payrollGroup: "",
  annualBaseSalary: "",
  hoursPerWeek: "",
  salaryEffectiveDate: "",
  address1: "",
  address2: "",
  city: "",
  state: "",
  zipCode: "",
  county: "",
  country: "",
  homePhone: "",
  mobilePhone: "",
  workPhone: "",
  employmentType: "",
  jobTitle: "",
  retireDate: "",
  originalHireDate: "",
  terminationDate: "",
  terminationReason: "",
  rehireDate: "",
};

const toEmploymentProfile = (member: GroupMemberRecord | null | undefined): EmploymentProfileState => {
  const toRecord = (value: unknown): Record<string, unknown> => (
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {}
  );
  const toStringValue = (...values: unknown[]): string => {
    for (const value of values) {
      if (typeof value === "string") {
        return value;
      }
    }
    return "";
  };

  const metadata = toRecord(member?.metadata);
  const registrationPayload = toRecord(member?.registrationPayload);
  const metadataEmployment = toRecord(metadata.employmentProfile);
  const payloadEmployment = toRecord(registrationPayload.employmentProfile);
  // Merge nested profile first, then legacy top-level census payload keys as fallback.
  const source = {
    ...registrationPayload,
    ...metadata,
    ...payloadEmployment,
    ...metadataEmployment,
  } as Record<string, unknown>;

  return {
    ...emptyEmploymentProfile,
    middleName: toStringValue(source.middleName, source.middle_name),
    suffix: toStringValue(source.suffix),
    preferredName: toStringValue(source.preferredName, source.preferred_name),
    sex: toStringValue(source.sex, source.gender),
    hireDate: toStringValue(source.hireDate, source.hire_date),
    className: toStringValue(source.className, source.class_name, source.class),
    department: toStringValue(source.department),
    division: toStringValue(source.division),
    businessUnit: toStringValue(source.businessUnit, source.business_unit),
    workEmail: toStringValue(source.workEmail, source.work_email, source.email),
    personalEmail: toStringValue(source.personalEmail, source.personal_email),
    payrollGroup: toStringValue(source.payrollGroup, source.payroll_group),
    annualBaseSalary: toStringValue(source.annualBaseSalary, source.annual_base_salary),
    hoursPerWeek: toStringValue(source.hoursPerWeek, source.hours_per_week),
    salaryEffectiveDate: toStringValue(source.salaryEffectiveDate, source.salary_effective_date),
    address1: toStringValue(source.address1, source.address_1, source.address),
    address2: toStringValue(source.address2, source.address_2),
    city: toStringValue(source.city),
    state: toStringValue(source.state),
    zipCode: toStringValue(source.zipCode, source.zip_code, source.zip),
    county: toStringValue(source.county),
    country: toStringValue(source.country),
    homePhone: toStringValue(source.homePhone, source.home_phone),
    mobilePhone: toStringValue(source.mobilePhone, source.mobile_phone, source.phone),
    workPhone: toStringValue(source.workPhone, source.work_phone),
    employmentType: toStringValue(source.employmentType, source.employment_type),
    jobTitle: toStringValue(source.jobTitle, source.job_title),
    retireDate: toStringValue(source.retireDate, source.retire_date),
    originalHireDate: toStringValue(source.originalHireDate, source.original_hire_date),
    terminationDate: toStringValue(source.terminationDate, source.termination_date),
    terminationReason: toStringValue(source.terminationReason, source.termination_reason),
    rehireDate: toStringValue(source.rehireDate, source.rehire_date),
  };
};

const collectMissingMemberFields = (form: MemberFormState): string[] => {
  const missing: string[] = [];
  const requiredProfileFields = isPrimaryRelationshipValue(form.relationship)
    ? REQUIRED_MEMBER_PROFILE_FIELDS
    : REQUIRED_DEPENDENT_PROFILE_FIELDS;

  REQUIRED_MEMBER_BASE_FIELDS.forEach((fieldName) => {
    if (!String(form[fieldName] || "").trim()) {
      missing.push(fieldName);
    }
  });

  requiredProfileFields.forEach((fieldName) => {
    if (!String(form[fieldName] || "").trim()) {
      missing.push(fieldName);
    }
  });

  return missing;
};

const isMemberCompleteForEnrollment = (member: GroupMemberRecord): boolean => {
  const employment = toEmploymentProfile(member);
  const requiredProfileFields = isPrimaryRelationshipValue(member.relationship)
    ? REQUIRED_MEMBER_PROFILE_FIELDS
    : REQUIRED_DEPENDENT_PROFILE_FIELDS;

  if (!String(member.relationship || "").trim()) return false;
  if (!String(member.firstName || "").trim()) return false;
  if (!String(member.lastName || "").trim()) return false;
  if (!String(member.dateOfBirth || "").trim()) return false;

  return requiredProfileFields.every((fieldName) => String(employment[fieldName] || "").trim().length > 0);
};

type DiscountValidationState = {
  code: string;
  isValid: boolean;
  message?: string;
  discountType?: string;
  durationType?: string;
};

type CensusImportRow = {
  firstName: string;
  lastName: string;
  email: string;
  ssn?: string;
  employeeSsn?: string;
  dependentSsn?: string;
  relationship?: string;
  householdBaseNumber?: string;
  householdMemberNumber?: string;
  dependentSuffix?: string;
  phone?: string;
  dateOfBirth?: string;
  tier: string;
  payorType?: string;
  status?: string;
  employerAmount?: string;
  memberAmount?: string;
  discountAmount?: string;
  totalAmount?: string;
  registrationPayload?: Record<string, unknown>;
};

type BulkImportFailedRow = {
  row: number;
  email?: string;
  reason: string;
  sourceRow?: CensusImportRow;
};

const IN_HOUSE_AGENT_OPTION_VALUE = "__in_house_admin_serviced__";

const defaultGroupProfileForm: GroupProfile = {
  ein: "",
  selectedPlanId: "",
  selectedPlanName: "",
  selectedPlanTier: "",
  pbmProgram: "BestChoice Rx Pro Premium-5 Medication Program (optional add-on)",
  pbmEnabled: false,
  pbmAmount: "",
  businessAddressLine1: "",
  businessAddressLine2: "",
  businessCity: "",
  businessState: "",
  businessZipCode: "",
  responsiblePersonName: "",
  responsiblePersonEmail: "",
  responsiblePersonPhone: "",
  contactPersonName: "",
  contactPersonEmail: "",
  contactPersonPhone: "",
  payorMixMode: "full",
  employerFixedAmount: "",
  memberFixedAmount: "",
  employerPercentage: "",
  memberPercentage: "",
  paymentResponsibilityMode: "group_invoice",
  preferredPaymentMethod: "card",
  achRoutingNumber: "",
  achAccountNumber: "",
  achBankName: "",
  achAccountType: "checking",
};

type PlanCatalogItem = {
  id: number;
  name: string;
  price: number | null;
  billingPeriod: string;
  features: string[];
};

type CoveragePricingRow = {
  coverageLabel: string;
  monthlyPrice: number;
  agentCommission: number;
};

const GROUP_COMMISSION_MATRIX: Record<string, CoveragePricingRow[]> = {
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

const derivePlanTierFromName = (planName: string): string => {
  const normalized = String(planName || "").toLowerCase();
  if (normalized.includes("elite")) return "Elite";
  if (normalized.includes("plus") || normalized.includes("+")) return "Plus";
  return "Base";
};

const isMemberOnlyPlanName = (planName: string | undefined | null): boolean => {
  const normalized = String(planName || "").toLowerCase();
  return normalized.includes("member only") || /\(ee\)|\bee\b/.test(normalized);
};

const normalizeRelationshipForPlan = (
  relationship: string,
  selectedPlanName: string,
): string => {
  if (isMemberOnlyPlanName(selectedPlanName)) {
    return "primary";
  }
  return relationship;
};

const toPlanTierMatrixKey = (value: string | undefined | null): "base" | "plus" | "elite" => {
  const normalized = String(value || "").toLowerCase();
  if (normalized.includes("elite")) return "elite";
  if (normalized.includes("plus")) return "plus";
  return "base";
};

const resolveMemberCoverageMonthlyPrice = (
  relationship: string,
  selectedPlanTier: string,
  selectedPlanName: string,
): number | null => {
  const tierValue = selectedPlanTier || (selectedPlanName ? derivePlanTierFromName(selectedPlanName) : "");
  if (!tierValue) return null;

  const rows = GROUP_COMMISSION_MATRIX[toPlanTierMatrixKey(tierValue)] || [];
  const normalizedRelationship = String(
    normalizeRelationshipForPlan(relationship, selectedPlanName) || "",
  ).trim().toLowerCase();

  if (normalizedRelationship === "spouse") {
    return rows.find((row) => row.coverageLabel.includes("Spouse"))?.monthlyPrice ?? null;
  }

  if (normalizedRelationship === "dependent" || normalizedRelationship === "child") {
    return rows.find((row) => row.coverageLabel.includes("Child"))?.monthlyPrice ?? null;
  }

  return rows.find((row) => row.coverageLabel.includes("Member Only"))?.monthlyPrice ?? null;
};

const derivePayorTypeFromMode = (mode: GroupProfile["payorMixMode"]): string => {
  if (mode === "full") return "full";
  if (mode === "member") return "member";
  return "mixed";
};

const derivePayorTypeFromPaymentResponsibility = (mode: GroupProfile["paymentResponsibilityMode"]): string => {
  if (mode === "group_invoice" || mode === "payroll_external") return "full";
  if (mode === "member_self_pay") return "member";
  return "mixed";
};

const mapGroupProfileContextToForm = (ctx?: GroupProfileContext): GroupProfile => {
  if (!ctx?.profile) return { ...defaultGroupProfileForm };
  return {
    ein: ctx.profile.ein || "",
    selectedPlanId:
      ctx.profile.planSelection?.planId === null || ctx.profile.planSelection?.planId === undefined
        ? ""
        : String(ctx.profile.planSelection.planId),
    selectedPlanName: ctx.profile.planSelection?.planName || "",
    selectedPlanTier: ctx.profile.planSelection?.planTier || "",
    pbmProgram: ctx.profile.planSelection?.pbmProgram || defaultGroupProfileForm.pbmProgram,
    pbmEnabled: Boolean(ctx.profile.planSelection?.pbmEnabled),
    pbmAmount:
      ctx.profile.planSelection?.pbmAmount === null || ctx.profile.planSelection?.pbmAmount === undefined
        ? ""
        : String(ctx.profile.planSelection.pbmAmount),
    businessAddressLine1: ctx.profile.businessAddress?.line1 || "",
    businessAddressLine2: ctx.profile.businessAddress?.line2 || "",
    businessCity: ctx.profile.businessAddress?.city || "",
    businessState: ctx.profile.businessAddress?.state || "",
    businessZipCode: ctx.profile.businessAddress?.zipCode || "",
    responsiblePersonName: ctx.profile.responsiblePerson?.name || "",
    responsiblePersonEmail: ctx.profile.responsiblePerson?.email || "",
    responsiblePersonPhone: ctx.profile.responsiblePerson?.phone || "",
    contactPersonName: ctx.profile.contactPerson?.name || "",
    contactPersonEmail: ctx.profile.contactPerson?.email || "",
    contactPersonPhone: ctx.profile.contactPerson?.phone || "",
    payorMixMode: ctx.profile.payorMix?.mode || "full",
    employerFixedAmount: ctx.profile.payorMix?.employerFixedAmount || "",
    memberFixedAmount: ctx.profile.payorMix?.memberFixedAmount || "",
    employerPercentage:
      ctx.profile.payorMix?.employerPercentage === null || ctx.profile.payorMix?.employerPercentage === undefined
        ? ""
        : String(ctx.profile.payorMix.employerPercentage),
    memberPercentage:
      ctx.profile.payorMix?.memberPercentage === null || ctx.profile.payorMix?.memberPercentage === undefined
        ? ""
        : String(ctx.profile.payorMix.memberPercentage),
      paymentResponsibilityMode: ctx.profile.paymentResponsibilityMode || "group_invoice",
    preferredPaymentMethod: ctx.profile.preferredPaymentMethod || "card",
    achRoutingNumber: ctx.profile.achDetails?.routingNumber || "",
    achAccountNumber: ctx.profile.achDetails?.accountNumber || "",
    achBankName: ctx.profile.achDetails?.bankName || "",
    achAccountType: (ctx.profile.achDetails?.accountType as "checking" | "savings") || "checking",
  };
};

const buildGroupProfilePayload = (form: GroupProfile) => ({
  ein: form.ein,
  planSelection: {
    planId: form.selectedPlanId ? Number(form.selectedPlanId) : null,
    planName: form.selectedPlanName,
    planTier: form.selectedPlanTier,
    pbmProgram: form.pbmProgram,
    pbmEnabled: form.pbmEnabled,
    pbmAmount: form.pbmAmount.trim() ? Number(form.pbmAmount) : null,
  },
  businessAddress: {
    line1: form.businessAddressLine1,
    line2: form.businessAddressLine2,
    city: form.businessCity,
    state: form.businessState,
    zipCode: form.businessZipCode,
  },
  responsiblePerson: {
    name: form.responsiblePersonName,
    email: form.responsiblePersonEmail,
    phone: form.responsiblePersonPhone,
  },
  contactPerson: {
    name: form.contactPersonName,
    email: form.contactPersonEmail,
    phone: form.contactPersonPhone,
  },
  payorMix: {
    mode: form.payorMixMode,
    employerFixedAmount: form.employerFixedAmount,
    memberFixedAmount: form.memberFixedAmount,
    employerPercentage: form.employerPercentage,
    memberPercentage: form.memberPercentage,
  },
  paymentResponsibilityMode: form.paymentResponsibilityMode,
  preferredPaymentMethod: form.preferredPaymentMethod,
  achDetails: {
    routingNumber: form.achRoutingNumber,
    accountNumber: form.achAccountNumber,
    bankName: form.achBankName,
    accountType: form.achAccountType,
  },
});

const getAssignedAgentIdFromMetadata = (metadata?: Record<string, any> | null): string => {
  const assignment = metadata?.assignment;
  const currentAssigned = assignment && typeof assignment === "object"
    ? (assignment as Record<string, unknown>).currentAssignedAgentId
    : null;
  if (typeof currentAssigned === "string") {
    return currentAssigned;
  }

  const assigned = metadata?.assignedAgentId;
  return typeof assigned === "string" ? assigned : "";
};

const getOriginalAssignedAgentIdFromMetadata = (metadata?: Record<string, any> | null): string => {
  const assignment = metadata?.assignment;
  const originalAssigned = assignment && typeof assignment === "object"
    ? (assignment as Record<string, unknown>).originalAssignedAgentId
    : null;
  if (typeof originalAssigned === "string") {
    return originalAssigned;
  }

  const original = metadata?.originalAssignedAgentId;
  if (typeof original === "string") {
    return original;
  }

  return getAssignedAgentIdFromMetadata(metadata);
};

const toAssignedAgentPayload = (selection: string): string | null | undefined => {
  if (!selection || selection === IN_HOUSE_AGENT_OPTION_VALUE) {
    return null;
  }

  return selection;
};

const getGroupDocumentsFromMetadata = (metadata?: Record<string, any> | null): GroupDocumentRecord[] => {
  if (!Array.isArray(metadata?.groupDocuments)) {
    return [];
  }
  return metadata.groupDocuments as GroupDocumentRecord[];
};

const getGroupIndustryFromMetadata = (metadata?: Record<string, any> | null): string => {
  const groupIndustry = metadata?.groupIndustry;
  if (typeof groupIndustry === "string") {
    return groupIndustry;
  }

  const industry = metadata?.industry;
  return typeof industry === "string" ? industry : "";
};

const normalizeHeader = (value: unknown): string =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

const parseCsvRows = (csvText: string): string[][] => {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = "";
  let inQuotes = false;

  for (let index = 0; index < csvText.length; index += 1) {
    const char = csvText[index];
    const nextChar = csvText[index + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentCell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      currentRow.push(currentCell.trim());
      currentCell = "";
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') {
        index += 1;
      }

      currentRow.push(currentCell.trim());
      if (currentRow.some((cell) => cell.length > 0)) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentCell = "";
      continue;
    }

    currentCell += char;
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell.trim());
    if (currentRow.some((cell) => cell.length > 0)) {
      rows.push(currentRow);
    }
  }

  return rows;
};

const readFileAsText = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Unable to read file"));
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsText(file);
  });

const readFileAsArrayBuffer = (file: File): Promise<ArrayBuffer> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Unable to read file"));
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.readAsArrayBuffer(file);
  });

const readFileAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Unable to read file"));
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsDataURL(file);
  });

const getRawRecordValue = (record: Record<string, unknown>, keys: string[]): unknown => {
  const entries = Object.entries(record);
  for (const key of keys) {
    const found = entries.find(([entryKey]) => normalizeHeader(entryKey) === normalizeHeader(key));
    if (found && found[1] !== undefined && found[1] !== null) {
      if (typeof found[1] === "string") {
        const value = found[1].trim();
        if (value) {
          return value;
        }
      } else {
        return found[1];
      }
    }
  }
  return "";
};

const getRecordValue = (record: Record<string, unknown>, keys: string[]): string => {
  const raw = getRawRecordValue(record, keys);
  if (raw === null || raw === undefined) {
    return "";
  }
  const value = String(raw).trim();
  if (value) {
    return value;
  }
  return "";
};

const IMPORT_EMPTY_MARKERS = new Set(["n/a", "na", "none", "null", "undefined"]);
const IMPORT_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const sanitizeImportValue = (value: unknown): string => {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return "";
  return IMPORT_EMPTY_MARKERS.has(trimmed.toLowerCase()) ? "" : trimmed;
};

const isSsnLikeHeader = (header: string): boolean => {
  const normalized = normalizeHeader(header);
  return normalized.includes("ssn") || normalized.includes("socialsecurity");
};

const normalizeImportedEmail = (value: unknown): string => normalizeOptionalEmailInput(value);

const buildEmploymentProfileFromRecord = (record: Record<string, unknown>): Record<string, unknown> => {
  const profile: Record<string, unknown> = {
    middleName: sanitizeImportValue(getRecordValue(record, ["middleName", "middle_name"])),
    suffix: sanitizeImportValue(getRecordValue(record, ["suffix"])),
    preferredName: sanitizeImportValue(getRecordValue(record, ["preferredName", "preferred_name"])),
    sex: sanitizeImportValue(getRecordValue(record, ["sex", "gender"])),
    hireDate: formatImportedDate(getRawRecordValue(record, ["hireDate", "hire_date"])),
    className: sanitizeImportValue(getRecordValue(record, ["className", "class", "employeeClass"])),
    department: sanitizeImportValue(getRecordValue(record, ["department"])),
    division: sanitizeImportValue(getRecordValue(record, ["division"])),
    businessUnit: sanitizeImportValue(getRecordValue(record, ["businessUnit", "business_unit"])),
    workEmail: normalizeImportedEmail(getRecordValue(record, ["workEmail", "work_email", "workEmailAddress"])),
    personalEmail: normalizeImportedEmail(getRecordValue(record, ["personalEmail", "personal_email", "email", "emailAddress"])),
    payrollGroup: sanitizeImportValue(getRecordValue(record, ["payrollGroup", "payroll_group"])),
    annualBaseSalary: sanitizeImportValue(getRecordValue(record, ["annualBaseSalary", "annual_base_salary", "annualSalary", "salary"])),
    hoursPerWeek: sanitizeImportValue(getRecordValue(record, ["hoursPerWeek", "hours_per_week"])),
    salaryEffectiveDate: formatImportedDate(getRawRecordValue(record, ["salaryEffectiveDate", "salary_effective_date"])),
    address1: sanitizeImportValue(getRecordValue(record, ["address1", "address_1", "addressLine1"])),
    address2: sanitizeImportValue(getRecordValue(record, ["address2", "address_2", "addressLine2"])),
    city: sanitizeImportValue(getRecordValue(record, ["city"])),
    state: sanitizeImportValue(getRecordValue(record, ["state", "province"])),
    zipCode: sanitizeImportValue(getRecordValue(record, ["zipCode", "zip", "postalCode", "postal_code"])),
    county: sanitizeImportValue(getRecordValue(record, ["county"])),
    country: sanitizeImportValue(getRecordValue(record, ["country"])),
    homePhone: sanitizeImportValue(getRecordValue(record, ["homePhone", "home_phone"])),
    mobilePhone: sanitizeImportValue(getRecordValue(record, ["mobilePhone", "mobile_phone", "phone", "phoneNumber"])),
    workPhone: sanitizeImportValue(getRecordValue(record, ["workPhone", "work_phone"])),
    employmentType: sanitizeImportValue(getRecordValue(record, ["employmentType", "employment_type", "employment type (ft/pt)"])),
    jobTitle: sanitizeImportValue(getRecordValue(record, ["jobTitle", "job_title", "title"])),
    retireDate: formatImportedDate(getRawRecordValue(record, ["retireDate", "retire_date"])),
    originalHireDate: formatImportedDate(getRawRecordValue(record, ["originalHireDate", "original_hire_date"])),
    terminationDate: formatImportedDate(getRawRecordValue(record, ["terminationDate", "termination_date"])),
    terminationReason: sanitizeImportValue(getRecordValue(record, ["terminationReason", "termination_reason"])),
    rehireDate: formatImportedDate(getRawRecordValue(record, ["rehireDate", "rehire_date"])),
  };

  const cleaned: Record<string, unknown> = {};
  Object.entries(profile).forEach(([key, value]) => {
    const nextValue = typeof value === "string" ? value.trim() : value;
    if (nextValue !== null && nextValue !== undefined && nextValue !== "") {
      cleaned[key] = nextValue;
    }
  });

  return cleaned;
};

const buildRegistrationPayloadFromRecord = (
  record: Record<string, unknown>,
  options?: { relationship?: string; tier?: string },
): Record<string, unknown> => {
  const payload: Record<string, unknown> = {};

  Object.entries(record).forEach(([key, value]) => {
    if (!key || isSsnLikeHeader(key)) {
      return;
    }

    const normalizedKey = normalizeHeader(key);
    if (!normalizedKey) {
      return;
    }

    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      payload[normalizedKey] = value.toISOString().slice(0, 10);
      return;
    }

    const sanitized = sanitizeImportValue(value);
    if (!sanitized) {
      return;
    }

    payload[normalizedKey] = sanitized;
  });

  const employmentProfile = buildEmploymentProfileFromRecord(record);
  if (Object.keys(employmentProfile).length > 0) {
    payload.employmentProfile = employmentProfile;
  }

  void options;

  return payload;
};

const formatImportedDate = (value: unknown): string => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  const raw = sanitizeImportValue(value);
  if (!raw) return "";

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw;
  }

  if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(raw)) {
    const [monthRaw, dayRaw, yearRaw] = raw.split("/");
    const month = monthRaw.padStart(2, "0");
    const day = dayRaw.padStart(2, "0");
    const year = yearRaw.length === 2 ? `20${yearRaw}` : yearRaw;
    return `${year}-${month}-${day}`;
  }

  const excelSerial = Number.parseFloat(raw);
  if (Number.isFinite(excelSerial) && excelSerial > 10000 && excelSerial < 90000) {
    const epoch = Date.UTC(1899, 11, 30);
    const date = new Date(epoch + Math.round(excelSerial) * 24 * 60 * 60 * 1000);
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString().slice(0, 10);
    }
  }

  return raw;
};

const inferTierFromRelationship = (record: Record<string, unknown>): string => {
  const relationship = sanitizeImportValue(getRecordValue(record, ["relationship", "dependentRelationship", "memberRelationship"])).toLowerCase();
  if (!relationship) return "member";

  if (
    relationship.includes("employee")
    || relationship.includes("member")
    || relationship.includes("self")
    || relationship.includes("subscriber")
    || relationship.includes("primary")
  ) {
    return "member";
  }

  if (relationship.includes("spouse") || relationship.includes("wife") || relationship.includes("husband")) {
    return "spouse";
  }

  if (
    relationship.includes("child")
    || relationship.includes("son")
    || relationship.includes("daughter")
    || relationship.includes("dependent")
  ) {
    return "child";
  }

  if (relationship.includes("family")) {
    return "family";
  }

  return "member";
};

const normalizeImportedTier = (value: string): string => {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return "member";

  if (normalized === "dependent" || normalized === "dep") return "child";
  if (normalized === "employee" || normalized === "ee" || normalized === "primary") return "member";
  if (normalized === "spouse" || normalized === "child" || normalized === "family" || normalized === "member") {
    return normalized;
  }

  return "member";
};

const normalizeImportedRelationship = (value: string, tier: string): string => {
  const normalized = value.trim().toLowerCase();
  if (normalized) {
    if (normalized === "primary" || normalized === "employee" || normalized === "member" || normalized === "self" || normalized === "subscriber" || normalized === "ee") {
      return "primary";
    }
    if (normalized === "spouse") {
      return "spouse";
    }
    if (normalized === "dependent" || normalized === "child" || normalized === "dep") {
      return "dependent";
    }
  }

  const tierValue = normalizeImportedTier(tier);
  if (tierValue === "spouse") return "spouse";
  if (tierValue === "child") return "dependent";
  return "primary";
};

const resolveImportedEmail = (record: Record<string, unknown>): string => {
  const candidates = [
    getRecordValue(record, ["email", "emailAddress", "email_address"]),
    getRecordValue(record, ["personalEmail", "personal_email"]),
    getRecordValue(record, ["workEmail", "work_email"]),
  ];

  for (const candidate of candidates) {
    const value = sanitizeImportValue(candidate).toLowerCase();
    if (value && IMPORT_EMAIL_REGEX.test(value)) {
      return value;
    }
  }

  return "";
};

const resolveImportedSsn = (
  relationship: string,
  tier: string,
  employeeSsn: string,
  dependentSsn: string,
  fallbackSsn: string,
): string => {
  const relationshipValue = relationship.toLowerCase();
  const tierValue = tier.toLowerCase();
  const looksDependent =
    relationshipValue.includes("dependent")
    || relationshipValue.includes("child")
    || relationshipValue.includes("spouse")
    || tierValue === "child"
    || tierValue === "spouse";

  if (looksDependent) {
    return dependentSsn || employeeSsn || fallbackSsn;
  }

  return employeeSsn || dependentSsn || fallbackSsn;
};

const mapRecordToCensusRow = (record: Record<string, unknown>): CensusImportRow => {
  const rawRelationship = sanitizeImportValue(
    getRecordValue(record, ["relationship", "memberRelationship", "dependentRelationship", "dependent_relation", "member_relation"]),
  );
  const rawTier = sanitizeImportValue(
    getRecordValue(record, ["planTier", "plan_tier", "plan tier", "tier", "memberType", "member_type"]),
  ) || inferTierFromRelationship(record);
  const tier = normalizeImportedTier(rawTier);
  const relationship = normalizeImportedRelationship(rawRelationship, tier);
  const employeeSsn = sanitizeImportValue(
    getRecordValue(record, ["employeeSsn", "employee_ssn", "employee social security number", "ee ssn"]),
  );
  const dependentSsn = sanitizeImportValue(
    getRecordValue(record, ["dependentSsn", "dependent_ssn", "dependent social security number", "dep ssn"]),
  );
  const fallbackSsn = sanitizeImportValue(
    getRecordValue(record, ["ssn", "socialSecurityNumber", "social_security_number", "social security number", "memberSsn", "member_ssn"]),
  );
  const importedEmployerAmount = sanitizeImportValue(getRecordValue(record, ["employerAmount", "employer_amount"]));
  const importedMemberAmount = sanitizeImportValue(getRecordValue(record, ["memberAmount", "member_amount"]));
  const importedTotalAmount = sanitizeImportValue(getRecordValue(record, ["totalAmount", "total_amount"]));

  return {
    firstName: sanitizeImportValue(getRecordValue(record, ["firstName", "first_name", "firstname", "employeeFirstName", "memberFirstName", "givenName"])),
    lastName: sanitizeImportValue(getRecordValue(record, ["lastName", "last_name", "lastname", "employeeLastName", "memberLastName", "surname", "familyName"])),
    email: resolveImportedEmail(record),
    employeeSsn,
    dependentSsn,
    ssn: resolveImportedSsn(relationship, tier, employeeSsn, dependentSsn, fallbackSsn),
    relationship,
    householdBaseNumber: sanitizeImportValue(getRecordValue(record, ["householdBaseNumber", "baseMemberNumber", "householdNumber"])),
    householdMemberNumber: sanitizeImportValue(getRecordValue(record, ["householdMemberNumber", "household_member_number", "householdId", "household_id"])),
    dependentSuffix: sanitizeImportValue(getRecordValue(record, ["dependentSuffix"])),
    phone: sanitizeImportValue(getRecordValue(record, ["phone", "phoneNumber", "phone_number", "mobilePhone", "homePhone", "workPhone", "cellPhone", "mobile"])),
    dateOfBirth: formatImportedDate(getRawRecordValue(record, ["dateOfBirth", "date_of_birth", "dob"])),
    tier,
    payorType: sanitizeImportValue(getRecordValue(record, ["payorType", "payor_type", "payor"])),
    status: sanitizeImportValue(getRecordValue(record, ["status"])),
    employerAmount: importedEmployerAmount,
    memberAmount: importedMemberAmount,
    discountAmount: sanitizeImportValue(getRecordValue(record, ["discountAmount", "discount_amount"])),
    totalAmount: importedTotalAmount,
    registrationPayload: buildRegistrationPayloadFromRecord(record, { relationship, tier }),
  };
};

const mapCsvTableToRows = (tableRows: string[][]): CensusImportRow[] => {
  if (tableRows.length < 2) {
    return [];
  }

  const headers = tableRows[0];
  const rows = tableRows
    .slice(1)
    .map((cells) => {
      const record: Record<string, unknown> = {};
      headers.forEach((header, idx) => {
        record[header] = cells[idx] || "";
      });
      return mapRecordToCensusRow(record);
    })
    .filter((row) => row.firstName || row.lastName || row.email);

  const hasImportedSsn = (value: string | undefined): boolean => {
    const digits = String(value || "").replace(/\D/g, "");
    return digits.length === 9 || digits.length === 8;
  };

  let activeHouseholdBase: string | null = null;
  let activePrimaryRowIndex = -1;
  let activeDependentSuffix = 0;
  let householdCounter = 0;

  rows.forEach((row, index) => {
    const relationship = String(row.relationship || "").trim().toLowerCase();
    const tier = String(row.tier || "").trim().toLowerCase();
    const hasEeSsn = hasImportedSsn(row.employeeSsn)
      || (hasImportedSsn(row.ssn) && !hasImportedSsn(row.dependentSsn) && (relationship === "" || relationship === "primary"));
    const hasDependentSsn = hasImportedSsn(row.dependentSsn);

    if (hasEeSsn) {
      householdCounter += 1;
      activeHouseholdBase = `IMP-${String(householdCounter).padStart(4, "0")}`;
      activePrimaryRowIndex = index;
      activeDependentSuffix = 0;

      row.relationship = "primary";
      if (!tier || tier === "dependent" || tier === "child" || tier === "spouse") {
        row.tier = hasDependentSsn ? "family" : "member";
      }

      row.householdBaseNumber = activeHouseholdBase;
      row.householdMemberNumber = `${activeHouseholdBase}-00`;
      row.dependentSuffix = "0";
      return;
    }

    const isDependentRow = hasDependentSsn
      || relationship === "dependent"
      || relationship === "spouse"
      || tier === "child"
      || tier === "spouse";

    if (!isDependentRow || !activeHouseholdBase) {
      return;
    }

    activeDependentSuffix += 1;
    row.relationship = relationship === "spouse" ? "spouse" : "dependent";
    if (!tier || tier === "member") {
      row.tier = row.relationship === "spouse" ? "spouse" : "child";
    }

    row.householdBaseNumber = activeHouseholdBase;
    row.householdMemberNumber = `${activeHouseholdBase}-${String(activeDependentSuffix).padStart(2, "0")}`;
    row.dependentSuffix = String(activeDependentSuffix);

    if (activePrimaryRowIndex >= 0) {
      const primaryRow = rows[activePrimaryRowIndex];
      if (String(primaryRow.tier || "").trim().toLowerCase() === "member") {
        primaryRow.tier = "family";
      }
    }
  });

  return rows;
};

const escapeCsvCell = (value: unknown): string => {
  const raw = String(value ?? "");
  if (raw.includes('"') || raw.includes(",") || raw.includes("\n") || raw.includes("\r")) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
};

const buildFailedRowsCsv = (failedRows: BulkImportFailedRow[]): string => {
  const headers = [
    "row",
    "reason",
    "email",
    "firstName",
    "lastName",
    "tier",
    "payorType",
    "status",
    "phone",
    "dateOfBirth",
    "employerAmount",
    "memberAmount",
    "discountAmount",
    "totalAmount",
  ];

  const lines = [headers.join(",")];
  for (const failed of failedRows) {
    const source = failed.sourceRow;
    lines.push(
      [
        failed.row,
        failed.reason,
        failed.email || source?.email || "",
        source?.firstName || "",
        source?.lastName || "",
        source?.tier || "",
        source?.payorType || "",
        source?.status || "",
        source?.phone || "",
        source?.dateOfBirth || "",
        source?.employerAmount || "",
        source?.memberAmount || "",
        source?.discountAmount || "",
        source?.totalAmount || "",
      ]
        .map(escapeCsvCell)
        .join(",")
    );
  }

  return lines.join("\n");
};

const buildFailedRowsFileName = (sourceFileName: string): string => {
  const baseName = sourceFileName.replace(/\.[^/.]+$/, "") || "group-census";
  const safeBase = baseName.replace(/[^a-zA-Z0-9-_]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${safeBase || "group-census"}-failed-rows-${timestamp}.csv`;
};

type DetailStep = "setup" | "profile" | "members" | "readiness";

const ENROLLMENT_RECORD_VIEW_KEY = "adminEnrollmentRecordsView";

export default function GroupEnrollment() {
  const { toast } = useToast();
  const { user, isLoading: authLoading } = useAuth();
  const isAuthorized = hasAtLeastRole(user?.role, "agent");
  const canAccessAdminViews = hasAtLeastRole(user?.role, "admin");
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  const [newGroupOpen, setNewGroupOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<GroupDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [newGroupForm, setNewGroupForm] = useState({
    name: "",
    groupType: "",
    industry: "",
    discountCode: "",
  });
  const [newGroupAssignedAgentId, setNewGroupAssignedAgentId] = useState(IN_HOUSE_AGENT_OPTION_VALUE);
  const [newGroupCensusFileName, setNewGroupCensusFileName] = useState("");
  const [newGroupCensusRows, setNewGroupCensusRows] = useState<CensusImportRow[]>([]);
  const [newGroupPaymentFormFile, setNewGroupPaymentFormFile] = useState<File | null>(null);
  const [newGroupProfileForm, setNewGroupProfileForm] = useState<GroupProfile>({ ...defaultGroupProfileForm });
  const [groupProfileForm, setGroupProfileForm] = useState<GroupProfile>({ ...defaultGroupProfileForm });
  const [groupSetupForm, setGroupSetupForm] = useState<GroupSetupFormState>({
    name: "",
    groupType: "",
    industry: "",
    discountCode: "",
  });
  const [groupAssignedAgentId, setGroupAssignedAgentId] = useState("");
  const [groupCurrentAgentFilter, setGroupCurrentAgentFilter] = useState("all");
  const [groupOriginalAgentFilter, setGroupOriginalAgentFilter] = useState("all");
  const [groupReassignedOnlyFilter, setGroupReassignedOnlyFilter] = useState(false);
  const [detailStep, setDetailStep] = useState<DetailStep>("setup");
  const [reassignDialogOpen, setReassignDialogOpen] = useState(false);
  const [reassignmentForm, setReassignmentForm] = useState<GroupReassignmentFormState>({
    newAgentId: IN_HOUSE_AGENT_OPTION_VALUE,
    effectiveDate: new Date().toISOString().slice(0, 10),
    reason: "",
    notes: "",
    transferOpenWorkflows: true,
    previousAgentReadOnly: true,
  });
  const [memberDialogOpen, setMemberDialogOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<GroupMemberRecord | null>(null);
  const defaultMemberForm: MemberFormState = {
    relationship: "primary",
    firstName: "",
    middleName: "",
    lastName: "",
    suffix: "",
    preferredName: "",
    dateOfBirth: "",
    sex: "",
    hireDate: "",
    className: "",
    department: "",
    division: "",
    businessUnit: "",
    workEmail: "",
    personalEmail: "",
    payrollGroup: "",
    annualBaseSalary: "",
    hoursPerWeek: "",
    salaryEffectiveDate: "",
    address1: "",
    address2: "",
    city: "",
    state: "",
    zipCode: "",
    county: "",
    country: "",
    homePhone: "",
    mobilePhone: "",
    workPhone: "",
    employmentType: "",
    jobTitle: "",
    retireDate: "",
    originalHireDate: "",
    terminationDate: "",
    terminationReason: "",
    rehireDate: "",
    ssn: "",
    selectedPlanId: "",
    selectedPlanName: "",
    selectedPlanTier: "",
    pbmEnabled: false,
    pbmAmount: "",
    tier: "member",
    payorType: "full",
    status: "draft",
  };
  const [memberForm, setMemberForm] = useState<MemberFormState>(defaultMemberForm);
  const [discountValidation, setDiscountValidation] = useState<DiscountValidationState | null>(null);
  const [isValidatingDiscount, setIsValidatingDiscount] = useState(false);
  const [effectiveDateSelection, setEffectiveDateSelection] = useState<string>("");
  const [effectiveDateReason, setEffectiveDateReason] = useState("");
  const [isDragActive, setIsDragActive] = useState(false);
  const [importFileName, setImportFileName] = useState("");
  const [importRows, setImportRows] = useState<CensusImportRow[]>([]);
  const [importWarnings, setImportWarnings] = useState<string[]>([]);
  const [lastImportSourceFileName, setLastImportSourceFileName] = useState("");
  const [lastImportFailedRows, setLastImportFailedRows] = useState<BulkImportFailedRow[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const newGroupCensusInputRef = useRef<HTMLInputElement | null>(null);
  const newGroupPaymentInputRef = useRef<HTMLInputElement | null>(null);
  const detailPaymentInputRef = useRef<HTMLInputElement | null>(null);
  const censusTemplateInputRef = useRef<HTMLInputElement | null>(null);

  const resetMemberForm = (overrides?: Partial<MemberFormState>) => {
    setMemberForm({
      ...defaultMemberForm,
      payorType: selectedGroup?.data?.payorType === "member" ? "member" : "full",
      selectedPlanId: groupProfileForm.selectedPlanId || "",
      selectedPlanName: groupProfileForm.selectedPlanName || "",
      selectedPlanTier: groupProfileForm.selectedPlanTier || "",
      pbmEnabled: groupProfileForm.pbmEnabled,
      pbmAmount: groupProfileForm.pbmAmount || "",
      ...overrides,
    });
  };

  const { data, isLoading, error } = useQuery({
    queryKey: [
      "/api/groups",
      user?.id || "anonymous",
      user?.role || "unknown",
      groupCurrentAgentFilter,
      groupOriginalAgentFilter,
      groupReassignedOnlyFilter,
    ],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (canAccessAdminViews) {
        if (groupCurrentAgentFilter !== "all") {
          params.set("currentAgentId", groupCurrentAgentFilter);
        }
        if (groupOriginalAgentFilter !== "all") {
          params.set("originalAgentId", groupOriginalAgentFilter);
        }
        if (groupReassignedOnlyFilter) {
          params.set("reassignedOnly", "true");
        }
      }

      const queryString = params.toString();
      return apiRequest(queryString ? `/api/groups?${queryString}` : "/api/groups");
    },
    enabled: !authLoading && isAuthorized,
  });

  const { data: agentsData } = useQuery({
    queryKey: ["/api/agents"],
    queryFn: async () => apiRequest("/api/agents"),
    enabled: !authLoading && isAuthorized && canAccessAdminViews,
    staleTime: 1000 * 60,
  });

  const { data: censusTemplateData } = useQuery({
    queryKey: ["/api/census-template"],
    queryFn: async () => apiRequest("/api/census-template"),
    enabled: !authLoading && isAuthorized,
    staleTime: 1000 * 60,
  });

  const { data: plansCatalogData = [] } = useQuery<any[]>({
    queryKey: ["/api/plans"],
    queryFn: async () => apiRequest("/api/plans"),
    enabled: !authLoading && isAuthorized,
    staleTime: 1000 * 60,
  });

  const availablePlans: PlanCatalogItem[] = useMemo(() => {
    const rawPlans = Array.isArray(plansCatalogData)
      ? plansCatalogData
      : Array.isArray((plansCatalogData as any)?.data)
        ? (plansCatalogData as any).data
        : [];

    return rawPlans
      .filter((plan: any) => Number.isFinite(Number(plan?.id)))
      .map((plan: any) => ({
        id: Number(plan.id),
        name: String(plan.name || "Plan"),
        price: Number.isFinite(Number(plan.price)) ? Number(plan.price) : null,
        billingPeriod: String(plan.billingPeriod || "monthly"),
        features: Array.isArray(plan.features) ? plan.features.map((feature: unknown) => String(feature)) : [],
      }));
  }, [plansCatalogData]);

  const planCatalogById = useMemo(() => {
    const map = new Map<string, PlanCatalogItem>();
    availablePlans.forEach((plan) => {
      map.set(String(plan.id), plan);
    });
    return map;
  }, [availablePlans]);

  const selectedDetailPlan = useMemo(
    () => planCatalogById.get(groupProfileForm.selectedPlanId),
    [planCatalogById, groupProfileForm.selectedPlanId],
  );
  const selectedNewGroupPlan = useMemo(
    () => planCatalogById.get(newGroupProfileForm.selectedPlanId),
    [planCatalogById, newGroupProfileForm.selectedPlanId],
  );

  const detailPlanPricingRows = useMemo(() => {
    const resolvedTier = groupProfileForm.selectedPlanTier
      || (selectedDetailPlan ? derivePlanTierFromName(selectedDetailPlan.name) : "");
    if (!resolvedTier) return [];
    return GROUP_COMMISSION_MATRIX[toPlanTierMatrixKey(resolvedTier)] || [];
  }, [groupProfileForm.selectedPlanTier, selectedDetailPlan]);

  const newPlanPricingRows = useMemo(() => {
    const resolvedTier = newGroupProfileForm.selectedPlanTier
      || (selectedNewGroupPlan ? derivePlanTierFromName(selectedNewGroupPlan.name) : "");
    if (!resolvedTier) return [];
    return GROUP_COMMISSION_MATRIX[toPlanTierMatrixKey(resolvedTier)] || [];
  }, [newGroupProfileForm.selectedPlanTier, selectedNewGroupPlan]);

  const groups: GroupRecord[] = useMemo(() => {
    if (Array.isArray(data)) {
      return data as GroupRecord[];
    }

    if (Array.isArray((data as any)?.data)) {
      return (data as any).data as GroupRecord[];
    }

    if (Array.isArray((data as any)?.groups)) {
      return (data as any).groups as GroupRecord[];
    }

    return [];
  }, [data]);
  const unassignedQueueCount = useMemo(
    () => groups.filter((group) => !group.currentAssignedAgentId && !getAssignedAgentIdFromMetadata(group.metadata)).length,
    [groups],
  );
  const statusSummary = useMemo(
    () => ({
      draft: groups.filter((group) => group.status === "draft").length,
      registered: groups.filter((group) => group.status === "registered").length,
      active: groups.filter((group) => group.status === "active").length,
    }),
    [groups],
  );
  const myAssignedQueueCount = useMemo(() => {
    if (!user?.id) {
      return 0;
    }

    return groups.filter((group) => {
      const assignedAgentId = group.currentAssignedAgentId || getAssignedAgentIdFromMetadata(group.metadata);
      return assignedAgentId === user.id;
    }).length;
  }, [groups, user?.id]);
  const agentOptions: AgentOption[] = useMemo(() => {
    const rawAgents = Array.isArray(agentsData)
      ? agentsData
      : Array.isArray((agentsData as any)?.data)
        ? (agentsData as any).data
        : Array.isArray((agentsData as any)?.agents)
          ? (agentsData as any).agents
          : [];

    return rawAgents
      .filter((agent: any) => (agent?.isActive ?? agent?.is_active) !== false)
      .map((agent: any) => ({
        id: agent.id,
        firstName: agent.firstName ?? agent.first_name ?? "",
        lastName: agent.lastName ?? agent.last_name ?? "",
        email: agent.email ?? null,
        role: agent.role,
        agentNumber: agent.agentNumber ?? agent.agent_number ?? null,
        isActive: agent.isActive ?? agent.is_active ?? true,
      }));
  }, [agentsData]);

  const getAgentLabel = (agentId?: string | null): string => {
    if (!agentId) {
      return "In-house (Admin serviced)";
    }

    const agent = agentOptions.find((item) => item.id === agentId);
    if (!agent) {
      return agentId;
    }

    const name = `${agent.firstName || ""} ${agent.lastName || ""}`.trim();
    const base = name || agent.email || agent.id;
    return agent.agentNumber ? `${agent.agentNumber} - ${base}` : base;
  };

  useEffect(() => {
    if (!isAuthorized && !authLoading) {
      toast({
        title: "Insufficient access",
        description: "Group enrollment is limited to agents and admins.",
        variant: "destructive",
      });
    }
  }, [isAuthorized, authLoading, toast]);

  useEffect(() => {
    if (!authLoading && isAuthorized && canAccessAdminViews) {
      window.localStorage.setItem(ENROLLMENT_RECORD_VIEW_KEY, "groups");
    }
  }, [authLoading, isAuthorized, canAccessAdminViews]);

  useEffect(() => {
    // Prevent stale group state when switching between user profiles in the same browser session.
    setDetailOpen(false);
    setMemberDialogOpen(false);
    setReassignDialogOpen(false);
    setSelectedGroup(null);
    setEditingMember(null);
    resetMemberForm();
  }, [user?.id]);

  useEffect(() => {
    if (!selectedGroup?.data) {
      return;
    }

    const currentAssigned = getAssignedAgentIdFromMetadata(selectedGroup.data.metadata) || IN_HOUSE_AGENT_OPTION_VALUE;
    setReassignmentForm((prev) => ({
      ...prev,
      newAgentId: currentAssigned,
      effectiveDate: new Date().toISOString().slice(0, 10),
      reason: "",
      notes: "",
    }));
  }, [selectedGroup?.data?.id]);

  const uploadGroupDocument = async (groupId: string, file: File, documentType: string) => {
    const dataUrl = await readFileAsDataUrl(file);
    const commaIndex = dataUrl.indexOf(",");
    if (commaIndex < 0) {
      throw new Error("Unable to encode file for upload");
    }

    const base64Data = dataUrl.slice(commaIndex + 1);
    return apiRequest(`/api/groups/${groupId}/documents`, {
      method: "POST",
      body: JSON.stringify({
        documentType,
        fileName: file.name,
        contentType: file.type || "application/octet-stream",
        base64Data,
      }),
    });
  };

  const createGroupMutation = useMutation({
    mutationFn: async () => {
      const normalizedDiscount = newGroupForm.discountCode.trim().toUpperCase();
      const discountCode = normalizedDiscount || undefined;
      if (discountCode) {
        const lastValidationMatches =
          discountValidation &&
          discountValidation.isValid &&
          discountValidation.code === normalizedDiscount;
        if (!lastValidationMatches) {
          throw new Error("Validate the discount code before saving");
        }
      }

      const payload = {
        name: newGroupForm.name.trim(),
        groupType: newGroupForm.groupType.trim() || undefined,
        payorType: derivePayorTypeFromPaymentResponsibility(newGroupProfileForm.paymentResponsibilityMode),
        discountCode,
        groupProfile: buildGroupProfilePayload(newGroupProfileForm),
        metadata: {
          groupIndustry: newGroupForm.industry.trim() || null,
        },
        assignedAgentId: canAccessAdminViews ? toAssignedAgentPayload(newGroupAssignedAgentId) : undefined,
      };
      return apiRequest("/api/groups", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
    onSuccess: async (result: any) => {
      const createdGroupId = result?.data?.id as string | undefined;

      if (createdGroupId && newGroupCensusRows.length > 0) {
        try {
          const bulkResult: any = await apiRequest(`/api/groups/${createdGroupId}/members/bulk`, {
            method: "POST",
            body: JSON.stringify({ members: newGroupCensusRows }),
          });
          const summary = bulkResult?.summary;
          toast({
            title: "Census upload finished",
            description: `Imported ${summary?.created ?? 0} of ${summary?.received ?? newGroupCensusRows.length} rows for the new group`,
            variant: summary?.failed ? "destructive" : undefined,
          });
        } catch (error: any) {
          toast({
            title: "Census upload failed",
            description: error?.message || "Group was created, but census upload failed.",
            variant: "destructive",
          });
        }
      }

      if (createdGroupId && newGroupPaymentFormFile) {
        try {
          await uploadGroupDocument(createdGroupId, newGroupPaymentFormFile, "authorized_payment_form");
          toast({
            title: "Payment form uploaded",
            description: "Authorized payment form attached to the new group.",
          });
        } catch (error: any) {
          toast({
            title: "Payment form upload failed",
            description: error?.message || "Group was created, but payment form upload failed.",
            variant: "destructive",
          });
        }
      }

      toast({
        title: "Group created",
        description: "Group record saved. You can start adding members now.",
      });
      setNewGroupOpen(false);
      setNewGroupForm({ name: "", groupType: "", industry: "", discountCode: "" });
      setNewGroupAssignedAgentId(IN_HOUSE_AGENT_OPTION_VALUE);
      setNewGroupCensusFileName("");
      setNewGroupCensusRows([]);
      setNewGroupPaymentFormFile(null);
      setNewGroupProfileForm({ ...defaultGroupProfileForm });
      setDiscountValidation(null);
      if (newGroupCensusInputRef.current) {
        newGroupCensusInputRef.current.value = "";
      }
      if (newGroupPaymentInputRef.current) {
        newGroupPaymentInputRef.current.value = "";
      }
      queryClient.invalidateQueries({ queryKey: ["/api/groups"] });
    },
    onError: (err: any) => {
      toast({
        title: "Unable to create group",
        description: err?.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  const fetchGroupDetail = async (groupId: string) => {
    const response = await apiRequest(`/api/groups/${groupId}`);
    const typed = response as GroupDetailResponse;
    setSelectedGroup(typed);
    setImportFileName("");
    setImportRows([]);
    setImportWarnings([]);
    setLastImportSourceFileName("");
    setLastImportFailedRows([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    setGroupAssignedAgentId(getAssignedAgentIdFromMetadata(typed.data?.metadata) || IN_HOUSE_AGENT_OPTION_VALUE);
    setGroupSetupForm({
      name: typed.data?.name || "",
      groupType: typed.data?.groupType || "",
      industry: getGroupIndustryFromMetadata(typed.data?.metadata),
      discountCode: typed.data?.discountCode || "",
    });
    setEffectiveDateSelection(typed.effectiveDateContext?.selectedEffectiveDate || "");
    setEffectiveDateReason(typed.effectiveDateContext?.overrideReason || "");
    setGroupProfileForm(mapGroupProfileContextToForm(typed.groupProfileContext));
    return typed;
  };

  const isGroupNotFoundError = (err: any): boolean => {
    const message = String(err?.message || "");
    return message.includes("HTTP 404") && message.toLowerCase().includes("group not found");
  };

  const refreshGroups = () => queryClient.invalidateQueries({ queryKey: ["/api/groups"] });

  const recoverFromMissingGroup = async () => {
    setDetailOpen(false);
    setMemberDialogOpen(false);
    setReassignDialogOpen(false);
    setSelectedGroup(null);
    setEditingMember(null);
    resetMemberForm();
    toast({
      title: "Group no longer available",
      description: "This group was not found. You can re-open it from the list once available.",
      variant: "destructive",
    });
  };

  const retrySelectedGroupAfterNotFound = async (): Promise<boolean> => {
    const groupId = selectedGroup?.data?.id;
    if (!groupId) {
      return false;
    }

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        // During deployment/cache handoffs a valid group id can briefly 404.
        // Refresh list state and re-fetch details with short retries before fallback.
        await refreshGroups();
        await fetchGroupDetail(groupId);
        return true;
      } catch {
        if (attempt < 2) {
          await new Promise((resolve) => setTimeout(resolve, 400));
        }
      }
    }

    return false;
  };

  const handleGroupMutationError = async (err: any, title: string) => {
    if (isGroupNotFoundError(err)) {
      const recovered = await retrySelectedGroupAfterNotFound();
      if (recovered) {
        toast({
          title: "Group reloaded",
          description: "The group became available again. Please retry your last action.",
        });
        return;
      }

      await recoverFromMissingGroup();
      return;
    }

    toast({
      title,
      description: err?.message || "Please try again",
      variant: "destructive",
    });
  };

  const parseCensusFile = async (file: File): Promise<CensusImportRow[]> => {
    const extension = file.name.split(".").pop()?.toLowerCase() || "";

    if (extension === "csv") {
      const text = await readFileAsText(file);
      return mapCsvTableToRows(parseCsvRows(text));
    }

    if (extension === "xls" || extension === "xlsx") {
      const XLSX = (await import("xlsx")) as any;
      const buffer = await readFileAsArrayBuffer(file);
      const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
      const firstSheetName = workbook.SheetNames[0];
      if (!firstSheetName) {
        return [];
      }

      const worksheet = workbook.Sheets[firstSheetName];
      const records = XLSX.utils.sheet_to_json(worksheet, { defval: "" }) as Record<string, unknown>[];
      return records.map(mapRecordToCensusRow).filter((row) => row.firstName || row.lastName || row.email);
    }

    throw new Error("Unsupported file type. Use .csv, .xls, or .xlsx");
  };

  const setParsedImportRows = (fileName: string, parsedRows: CensusImportRow[]) => {
    const warnings: string[] = [];
    parsedRows.forEach((row, index) => {
      const requiresEmail = isPrimaryRelationshipValue(row.relationship) && doesTierRequirePrimaryEmail(row.tier);
      if (!row.firstName || !row.lastName || (requiresEmail && !row.email)) {
        warnings.push(
          requiresEmail
            ? `Row ${index + 2} missing firstName, lastName, or primary-member email`
            : `Row ${index + 2} missing firstName or lastName`,
        );
      }
    });

    setImportFileName(fileName);
    setImportRows(parsedRows);
    setImportWarnings(warnings.slice(0, 5));
    setLastImportSourceFileName("");
    setLastImportFailedRows([]);
  };

  const handleCensusFile = async (file: File) => {
    try {
      const parsedRows = await parseCensusFile(file);
      if (parsedRows.length === 0) {
        throw new Error("No member rows found in file");
      }

      setParsedImportRows(file.name, parsedRows);
      toast({
        title: "Census file loaded",
        description: `${parsedRows.length} rows ready to import`,
      });
    } catch (err: any) {
      setImportFileName("");
      setImportRows([]);
      setImportWarnings([]);
      setLastImportSourceFileName("");
      setLastImportFailedRows([]);
      toast({
        title: "Unable to read file",
        description: err?.message || "Please check file format and try again",
        variant: "destructive",
      });
    }
  };

  const handleNewGroupCensusFile = async (file: File) => {
    try {
      const parsedRows = await parseCensusFile(file);
      if (parsedRows.length === 0) {
        throw new Error("No member rows found in file");
      }

      setNewGroupCensusFileName(file.name);
      setNewGroupCensusRows(parsedRows);
      toast({
        title: "Census file queued",
        description: `${parsedRows.length} rows will import after group creation`,
      });
    } catch (err: any) {
      setNewGroupCensusFileName("");
      setNewGroupCensusRows([]);
      toast({
        title: "Unable to read census file",
        description: err?.message || "Please check file format and try again",
        variant: "destructive",
      });
    }
  };

  const handleNewGroupCensusSelect = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      await handleNewGroupCensusFile(file);
    }
  };

  const handleNewGroupPaymentFormSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    setNewGroupPaymentFormFile(file);
  };

  const upsertMemberMutation = useMutation({
    mutationFn: async () => {
      const groupId = selectedGroup?.data?.id;
      if (!groupId) throw new Error("Select a group first");

      const normalizedWorkEmail = normalizeOptionalEmailInput(memberForm.workEmail);
      const normalizedPersonalEmail = normalizeOptionalEmailInput(memberForm.personalEmail);
      const primaryEmail = normalizedWorkEmail || normalizedPersonalEmail || null;
      const normalizedRelationship = normalizeRelationshipForPlan(
        memberForm.relationship,
        memberForm.selectedPlanName,
      );
      const normalizedTier = deriveTierFromRelationship(normalizedRelationship, memberForm.tier);
      const coverageMonthlyPrice = resolveMemberCoverageMonthlyPrice(
        normalizedRelationship,
        memberForm.selectedPlanTier,
        memberForm.selectedPlanName,
      );
      const pbmMonthlyAmount = memberForm.pbmEnabled ? Math.max(0, Number(memberForm.pbmAmount || 0)) : 0;
      const computedMonthlyTotal = coverageMonthlyPrice === null
        ? null
        : Number((coverageMonthlyPrice + pbmMonthlyAmount).toFixed(2));
      const computedEmployerAmount = computedMonthlyTotal === null
        ? null
        : memberForm.payorType === "full"
          ? computedMonthlyTotal
          : 0;
      const computedMemberAmount = computedMonthlyTotal === null
        ? null
        : memberForm.payorType === "member"
          ? computedMonthlyTotal
          : 0;

      const payload = {
        relationship: normalizedRelationship,
        firstName: memberForm.firstName.trim(),
        middleName: memberForm.middleName.trim() || null,
        lastName: memberForm.lastName.trim(),
        dateOfBirth: memberForm.dateOfBirth,
        phone: memberForm.mobilePhone.trim() || null,
        email: primaryEmail,
        ssn: memberForm.ssn.trim() || null,
        tier: normalizedTier,
        payorType: memberForm.payorType,
        status: memberForm.status,
        employerAmount: computedEmployerAmount,
        memberAmount: computedMemberAmount,
        discountAmount: 0,
        totalAmount: computedMonthlyTotal,
        metadata: {
          planSelection: {
            planId: memberForm.selectedPlanId ? Number(memberForm.selectedPlanId) : null,
            planName: memberForm.selectedPlanName || null,
            planTier: memberForm.selectedPlanTier || null,
            pbmEnabled: memberForm.pbmEnabled,
            pbmAmount: memberForm.pbmAmount.trim() ? Number(memberForm.pbmAmount) : null,
          },
          planId: memberForm.selectedPlanId ? Number(memberForm.selectedPlanId) : null,
          planName: memberForm.selectedPlanName || null,
          planTier: memberForm.selectedPlanTier || null,
          selectedPlanId: memberForm.selectedPlanId ? Number(memberForm.selectedPlanId) : null,
          selectedPlanName: memberForm.selectedPlanName || null,
          selectedPlanTier: memberForm.selectedPlanTier || null,
          pbmEnabled: memberForm.pbmEnabled,
          pbm: memberForm.pbmEnabled,
          pbmAmount: memberForm.pbmAmount.trim() ? Number(memberForm.pbmAmount) : null,
          employmentProfile: {
            middleName: memberForm.middleName,
            suffix: memberForm.suffix,
            preferredName: memberForm.preferredName,
            sex: memberForm.sex,
            hireDate: memberForm.hireDate,
            className: memberForm.className,
            department: memberForm.department,
            division: memberForm.division,
            businessUnit: memberForm.businessUnit,
            workEmail: normalizedWorkEmail || null,
            personalEmail: normalizedPersonalEmail || null,
            payrollGroup: memberForm.payrollGroup,
            annualBaseSalary: memberForm.annualBaseSalary,
            hoursPerWeek: memberForm.hoursPerWeek,
            salaryEffectiveDate: memberForm.salaryEffectiveDate,
            address1: memberForm.address1,
            address2: memberForm.address2,
            city: memberForm.city,
            state: memberForm.state,
            zipCode: memberForm.zipCode,
            county: memberForm.county,
            country: memberForm.country,
            homePhone: memberForm.homePhone,
            mobilePhone: memberForm.mobilePhone,
            workPhone: memberForm.workPhone,
            employmentType: memberForm.employmentType,
            jobTitle: memberForm.jobTitle,
            retireDate: memberForm.retireDate,
            originalHireDate: memberForm.originalHireDate,
            terminationDate: memberForm.terminationDate,
            terminationReason: memberForm.terminationReason,
            rehireDate: memberForm.rehireDate,
          },
        },
        registrationPayload: {
          planId: memberForm.selectedPlanId ? Number(memberForm.selectedPlanId) : null,
          planName: memberForm.selectedPlanName || null,
          planTier: memberForm.selectedPlanTier || null,
          selectedPlanId: memberForm.selectedPlanId ? Number(memberForm.selectedPlanId) : null,
          selectedPlanName: memberForm.selectedPlanName || null,
          selectedPlanTier: memberForm.selectedPlanTier || null,
          pbmEnabled: memberForm.pbmEnabled,
          pbm: memberForm.pbmEnabled,
          pbmAmount: memberForm.pbmAmount.trim() ? Number(memberForm.pbmAmount) : null,
          employmentProfile: {
            middleName: memberForm.middleName,
            suffix: memberForm.suffix,
            preferredName: memberForm.preferredName,
            sex: memberForm.sex,
            hireDate: memberForm.hireDate,
            className: memberForm.className,
            department: memberForm.department,
            division: memberForm.division,
            businessUnit: memberForm.businessUnit,
            workEmail: normalizedWorkEmail || null,
            personalEmail: normalizedPersonalEmail || null,
            payrollGroup: memberForm.payrollGroup,
            annualBaseSalary: memberForm.annualBaseSalary,
            hoursPerWeek: memberForm.hoursPerWeek,
            salaryEffectiveDate: memberForm.salaryEffectiveDate,
            address1: memberForm.address1,
            address2: memberForm.address2,
            city: memberForm.city,
            state: memberForm.state,
            zipCode: memberForm.zipCode,
            county: memberForm.county,
            country: memberForm.country,
            homePhone: memberForm.homePhone,
            mobilePhone: memberForm.mobilePhone,
            workPhone: memberForm.workPhone,
            employmentType: memberForm.employmentType,
            jobTitle: memberForm.jobTitle,
            retireDate: memberForm.retireDate,
            originalHireDate: memberForm.originalHireDate,
            terminationDate: memberForm.terminationDate,
            terminationReason: memberForm.terminationReason,
            rehireDate: memberForm.rehireDate,
          },
        },
      };

      if (editingMember) {
        return apiRequest(`/api/groups/${groupId}/members/${editingMember.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      }

      return apiRequest(`/api/groups/${groupId}/members`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
    onSuccess: async () => {
      if (selectedGroup?.data?.id) {
        await fetchGroupDetail(selectedGroup.data.id);
      }
      refreshGroups();
      setMemberDialogOpen(false);
      setEditingMember(null);
      resetMemberForm();
      toast({
        title: "Member saved",
        description: "The member record was updated.",
      });
    },
    onError: (err: any) => {
      void handleGroupMutationError(err, "Unable to save member");
    },
  });

  const deleteMemberMutation = useMutation({
    mutationFn: async (member: GroupMemberRecord) => {
      if (!selectedGroup?.data?.id) throw new Error("Select a group first");
      return apiRequest(`/api/groups/${selectedGroup.data.id}/members/${member.id}`, {
        method: "DELETE",
      });
    },
    onSuccess: async () => {
      if (selectedGroup?.data?.id) {
        await fetchGroupDetail(selectedGroup.data.id);
      }
      refreshGroups();
      toast({
        title: "Member terminated",
        description: "The member was marked terminated and retained for history.",
      });
    },
    onError: (err: any) => {
      void handleGroupMutationError(err, "Unable to terminate member");
    },
  });

  const restoreMemberMutation = useMutation({
    mutationFn: async (member: GroupMemberRecord) => {
      if (!selectedGroup?.data?.id) throw new Error("Select a group first");
      return apiRequest(`/api/groups/${selectedGroup.data.id}/members/${member.id}/restore`, {
        method: "POST",
      });
    },
    onSuccess: async () => {
      if (selectedGroup?.data?.id) {
        await fetchGroupDetail(selectedGroup.data.id);
      }
      refreshGroups();
      toast({
        title: "Member restored",
        description: "The member was restored to an active lifecycle state.",
      });
    },
    onError: (err: any) => {
      void handleGroupMutationError(err, "Unable to restore member");
    },
  });

  const reassignGroupMutation = useMutation({
    mutationFn: async () => {
      const groupId = selectedGroup?.data?.id;
      if (!groupId) throw new Error("Select a group first");
      if (!reassignmentForm.newAgentId || reassignmentForm.newAgentId === IN_HOUSE_AGENT_OPTION_VALUE) {
        throw new Error("Select a destination agent");
      }
      if (!reassignmentForm.reason.trim() || reassignmentForm.reason.trim().length < 3) {
        throw new Error("Reason must be at least 3 characters");
      }

      return apiRequest(`/api/groups/${groupId}/reassign`, {
        method: "POST",
        body: JSON.stringify({
          newAgentId: reassignmentForm.newAgentId,
          effectiveDate: reassignmentForm.effectiveDate,
          reason: reassignmentForm.reason.trim(),
          notes: reassignmentForm.notes.trim() || null,
          transferOpenWorkflows: reassignmentForm.transferOpenWorkflows,
          previousAgentReadOnly: reassignmentForm.previousAgentReadOnly,
        }),
      });
    },
    onSuccess: async (result: any) => {
      if (selectedGroup?.data?.id) {
        await fetchGroupDetail(selectedGroup.data.id);
      }
      refreshGroups();
      setReassignDialogOpen(false);

      const linkedTransferred = result?.transferSummary?.linkedEmployeesTransferred ?? 0;
      const workflowsTransferred = result?.transferSummary?.openWorkflowsTransferred ?? 0;
      toast({
        title: "Group reassigned",
        description: `Transferred ${linkedTransferred} linked employees and ${workflowsTransferred} open workflows.`,
      });
    },
    onError: (err: any) => {
      void handleGroupMutationError(err, "Unable to reassign group");
    },
  });

  const bulkImportMembersMutation = useMutation({
    mutationFn: async () => {
      if (!selectedGroup?.data?.id) throw new Error("Select a group first");
      if (importRows.length === 0) throw new Error("Load a census file first");

      return apiRequest(`/api/groups/${selectedGroup.data.id}/members/sync`, {
        method: "POST",
        body: JSON.stringify({ members: importRows }),
      });
    },
    onSuccess: async (result: any) => {
      const failedRows: BulkImportFailedRow[] = Array.isArray(result?.failed)
        ? result.failed.map((failed: any) => {
            const rowNumber = Number(failed?.row);
            const sourceIndex = Number.isFinite(rowNumber) ? Math.max(0, rowNumber - 2) : -1;
            return {
              row: Number.isFinite(rowNumber) ? rowNumber : 0,
              email: typeof failed?.email === "string" ? failed.email : undefined,
              reason: typeof failed?.reason === "string" ? failed.reason : "Failed to import row",
              sourceRow: sourceIndex >= 0 ? importRows[sourceIndex] : undefined,
            };
          })
        : [];

      if (selectedGroup?.data?.id) {
        await fetchGroupDetail(selectedGroup.data.id);
      }
      refreshGroups();
      const summary = result?.summary;
      setLastImportSourceFileName(importFileName || "group-census.csv");
      setLastImportFailedRows(failedRows);
      toast({
        title: "Census sync complete",
        description:
          failedRows.length > 0
            ? `Created ${summary?.created ?? 0}, updated ${summary?.updated ?? 0}, failed ${failedRows.length} of ${summary?.received ?? importRows.length} rows.`
            : `Created ${summary?.created ?? 0} and updated ${summary?.updated ?? 0} of ${summary?.received ?? importRows.length} rows`,
        variant: summary?.failed ? "destructive" : undefined,
      });
      setImportFileName("");
      setImportRows([]);
      setImportWarnings([]);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    },
    onError: (err: any) => {
      void handleGroupMutationError(err, "Census import failed");
    },
  });

  const uploadCensusTemplateMutation = useMutation({
    mutationFn: async (file: File) => {
      const dataUrl = await readFileAsDataUrl(file);
      const base64 = dataUrl.split(",")[1] || "";
      if (!base64) {
        throw new Error("Unable to read template file");
      }

      return apiRequest("/api/admin/census-template", {
        method: "POST",
        body: JSON.stringify({
          fileName: file.name,
          mimeType: file.type || "application/octet-stream",
          base64,
        }),
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/census-template"] });
      toast({
        title: "Template updated",
        description: "The census template is now shared across all users.",
      });
      if (censusTemplateInputRef.current) {
        censusTemplateInputRef.current.value = "";
      }
    },
    onError: (err: any) => {
      toast({
        title: "Template upload failed",
        description: err?.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  const handleTemplateDownload = () => {
    const template = censusTemplateData as CensusTemplateConfig | undefined;

    if (template?.source === "custom" && template.base64) {
      const anchor = document.createElement("a");
      const mimeType = template.mimeType || "application/octet-stream";
      anchor.href = `data:${mimeType};base64,${template.base64}`;
      anchor.download = template.fileName || "MyPremierPlans_Census_Template.xlsx";
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      return;
    }

    const anchor = document.createElement("a");
    anchor.href = template?.url || CENSUS_TEMPLATE_PATH;
    anchor.download = template?.fileName || "MyPremierPlans_Census_Template.csv";
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  };

  const handleTemplateUploadSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      uploadCensusTemplateMutation.mutate(file);
    }
  };

  const handleDownloadFailedRows = () => {
    if (lastImportFailedRows.length === 0) {
      toast({
        title: "No failed rows",
        description: "There are no failed rows to download.",
      });
      return;
    }

    const csv = buildFailedRowsCsv(lastImportFailedRows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = buildFailedRowsFileName(lastImportSourceFileName || "group-census.csv");
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  };

  const uploadPaymentFormMutation = useMutation({
    mutationFn: async (file: File) => {
      const groupId = selectedGroup?.data?.id;
      if (!groupId) {
        throw new Error("Select a group first");
      }
      return uploadGroupDocument(groupId, file, "authorized_payment_form");
    },
    onSuccess: async () => {
      if (selectedGroup?.data?.id) {
        await fetchGroupDetail(selectedGroup.data.id);
      }
      toast({
        title: "Payment form uploaded",
        description: "Authorized payment form was attached to this group.",
      });
      if (detailPaymentInputRef.current) {
        detailPaymentInputRef.current.value = "";
      }
    },
    onError: (err: any) => {
      void handleGroupMutationError(err, "Payment form upload failed");
    },
  });

  const handleDetailPaymentFormSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      uploadPaymentFormMutation.mutate(file);
    }
  };

  const completeGroupMutation = useMutation({
    mutationFn: async () => {
      if (!selectedGroup?.data?.id) throw new Error("Select a group first");
      return apiRequest(`/api/groups/${selectedGroup.data.id}/complete`, {
        method: "POST",
        body: JSON.stringify({ status: "registered" }),
      });
    },
    onSuccess: async () => {
      if (selectedGroup?.data?.id) {
        await fetchGroupDetail(selectedGroup.data.id);
      }
      refreshGroups();
      toast({
        title: "Enrollment completed",
        description: "Group enrollment was completed. Activate the group when you are ready.",
      });
    },
    onError: (err: any) => {
      void handleGroupMutationError(err, "Unable to complete enrollment");
    },
  });

  const activateGroupMutation = useMutation({
    mutationFn: async () => {
      if (!selectedGroup?.data?.id) throw new Error("Select a group first");
      return apiRequest(`/api/groups/${selectedGroup.data.id}/activate`, {
        method: "POST",
      });
    },
    onSuccess: async () => {
      if (selectedGroup?.data?.id) {
        await fetchGroupDetail(selectedGroup.data.id);
      }
      refreshGroups();
      toast({
        title: "Group activated",
        description: "This group is now active. Payment can be processed on a separate timeline.",
      });
    },
    onError: (err: any) => {
      void handleGroupMutationError(err, "Unable to activate group");
    },
  });

  const updateEffectiveDateMutation = useMutation({
    mutationFn: async () => {
      const groupId = selectedGroup?.data?.id;
      if (!groupId) throw new Error("Select a group first");

      return apiRequest(`/api/groups/${groupId}/effective-date`, {
        method: "PATCH",
        body: JSON.stringify({
          selectedEffectiveDate: effectiveDateSelection || null,
          overrideReason: effectiveDateReason || null,
        }),
      });
    },
    onSuccess: async () => {
      if (selectedGroup?.data?.id) {
        await fetchGroupDetail(selectedGroup.data.id);
      }
      refreshGroups();
      toast({
        title: "Effective date updated",
        description: "Group effective-date settings were saved.",
      });
    },
    onError: (err: any) => {
      void handleGroupMutationError(err, "Unable to update effective date");
    },
  });

  const updateGroupProfileMutation = useMutation({
    mutationFn: async () => {
      const groupId = selectedGroup?.data?.id;
      if (!groupId) throw new Error("Select a group first");

      return apiRequest(`/api/groups/${groupId}`, {
        method: "PATCH",
        body: JSON.stringify({
          payorType: derivePayorTypeFromPaymentResponsibility(groupProfileForm.paymentResponsibilityMode),
          groupProfile: buildGroupProfilePayload(groupProfileForm),
          assignedAgentId: canAccessAdminViews ? toAssignedAgentPayload(groupAssignedAgentId) : undefined,
        }),
      });
    },
    onSuccess: async () => {
      if (selectedGroup?.data?.id) {
        await fetchGroupDetail(selectedGroup.data.id);
      }
      refreshGroups();
      toast({
        title: "Group profile updated",
        description: "Saved EIN, contact, payor mix, and payment preference.",
      });
    },
    onError: (err: any) => {
      void handleGroupMutationError(err, "Unable to update group profile");
    },
  });

  const updateGroupSetupMutation = useMutation({
    mutationFn: async () => {
      const groupId = selectedGroup?.data?.id;
      if (!groupId) throw new Error("Select a group first");

      return apiRequest(`/api/groups/${groupId}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: groupSetupForm.name.trim(),
          groupType: groupSetupForm.groupType.trim() || null,
          discountCode: groupSetupForm.discountCode.trim().toUpperCase() || null,
          metadata: {
            groupIndustry: groupSetupForm.industry.trim() || null,
          },
        }),
      });
    },
    onSuccess: async () => {
      if (selectedGroup?.data?.id) {
        await fetchGroupDetail(selectedGroup.data.id);
      }
      refreshGroups();
      toast({
        title: "Group setup updated",
        description: "Saved group info, industry, and discount settings.",
      });
    },
    onError: (err: any) => {
      void handleGroupMutationError(err, "Unable to update group setup");
    },
  });

  const updateGroupAssignmentMutation = useMutation({
    mutationFn: async () => {
      const groupId = selectedGroup?.data?.id;
      if (!groupId) throw new Error("Select a group first");

      return apiRequest(`/api/groups/${groupId}`, {
        method: "PATCH",
        body: JSON.stringify({
          assignedAgentId: canAccessAdminViews ? toAssignedAgentPayload(groupAssignedAgentId) : undefined,
        }),
      });
    },
    onSuccess: async () => {
      if (selectedGroup?.data?.id) {
        await fetchGroupDetail(selectedGroup.data.id);
      }
      refreshGroups();
      toast({
        title: "Assignment updated",
        description: "Agent of record was saved.",
      });
    },
    onError: (err: any) => {
      void handleGroupMutationError(err, "Unable to save assignment");
    },
  });

    const handleValidateDiscount = async () => {
      const normalized = newGroupForm.discountCode.trim().toUpperCase();
      if (!normalized) {
        toast({
          title: "Enter a discount code",
          description: "Add a code before running validation.",
        });
        return;
      }

      setIsValidatingDiscount(true);
      try {
        const result = await apiRequest(`/api/discount-codes/validate?code=${encodeURIComponent(normalized)}`);
        const isValid = Boolean(result?.isValid);
        setDiscountValidation({
          code: normalized,
          isValid,
          message: result?.message,
          discountType: result?.discountType,
          durationType: result?.durationType,
        });
        toast({
          title: isValid ? "Discount applied" : "Discount not valid",
          description: result?.message || (isValid ? `Code ${normalized} is active.` : `Code ${normalized} cannot be used.`),
          variant: isValid ? undefined : "destructive",
        });
      } catch (err: any) {
        setDiscountValidation({ code: normalized, isValid: false, message: err?.message || "Unable to validate" });
        toast({
          title: "Unable to validate",
          description: err?.message || "Please try again.",
          variant: "destructive",
        });
      } finally {
        setIsValidatingDiscount(false);
      }
    };

  const handleMemberDialogToggle = (open: boolean) => {
    if (!open) {
      setMemberDialogOpen(false);
      setEditingMember(null);
      resetMemberForm();
      upsertMemberMutation.reset();
      return;
    }
    setMemberDialogOpen(true);
  };

  const handleViewGroup = async (groupId: string) => {
    setDetailLoading(true);
    try {
      await fetchGroupDetail(groupId);
      setDetailStep("setup");
      setDetailOpen(true);
    } catch (err: any) {
      if (isGroupNotFoundError(err)) {
        try {
          // Deployment/reload windows can briefly return 404 for a valid group id.
          // Refresh the list and retry once before treating it as truly missing.
          await refreshGroups();
          await fetchGroupDetail(groupId);
          setDetailStep("setup");
          setDetailOpen(true);
          return;
        } catch (retryErr: any) {
          if (isGroupNotFoundError(retryErr)) {
            await recoverFromMissingGroup();
            return;
          }
          toast({
            title: "Failed to load group",
            description: retryErr?.message || "Please try again",
            variant: "destructive",
          });
          return;
        }
      }

      toast({
        title: "Failed to load group",
        description: err?.message || "Please try again",
        variant: "destructive",
      });
    } finally {
      setDetailLoading(false);
    }
  };

  const handleOpenMemberHostedCheckout = (member: GroupMemberRecord) => {
    const groupId = selectedGroup?.data?.id;
    if (!groupId) {
      toast({
        title: "Group not selected",
        description: "Select a group before launching hosted checkout.",
        variant: "destructive",
      });
      return;
    }

    const explicitTotal = parseCurrencyValue(member.totalAmount);
    const derivedTotal = parseCurrencyValue(member.employerAmount) + parseCurrencyValue(member.memberAmount) - parseCurrencyValue(member.discountAmount);
    const amount = explicitTotal > 0 ? explicitTotal : derivedTotal;

    const params = new URLSearchParams({
      groupId,
      groupMemberId: String(member.id),
    });

    if (amount > 0) {
      params.set("amount", amount.toFixed(2));
    }

    setLocation(`/payments/group-checkout?${params.toString()}`);
  };

  const handleAddMemberClick = () => {
    setEditingMember(null);
    resetMemberForm();
    setMemberDialogOpen(true);
  };

  const handleDropZoneDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragActive(false);
    const file = event.dataTransfer.files?.[0];
    if (file) {
      await handleCensusFile(file);
    }
  };

  const handleDropZoneSelect = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      await handleCensusFile(file);
    }
  };

  const handleEditMemberClick = (member: GroupMemberRecord) => {
    const employment = toEmploymentProfile(member);
    const memberMetadata = (member.metadata || {}) as Record<string, any>;
    const payload = (member.registrationPayload || {}) as Record<string, any>;
      const memberPbmEnabledRaw = payload.pbmEnabled ?? payload.pbm ?? memberMetadata.pbmEnabled ?? memberMetadata.pbm;
      const memberPbmAmountRaw = payload.pbmAmount ?? memberMetadata.pbmAmount;
    const normalizedRelationship = member.relationship || "primary";
    const payloadPlanId = payload.selectedPlanId ?? payload.planId;
    const metadataPlanId = memberMetadata.selectedPlanId ?? memberMetadata.planId;
    const resolvedPlanIdRaw = payloadPlanId ?? metadataPlanId ?? groupProfileForm.selectedPlanId;
    const resolvedPlanId =
      resolvedPlanIdRaw === null || resolvedPlanIdRaw === undefined || resolvedPlanIdRaw === ""
        ? ""
        : String(resolvedPlanIdRaw);
    const resolvedPlanName =
      String(
        payload.selectedPlanName
        || payload.planName
        || memberMetadata.selectedPlanName
        || memberMetadata.planName
        || groupProfileForm.selectedPlanName
        || "",
      );
    const resolvedPlanTier =
      String(
        payload.selectedPlanTier
        || payload.planTier
        || memberMetadata.selectedPlanTier
        || memberMetadata.planTier
        || groupProfileForm.selectedPlanTier
        || "",
      );
    setEditingMember(member);
    resetMemberForm({
      id: member.id,
      relationship: normalizedRelationship,
      firstName: member.firstName || String(payload.firstName || payload.first_name || ""),
      middleName: employment.middleName,
      lastName: member.lastName || String(payload.lastName || payload.last_name || ""),
      suffix: employment.suffix,
      preferredName: employment.preferredName,
      dateOfBirth: member.dateOfBirth || String(payload.dateOfBirth || payload.date_of_birth || payload.dob || ""),
      sex: employment.sex,
      hireDate: employment.hireDate,
      className: employment.className,
      department: employment.department,
      division: employment.division,
      businessUnit: employment.businessUnit,
      workEmail: employment.workEmail || (isPrimaryRelationshipValue(member.relationship) ? (member.email || "") : ""),
      personalEmail: employment.personalEmail,
      payrollGroup: employment.payrollGroup,
      annualBaseSalary: employment.annualBaseSalary,
      hoursPerWeek: employment.hoursPerWeek,
      salaryEffectiveDate: employment.salaryEffectiveDate,
      address1: employment.address1,
      address2: employment.address2,
      city: employment.city,
      state: employment.state,
      zipCode: employment.zipCode,
      county: employment.county,
      country: employment.country,
      homePhone: employment.homePhone,
      mobilePhone: employment.mobilePhone || member.phone || "",
      workPhone: employment.workPhone,
      employmentType: employment.employmentType,
      jobTitle: employment.jobTitle,
      retireDate: employment.retireDate,
      originalHireDate: employment.originalHireDate,
      terminationDate: employment.terminationDate,
      terminationReason: employment.terminationReason,
      rehireDate: employment.rehireDate,
      ssn: member.ssn || "",
      selectedPlanId: resolvedPlanId,
      selectedPlanName: resolvedPlanName,
      selectedPlanTier: resolvedPlanTier,
      pbmEnabled: Boolean(memberPbmEnabledRaw),
      pbmAmount:
        memberPbmAmountRaw === null || memberPbmAmountRaw === undefined || memberPbmAmountRaw === ""
          ? (groupProfileForm.pbmAmount || "")
          : String(memberPbmAmountRaw),
      tier: deriveTierFromRelationship(normalizedRelationship, member.tier),
      payorType: member.payorType || selectedGroup?.data?.payorType || "full",
      status: member.status || "draft",
    });
    setMemberDialogOpen(true);
  };

  const missingMemberFields = collectMissingMemberFields(memberForm);
  const isMemberFormValid = missingMemberFields.length === 0;
  const memberPlanIsMemberOnly = useMemo(
    () => isMemberOnlyPlanName(memberForm.selectedPlanName),
    [memberForm.selectedPlanName],
  );
  const memberCoverageMonthlyPrice = useMemo(
    () => resolveMemberCoverageMonthlyPrice(
      normalizeRelationshipForPlan(memberForm.relationship, memberForm.selectedPlanName),
      memberForm.selectedPlanTier,
      memberForm.selectedPlanName,
    ),
    [memberForm.relationship, memberForm.selectedPlanTier, memberForm.selectedPlanName],
  );
  const memberPbmMonthlyAmount = useMemo(
    () => (memberForm.pbmEnabled ? Math.max(0, Number(memberForm.pbmAmount || 0)) : 0),
    [memberForm.pbmEnabled, memberForm.pbmAmount],
  );
  const memberCalculatedMonthlyTotal = useMemo(
    () => (memberCoverageMonthlyPrice === null ? null : Number((memberCoverageMonthlyPrice + memberPbmMonthlyAmount).toFixed(2))),
    [memberCoverageMonthlyPrice, memberPbmMonthlyAmount],
  );

  const memberDialogTitle = editingMember ? "Edit Group Member" : "Add Group Member";
  const memberDialogDescription = editingMember
    ? "Update this record before sending the hosted checkout link."
    : "Enter each enrollee before triggering hosted checkout.";
  const activeMemberCount = selectedGroup?.members?.filter((member) => member.status !== "terminated").length ?? 0;
  const memberCount = selectedGroup?.members?.length ?? 0;
  const activeGroupMembers = useMemo(
    () => (selectedGroup?.members || []).filter((member) => member.status !== "terminated"),
    [selectedGroup?.members],
  );
  const groupFinancialSnapshot = useMemo(() => {
    let employerTotal = 0;
    let memberTotal = 0;
    let discountTotal = 0;
    let invoiceTotal = 0;
    let membersMissingTotalAmount = 0;

    for (const member of activeGroupMembers) {
      const employer = parseCurrencyValue(member.employerAmount);
      const memberAmount = parseCurrencyValue(member.memberAmount);
      const discount = parseCurrencyValue(member.discountAmount);
      const explicitTotal = parseCurrencyValue(member.totalAmount);
      const derivedTotal = employer + memberAmount - discount;
      const resolvedTotal = explicitTotal > 0 ? explicitTotal : derivedTotal;

      employerTotal += employer;
      memberTotal += memberAmount;
      discountTotal += discount;
      invoiceTotal += resolvedTotal;

      if (!member.totalAmount || member.totalAmount === "") {
        membersMissingTotalAmount += 1;
      }
    }

    const tierCounts = activeGroupMembers.reduce<Record<string, number>>((acc, member) => {
      const tier = (member.tier || "unknown").toLowerCase();
      acc[tier] = (acc[tier] || 0) + 1;
      return acc;
    }, {});

    const payorCounts = activeGroupMembers.reduce<Record<string, number>>((acc, member) => {
      const payor = (member.payorType || selectedGroup?.data?.payorType || "unknown").toLowerCase();
      acc[payor] = (acc[payor] || 0) + 1;
      return acc;
    }, {});

    return {
      employerTotal,
      memberTotal,
      discountTotal,
      invoiceTotal,
      membersMissingTotalAmount,
      tierCounts,
      payorCounts,
    };
  }, [activeGroupMembers, selectedGroup?.data?.payorType]);
  const groupProfileContext = selectedGroup?.groupProfileContext;
  const groupFinancialSummary = selectedGroup?.groupFinancialSummary;
  const monthlyRevenueDisplay = groupFinancialSummary?.monthlyRevenue ?? groupFinancialSnapshot.invoiceTotal;
  const yearlyRevenueDisplay = groupFinancialSummary?.yearlyProjectedRevenue ?? (monthlyRevenueDisplay * 12);
  const projectedMonthlyCommissionDisplay = groupFinancialSummary?.projectedMonthlyCommission ?? 0;
  const projectedYearlyCommissionDisplay = groupFinancialSummary?.projectedYearlyCommission ?? (projectedMonthlyCommissionDisplay * 12);
  const activeMemberCountDisplay = groupFinancialSummary?.activeMemberCount ?? activeGroupMembers.length;
  const profileComplete = Boolean(groupProfileContext?.isComplete);
  const paymentResponsibilityMode = groupProfileContext?.profile?.paymentResponsibilityMode || "group_invoice";
  const allowsMemberPaymentCollection = paymentResponsibilityMode === "member_self_pay" || paymentResponsibilityMode === "hybrid_split";
  const allowsGroupInvoiceCollection = paymentResponsibilityMode === "group_invoice" || paymentResponsibilityMode === "hybrid_split";
  const usesPayrollExternalCollection = paymentResponsibilityMode === "payroll_external";
  const groupStatus = selectedGroup?.data?.status || "draft";
  const isEnrollmentComplete = groupStatus === "registered" || groupStatus === "active";
  const isGroupActive = groupStatus === "active";
  const canCompleteEnrollment = activeMemberCount > 0 && !isEnrollmentComplete;
  const activeMembersMissingRequired = selectedGroup?.members?.filter((member) =>
    member.status !== "terminated" && !isMemberCompleteForEnrollment(member)
  ).length ?? 0;
  const hasEnrollmentDataGaps = !profileComplete || activeMembersMissingRequired > 0;
  const canActivateGroup = activeMemberCount > 0 && profileComplete && isEnrollmentComplete && !isGroupActive;
  const paymentHandoffStatusLabel = selectedGroup?.data?.hostedCheckoutStatus || "not-started";
  const paymentHandoffBadgeClass = paymentHandoffStatusLabel === "ready"
    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
    : paymentHandoffStatusLabel === "in-progress"
      ? "bg-amber-50 text-amber-700 border-amber-200"
      : "bg-slate-50 text-slate-600 border-slate-200";
  const effectiveDateContext = selectedGroup?.effectiveDateContext;
  const selectedIsDefault =
    effectiveDateContext &&
    effectiveDateSelection &&
    effectiveDateSelection === effectiveDateContext.defaultEffectiveDate;
  const canSaveEffectiveDate = Boolean(
    effectiveDateContext?.canOverride &&
    effectiveDateSelection &&
    (selectedIsDefault || effectiveDateReason.trim().length >= 5)
  );
  const canRunBulkImport = importRows.length > 0 && !bulkImportMembersMutation.isPending;
  const canDownloadFailedRows = lastImportFailedRows.length > 0;
  const groupDocuments = getGroupDocumentsFromMetadata(selectedGroup?.data?.metadata);
  const latestPaymentForm = groupDocuments.find((doc) => doc.type === "authorized_payment_form");
  const canCreateGroup = Boolean(newGroupForm.name.trim().length > 0 && newGroupCensusRows.length > 0);
  const setupComplete = Boolean(groupSetupForm.name.trim().length > 0);
  const membersComplete = activeMemberCount > 0;
  const readinessComplete = isEnrollmentComplete;
  const canOpenProfileStep = true;
  const canOpenMembersStep = true;
  // Allow opening Enrollment step once members exist so teams can review readiness gaps in one place.
  // Final completion/activation still enforces profile completeness and required member data.
  const canOpenReadinessStep = membersComplete || readinessComplete;
  const navigateDetailStep = (nextStep: DetailStep) => {
    if (nextStep === "setup") {
      setDetailStep("setup");
      return;
    }

    if (nextStep === "profile" && !canOpenProfileStep) {
      toast({
        title: "Profile step is locked",
        description: "Complete required prerequisites before opening Group Profile.",
      });
      return;
    }

    if (nextStep === "members" && !canOpenMembersStep) {
      toast({
        title: "Members step is locked",
        description: "Complete required prerequisites before opening Members.",
      });
      return;
    }

    if (nextStep === "readiness" && !canOpenReadinessStep) {
      toast({
        title: "Enrollment step is locked",
        description: "Add at least one active member first.",
      });
      return;
    }

    setDetailStep(nextStep);
  };
  const newGroupIndustryIsCustom = Boolean(newGroupForm.industry.trim()) && !isPresetIndustryValue(newGroupForm.industry);
  const newGroupIndustrySelectValue = newGroupIndustryIsCustom
    ? INDUSTRY_OTHER_VALUE
    : (newGroupForm.industry || INDUSTRY_NOT_SET_VALUE);
  const detailIndustryIsCustom = Boolean(groupSetupForm.industry.trim()) && !isPresetIndustryValue(groupSetupForm.industry);
  const detailIndustrySelectValue = detailIndustryIsCustom
    ? INDUSTRY_OTHER_VALUE
    : (groupSetupForm.industry || INDUSTRY_NOT_SET_VALUE);
  const selectedGroupCurrentAgentId = getAssignedAgentIdFromMetadata(selectedGroup?.data?.metadata) || "";
  const selectedGroupOriginalAgentId = getOriginalAssignedAgentIdFromMetadata(selectedGroup?.data?.metadata) || "";
  const canEditSelectedGroup = canAccessAdminViews
    || (!!user?.id && selectedGroupCurrentAgentId === user.id);
  const canSubmitReassignment = Boolean(
    selectedGroup?.data?.id
    && reassignmentForm.newAgentId
    && reassignmentForm.newAgentId !== IN_HOUSE_AGENT_OPTION_VALUE
    && reassignmentForm.newAgentId !== selectedGroupCurrentAgentId
    && reassignmentForm.reason.trim().length >= 3
    && reassignmentForm.effectiveDate,
  );

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (!isAuthorized) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <Card className="max-w-lg w-full">
          <CardHeader>
            <CardTitle>Access Restricted</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-600">
              Only active agents, admins, and super admins can access the group enrollment workspace.
              Please switch accounts or contact a super admin for access.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col gap-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="space-y-2">
              {canAccessAdminViews && (
                <Button
                  variant="ghost"
                  onClick={() => setLocation("/admin")}
                  className="w-fit px-0 text-sm text-gray-600 hover:text-gray-900"
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Admin View
                </Button>
              )}
              <p className="text-sm text-gray-500 uppercase tracking-wide">Stage 1 Manual Workflow</p>
              <h1 className="text-3xl font-bold text-gray-900">Enrollment Records</h1>
              <p className="text-gray-600 mt-1">Groups view: groups are pre-configured outside this app. Use this workspace for member enrollment and activation.</p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <Button onClick={() => setNewGroupOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                New Group Setup
              </Button>
              <Button variant="outline" onClick={refreshGroups}>
                Refresh
              </Button>
            </div>
          </div>

          {canAccessAdminViews && (
            <div className="w-fit rounded-lg border border-gray-200 p-1 bg-gray-50">
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="text-gray-600 hover:text-gray-900"
                  onClick={() => {
                    window.localStorage.setItem(ENROLLMENT_RECORD_VIEW_KEY, "people");
                    setLocation("/admin/enrollments");
                  }}
                >
                  People
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="bg-white text-gray-900 shadow-sm hover:bg-white"
                >
                  Groups
                </Button>
              </div>
            </div>
          )}

          {canAccessAdminViews && (
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">Group Filters</p>
              <div className="grid gap-3 md:grid-cols-3">
                <div>
                  <Label className="text-xs uppercase text-gray-500">Current Agent</Label>
                  <Select value={groupCurrentAgentFilter} onValueChange={setGroupCurrentAgentFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="All current agents" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All current agents</SelectItem>
                      <SelectItem value="unassigned">Unassigned / In-house</SelectItem>
                      {agentOptions.map((agent) => (
                        <SelectItem key={agent.id} value={agent.id}>
                          {getAgentLabel(agent.id)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs uppercase text-gray-500">Original Agent</Label>
                  <Select value={groupOriginalAgentFilter} onValueChange={setGroupOriginalAgentFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="All original agents" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All original agents</SelectItem>
                      <SelectItem value="unassigned">Unassigned / In-house</SelectItem>
                      {agentOptions.map((agent) => (
                        <SelectItem key={agent.id} value={agent.id}>
                          {getAgentLabel(agent.id)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2 mt-6 md:mt-0">
                  <Checkbox
                    id="reassigned-only"
                    checked={groupReassignedOnlyFilter}
                    onCheckedChange={(value) => setGroupReassignedOnlyFilter(Boolean(value))}
                  />
                  <Label htmlFor="reassigned-only">Reassigned groups only</Label>
                </div>
              </div>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Unable to load groups</AlertTitle>
            <AlertDescription>Check your connection and try again.</AlertDescription>
          </Alert>
        )}

        <section className="grid gap-6 md:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm text-gray-500 uppercase">Active Groups</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{groups.length}</p>
              <p className="text-sm text-gray-500">Groups currently in enrollment workflow</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm text-gray-500 uppercase">Payor Mix</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {[
                { value: 'full', label: 'Employer Pays All' },
                { value: 'member', label: 'Member Pays All' },
                { value: 'mixed', label: 'Mixed Split' },
              ].map((option) => {
                const count = groups.filter((g) => g.payorType === option.value).length;
                return (
                  <div key={option.value} className="flex items-center justify-between text-sm">
                    <span>{option.label}</span>
                    <Badge variant="secondary">{count}</Badge>
                  </div>
                );
              })}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm text-gray-500 uppercase">Next Step</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-gray-700">Add employee records, complete enrollment, then activate when the group is ready.</p>
              <p className="text-xs text-gray-500">Payment collection can be completed later on a separate timeline.</p>
              {canAccessAdminViews && (
                <div className="pt-2 space-y-2">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <Badge variant="secondary">Unassigned queue: {unassignedQueueCount}</Badge>
                    <Badge variant="outline">My assigned queue: {myAssignedQueueCount}</Badge>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => {
                      setGroupCurrentAgentFilter("unassigned");
                      setGroupOriginalAgentFilter("all");
                      setGroupReassignedOnlyFilter(false);
                    }}
                  >
                    Open Unassigned Queue
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </section>

        <Card>
          <CardHeader>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle>Group Pipeline</CardTitle>
                <p className="text-sm text-gray-500">Monitor each employer group before payment handoff.</p>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                  <Badge variant="outline">Draft: {statusSummary.draft}</Badge>
                  <Badge variant="outline">Enrolled: {statusSummary.registered}</Badge>
                  <Badge variant="outline">Active: {statusSummary.active}</Badge>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {groups.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <Users className="h-10 w-10 mx-auto mb-4 text-gray-400" />
                <p>No groups created yet.</p>
                <p className="text-sm">Use the "New Group Setup" button to start.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Group</TableHead>
                      <TableHead>Payor Type</TableHead>
                      {canAccessAdminViews && <TableHead>Current Agent</TableHead>}
                      {canAccessAdminViews && <TableHead>Original Agent</TableHead>}
                      <TableHead>Status</TableHead>
                      <TableHead>Discount</TableHead>
                      <TableHead>Updated</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {groups.map((group) => (
                      <TableRow key={group.id}>
                        <TableCell>
                          <div className="font-medium">{group.name}</div>
                          <div className="text-sm text-gray-500">{group.groupType || 'General'}</div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{group.payorType}</Badge>
                        </TableCell>
                        {canAccessAdminViews && (
                          <TableCell className="text-sm">
                            {getAgentLabel(group.currentAssignedAgentId || getAssignedAgentIdFromMetadata(group.metadata))}
                          </TableCell>
                        )}
                        {canAccessAdminViews && (
                          <TableCell className="text-sm">
                            {getAgentLabel(group.originalAssignedAgentId || getOriginalAssignedAgentIdFromMetadata(group.metadata))}
                          </TableCell>
                        )}
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {group.status === 'active' ? (
                              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                            ) : group.status === 'registered' ? (
                              <CheckCircle2 className="h-4 w-4 text-blue-600" />
                            ) : (
                              <Layers className="h-4 w-4 text-amber-500" />
                            )}
                            <span className="capitalize">{group.status}</span>
                            {group.hasReassignmentHistory && (
                              <Badge variant="secondary" className="ml-1">Reassigned</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{group.discountCode || '—'}</TableCell>
                        <TableCell className="text-sm text-gray-500">
                          {group.updatedAt ? formatDistanceToNow(new Date(group.updatedAt), { addSuffix: true }) : 'just now'}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="outline" size="sm" onClick={() => handleViewGroup(group.id)}>
                            View
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      <Dialog open={newGroupOpen} onOpenChange={setNewGroupOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Start New Group Setup</DialogTitle>
            <DialogDescription>Capture the basic employer information to begin group setup.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="group-name">Group Name</Label>
              <Input
                id="group-name"
                placeholder="Acme Logistics"
                value={newGroupForm.name}
                onChange={(event) => setNewGroupForm((prev) => ({ ...prev, name: event.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="group-type">Group Type</Label>
              <Input
                id="group-type"
                placeholder="Industry or segment"
                value={newGroupForm.groupType}
                onChange={(event) => setNewGroupForm((prev) => ({ ...prev, groupType: event.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="group-industry">Industry</Label>
              <Select
                value={newGroupIndustrySelectValue}
                onValueChange={(value) => {
                  if (value === INDUSTRY_NOT_SET_VALUE) {
                    setNewGroupForm((prev) => ({ ...prev, industry: "" }));
                    return;
                  }

                  if (value === INDUSTRY_OTHER_VALUE) {
                    if (!newGroupIndustryIsCustom) {
                      setNewGroupForm((prev) => ({ ...prev, industry: "" }));
                    }
                    return;
                  }

                  setNewGroupForm((prev) => ({ ...prev, industry: value }));
                }}
              >
                <SelectTrigger id="group-industry">
                  <SelectValue placeholder="Select industry" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={INDUSTRY_NOT_SET_VALUE}>Not set</SelectItem>
                  {industryOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value === "Other" ? INDUSTRY_OTHER_VALUE : option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {newGroupIndustrySelectValue === INDUSTRY_OTHER_VALUE && (
                <Input
                  className="mt-2"
                  placeholder="Enter custom industry"
                  value={newGroupForm.industry}
                  onChange={(event) => setNewGroupForm((prev) => ({ ...prev, industry: event.target.value }))}
                />
              )}
            </div>
            {canAccessAdminViews && (
              <div>
                <Label>Assign to Agent of Record</Label>
                <Select
                  value={newGroupAssignedAgentId}
                  onValueChange={setNewGroupAssignedAgentId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select an agent" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={IN_HOUSE_AGENT_OPTION_VALUE}>
                      In-house (Admin serviced)
                    </SelectItem>
                    {agentOptions.map((agent) => (
                      <SelectItem key={agent.id} value={agent.id}>
                        {agent.agentNumber ? `${agent.agentNumber} - ` : ""}
                        {`${agent.firstName || ""} ${agent.lastName || ""}`.trim() || agent.email || agent.id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-slate-600 mt-1">Use In-house when no specific agent/user owns servicing.</p>
              </div>
            )}
            <div>
              <Label>Payor Matrix Option</Label>
              <Select
                value={newGroupProfileForm.payorMixMode}
                onValueChange={(value) =>
                  setNewGroupProfileForm((prev) => ({
                    ...prev,
                    payorMixMode: value as GroupProfile['payorMixMode'],
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select payor mix" />
                </SelectTrigger>
                <SelectContent>
                  {payorMixOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {newGroupProfileForm.payorMixMode === "fixed" && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="new-employer-fixed">Employer Amount ($)</Label>
                  <Input
                    id="new-employer-fixed"
                    value={newGroupProfileForm.employerFixedAmount}
                    onChange={(event) =>
                      setNewGroupProfileForm((prev) => ({ ...prev, employerFixedAmount: event.target.value }))
                    }
                    placeholder="100.00"
                  />
                </div>
                <div>
                  <Label htmlFor="new-member-fixed">Member Amount ($)</Label>
                  <Input
                    id="new-member-fixed"
                    value={newGroupProfileForm.memberFixedAmount}
                    onChange={(event) =>
                      setNewGroupProfileForm((prev) => ({ ...prev, memberFixedAmount: event.target.value }))
                    }
                    placeholder="25.00"
                  />
                </div>
              </div>
            )}
            {newGroupProfileForm.payorMixMode === "percentage" && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="new-employer-percent">Employer Percentage (%)</Label>
                  <Input
                    id="new-employer-percent"
                    value={newGroupProfileForm.employerPercentage}
                    onChange={(event) =>
                      setNewGroupProfileForm((prev) => ({ ...prev, employerPercentage: event.target.value }))
                    }
                    placeholder="80"
                  />
                </div>
                <div>
                  <Label htmlFor="new-member-percent">Member Percentage (%)</Label>
                  <Input
                    id="new-member-percent"
                    value={newGroupProfileForm.memberPercentage}
                    onChange={(event) =>
                      setNewGroupProfileForm((prev) => ({ ...prev, memberPercentage: event.target.value }))
                    }
                    placeholder="20"
                  />
                </div>
              </div>
            )}
            <div>
              <Label htmlFor="new-group-ein">EIN</Label>
              <Input
                id="new-group-ein"
                value={newGroupProfileForm.ein}
                onChange={(event) => setNewGroupProfileForm((prev) => ({ ...prev, ein: event.target.value }))}
                placeholder="12-3456789"
              />
            </div>
            <div className="space-y-3 border rounded-md p-3 bg-slate-50">
              <div>
                <Label>Group Plan Tier</Label>
                <Select
                  value={newGroupProfileForm.selectedPlanId}
                  onValueChange={(value) => {
                    const selectedPlan = planCatalogById.get(value);
                    setNewGroupProfileForm((prev) => ({
                      ...prev,
                      selectedPlanId: value,
                      selectedPlanName: selectedPlan?.name || "",
                      selectedPlanTier: selectedPlan ? derivePlanTierFromName(selectedPlan.name) : "",
                      pbmProgram: prev.pbmProgram || defaultGroupProfileForm.pbmProgram,
                    }));
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a plan tier" />
                  </SelectTrigger>
                  <SelectContent>
                    {availablePlans.map((plan) => (
                      <SelectItem key={plan.id} value={String(plan.id)}>
                        {plan.name} {plan.price !== null ? `- $${plan.price.toFixed(2)}/mo` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="new-group-pbm-program">PBM Program</Label>
                <Input
                  id="new-group-pbm-program"
                  value={newGroupProfileForm.pbmProgram}
                  onChange={(event) =>
                    setNewGroupProfileForm((prev) => ({ ...prev, pbmProgram: event.target.value }))
                  }
                  placeholder="PBM program details"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label>PBM Enabled</Label>
                  <Select
                    value={newGroupProfileForm.pbmEnabled ? "enabled" : "disabled"}
                    onValueChange={(value) =>
                      setNewGroupProfileForm((prev) => ({ ...prev, pbmEnabled: value === "enabled" }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="PBM selection" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="disabled">Disabled</SelectItem>
                      <SelectItem value="enabled">Enabled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="new-group-pbm-amount">PBM Monthly Amount ($)</Label>
                  <Input
                    id="new-group-pbm-amount"
                    type="number"
                    min="0"
                    step="0.01"
                    value={newGroupProfileForm.pbmAmount}
                    onChange={(event) =>
                      setNewGroupProfileForm((prev) => ({ ...prev, pbmAmount: event.target.value }))
                    }
                    placeholder="0.00"
                    disabled={!newGroupProfileForm.pbmEnabled}
                  />
                </div>
              </div>
              {newGroupProfileForm.selectedPlanId ? (
                <div className="text-xs text-slate-700 space-y-1">
                  <p>
                    Plan Tier: <span className="font-medium">{newGroupProfileForm.selectedPlanTier || "-"}</span>
                  </p>
                  <p>
                    Base Price: <span className="font-medium">{selectedNewGroupPlan?.price !== null && selectedNewGroupPlan?.price !== undefined ? `$${selectedNewGroupPlan.price.toFixed(2)}/mo` : "-"}</span>
                  </p>
                </div>
              ) : null}
              {newPlanPricingRows.length > 0 ? (
                <div>
                  <p className="text-xs font-semibold text-slate-800 mb-2">Coverage Pricing and Commission</p>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Coverage</TableHead>
                        <TableHead>Monthly Price</TableHead>
                        <TableHead>Agent Commission</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {newPlanPricingRows.map((row) => (
                        <TableRow key={row.coverageLabel}>
                          <TableCell>{row.coverageLabel}</TableCell>
                          <TableCell>${row.monthlyPrice.toFixed(2)}</TableCell>
                          <TableCell>${row.agentCommission.toFixed(2)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : null}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="new-responsible-name">Responsible Person Name</Label>
                <Input
                  id="new-responsible-name"
                  value={newGroupProfileForm.responsiblePersonName}
                  onChange={(event) =>
                    setNewGroupProfileForm((prev) => ({ ...prev, responsiblePersonName: event.target.value }))
                  }
                />
              </div>
              <div>
                <Label htmlFor="new-responsible-email">Responsible Person Email</Label>
                <Input
                  id="new-responsible-email"
                  type="email"
                  value={newGroupProfileForm.responsiblePersonEmail}
                  onChange={(event) =>
                    setNewGroupProfileForm((prev) => ({ ...prev, responsiblePersonEmail: event.target.value }))
                  }
                />
              </div>
            </div>
            <div>
              <Label htmlFor="new-responsible-phone">Responsible Person Phone</Label>
              <Input
                id="new-responsible-phone"
                value={newGroupProfileForm.responsiblePersonPhone}
                onChange={(event) =>
                  setNewGroupProfileForm((prev) => ({ ...prev, responsiblePersonPhone: event.target.value }))
                }
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="new-contact-name">Contact Person Name</Label>
                <Input
                  id="new-contact-name"
                  value={newGroupProfileForm.contactPersonName}
                  onChange={(event) =>
                    setNewGroupProfileForm((prev) => ({ ...prev, contactPersonName: event.target.value }))
                  }
                />
              </div>
              <div>
                <Label htmlFor="new-contact-email">Contact Person Email</Label>
                <Input
                  id="new-contact-email"
                  type="email"
                  value={newGroupProfileForm.contactPersonEmail}
                  onChange={(event) =>
                    setNewGroupProfileForm((prev) => ({ ...prev, contactPersonEmail: event.target.value }))
                  }
                />
              </div>
            </div>
            <div>
              <Label htmlFor="new-contact-phone">Contact Person Phone</Label>
              <Input
                id="new-contact-phone"
                value={newGroupProfileForm.contactPersonPhone}
                onChange={(event) =>
                  setNewGroupProfileForm((prev) => ({ ...prev, contactPersonPhone: event.target.value }))
                }
              />
            </div>
            <div>
              <Label>Payment Responsibility</Label>
              <Select
                value={newGroupProfileForm.paymentResponsibilityMode}
                onValueChange={(value) =>
                  setNewGroupProfileForm((prev) => ({
                    ...prev,
                    paymentResponsibilityMode: value as GroupProfile['paymentResponsibilityMode'],
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select payment responsibility" />
                </SelectTrigger>
                <SelectContent>
                  {paymentResponsibilityModeOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Preferred Payment Method</Label>
              <Select
                value={newGroupProfileForm.preferredPaymentMethod}
                onValueChange={(value) =>
                  setNewGroupProfileForm((prev) => ({
                    ...prev,
                    preferredPaymentMethod: value as GroupProfile['preferredPaymentMethod'],
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select payment method" />
                </SelectTrigger>
                <SelectContent>
                  {preferredPaymentMethodOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {newGroupProfileForm.preferredPaymentMethod === "ach" && (
              <div className="space-y-4 border rounded-md p-3 bg-slate-50">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="new-ach-routing">Routing Number</Label>
                    <Input
                      id="new-ach-routing"
                      value={newGroupProfileForm.achRoutingNumber}
                      onChange={(event) =>
                        setNewGroupProfileForm((prev) => ({ ...prev, achRoutingNumber: event.target.value }))
                      }
                    />
                  </div>
                  <div>
                    <Label htmlFor="new-ach-account">Account Number</Label>
                    <Input
                      id="new-ach-account"
                      value={newGroupProfileForm.achAccountNumber}
                      onChange={(event) =>
                        setNewGroupProfileForm((prev) => ({ ...prev, achAccountNumber: event.target.value }))
                      }
                    />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="new-ach-bank">Bank Name</Label>
                    <Input
                      id="new-ach-bank"
                      value={newGroupProfileForm.achBankName}
                      onChange={(event) =>
                        setNewGroupProfileForm((prev) => ({ ...prev, achBankName: event.target.value }))
                      }
                    />
                  </div>
                  <div>
                    <Label>Account Type</Label>
                    <Select
                      value={newGroupProfileForm.achAccountType}
                      onValueChange={(value) =>
                        setNewGroupProfileForm((prev) => ({
                          ...prev,
                          achAccountType: value as GroupProfile['achAccountType'],
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select account type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="checking">Checking</SelectItem>
                        <SelectItem value="savings">Savings</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            )}
            <div>
              <Label htmlFor="discount-code">Discount Code (optional)</Label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  id="discount-code"
                  placeholder="WELCOME20"
                  value={newGroupForm.discountCode}
                  onChange={(event) => {
                    const value = event.target.value.toUpperCase();
                    setNewGroupForm((prev) => ({ ...prev, discountCode: value }));
                    setDiscountValidation(null);
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleValidateDiscount}
                  disabled={!newGroupForm.discountCode.trim() || isValidatingDiscount}
                >
                  {isValidatingDiscount ? 'Checking...' : 'Validate'}
                </Button>
              </div>
              {discountValidation &&
                newGroupForm.discountCode.trim().toUpperCase() === discountValidation.code && (
                  <p className={`text-xs mt-1 ${discountValidation.isValid ? 'text-emerald-600' : 'text-red-600'}`}>
                    {discountValidation.message ||
                      (discountValidation.isValid ? 'Discount code is valid.' : 'Discount code is invalid.')}
                  </p>
                )}
            </div>

            <div className="space-y-2 border rounded-md p-3 bg-slate-50">
              <p className="text-sm font-medium text-slate-800">File Uploads</p>
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-white px-3 py-2">
                <p className="text-xs text-slate-600">
                  Use the standard template so every heading maps correctly during import.
                </p>
                <Button type="button" size="sm" variant="outline" onClick={handleTemplateDownload}>
                  <Download className="mr-1 h-4 w-4" />
                  Download Census Template
                </Button>
                {canAccessAdminViews && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => censusTemplateInputRef.current?.click()}
                    disabled={uploadCensusTemplateMutation.isPending}
                  >
                    {uploadCensusTemplateMutation.isPending ? "Uploading..." : "Upload New Template"}
                  </Button>
                )}
              </div>
              <input
                ref={censusTemplateInputRef}
                type="file"
                accept=".csv,.xls,.xlsx"
                className="hidden"
                onChange={handleTemplateUploadSelect}
              />
              <input
                ref={newGroupCensusInputRef}
                type="file"
                accept=".csv,.xls,.xlsx"
                className="hidden"
                onChange={handleNewGroupCensusSelect}
              />
              <input
                ref={newGroupPaymentInputRef}
                type="file"
                accept=".pdf,.png,.jpg,.jpeg"
                className="hidden"
                onChange={handleNewGroupPaymentFormSelect}
              />
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Button type="button" variant="outline" size="sm" onClick={() => newGroupCensusInputRef.current?.click()}>
                  Choose Census File
                </Button>
                <span className="text-xs text-slate-600">
                  {newGroupCensusFileName
                    ? `${newGroupCensusFileName} (${newGroupCensusRows.length} rows queued)`
                    : "Required: upload census before saving the group"}
                </span>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Button type="button" variant="outline" size="sm" onClick={() => newGroupPaymentInputRef.current?.click()}>
                  Choose Authorized Payment Form
                </Button>
                <span className="text-xs text-slate-600">
                  {newGroupPaymentFormFile
                    ? `${newGroupPaymentFormFile.name} queued for upload`
                    : "Optional: attach payment authorization form after saving"}
                </span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setNewGroupOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createGroupMutation.mutate()}
              disabled={!canCreateGroup || createGroupMutation.isPending}
            >
              {createGroupMutation.isPending ? 'Saving...' : 'Save Group'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="w-[96vw] max-w-[1500px] h-[92vh] flex flex-col overflow-hidden p-0">
          <DialogHeader className="px-6 pt-6 pb-3 border-b">
            <DialogTitle>{selectedGroup?.data?.name || 'Group Details'}</DialogTitle>
            <DialogDescription>
              Manual member entry and hosted checkout prep live here. Use the API-backed flow to keep downtime low.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {detailLoading || !selectedGroup ? (
              <div className="flex items-center justify-center py-10">
                <LoadingSpinner />
              </div>
            ) : (
              <div className="space-y-6">
              <div className="rounded-lg border bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Enrollment Flow</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-4">
                  <Button
                    type="button"
                    variant={detailStep === "setup" ? "default" : "outline"}
                    size="sm"
                    onClick={() => navigateDetailStep("setup")}
                  >
                    1. Setup {setupComplete ? "✓" : ""}
                  </Button>
                  <Button
                    type="button"
                    variant={detailStep === "profile" ? "default" : "outline"}
                    size="sm"
                    onClick={() => navigateDetailStep("profile")}
                    disabled={!canOpenProfileStep}
                  >
                    2. Profile {profileComplete ? "✓" : ""}
                  </Button>
                  <Button
                    type="button"
                    variant={detailStep === "members" ? "default" : "outline"}
                    size="sm"
                    onClick={() => navigateDetailStep("members")}
                    disabled={!canOpenMembersStep}
                  >
                    3. Members {membersComplete ? "✓" : ""}
                  </Button>
                  <Button
                    type="button"
                    variant={detailStep === "readiness" ? "default" : "outline"}
                    size="sm"
                    onClick={() => navigateDetailStep("readiness")}
                    disabled={!canOpenReadinessStep}
                  >
                    4. Enrollment {readinessComplete ? "✓" : ""}
                  </Button>
                </div>
                {(!canOpenMembersStep || !canOpenReadinessStep) && (
                  <p className="mt-2 text-xs text-slate-600">
                    Complete profile and add at least one active member before finishing enrollment.
                  </p>
                )}
              </div>

              {detailStep === "setup" && (
                <>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label>Status</Label>
                  <p className="font-medium capitalize">{selectedGroup.data.status}</p>
                </div>
                <div>
                  <Label>Payor Type</Label>
                  <p className="font-medium capitalize">{selectedGroup.data.payorType}</p>
                </div>
                {canAccessAdminViews && (
                  <div>
                    <Label>Agent of Record</Label>
                    <Select value={groupAssignedAgentId} onValueChange={setGroupAssignedAgentId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select an agent" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={IN_HOUSE_AGENT_OPTION_VALUE}>
                          In-house (Admin serviced)
                        </SelectItem>
                        {agentOptions.map((agent) => (
                          <SelectItem key={agent.id} value={agent.id}>
                            {agent.agentNumber ? `${agent.agentNumber} - ` : ""}
                            {`${agent.firstName || ""} ${agent.lastName || ""}`.trim() || agent.email || agent.id}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="mt-2 space-y-1 text-xs text-slate-600">
                      <p>Current: {getAgentLabel(selectedGroupCurrentAgentId || null)}</p>
                      <p>Original: {getAgentLabel(selectedGroupOriginalAgentId || null)}</p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-3"
                      onClick={() => setReassignDialogOpen(true)}
                    >
                      Reassign Group
                    </Button>
                  </div>
                )}
                <div>
                  <Label>Industry</Label>
                  <p className="font-medium">{groupSetupForm.industry || "Not set"}</p>
                </div>
              </div>

              <div className="border rounded-lg p-4 bg-white space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-base font-semibold text-slate-900">Group Setup</h3>
                  <Badge variant="secondary">{canEditSelectedGroup ? "Editable" : "Read only"}</Badge>
                </div>
                <p className="text-xs text-slate-600">
                  Group setup can be edited by the assigned agent or admin. Payor Matrix Option is configured in the Profile step.
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="detail-group-name">Group Name</Label>
                    <Input
                      id="detail-group-name"
                      value={groupSetupForm.name}
                      onChange={(event) => setGroupSetupForm((prev) => ({ ...prev, name: event.target.value }))}
                      disabled={!canEditSelectedGroup}
                    />
                  </div>
                  <div>
                    <Label htmlFor="detail-group-type">Group Type</Label>
                    <Input
                      id="detail-group-type"
                      value={groupSetupForm.groupType}
                      onChange={(event) => setGroupSetupForm((prev) => ({ ...prev, groupType: event.target.value }))}
                      disabled={!canEditSelectedGroup}
                    />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="detail-group-industry">Industry</Label>
                    <Select
                      value={detailIndustrySelectValue}
                      onValueChange={(value) => {
                        if (value === INDUSTRY_NOT_SET_VALUE) {
                          setGroupSetupForm((prev) => ({ ...prev, industry: "" }));
                          return;
                        }

                        if (value === INDUSTRY_OTHER_VALUE) {
                          if (!detailIndustryIsCustom) {
                            setGroupSetupForm((prev) => ({ ...prev, industry: "" }));
                          }
                          return;
                        }

                        setGroupSetupForm((prev) => ({ ...prev, industry: value }));
                      }}
                      disabled={!canEditSelectedGroup}
                    >
                      <SelectTrigger id="detail-group-industry">
                        <SelectValue placeholder="Select industry" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={INDUSTRY_NOT_SET_VALUE}>Not set</SelectItem>
                        {industryOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value === "Other" ? INDUSTRY_OTHER_VALUE : option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {detailIndustrySelectValue === INDUSTRY_OTHER_VALUE && (
                      <Input
                        className="mt-2"
                        placeholder="Enter custom industry"
                        value={groupSetupForm.industry}
                        onChange={(event) => setGroupSetupForm((prev) => ({ ...prev, industry: event.target.value }))}
                        disabled={!canEditSelectedGroup}
                      />
                    )}
                  </div>
                  <div>
                    <Label htmlFor="detail-group-discount-code">Discount Code</Label>
                    <Input
                      id="detail-group-discount-code"
                      placeholder="Optional"
                      value={groupSetupForm.discountCode}
                      onChange={(event) =>
                        setGroupSetupForm((prev) => ({ ...prev, discountCode: event.target.value.toUpperCase() }))
                      }
                      disabled={!canEditSelectedGroup}
                    />
                  </div>
                </div>

                <div className="space-y-3 border rounded-md p-3 bg-slate-50">
                  <div>
                    <Label>Group Plan Tier</Label>
                    <Select
                      value={groupProfileForm.selectedPlanId}
                      onValueChange={(value) => {
                        const selectedPlan = planCatalogById.get(value);
                        setGroupProfileForm((prev) => ({
                          ...prev,
                          selectedPlanId: value,
                          selectedPlanName: selectedPlan?.name || "",
                          selectedPlanTier: selectedPlan ? derivePlanTierFromName(selectedPlan.name) : "",
                          pbmProgram: prev.pbmProgram || defaultGroupProfileForm.pbmProgram,
                        }));
                      }}
                      disabled={!canEditSelectedGroup}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select a plan tier" />
                      </SelectTrigger>
                      <SelectContent>
                        {availablePlans.map((plan) => (
                          <SelectItem key={plan.id} value={String(plan.id)}>
                            {plan.name} {plan.price !== null ? `- $${plan.price.toFixed(2)}/mo` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="detail-setup-pbm-program">PBM Program</Label>
                    <Input
                      id="detail-setup-pbm-program"
                      value={groupProfileForm.pbmProgram}
                      onChange={(event) =>
                        setGroupProfileForm((prev) => ({ ...prev, pbmProgram: event.target.value }))
                      }
                      placeholder="PBM program details"
                      disabled={!canEditSelectedGroup}
                    />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <Label>PBM Enabled</Label>
                      <Select
                        value={groupProfileForm.pbmEnabled ? "enabled" : "disabled"}
                        onValueChange={(value) =>
                          setGroupProfileForm((prev) => ({ ...prev, pbmEnabled: value === "enabled" }))
                        }
                        disabled={!canEditSelectedGroup}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="PBM selection" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="disabled">Disabled</SelectItem>
                          <SelectItem value="enabled">Enabled</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="detail-setup-pbm-amount">PBM Monthly Amount ($)</Label>
                      <Input
                        id="detail-setup-pbm-amount"
                        type="number"
                        min="0"
                        step="0.01"
                        value={groupProfileForm.pbmAmount}
                        onChange={(event) =>
                          setGroupProfileForm((prev) => ({ ...prev, pbmAmount: event.target.value }))
                        }
                        placeholder="0.00"
                        disabled={!canEditSelectedGroup || !groupProfileForm.pbmEnabled}
                      />
                    </div>
                  </div>

                  {groupProfileForm.selectedPlanId ? (
                    <div className="text-xs text-slate-700 space-y-1">
                      <p>
                        Plan Tier: <span className="font-medium">{groupProfileForm.selectedPlanTier || "-"}</span>
                      </p>
                      <p>
                        Base Price: <span className="font-medium">{selectedDetailPlan?.price !== null && selectedDetailPlan?.price !== undefined ? `$${selectedDetailPlan.price.toFixed(2)}/mo` : "-"}</span>
                      </p>
                    </div>
                  ) : null}

                  {detailPlanPricingRows.length > 0 ? (
                    <div>
                      <p className="text-xs font-semibold text-slate-800 mb-2">Coverage Pricing and Commission</p>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Coverage</TableHead>
                            <TableHead>Monthly Price</TableHead>
                            <TableHead>Agent Commission</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {detailPlanPricingRows.map((row) => (
                            <TableRow key={row.coverageLabel}>
                              <TableCell>{row.coverageLabel}</TableCell>
                              <TableCell>${row.monthlyPrice.toFixed(2)}</TableCell>
                              <TableCell>${row.agentCommission.toFixed(2)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ) : null}
                </div>

                {(canEditSelectedGroup || canAccessAdminViews) && (
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setDetailStep("profile")}
                    >
                      Go To Profile Step
                    </Button>
                    {canAccessAdminViews && (
                      <Button
                        variant="outline"
                        disabled={updateGroupAssignmentMutation.isPending}
                        onClick={() => updateGroupAssignmentMutation.mutate()}
                      >
                        {updateGroupAssignmentMutation.isPending ? "Saving..." : "Save Agent Assignment"}
                      </Button>
                    )}
                    {canEditSelectedGroup && (
                      <Button
                        variant="outline"
                        disabled={updateGroupSetupMutation.isPending || !groupSetupForm.name.trim()}
                        onClick={() => updateGroupSetupMutation.mutate()}
                      >
                        {updateGroupSetupMutation.isPending ? "Saving..." : "Save Group Setup"}
                      </Button>
                    )}
                  </div>
                )}
              </div>

              {effectiveDateContext && (
                <div className="border rounded-lg p-4 bg-blue-50/40 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-base font-semibold text-slate-900">Effective Date</h3>
                    <Badge variant="outline" className="capitalize">
                      {effectiveDateContext.isOverride ? "manual override" : "default"}
                    </Badge>
                  </div>
                  <p className="text-sm text-slate-600">
                    Default active date: <span className="font-medium text-slate-900">{effectiveDateContext.defaultEffectiveDate || "—"}</span>
                  </p>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <Label>Selected Effective Date</Label>
                      <Select
                        value={effectiveDateSelection}
                        onValueChange={setEffectiveDateSelection}
                        disabled={!effectiveDateContext.canOverride}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select effective date" />
                        </SelectTrigger>
                        <SelectContent>
                          {effectiveDateContext.availableEffectiveDates.map((dateValue, idx) => (
                            <SelectItem key={dateValue} value={dateValue}>
                              {dateValue} {idx === 0 ? "(default)" : idx === 2 ? "(3rd closest)" : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-slate-500 mt-1">Groups can be manually set up to the 3rd closest active date.</p>
                    </div>
                    <div>
                      <Label htmlFor="effective-date-reason">Override Reason</Label>
                      <Input
                        id="effective-date-reason"
                        placeholder="Optional for default, required for override"
                        value={effectiveDateReason}
                        onChange={(event) => setEffectiveDateReason(event.target.value)}
                        disabled={!effectiveDateContext.canOverride}
                      />
                      {!selectedIsDefault && effectiveDateContext.canOverride && (
                        <p className="text-xs text-slate-500 mt-1">At least 5 characters required when selecting a non-default date.</p>
                      )}
                    </div>
                  </div>
                  {effectiveDateContext.canOverride ? (
                    <div className="flex justify-end">
                      <Button
                        variant="outline"
                        disabled={!canSaveEffectiveDate || updateEffectiveDateMutation.isPending}
                        onClick={() => updateEffectiveDateMutation.mutate()}
                      >
                        {updateEffectiveDateMutation.isPending ? "Saving..." : "Save Effective Date"}
                      </Button>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500">Only admins and super admins can apply manual group effective-date overrides.</p>
                  )}
                </div>
              )}
                </>
              )}

              {detailStep === "profile" && (
              <div className="border rounded-lg p-4 bg-white space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-base font-semibold text-slate-900">Group Profile</h3>
                  <Badge variant={groupProfileContext?.isComplete ? "default" : "secondary"}>
                    {groupProfileContext?.isComplete ? "Complete" : "Needs info"}
                  </Badge>
                </div>
                {!groupProfileContext?.isComplete && groupProfileContext?.missingFields?.length ? (
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                    Missing fields: {groupProfileContext.missingFields.join(", ")}
                  </p>
                ) : null}
                {!canEditSelectedGroup ? (
                  <p className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded px-2 py-1">
                    Profile is read only for this group assignment.
                  </p>
                ) : null}

                <fieldset disabled={!canEditSelectedGroup} className="space-y-4">

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="detail-ein">EIN</Label>
                    <Input
                      id="detail-ein"
                      value={groupProfileForm.ein}
                      onChange={(event) => setGroupProfileForm((prev) => ({ ...prev, ein: event.target.value }))}
                    />
                  </div>
                  <div>
                    <Label>Payor Matrix Option</Label>
                    <Select
                      value={groupProfileForm.payorMixMode}
                      onValueChange={(value) =>
                        setGroupProfileForm((prev) => ({
                          ...prev,
                          payorMixMode: value as GroupProfile['payorMixMode'],
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select payor mix" />
                      </SelectTrigger>
                      <SelectContent>
                        {payorMixOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-3 border rounded-md p-3 bg-slate-50">
                  <div>
                    <Label>Group Plan Tier</Label>
                    <Select
                      value={groupProfileForm.selectedPlanId}
                      onValueChange={(value) => {
                        const selectedPlan = planCatalogById.get(value);
                        setGroupProfileForm((prev) => ({
                          ...prev,
                          selectedPlanId: value,
                          selectedPlanName: selectedPlan?.name || "",
                          selectedPlanTier: selectedPlan ? derivePlanTierFromName(selectedPlan.name) : "",
                          pbmProgram: prev.pbmProgram || defaultGroupProfileForm.pbmProgram,
                        }));
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select a plan tier" />
                      </SelectTrigger>
                      <SelectContent>
                        {availablePlans.map((plan) => (
                          <SelectItem key={plan.id} value={String(plan.id)}>
                            {plan.name} {plan.price !== null ? `- $${plan.price.toFixed(2)}/mo` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="detail-pbm-program">PBM Program</Label>
                    <Input
                      id="detail-pbm-program"
                      value={groupProfileForm.pbmProgram}
                      onChange={(event) =>
                        setGroupProfileForm((prev) => ({ ...prev, pbmProgram: event.target.value }))
                      }
                      placeholder="PBM program details"
                    />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <Label>PBM Enabled</Label>
                      <Select
                        value={groupProfileForm.pbmEnabled ? "enabled" : "disabled"}
                        onValueChange={(value) =>
                          setGroupProfileForm((prev) => ({ ...prev, pbmEnabled: value === "enabled" }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="PBM selection" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="disabled">Disabled</SelectItem>
                          <SelectItem value="enabled">Enabled</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="detail-pbm-amount">PBM Monthly Amount ($)</Label>
                      <Input
                        id="detail-pbm-amount"
                        type="number"
                        min="0"
                        step="0.01"
                        value={groupProfileForm.pbmAmount}
                        onChange={(event) =>
                          setGroupProfileForm((prev) => ({ ...prev, pbmAmount: event.target.value }))
                        }
                        placeholder="0.00"
                        disabled={!groupProfileForm.pbmEnabled}
                      />
                    </div>
                  </div>

                  {groupProfileForm.selectedPlanId ? (
                    <div className="text-xs text-slate-700 space-y-1">
                      <p>
                        Plan Tier: <span className="font-medium">{groupProfileForm.selectedPlanTier || "-"}</span>
                      </p>
                      <p>
                        Base Price: <span className="font-medium">{selectedDetailPlan?.price !== null && selectedDetailPlan?.price !== undefined ? `$${selectedDetailPlan.price.toFixed(2)}/mo` : "-"}</span>
                      </p>
                    </div>
                  ) : null}

                  {detailPlanPricingRows.length > 0 ? (
                    <div>
                      <p className="text-xs font-semibold text-slate-800 mb-2">Coverage Pricing and Commission</p>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Coverage</TableHead>
                            <TableHead>Monthly Price</TableHead>
                            <TableHead>Agent Commission</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {detailPlanPricingRows.map((row) => (
                            <TableRow key={row.coverageLabel}>
                              <TableCell>{row.coverageLabel}</TableCell>
                              <TableCell>${row.monthlyPrice.toFixed(2)}</TableCell>
                              <TableCell>${row.agentCommission.toFixed(2)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ) : null}
                </div>

                {groupProfileForm.payorMixMode === "fixed" && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="detail-employer-fixed">Employer Amount ($)</Label>
                      <Input
                        id="detail-employer-fixed"
                        value={groupProfileForm.employerFixedAmount}
                        onChange={(event) =>
                          setGroupProfileForm((prev) => ({ ...prev, employerFixedAmount: event.target.value }))
                        }
                      />
                    </div>
                    <div>
                      <Label htmlFor="detail-member-fixed">Member Amount ($)</Label>
                      <Input
                        id="detail-member-fixed"
                        value={groupProfileForm.memberFixedAmount}
                        onChange={(event) =>
                          setGroupProfileForm((prev) => ({ ...prev, memberFixedAmount: event.target.value }))
                        }
                      />
                    </div>
                  </div>
                )}

                {groupProfileForm.payorMixMode === "percentage" && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="detail-employer-percent">Employer Percentage (%)</Label>
                      <Input
                        id="detail-employer-percent"
                        value={groupProfileForm.employerPercentage}
                        onChange={(event) =>
                          setGroupProfileForm((prev) => ({ ...prev, employerPercentage: event.target.value }))
                        }
                      />
                    </div>
                    <div>
                      <Label htmlFor="detail-member-percent">Member Percentage (%)</Label>
                      <Input
                        id="detail-member-percent"
                        value={groupProfileForm.memberPercentage}
                        onChange={(event) =>
                          setGroupProfileForm((prev) => ({ ...prev, memberPercentage: event.target.value }))
                        }
                      />
                    </div>
                  </div>
                )}

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="detail-responsible-name">Responsible Person Name</Label>
                    <Input
                      id="detail-responsible-name"
                      value={groupProfileForm.responsiblePersonName}
                      onChange={(event) =>
                        setGroupProfileForm((prev) => ({ ...prev, responsiblePersonName: event.target.value }))
                      }
                    />
                  </div>
                  <div>
                    <Label htmlFor="detail-responsible-email">Responsible Person Email</Label>
                    <Input
                      id="detail-responsible-email"
                      type="email"
                      value={groupProfileForm.responsiblePersonEmail}
                      onChange={(event) =>
                        setGroupProfileForm((prev) => ({ ...prev, responsiblePersonEmail: event.target.value }))
                      }
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="detail-responsible-phone">Responsible Person Phone</Label>
                    <Input
                      id="detail-responsible-phone"
                      value={groupProfileForm.responsiblePersonPhone}
                      onChange={(event) =>
                        setGroupProfileForm((prev) => ({ ...prev, responsiblePersonPhone: event.target.value }))
                      }
                    />
                  </div>
                  <div>
                    <Label htmlFor="detail-contact-name">Contact Person Name</Label>
                    <Input
                      id="detail-contact-name"
                      value={groupProfileForm.contactPersonName}
                      onChange={(event) =>
                        setGroupProfileForm((prev) => ({ ...prev, contactPersonName: event.target.value }))
                      }
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="detail-contact-email">Contact Person Email</Label>
                    <Input
                      id="detail-contact-email"
                      type="email"
                      value={groupProfileForm.contactPersonEmail}
                      onChange={(event) =>
                        setGroupProfileForm((prev) => ({ ...prev, contactPersonEmail: event.target.value }))
                      }
                    />
                  </div>
                  <div>
                    <Label htmlFor="detail-contact-phone">Contact Person Phone</Label>
                    <Input
                      id="detail-contact-phone"
                      value={groupProfileForm.contactPersonPhone}
                      onChange={(event) =>
                        setGroupProfileForm((prev) => ({ ...prev, contactPersonPhone: event.target.value }))
                      }
                    />
                  </div>
                </div>

                <div className="space-y-3 border rounded-md p-3 bg-slate-50">
                  <h4 className="text-sm font-semibold text-slate-800">Business Address</h4>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <Label htmlFor="detail-business-address-line1">Address Line 1</Label>
                      <Input
                        id="detail-business-address-line1"
                        value={groupProfileForm.businessAddressLine1}
                        onChange={(event) =>
                          setGroupProfileForm((prev) => ({ ...prev, businessAddressLine1: event.target.value }))
                        }
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <Label htmlFor="detail-business-address-line2">Address Line 2</Label>
                      <Input
                        id="detail-business-address-line2"
                        value={groupProfileForm.businessAddressLine2}
                        onChange={(event) =>
                          setGroupProfileForm((prev) => ({ ...prev, businessAddressLine2: event.target.value }))
                        }
                      />
                    </div>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div>
                      <Label htmlFor="detail-business-city">City</Label>
                      <Input
                        id="detail-business-city"
                        value={groupProfileForm.businessCity}
                        onChange={(event) =>
                          setGroupProfileForm((prev) => ({ ...prev, businessCity: event.target.value }))
                        }
                      />
                    </div>
                    <div>
                      <Label htmlFor="detail-business-state">State</Label>
                      <Input
                        id="detail-business-state"
                        value={groupProfileForm.businessState}
                        onChange={(event) =>
                          setGroupProfileForm((prev) => ({ ...prev, businessState: event.target.value.toUpperCase() }))
                        }
                      />
                    </div>
                    <div>
                      <Label htmlFor="detail-business-zip">ZIP</Label>
                      <Input
                        id="detail-business-zip"
                        value={groupProfileForm.businessZipCode}
                        onChange={(event) =>
                          setGroupProfileForm((prev) => ({ ...prev, businessZipCode: event.target.value }))
                        }
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <Label>Payment Responsibility</Label>
                  <Select
                    value={groupProfileForm.paymentResponsibilityMode}
                    onValueChange={(value) =>
                      setGroupProfileForm((prev) => ({
                        ...prev,
                        paymentResponsibilityMode: value as GroupProfile['paymentResponsibilityMode'],
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select payment responsibility" />
                    </SelectTrigger>
                    <SelectContent>
                      {paymentResponsibilityModeOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Preferred Payment Method</Label>
                  <Select
                    value={groupProfileForm.preferredPaymentMethod}
                    onValueChange={(value) =>
                      setGroupProfileForm((prev) => ({
                        ...prev,
                        preferredPaymentMethod: value as GroupProfile['preferredPaymentMethod'],
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select payment method" />
                    </SelectTrigger>
                    <SelectContent>
                      {preferredPaymentMethodOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {groupProfileForm.preferredPaymentMethod === "ach" && (
                  <div className="space-y-4 border rounded-md p-3 bg-slate-50">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <Label htmlFor="detail-ach-routing">Routing Number</Label>
                        <Input
                          id="detail-ach-routing"
                          value={groupProfileForm.achRoutingNumber}
                          onChange={(event) =>
                            setGroupProfileForm((prev) => ({ ...prev, achRoutingNumber: event.target.value }))
                          }
                        />
                      </div>
                      <div>
                        <Label htmlFor="detail-ach-account">Account Number</Label>
                        <Input
                          id="detail-ach-account"
                          value={groupProfileForm.achAccountNumber}
                          onChange={(event) =>
                            setGroupProfileForm((prev) => ({ ...prev, achAccountNumber: event.target.value }))
                          }
                        />
                      </div>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <Label htmlFor="detail-ach-bank">Bank Name</Label>
                        <Input
                          id="detail-ach-bank"
                          value={groupProfileForm.achBankName}
                          onChange={(event) =>
                            setGroupProfileForm((prev) => ({ ...prev, achBankName: event.target.value }))
                          }
                        />
                      </div>
                      <div>
                        <Label>Account Type</Label>
                        <Select
                          value={groupProfileForm.achAccountType}
                          onValueChange={(value) =>
                            setGroupProfileForm((prev) => ({
                              ...prev,
                              achAccountType: value as GroupProfile['achAccountType'],
                            }))
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select account type" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="checking">Checking</SelectItem>
                            <SelectItem value="savings">Savings</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                )}
                </fieldset>

                <div className="flex justify-end">
                  <Button
                    variant="outline"
                    disabled={updateGroupProfileMutation.isPending || !canEditSelectedGroup}
                    onClick={() => updateGroupProfileMutation.mutate()}
                  >
                    {updateGroupProfileMutation.isPending ? "Saving..." : "Save Group Profile"}
                  </Button>
                </div>
              </div>
              )}

              {detailStep === "members" && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    <Users className="h-4 w-4" /> Members
                  </h3>
                  <Button variant="outline" size="sm" onClick={handleAddMemberClick}>
                    <UserPlus className="h-4 w-4 mr-1" />
                    Add Member
                  </Button>
                </div>
                <div className="mb-3 border rounded-lg p-3 bg-slate-50 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-white px-3 py-2">
                    <p className="text-xs text-slate-600">
                      Need a blank file? Download the shared census template with supported headings.
                    </p>
                    <Button type="button" size="sm" variant="outline" onClick={handleTemplateDownload}>
                      <Download className="mr-1 h-4 w-4" />
                      Download Census Template
                    </Button>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.xls,.xlsx"
                    className="hidden"
                    onChange={handleDropZoneSelect}
                  />
                  <div
                    className={`rounded-md border-2 border-dashed p-4 text-center transition-colors ${
                      isDragActive ? "border-blue-500 bg-blue-50" : "border-slate-300 bg-white"
                    }`}
                    onDragOver={(event) => {
                      event.preventDefault();
                      setIsDragActive(true);
                    }}
                    onDragLeave={() => setIsDragActive(false)}
                    onDrop={handleDropZoneDrop}
                  >
                    <Upload className="h-5 w-5 mx-auto mb-2 text-slate-500" />
                    <p className="text-sm text-slate-700">Drag and drop group census file here</p>
                    <p className="text-xs text-slate-500 mt-1">Supports .csv, .xls, and .xlsx</p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-3"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      Choose File
                    </Button>
                  </div>
                  {importFileName && (
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm font-medium text-slate-800">{importFileName}</p>
                        <p className="text-xs text-slate-600">{importRows.length} rows ready for import</p>
                      </div>
                      <Button
                        type="button"
                        onClick={() => bulkImportMembersMutation.mutate()}
                        disabled={!canRunBulkImport}
                      >
                        {bulkImportMembersMutation.isPending ? "Importing..." : "Import Census Rows"}
                      </Button>
                    </div>
                  )}
                  {importWarnings.length > 0 && (
                    <p className="text-xs text-amber-700">
                      Potential issues found: {importWarnings.join("; ")}
                    </p>
                  )}
                  {canDownloadFailedRows && (
                    <Alert className="border-amber-200 bg-amber-50">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertTitle>Import completed with failed rows</AlertTitle>
                      <AlertDescription className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <span className="text-xs sm:text-sm">
                          {lastImportFailedRows.length} rows failed validation or save. Download them to correct and re-upload.
                        </span>
                        <Button type="button" size="sm" variant="outline" onClick={handleDownloadFailedRows}>
                          Download Failed Rows
                        </Button>
                      </AlertDescription>
                    </Alert>
                  )}
                  <div className="rounded-md border bg-white p-3">
                    <input
                      ref={detailPaymentInputRef}
                      type="file"
                      accept=".pdf,.png,.jpg,.jpeg"
                      className="hidden"
                      onChange={handleDetailPaymentFormSelect}
                    />
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm font-medium text-slate-800">Authorized Payment Form</p>
                        <p className="text-xs text-slate-600">
                          {latestPaymentForm?.uploadedAt
                            ? `Last uploaded ${formatDistanceToNow(new Date(latestPaymentForm.uploadedAt), { addSuffix: true })}: ${latestPaymentForm.fileName}`
                            : "No form uploaded yet"}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={uploadPaymentFormMutation.isPending}
                        onClick={() => detailPaymentInputRef.current?.click()}
                      >
                        {uploadPaymentFormMutation.isPending ? "Uploading..." : "Upload Payment Form"}
                      </Button>
                    </div>
                  </div>
                </div>
                <div className="mb-3 grid gap-3 lg:grid-cols-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-xs uppercase text-gray-500">Revenue Run Rate</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-2xl font-semibold">{formatCurrencyDisplay(monthlyRevenueDisplay.toFixed(2))}</p>
                      <p className="text-xs text-gray-500">Monthly across {activeMemberCountDisplay} active members</p>
                      <p className="text-xs text-gray-500">Yearly projected: <span className="font-medium">{formatCurrencyDisplay(yearlyRevenueDisplay.toFixed(2))}</span></p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-xs uppercase text-gray-500">Projected Commission</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-1 text-sm">
                      <p>Monthly: <span className="font-medium">{formatCurrencyDisplay(projectedMonthlyCommissionDisplay.toFixed(2))}</span></p>
                      <p>Yearly projected: <span className="font-medium">{formatCurrencyDisplay(projectedYearlyCommissionDisplay.toFixed(2))}</span></p>
                      <p className="text-xs text-gray-500">Based on active members and configured group plan/tier assumptions.</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-xs uppercase text-gray-500">Employer vs Member</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-1 text-sm">
                      <p>Employer: <span className="font-medium">{formatCurrencyDisplay((groupFinancialSummary?.employerTotal ?? groupFinancialSnapshot.employerTotal).toFixed(2))}</span></p>
                      <p>Member: <span className="font-medium">{formatCurrencyDisplay((groupFinancialSummary?.memberTotal ?? groupFinancialSnapshot.memberTotal).toFixed(2))}</span></p>
                      <p>Discounts: <span className="font-medium">{formatCurrencyDisplay((groupFinancialSummary?.discountTotal ?? groupFinancialSnapshot.discountTotal).toFixed(2))}</span></p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-xs uppercase text-gray-500">Coverage Mix</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-1 text-sm">
                      {Object.keys(groupFinancialSnapshot.tierCounts).length === 0 ? (
                        <p className="text-gray-500">No active coverage yet.</p>
                      ) : (
                        Object.entries(groupFinancialSnapshot.tierCounts).map(([tier, count]) => (
                          <p key={tier}>
                            {(tierLabels[tier] || tier)}: <span className="font-medium">{count}</span>
                          </p>
                        ))
                      )}
                      <p className="text-xs text-gray-500">Terminated members: <span className="font-medium">{groupFinancialSummary?.terminatedMemberCount ?? Math.max(0, memberCount - activeMemberCountDisplay)}</span></p>
                    </CardContent>
                  </Card>
                </div>
                <div className="border rounded-lg bg-white overflow-x-auto">
                  {selectedGroup?.members && selectedGroup.members.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Member</TableHead>
                          <TableHead>Relationship</TableHead>
                          <TableHead>Household #</TableHead>
                          <TableHead>Phone</TableHead>
                          <TableHead>DOB</TableHead>
                          <TableHead>Tier</TableHead>
                          <TableHead>Payor</TableHead>
                          <TableHead>Employer $</TableHead>
                          <TableHead>Member $</TableHead>
                          <TableHead>Discount $</TableHead>
                          <TableHead>Total $</TableHead>
                          <TableHead>Payment</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedGroup.members.map((member) => {
                          const isTerminated = member.status === "terminated";
                          const statusTimestamp = isTerminated ? member.terminatedAt : member.registeredAt;

                          return (
                            <TableRow key={member.id}>
                              <TableCell>
                                <div>
                                  <p className="font-medium">{member.firstName} {member.lastName}</p>
                                  <p className="text-xs text-gray-500">{member.email}</p>
                                </div>
                              </TableCell>
                              <TableCell>{getDisplayRelationshipLabel(member)}</TableCell>
                              <TableCell>{formatHouseholdMemberNumber(member)}</TableCell>
                              <TableCell>{formatMemberPhone(member.phone)}</TableCell>
                              <TableCell>{formatMemberDateOfBirth(member.dateOfBirth)}</TableCell>
                              <TableCell>{tierLabels[member.tier] || member.tier}</TableCell>
                              <TableCell className="capitalize">{member.payorType || "-"}</TableCell>
                              <TableCell>{formatCurrencyDisplay(member.employerAmount)}</TableCell>
                              <TableCell>{formatCurrencyDisplay(member.memberAmount)}</TableCell>
                              <TableCell>{formatCurrencyDisplay(member.discountAmount)}</TableCell>
                              <TableCell>{formatCurrencyDisplay(member.totalAmount)}</TableCell>
                              <TableCell className="capitalize">{member.paymentStatus || "pending"}</TableCell>
                              <TableCell>
                                <Badge variant="outline" className="capitalize">{member.status || "draft"}</Badge>
                                <p className="mt-1 text-xs text-gray-500">
                                  {statusTimestamp
                                    ? `${isTerminated ? "Terminated" : "Updated"} ${formatDistanceToNow(new Date(statusTimestamp), { addSuffix: true })}`
                                    : "Pending"}
                                </p>
                              </TableCell>
                              <TableCell>
                                <div className="flex justify-end gap-2">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={() => handleEditMemberClick(member)}
                                    aria-label="Edit member"
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                  {!isTerminated && allowsMemberPaymentCollection && (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => handleOpenMemberHostedCheckout(member)}
                                    >
                                      Collect Payment
                                    </Button>
                                  )}
                                  {isTerminated ? (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      disabled={restoreMemberMutation.isPending}
                                      onClick={() => restoreMemberMutation.mutate(member)}
                                    >
                                      Restore
                                    </Button>
                                  ) : (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 text-red-600"
                                      disabled={deleteMemberMutation.isPending}
                                      onClick={() => deleteMemberMutation.mutate(member)}
                                      aria-label="Terminate member"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  ) : (
                    <div className="p-4 text-sm text-gray-500">No members captured yet.</div>
                  )}
                </div>
              </div>
              )}

              {detailStep === "readiness" && (
                <>
              <div className="border rounded-lg p-4 bg-slate-50 flex flex-col gap-4">
                <div className="flex items-center gap-2 text-xs font-semibold tracking-wide text-slate-600 uppercase">
                  <ClipboardCheck className="h-4 w-4 text-blue-600" /> Enrollment + Activation
                </div>
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div className="space-y-2">
                    <p className="text-sm text-slate-600">
                      {memberCount === 0
                        ? 'Add at least one member before completing enrollment.'
                        : !profileComplete
                          ? 'Complete the group profile (EIN, contacts, payor mix, payment preference) before completing enrollment.'
                        : isGroupActive
                          ? 'This group is active. Payment can be processed separately when needed.'
                        : isEnrollmentComplete
                          ? 'Enrollment is complete. Activate the group when operations is ready.'
                          : 'Review member details, then complete enrollment.'}
                    </p>
                    <div className="flex flex-wrap items-center gap-3 text-sm">
                      <div className="flex items-center gap-2">
                        <span className="text-slate-500">Members captured</span>
                        <Badge variant="secondary">{activeMemberCount}</Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-slate-500">Enrollment</span>
                        <Badge variant="outline" className="capitalize">
                          {groupStatus}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-slate-500">Payment handoff</span>
                        <Badge variant="outline" className={`capitalize ${paymentHandoffBadgeClass}`}>
                          {paymentHandoffStatusLabel}
                        </Badge>
                      </div>
                      {selectedGroup.data.registrationCompletedAt && (
                        <span className="text-xs text-slate-500">
                          Marked {formatDistanceToNow(new Date(selectedGroup.data.registrationCompletedAt), { addSuffix: true })}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500">
                      {allowsMemberPaymentCollection
                        ? 'Member self-pay is enabled. Use member row actions for hosted checkout.'
                        : usesPayrollExternalCollection
                          ? 'Payroll-managed collection is enabled. Hosted checkout is intentionally disabled for this group.'
                          : allowsGroupInvoiceCollection
                            ? 'Group invoice collection is enabled. Member-level hosted checkout is hidden for this group.'
                            : 'Payment collection mode is not configured.'}
                    </p>
                  </div>
                  <div className="w-full md:w-auto">
                    <div className="space-y-2">
                      <Button
                        className="w-full"
                        onClick={() => completeGroupMutation.mutate()}
                        disabled={!canCompleteEnrollment || completeGroupMutation.isPending}
                      >
                        {isEnrollmentComplete
                          ? 'Enrollment Complete'
                          : completeGroupMutation.isPending
                            ? 'Completing...'
                            : 'Complete Enrollment'}
                      </Button>
                      <Button
                        className="w-full"
                        variant="outline"
                        onClick={() => activateGroupMutation.mutate()}
                        disabled={!canActivateGroup || activateGroupMutation.isPending || isGroupActive}
                      >
                        {isGroupActive
                          ? 'Active'
                          : activateGroupMutation.isPending
                            ? 'Activating...'
                            : 'Set Active'}
                      </Button>
                    </div>
                    {hasEnrollmentDataGaps && !isEnrollmentComplete && (
                      <p className="mt-2 text-xs text-slate-500 text-center">
                        {activeMemberCount === 0
                          ? 'Add at least one non-terminated member before completing enrollment.'
                          : !profileComplete && activeMembersMissingRequired > 0
                            ? `Enrollment can continue. Follow-up needed: group profile plus ${activeMembersMissingRequired} member record(s).`
                            : !profileComplete
                              ? 'Enrollment can continue. Follow-up needed: complete the group profile.'
                              : activeMembersMissingRequired > 0
                                ? `Enrollment can continue. Follow-up needed: complete required fields for ${activeMembersMissingRequired} active member(s).`
                                : 'Enrollment can continue with follow-up data completion.'}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Enrollment workflow</AlertTitle>
                <AlertDescription>
                  Use this workspace to capture members and complete enrollment. Activation and payment handoff can happen at different times.
                </AlertDescription>
              </Alert>
                </>
              )}
              </div>
            )}
          </div>
          <DialogFooter className="px-6 py-4 border-t bg-white">
            <Button variant="ghost" onClick={() => setDetailOpen(false)}>
              Close
            </Button>
            <Button
              onClick={() => setLocation(canAccessAdminViews ? '/admin/enrollments' : '/agent')}
              variant="secondary"
            >
              {canAccessAdminViews ? 'Go to Enrollment Records' : 'Back to Dashboard'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={reassignDialogOpen} onOpenChange={setReassignDialogOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Reassign Group</DialogTitle>
            <DialogDescription>
              Move this group to a new agent while preserving history and audit attribution.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-md border bg-slate-50 p-3 text-sm">
              <p><span className="font-medium">Current agent:</span> {getAgentLabel(selectedGroupCurrentAgentId || null)}</p>
              <p><span className="font-medium">Original agent:</span> {getAgentLabel(selectedGroupOriginalAgentId || null)}</p>
              {selectedGroup?.assignmentHistory && selectedGroup.assignmentHistory.length > 0 && (
                <p className="text-xs text-slate-600 mt-2">
                  Last reassigned {selectedGroup.assignmentHistory[0]?.changed_at
                    ? formatDistanceToNow(new Date(selectedGroup.assignmentHistory[0].changed_at as string), { addSuffix: true })
                    : "recently"}
                </p>
              )}
            </div>

            <div>
              <Label>New Agent</Label>
              <Select
                value={reassignmentForm.newAgentId}
                onValueChange={(value) => setReassignmentForm((prev) => ({ ...prev, newAgentId: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select destination agent" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={IN_HOUSE_AGENT_OPTION_VALUE}>Select destination agent</SelectItem>
                  {agentOptions.map((agent) => (
                    <SelectItem key={agent.id} value={agent.id}>
                      {getAgentLabel(agent.id)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="reassign-effective-date">Effective Date</Label>
              <Input
                id="reassign-effective-date"
                type="date"
                value={reassignmentForm.effectiveDate}
                onChange={(event) => setReassignmentForm((prev) => ({ ...prev, effectiveDate: event.target.value }))}
              />
            </div>

            <div>
              <Label htmlFor="reassign-reason">Reason</Label>
              <Input
                id="reassign-reason"
                value={reassignmentForm.reason}
                onChange={(event) => setReassignmentForm((prev) => ({ ...prev, reason: event.target.value }))}
                placeholder="Territory handoff, ownership correction, staffing change..."
              />
            </div>

            <div>
              <Label htmlFor="reassign-notes">Notes</Label>
              <Input
                id="reassign-notes"
                value={reassignmentForm.notes}
                onChange={(event) => setReassignmentForm((prev) => ({ ...prev, notes: event.target.value }))}
                placeholder="Optional context for audit and reporting"
              />
            </div>

            <div className="space-y-3 rounded-md border p-3">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="transfer-linked-employees"
                  checked={true}
                  disabled
                />
                <Label htmlFor="transfer-linked-employees">Transfer linked employees (always enforced)</Label>
              </div>
              <p className="text-xs text-slate-600">
                Enrollment ownership is automatically reassigned so enrollment records follow the new current assignee.
              </p>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="transfer-open-workflows"
                  checked={reassignmentForm.transferOpenWorkflows}
                  onCheckedChange={(value) =>
                    setReassignmentForm((prev) => ({ ...prev, transferOpenWorkflows: Boolean(value) }))
                  }
                />
                <Label htmlFor="transfer-open-workflows">Transfer open enrollments/opportunities/tasks</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="previous-agent-readonly"
                  checked={reassignmentForm.previousAgentReadOnly}
                  onCheckedChange={(value) =>
                    setReassignmentForm((prev) => ({ ...prev, previousAgentReadOnly: Boolean(value) }))
                  }
                />
                <Label htmlFor="previous-agent-readonly">Keep previous agent read-only access</Label>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setReassignDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => reassignGroupMutation.mutate()}
              disabled={!canSubmitReassignment || reassignGroupMutation.isPending}
            >
              {reassignGroupMutation.isPending ? "Reassigning..." : "Confirm Reassignment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={memberDialogOpen} onOpenChange={handleMemberDialogToggle}>
        <DialogContent className="w-[96vw] max-w-[1400px] h-[92vh] flex flex-col overflow-hidden p-0">
          <DialogHeader className="px-6 pt-6 pb-3 border-b">
            <DialogTitle>{memberDialogTitle}</DialogTitle>
            <DialogDescription>{memberDialogDescription}</DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-6 py-4">
            <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Relationship</Label>
                <Select
                  value={memberForm.relationship}
                  onValueChange={(value) => setMemberForm((prev) => {
                    const normalizedRelationship = normalizeRelationshipForPlan(value, prev.selectedPlanName);
                    return {
                      ...prev,
                      relationship: normalizedRelationship,
                      tier: deriveTierFromRelationship(normalizedRelationship, prev.tier),
                    };
                  })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Relationship" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="primary">Primary</SelectItem>
                    <SelectItem value="spouse" disabled={memberPlanIsMemberOnly}>Spouse</SelectItem>
                    <SelectItem value="dependent" disabled={memberPlanIsMemberOnly}>Dependent</SelectItem>
                  </SelectContent>
                </Select>
                {memberPlanIsMemberOnly ? (
                  <p className="text-xs text-slate-500 mt-1">
                    Member-only plans support primary enrollment only.
                  </p>
                ) : null}
              </div>
              <div>
                <Label htmlFor="member-date-of-birth">Date of Birth</Label>
                <Input
                  id="member-date-of-birth"
                  type="date"
                  value={memberForm.dateOfBirth}
                  onChange={(event) => setMemberForm((prev) => ({ ...prev, dateOfBirth: event.target.value }))}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              <div>
                <Label htmlFor="member-first-name">First Name</Label>
                <Input
                  id="member-first-name"
                  value={memberForm.firstName}
                  onChange={(event) => setMemberForm((prev) => ({ ...prev, firstName: event.target.value }))}
                  placeholder="Leslie"
                />
              </div>
              <div>
                <Label htmlFor="member-last-name">Last Name</Label>
                <Input
                  id="member-last-name"
                  value={memberForm.lastName}
                  onChange={(event) => setMemberForm((prev) => ({ ...prev, lastName: event.target.value }))}
                  placeholder="Knope"
                />
              </div>
              <div>
                <Label htmlFor="member-middle-name">Middle Name</Label>
                <Input
                  id="member-middle-name"
                  value={memberForm.middleName}
                  onChange={(event) => setMemberForm((prev) => ({ ...prev, middleName: event.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="member-suffix">Suffix</Label>
                <Input
                  id="member-suffix"
                  value={memberForm.suffix}
                  onChange={(event) => setMemberForm((prev) => ({ ...prev, suffix: event.target.value }))}
                  placeholder="Jr"
                />
              </div>
              <div>
                <Label htmlFor="member-preferred-name">Preferred Name</Label>
                <Input
                  id="member-preferred-name"
                  value={memberForm.preferredName}
                  onChange={(event) => setMemberForm((prev) => ({ ...prev, preferredName: event.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="member-sex">Sex</Label>
                <Input
                  id="member-sex"
                  value={memberForm.sex}
                  onChange={(event) => setMemberForm((prev) => ({ ...prev, sex: event.target.value }))}
                  placeholder="M/F/X"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="member-employee-ssn">Employee SSN (optional)</Label>
                <Input
                  id="member-employee-ssn"
                  value={memberForm.ssn}
                  onChange={(event) => setMemberForm((prev) => ({ ...prev, ssn: event.target.value }))}
                  placeholder="###-##-####"
                />
              </div>
              <div>
                <Label htmlFor="member-mobile-phone">Mobile Phone</Label>
                <Input
                  id="member-mobile-phone"
                  value={memberForm.mobilePhone}
                  onChange={(event) => setMemberForm((prev) => ({ ...prev, mobilePhone: event.target.value }))}
                  placeholder="(555) 123-4567"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="member-work-email">Work Email</Label>
                <Input
                  id="member-work-email"
                  type="email"
                  value={memberForm.workEmail}
                  onChange={(event) => setMemberForm((prev) => ({ ...prev, workEmail: event.target.value }))}
                  placeholder="employee@company.com"
                />
              </div>
              <div>
                <Label htmlFor="member-personal-email">Personal Email</Label>
                <Input
                  id="member-personal-email"
                  type="email"
                  value={memberForm.personalEmail}
                  onChange={(event) => setMemberForm((prev) => ({ ...prev, personalEmail: event.target.value }))}
                  placeholder="person@email.com"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              <div>
                <Label htmlFor="member-hire-date">Hire Date</Label>
                <Input
                  id="member-hire-date"
                  type="date"
                  value={memberForm.hireDate}
                  onChange={(event) => setMemberForm((prev) => ({ ...prev, hireDate: event.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="member-original-hire-date">Original Hire Date</Label>
                <Input
                  id="member-original-hire-date"
                  type="date"
                  value={memberForm.originalHireDate}
                  onChange={(event) => setMemberForm((prev) => ({ ...prev, originalHireDate: event.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="member-employment-type">Employment Type</Label>
                <Input
                  id="member-employment-type"
                  value={memberForm.employmentType}
                  onChange={(event) => setMemberForm((prev) => ({ ...prev, employmentType: event.target.value }))}
                  placeholder="Full-time"
                />
              </div>
              <div>
                <Label htmlFor="member-class">Class</Label>
                <Input
                  id="member-class"
                  value={memberForm.className}
                  onChange={(event) => setMemberForm((prev) => ({ ...prev, className: event.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="member-division">Division</Label>
                <Input
                  id="member-division"
                  value={memberForm.division}
                  onChange={(event) => setMemberForm((prev) => ({ ...prev, division: event.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="member-payroll-group">Payroll Group</Label>
                <Input
                  id="member-payroll-group"
                  value={memberForm.payrollGroup}
                  onChange={(event) => setMemberForm((prev) => ({ ...prev, payrollGroup: event.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="member-annual-base-salary">Annual Base Salary</Label>
                <Input
                  id="member-annual-base-salary"
                  value={memberForm.annualBaseSalary}
                  onChange={(event) => setMemberForm((prev) => ({ ...prev, annualBaseSalary: event.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="member-hours-per-week">Hours Per Week</Label>
                <Input
                  id="member-hours-per-week"
                  value={memberForm.hoursPerWeek}
                  onChange={(event) => setMemberForm((prev) => ({ ...prev, hoursPerWeek: event.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="member-salary-effective-date">Salary Effective Date</Label>
                <Input
                  id="member-salary-effective-date"
                  type="date"
                  value={memberForm.salaryEffectiveDate}
                  onChange={(event) => setMemberForm((prev) => ({ ...prev, salaryEffectiveDate: event.target.value }))}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="member-address-1">Address 1</Label>
                <Input
                  id="member-address-1"
                  value={memberForm.address1}
                  onChange={(event) => setMemberForm((prev) => ({ ...prev, address1: event.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="member-address-2">Address 2</Label>
                <Input
                  id="member-address-2"
                  value={memberForm.address2}
                  onChange={(event) => setMemberForm((prev) => ({ ...prev, address2: event.target.value }))}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              <div>
                <Label htmlFor="member-city">City</Label>
                <Input
                  id="member-city"
                  value={memberForm.city}
                  onChange={(event) => setMemberForm((prev) => ({ ...prev, city: event.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="member-state">State</Label>
                <Input
                  id="member-state"
                  value={memberForm.state}
                  onChange={(event) => setMemberForm((prev) => ({ ...prev, state: event.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="member-zip">Zip Code</Label>
                <Input
                  id="member-zip"
                  value={memberForm.zipCode}
                  onChange={(event) => setMemberForm((prev) => ({ ...prev, zipCode: event.target.value }))}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              <div>
                <Label htmlFor="member-department">Department</Label>
                <Input
                  id="member-department"
                  value={memberForm.department}
                  onChange={(event) => setMemberForm((prev) => ({ ...prev, department: event.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="member-business-unit">Business Unit</Label>
                <Input
                  id="member-business-unit"
                  value={memberForm.businessUnit}
                  onChange={(event) => setMemberForm((prev) => ({ ...prev, businessUnit: event.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="member-job-title">Job Title</Label>
                <Input
                  id="member-job-title"
                  value={memberForm.jobTitle}
                  onChange={(event) => setMemberForm((prev) => ({ ...prev, jobTitle: event.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="member-county">County</Label>
                <Input
                  id="member-county"
                  value={memberForm.county}
                  onChange={(event) => setMemberForm((prev) => ({ ...prev, county: event.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="member-country">Country</Label>
                <Input
                  id="member-country"
                  value={memberForm.country}
                  onChange={(event) => setMemberForm((prev) => ({ ...prev, country: event.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="member-home-phone">Home Phone</Label>
                <Input
                  id="member-home-phone"
                  value={memberForm.homePhone}
                  onChange={(event) => setMemberForm((prev) => ({ ...prev, homePhone: event.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="member-work-phone">Work Phone</Label>
                <Input
                  id="member-work-phone"
                  value={memberForm.workPhone}
                  onChange={(event) => setMemberForm((prev) => ({ ...prev, workPhone: event.target.value }))}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <Label htmlFor="member-retire-date">Retire Date</Label>
                <Input
                  id="member-retire-date"
                  type="date"
                  value={memberForm.retireDate}
                  onChange={(event) => setMemberForm((prev) => ({ ...prev, retireDate: event.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="member-termination-date">Termination Date</Label>
                <Input
                  id="member-termination-date"
                  type="date"
                  value={memberForm.terminationDate}
                  onChange={(event) => setMemberForm((prev) => ({ ...prev, terminationDate: event.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="member-rehire-date">Rehire Date</Label>
                <Input
                  id="member-rehire-date"
                  type="date"
                  value={memberForm.rehireDate}
                  onChange={(event) => setMemberForm((prev) => ({ ...prev, rehireDate: event.target.value }))}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="member-termination-reason">Termination Reason</Label>
              <Input
                id="member-termination-reason"
                value={memberForm.terminationReason}
                onChange={(event) => setMemberForm((prev) => ({ ...prev, terminationReason: event.target.value }))}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Employee Plan Selection</Label>
                <Select
                  value={memberForm.selectedPlanId}
                  onValueChange={(value) => {
                    const selectedPlan = planCatalogById.get(value);
                    setMemberForm((prev) => {
                      const selectedPlanName = selectedPlan?.name || "";
                      const normalizedRelationship = normalizeRelationshipForPlan(prev.relationship, selectedPlanName);
                      return {
                        ...prev,
                        selectedPlanId: value,
                        selectedPlanName,
                        selectedPlanTier: selectedPlan ? derivePlanTierFromName(selectedPlan.name) : "",
                        relationship: normalizedRelationship,
                        tier: deriveTierFromRelationship(normalizedRelationship, prev.tier),
                      };
                    });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select employee plan" />
                  </SelectTrigger>
                  <SelectContent>
                    {availablePlans.map((plan) => (
                      <SelectItem key={plan.id} value={String(plan.id)}>
                        {plan.name} {plan.price !== null ? `- $${plan.price.toFixed(2)}/mo` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {memberForm.selectedPlanTier ? (
                  <p className="text-xs text-slate-500 mt-1">Resolved tier: {memberForm.selectedPlanTier}</p>
                ) : null}
              </div>
              <div>
                <Label>PBM Enabled</Label>
                <Select
                  value={memberForm.pbmEnabled ? "enabled" : "disabled"}
                  onValueChange={(value) =>
                    setMemberForm((prev) => ({ ...prev, pbmEnabled: value === "enabled" }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="PBM selection" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="disabled">Disabled</SelectItem>
                    <SelectItem value="enabled">Enabled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Status</Label>
                <Select
                  value={memberForm.status}
                  onValueChange={(value) => setMemberForm((prev) => ({ ...prev, status: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    {statusOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="member-pbm-amount">PBM Monthly Amount ($)</Label>
                <Input
                  id="member-pbm-amount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={memberForm.pbmAmount}
                  onChange={(event) => setMemberForm((prev) => ({ ...prev, pbmAmount: event.target.value }))}
                  placeholder="0.00"
                  disabled={!memberForm.pbmEnabled}
                />
              </div>
            </div>

            <div>
              <Label>Payor</Label>
              <Select
                value={memberForm.payorType}
                onValueChange={(value) => setMemberForm((prev) => ({ ...prev, payorType: value }))}
                disabled={Boolean(selectedGroup?.data?.payorType && selectedGroup.data.payorType !== 'mixed')}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Payor" />
                </SelectTrigger>
                <SelectContent>
                  {[
                    { value: "full", label: "Employer Pays All" },
                    { value: "member", label: "Member Pays All" },
                  ].map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedGroup?.data?.payorType && selectedGroup.data.payorType !== 'mixed' && (
                <p className="text-xs text-gray-500 mt-1">Payor mirrors the group setting.</p>
              )}
              {memberCalculatedMonthlyTotal !== null && (
                <p className="text-xs text-slate-600 mt-1">
                  Calculated monthly total: ${memberCalculatedMonthlyTotal.toFixed(2)}
                </p>
              )}
            </div>

            {missingMemberFields.length > 0 && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                Missing required fields: {missingMemberFields.join(", ")}
              </p>
            )}
            </div>
          </div>

          <DialogFooter className="px-6 py-4 border-t bg-white">
            <Button variant="ghost" onClick={() => handleMemberDialogToggle(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => upsertMemberMutation.mutate()}
              disabled={!isMemberFormValid || upsertMemberMutation.isPending}
            >
              {upsertMemberMutation.isPending ? 'Saving...' : editingMember ? 'Save Changes' : 'Add Member'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
