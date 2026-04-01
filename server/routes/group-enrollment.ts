import { Router, Response, NextFunction } from 'express';
import { authenticateToken, type AuthRequest } from '../auth/supabaseAuth';
import { hasAtLeastRole } from '../auth/roles';
import { formatPlanStartDateISO, getUpcomingPlanStartDates } from '../../shared/planStartDates';
import { displaySSN } from '@shared/display-ssn';
import { supabase } from '../lib/supabaseClient';
import { decryptSSN, encryptSSN, formatSSN } from '../utils/encryption';
import {
  addGroupMember,
  completeGroupRegistration,
  createAdminNotification,
  createGroup,
  deleteGroupMember,
  getPlatformSetting,
  getDiscountCodeByCode,
  getGroupById,
  getGroupMemberById,
  listGroupMembers,
  listGroups,
  setGroupMemberPaymentStatus,
  upsertPlatformSetting,
  updateGroup,
  updateGroupMember,
} from '../storage';
import { calculatePaymentEligibleDate } from '../utils/commission-payment-calculator';
import { createMonthlyPayout } from '../services/commission-payout-service';
import { transitionGroupPaymentToPayable } from '../services/group-payment-transition-service';
import { calculateCommission } from '../commissionCalculator';

const router = Router();

const GROUP_LOOKUP_SCAN_PAGE_SIZE = 200;
const GROUP_LOOKUP_SCAN_MAX_PAGES = 25;

const ensureGroupEnrollmentAccess = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.user || !hasAtLeastRole(req.user.role, 'agent')) {
    return res.status(403).json({ message: 'Insufficient permissions for group enrollment' });
  }
  return next();
};

const resolveGroupById = async (groupId: string) => {
  const normalizedGroupId = String(groupId || '').trim();
  if (!normalizedGroupId) {
    return null;
  }

  const directGroup = await getGroupById(normalizedGroupId);
  if (directGroup) {
    return directGroup;
  }

  const normalizedToken = normalizedGroupId.toLowerCase();
  for (let page = 0; page < GROUP_LOOKUP_SCAN_MAX_PAGES; page += 1) {
    const offset = page * GROUP_LOOKUP_SCAN_PAGE_SIZE;
    const { groups } = await listGroups({ limit: GROUP_LOOKUP_SCAN_PAGE_SIZE, offset });

    if (!groups.length) {
      break;
    }

    const fallbackGroup = groups.find(
      (candidate) => String(candidate.id || '').trim().toLowerCase() === normalizedToken,
    );
    if (fallbackGroup) {
      console.warn('[Group Enrollment] Group recovered via paged list lookup', {
        groupId: normalizedGroupId,
        page,
      });
      return fallbackGroup;
    }

    if (groups.length < GROUP_LOOKUP_SCAN_PAGE_SIZE) {
      break;
    }
  }

  return null;
};

const parseAmount = (value: unknown): string | null => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const numeric = typeof value === 'number' ? value : parseFloat(String(value));
  if (Number.isNaN(numeric)) {
    return null;
  }

  return numeric.toFixed(2);
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ALLOWED_MEMBER_TIERS = new Set(['member', 'spouse', 'child', 'family']);
const ALLOWED_MEMBER_STATUSES = new Set(['draft', 'ready', 'registered', 'terminated']);
const ALLOWED_MEMBER_RELATIONSHIPS = new Set(['primary', 'spouse', 'dependent']);
const ALLOWED_PAYOR_TYPES = new Set(['full', 'member']);
const GROUP_INDUSTRY_CANONICAL_MAP: Record<string, string> = {
  healthcare: 'Healthcare',
  logistics: 'Logistics',
  retail: 'Retail',
  manufacturing: 'Manufacturing',
  construction: 'Construction',
  hospitality: 'Hospitality',
  'professional services': 'Professional Services',
  technology: 'Technology',
  education: 'Education',
  nonprofit: 'Nonprofit',
  government: 'Government',
};
const normalizeImportKey = (value: unknown): string =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

const SSN_FIELD_ALIASES = new Set([
  'ssn',
  'socialsecuritynumber',
  'socialsecurity',
  'socialsecurityno',
  'socialsecuritynum',
  'employeessn',
  'eessn',
  'employeesocialsecuritynumber',
  'depssn',
  'dependentssn',
  'dependentsocialsecuritynumber',
  'memberssn',
]);
const PRIMARY_MEMBER_SSN_ALIASES = [
  'employeessn',
  'eessn',
  'employeesocialsecuritynumber',
] as const;
const DEPENDENT_MEMBER_SSN_ALIASES = [
  'depssn',
  'dependentssn',
  'dependentsocialsecuritynumber',
] as const;
const GROUP_DOCUMENTS_BUCKET = 'group-documents';
const CENSUS_TEMPLATE_SETTING_KEY = 'group_census_template';
const MAX_CENSUS_TEMPLATE_BYTES = 5 * 1024 * 1024;
const GROUP_ASSIGNMENT_HISTORY_TABLE = 'group_assignment_history';
const GROUP_WORKFLOW_OPEN_STATUSES = new Set(['draft', 'ready', 'pending', 'pending_activation']);
const CAPTURED_PAYMENT_STATUSES = new Set(['paid', 'captured', 'succeeded', 'success', 'completed']);
const MAX_GROUP_DOCUMENT_BYTES = 10 * 1024 * 1024;
const ALLOWED_GROUP_DOCUMENT_TYPES = new Set(['authorized_payment_form']);
const REQUIRED_PRIMARY_MEMBER_EMPLOYMENT_PROFILE_FIELDS = [
  'sex',
  'hireDate',
  'className',
  'division',
  'payrollGroup',
  'annualBaseSalary',
  'hoursPerWeek',
  'salaryEffectiveDate',
  'address1',
  'address2',
  'city',
  'state',
  'zipCode',
  'mobilePhone',
  'employmentType',
  'originalHireDate',
] as const;

const REQUIRED_DEPENDENT_EMPLOYMENT_PROFILE_FIELDS = [
  'sex',
] as const;

let groupDocumentsBucketReady = false;

type PayorMixMode = 'full' | 'member' | 'fixed' | 'percentage';
type PreferredPaymentMethod = 'card' | 'ach' | null;
type PaymentResponsibilityMode = 'group_invoice' | 'member_self_pay' | 'hybrid_split' | 'payroll_external';

type GroupProfile = {
  ein: string | null;
  businessAddress: {
    line1: string | null;
    line2: string | null;
    city: string | null;
    state: string | null;
    zipCode: string | null;
  };
  responsiblePerson: {
    name: string | null;
    email: string | null;
    phone: string | null;
  };
  contactPerson: {
    name: string | null;
    email: string | null;
    phone: string | null;
  };
  payorMix: {
    mode: PayorMixMode;
    employerFixedAmount: string | null;
    memberFixedAmount: string | null;
    employerPercentage: number | null;
    memberPercentage: number | null;
  };
  paymentResponsibilityMode: PaymentResponsibilityMode;
  preferredPaymentMethod: PreferredPaymentMethod;
  achDetails: {
    routingNumber: string | null;
    accountNumber: string | null;
    bankName: string | null;
    accountType: string | null;
  };
};

type CensusTemplateSettingValue = {
  fileName: string;
  mimeType: string;
  base64: string;
  uploadedAt: string;
  uploadedBy?: string | null;
};

const toTrimmedOrNull = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const getEmploymentProfileFromMember = (member: any): Record<string, any> => {
  const metadata = toObjectOrNull(member?.metadata);
  const registrationPayload = toObjectOrNull(member?.registrationPayload);

  const fromMetadata = toObjectOrNull(metadata?.employmentProfile);
  const fromPayload = toObjectOrNull(registrationPayload?.employmentProfile);

  return {
    ...(fromPayload || {}),
    ...(fromMetadata || {}),
  };
};

const getMissingRequiredMemberFields = (member: any): string[] => {
  const missing: string[] = [];
  const profile = getEmploymentProfileFromMember(member);
  const normalizedRelationship = normalizeMemberRelationship(member?.relationship, member?.tier);
  const requiredProfileFields = normalizedRelationship === 'primary'
    ? REQUIRED_PRIMARY_MEMBER_EMPLOYMENT_PROFILE_FIELDS
    : REQUIRED_DEPENDENT_EMPLOYMENT_PROFILE_FIELDS;

  if (!toTrimmedOrNull(member?.relationship)) {
    missing.push('relationship');
  }

  if (!toTrimmedOrNull(member?.firstName)) {
    missing.push('firstName');
  }

  if (!toTrimmedOrNull(member?.lastName)) {
    missing.push('lastName');
  }

  if (!toTrimmedOrNull(member?.dateOfBirth)) {
    missing.push('dateOfBirth');
  }

  for (const fieldName of requiredProfileFields) {
    if (!toTrimmedOrNull(profile[fieldName])) {
      missing.push(fieldName);
    }
  }

  return missing;
};

const toTitleCase = (value: string): string =>
  value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');

const normalizeGroupIndustry = (value: unknown): string | null => {
  const trimmed = toTrimmedOrNull(value);
  if (!trimmed) {
    return null;
  }

  const canonical = GROUP_INDUSTRY_CANONICAL_MAP[trimmed.toLowerCase()];
  if (canonical) {
    return canonical;
  }

  return toTitleCase(trimmed);
};

const resolveValidDiscountCode = async (
  value: unknown,
): Promise<{ discountCode: string | null; discountCodeId: string | null }> => {
  const normalizedCode = toTrimmedOrNull(value)?.toUpperCase() ?? null;
  if (!normalizedCode) {
    return { discountCode: null, discountCodeId: null };
  }

  const discountCode = await getDiscountCodeByCode(normalizedCode);
  if (!discountCode || !discountCode.isActive) {
    throw new Error('Invalid or inactive discount code');
  }

  const now = new Date();
  if (discountCode.validFrom && new Date(discountCode.validFrom) > now) {
    throw new Error('This discount code is not yet active');
  }

  if (discountCode.validUntil && new Date(discountCode.validUntil) < now) {
    throw new Error('This discount code has expired');
  }

  if (discountCode.maxUses && discountCode.currentUses >= discountCode.maxUses) {
    throw new Error('This discount code has reached its maximum number of uses');
  }

  return {
    discountCode: discountCode.code,
    discountCodeId: discountCode.id,
  };
};

const toDigitsOrNull = (value: unknown): string | null => {
  const normalized = toTrimmedOrNull(value);
  if (!normalized) {
    return null;
  }
  const digits = normalized.replace(/\D/g, '');
  return digits.length > 0 ? digits : null;
};

const sanitizeEmailLocalPart = (value: string | null): string => {
  if (!value) {
    return 'member';
  }

  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/\.{2,}/g, '.')
    .replace(/^\.|\.$/g, '');

  return normalized || 'member';
};

const buildBulkImportFallbackEmail = (
  firstName: string,
  lastName: string,
  rowNumber: number,
  groupId: string,
): string => {
  const first = sanitizeEmailLocalPart(firstName);
  const last = sanitizeEmailLocalPart(lastName);
  const groupToken = groupId.replace(/-/g, '').slice(0, 8) || 'group';
  return `${first}.${last}.row${rowNumber}.${groupToken}@group-import.local`;
};

const buildDependentMemberFallbackEmail = (
  firstName: string,
  lastName: string,
  groupId: string,
  seed: number,
): string => {
  const first = sanitizeEmailLocalPart(firstName);
  const last = sanitizeEmailLocalPart(lastName);
  const groupToken = groupId.replace(/-/g, '').slice(0, 8) || 'group';
  return `${first}.${last}.dep${seed}.${groupToken}@group-import.local`;
};

const formatDateAsMMDDYYYY = (date: Date): string => {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const year = String(date.getFullYear());
  return `${month}${day}${year}`;
};

const normalizeGroupMemberDateOfBirth = (value: unknown): string | null => {
  const normalized = toTrimmedOrNull(value);
  if (!normalized) {
    return null;
  }

  if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(normalized)) {
    const [monthRaw, dayRaw, yearRaw] = normalized.split('/');
    const month = monthRaw.padStart(2, '0');
    const day = dayRaw.padStart(2, '0');
    const year = yearRaw.length === 2 ? `20${yearRaw}` : yearRaw;
    if (/^\d{4}$/.test(year)) {
      return `${month}${day}${year}`;
    }
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    const [year, month, day] = normalized.split('-');
    return `${month}${day}${year}`;
  }

  const dateFromValue = new Date(normalized);
  if (!Number.isNaN(dateFromValue.getTime())) {
    return formatDateAsMMDDYYYY(dateFromValue);
  }

  const digits = normalized.replace(/\D/g, '');
  if (/^\d{8}$/.test(digits)) {
    return digits;
  }

  return null;
};

const isNineDigitSsn = (value: string): boolean => /^\d{9}$/.test(value);

const toNumberOrNull = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const parsed = typeof value === 'number' ? value : parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizePayorMixMode = (value: unknown, fallbackPayorType?: string): PayorMixMode => {
  if (value === 'full' || value === 'member' || value === 'fixed' || value === 'percentage') {
    return value;
  }
  if (fallbackPayorType === 'full') {
    return 'full';
  }
  if (fallbackPayorType === 'member') {
    return 'member';
  }
  return 'fixed';
};

const normalizeGroupProfile = (raw: any, fallbackPayorType?: string): GroupProfile => {
  const einRaw = toTrimmedOrNull(raw?.ein);
  const normalizedEinDigits = einRaw ? einRaw.replace(/\D/g, '') : null;
  const ein = normalizedEinDigits && normalizedEinDigits.length === 9
    ? `${normalizedEinDigits.slice(0, 2)}-${normalizedEinDigits.slice(2)}`
    : einRaw;

  const mode = normalizePayorMixMode(raw?.payorMix?.mode, fallbackPayorType);
  const derivedPaymentResponsibilityMode: PaymentResponsibilityMode = mode === 'full'
    ? 'group_invoice'
    : mode === 'member'
      ? 'member_self_pay'
      : 'hybrid_split';
  const paymentResponsibilityMode = raw?.paymentResponsibilityMode === 'group_invoice'
    || raw?.paymentResponsibilityMode === 'member_self_pay'
    || raw?.paymentResponsibilityMode === 'hybrid_split'
    || raw?.paymentResponsibilityMode === 'payroll_external'
    ? raw.paymentResponsibilityMode
    : derivedPaymentResponsibilityMode;
  const preferredPaymentMethod = raw?.preferredPaymentMethod === 'card' || raw?.preferredPaymentMethod === 'ach'
    ? raw.preferredPaymentMethod
    : null;

  return {
    ein,
    businessAddress: {
      line1: toTrimmedOrNull(raw?.businessAddress?.line1),
      line2: toTrimmedOrNull(raw?.businessAddress?.line2),
      city: toTrimmedOrNull(raw?.businessAddress?.city),
      state: toTrimmedOrNull(raw?.businessAddress?.state)?.toUpperCase() || null,
      zipCode: toTrimmedOrNull(raw?.businessAddress?.zipCode),
    },
    responsiblePerson: {
      name: toTrimmedOrNull(raw?.responsiblePerson?.name),
      email: toTrimmedOrNull(raw?.responsiblePerson?.email)?.toLowerCase() || null,
      phone: toDigitsOrNull(raw?.responsiblePerson?.phone),
    },
    contactPerson: {
      name: toTrimmedOrNull(raw?.contactPerson?.name),
      email: toTrimmedOrNull(raw?.contactPerson?.email)?.toLowerCase() || null,
      phone: toDigitsOrNull(raw?.contactPerson?.phone),
    },
    payorMix: {
      mode,
      employerFixedAmount: parseAmount(raw?.payorMix?.employerFixedAmount),
      memberFixedAmount: parseAmount(raw?.payorMix?.memberFixedAmount),
      employerPercentage: toNumberOrNull(raw?.payorMix?.employerPercentage),
      memberPercentage: toNumberOrNull(raw?.payorMix?.memberPercentage),
    },
    paymentResponsibilityMode,
    preferredPaymentMethod,
    achDetails: {
      routingNumber: toDigitsOrNull(raw?.achDetails?.routingNumber),
      accountNumber: toDigitsOrNull(raw?.achDetails?.accountNumber),
      bankName: toTrimmedOrNull(raw?.achDetails?.bankName),
      accountType: toTrimmedOrNull(raw?.achDetails?.accountType)?.toLowerCase() || null,
    },
  };
};

const payorMixModeToPayorType = (mode: PayorMixMode): string => {
  if (mode === 'full') return 'full';
  if (mode === 'member') return 'member';
  return 'mixed';
};

const getGroupProfileCompleteness = (profile: GroupProfile): { isComplete: boolean; missingFields: string[] } => {
  const missingFields: string[] = [];

  if (!profile.paymentResponsibilityMode) {
    missingFields.push('paymentResponsibilityMode');
  }

  if (!profile.ein) {
    missingFields.push('ein');
  }

  if (!profile.responsiblePerson.name) missingFields.push('responsiblePerson.name');
  if (!profile.responsiblePerson.email || !EMAIL_REGEX.test(profile.responsiblePerson.email)) {
    missingFields.push('responsiblePerson.email');
  }
  if (!profile.responsiblePerson.phone || profile.responsiblePerson.phone.length < 10) {
    missingFields.push('responsiblePerson.phone');
  }

  if (!profile.contactPerson.name) missingFields.push('contactPerson.name');
  if (!profile.contactPerson.email || !EMAIL_REGEX.test(profile.contactPerson.email)) {
    missingFields.push('contactPerson.email');
  }
  if (!profile.contactPerson.phone || profile.contactPerson.phone.length < 10) {
    missingFields.push('contactPerson.phone');
  }

  if (profile.payorMix.mode === 'fixed') {
    const employer = toNumberOrNull(profile.payorMix.employerFixedAmount);
    const member = toNumberOrNull(profile.payorMix.memberFixedAmount);
    if (employer === null || employer < 0) missingFields.push('payorMix.employerFixedAmount');
    if (member === null || member < 0) missingFields.push('payorMix.memberFixedAmount');
  }

  if (profile.payorMix.mode === 'percentage') {
    const employerPct = profile.payorMix.employerPercentage;
    const memberPct = profile.payorMix.memberPercentage;
    if (employerPct === null || employerPct < 0) missingFields.push('payorMix.employerPercentage');
    if (memberPct === null || memberPct < 0) missingFields.push('payorMix.memberPercentage');
    const total = (employerPct ?? 0) + (memberPct ?? 0);
    if (Math.abs(total - 100) > 0.01) {
      missingFields.push('payorMix.percentageTotal');
    }
  }

  if (!profile.preferredPaymentMethod) {
    missingFields.push('preferredPaymentMethod');
  }

  if (profile.preferredPaymentMethod === 'ach') {
    if (!profile.achDetails.routingNumber || profile.achDetails.routingNumber.length !== 9) {
      missingFields.push('achDetails.routingNumber');
    }
    if (!profile.achDetails.accountNumber || profile.achDetails.accountNumber.length < 4) {
      missingFields.push('achDetails.accountNumber');
    }
    if (!profile.achDetails.bankName) {
      missingFields.push('achDetails.bankName');
    }
    if (profile.achDetails.accountType !== 'checking' && profile.achDetails.accountType !== 'savings') {
      missingFields.push('achDetails.accountType');
    }
  }

  return {
    isComplete: missingFields.length === 0,
    missingFields,
  };
};

const getGroupProfileContext = (groupMetadata: any, payorType: string) => {
  const rawProfile = groupMetadata?.groupProfile ?? null;
  const profile = normalizeGroupProfile(rawProfile, payorType);
  const completeness = getGroupProfileCompleteness(profile);

  return {
    profile,
    ...completeness,
  };
};

const canCollectMemberPaymentsForMode = (mode: PaymentResponsibilityMode): boolean =>
  mode === 'member_self_pay' || mode === 'hybrid_split';

const isISODateString = (value: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(value);

const getGroupEffectiveDateContext = (req: AuthRequest, groupMetadata: any) => {
  const availableEffectiveDates = getUpcomingPlanStartDates({ anchorCount: 3 }).map(formatPlanStartDateISO);
  const defaultEffectiveDate = availableEffectiveDates[0] ?? null;
  const override = groupMetadata?.effectiveDateOverride ?? null;
  const selectedFromOverride = typeof override?.selectedEffectiveDate === 'string' ? override.selectedEffectiveDate : null;

  const selectedEffectiveDate =
    selectedFromOverride && availableEffectiveDates.includes(selectedFromOverride)
      ? selectedFromOverride
      : defaultEffectiveDate;

  return {
    availableEffectiveDates,
    defaultEffectiveDate,
    selectedEffectiveDate,
    isOverride: Boolean(selectedEffectiveDate && defaultEffectiveDate && selectedEffectiveDate !== defaultEffectiveDate),
    overrideReason: typeof override?.overrideReason === 'string' ? override.overrideReason : null,
    canOverride: Boolean(req.user && hasAtLeastRole(req.user.role, 'admin')),
  };
};

const normalizeAssignedAgentId = (value: unknown): string | null | undefined => {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const normalizeBoolean = (value: unknown): boolean => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
  }
  return false;
};

const normalizeStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const uniqueValues = new Set<string>();
  for (const item of value) {
    if (typeof item !== 'string') {
      continue;
    }

    const trimmed = item.trim();
    if (!trimmed) {
      continue;
    }

    uniqueValues.add(trimmed);
  }

  return Array.from(uniqueValues);
};

type GroupAssignmentState = {
  currentAssignedAgentId: string | null;
  originalAssignedAgentId: string | null;
  readOnlyAgentIds: string[];
  reassignmentCount: number;
};

const getGroupAssignmentState = (metadata: unknown): GroupAssignmentState => {
  const safeMetadata = (metadata && typeof metadata === 'object' && !Array.isArray(metadata))
    ? (metadata as Record<string, any>)
    : {};
  const assignment = (safeMetadata.assignment && typeof safeMetadata.assignment === 'object' && !Array.isArray(safeMetadata.assignment))
    ? (safeMetadata.assignment as Record<string, any>)
    : {};

  const currentAssignedAgentId = normalizeAssignedAgentId(
    assignment.currentAssignedAgentId ?? safeMetadata.assignedAgentId,
  ) ?? null;
  const originalAssignedAgentId = normalizeAssignedAgentId(
    assignment.originalAssignedAgentId ?? safeMetadata.originalAssignedAgentId ?? currentAssignedAgentId,
  ) ?? null;
  const readOnlyAgentIds = normalizeStringArray(
    assignment.readOnlyAgentIds ?? safeMetadata.readOnlyAgentIds,
  ).filter((agentId) => agentId !== currentAssignedAgentId);

  const reassignmentCountRaw = assignment.reassignmentCount ?? safeMetadata.reassignmentCount;
  const reassignmentCountNumeric = typeof reassignmentCountRaw === 'number'
    ? reassignmentCountRaw
    : parseInt(String(reassignmentCountRaw ?? '0'), 10);

  return {
    currentAssignedAgentId,
    originalAssignedAgentId,
    readOnlyAgentIds,
    reassignmentCount: Number.isFinite(reassignmentCountNumeric) && reassignmentCountNumeric > 0
      ? reassignmentCountNumeric
      : 0,
  };
};

const setGroupAssignmentMetadata = (
  existingMetadata: unknown,
  updates: {
    currentAssignedAgentId: string | null;
    originalAssignedAgentId?: string | null;
    readOnlyAgentIds?: string[];
    reassignmentCount?: number;
    lastReassignedAt?: string | null;
    lastReassignmentEffectiveDate?: string | null;
    previousAssignedAgentId?: string | null;
    previousAgentKeepsReadOnlyAccess?: boolean;
  },
): Record<string, any> => {
  const safeMetadata = (existingMetadata && typeof existingMetadata === 'object' && !Array.isArray(existingMetadata))
    ? { ...(existingMetadata as Record<string, any>) }
    : {};
  const existingState = getGroupAssignmentState(safeMetadata);
  const previousAssignment = (safeMetadata.assignment && typeof safeMetadata.assignment === 'object' && !Array.isArray(safeMetadata.assignment))
    ? { ...(safeMetadata.assignment as Record<string, any>) }
    : {};

  const currentAssignedAgentId = updates.currentAssignedAgentId;
  const originalAssignedAgentId =
    updates.originalAssignedAgentId
    ?? existingState.originalAssignedAgentId
    ?? existingState.currentAssignedAgentId
    ?? currentAssignedAgentId;
  const readOnlyAgentIds = normalizeStringArray(
    updates.readOnlyAgentIds ?? existingState.readOnlyAgentIds,
  ).filter((agentId) => agentId !== currentAssignedAgentId);
  const reassignmentCount = typeof updates.reassignmentCount === 'number'
    ? updates.reassignmentCount
    : existingState.reassignmentCount;

  safeMetadata.assignedAgentId = currentAssignedAgentId;
  safeMetadata.originalAssignedAgentId = originalAssignedAgentId;
  safeMetadata.reassignmentCount = reassignmentCount;
  safeMetadata.hasReassignmentHistory = reassignmentCount > 0;
  safeMetadata.readOnlyAgentIds = readOnlyAgentIds;

  safeMetadata.assignment = {
    ...previousAssignment,
    currentAssignedAgentId,
    originalAssignedAgentId,
    readOnlyAgentIds,
    reassignmentCount,
    hasReassignmentHistory: reassignmentCount > 0,
    lastReassignedAt: updates.lastReassignedAt ?? previousAssignment.lastReassignedAt ?? null,
    lastReassignmentEffectiveDate:
      updates.lastReassignmentEffectiveDate
      ?? previousAssignment.lastReassignmentEffectiveDate
      ?? null,
    previousAssignedAgentId:
      updates.previousAssignedAgentId
      ?? previousAssignment.previousAssignedAgentId
      ?? null,
    previousAgentKeepsReadOnlyAccess:
      typeof updates.previousAgentKeepsReadOnlyAccess === 'boolean'
        ? updates.previousAgentKeepsReadOnlyAccess
        : previousAssignment.previousAgentKeepsReadOnlyAccess ?? false,
  };

  return safeMetadata;
};

const canAccessGroupByAssignment = (req: AuthRequest, groupMetadata: unknown): boolean => {
  if (!req.user) {
    return false;
  }

  if (hasAtLeastRole(req.user.role, 'admin')) {
    return true;
  }

  const assignmentState = getGroupAssignmentState(groupMetadata);
  return assignmentState.currentAssignedAgentId === req.user.id
    || assignmentState.readOnlyAgentIds.includes(req.user.id);
};

const fetchGroupAssignmentHistory = async (groupId: string): Promise<any[]> => {
  const { data, error } = await supabase
    .from(GROUP_ASSIGNMENT_HISTORY_TABLE)
    .select('*')
    .eq('group_id', groupId)
    .order('changed_at', { ascending: false });

  if (error) {
    console.warn('[Group Enrollment] Failed to fetch group assignment history:', error);
    return [];
  }

  return data || [];
};

const parseAmountNumber = (value: unknown): number => {
  const parsed = typeof value === 'number' ? value : parseFloat(String(value ?? 0));
  return Number.isFinite(parsed) ? parsed : 0;
};

const getRegistrationPayloadRateLabel = (groupMember: any): string | null => {
  const payload = groupMember?.registrationPayload && typeof groupMember.registrationPayload === 'object'
    ? groupMember.registrationPayload as Record<string, any>
    : {};

  const employmentProfile = payload.employmentProfile && typeof payload.employmentProfile === 'object'
    ? payload.employmentProfile as Record<string, any>
    : {};

  const directCandidates = [
    payload.businessUnit,
    payload.plantier,
    payload.planTier,
    payload.plan,
    employmentProfile.businessUnit,
  ];

  for (const candidate of directCandidates) {
    const normalized = typeof candidate === 'string' ? candidate.trim() : '';
    if (normalized.length > 0) {
      return normalized;
    }
  }

  return null;
};

const inferAmountFromRateLabel = (rateLabel: string | null): number => {
  if (!rateLabel) {
    return 0;
  }

  const matches = rateLabel.match(/\$\s*([0-9]+(?:\.[0-9]{1,2})?)/g) || [];
  const total = matches
    .map((match) => parseAmountNumber(match.replace(/[^0-9.]/g, '')))
    .filter((value) => value > 0)
    .reduce((sum, value) => sum + value, 0);

  return roundCurrency(total);
};

const resolveGroupMemberBaseAmount = async (groupMember: any): Promise<number> => {
  const currentBaseAmount = roundCurrency(
    parseAmountNumber(groupMember.totalAmount)
    || (parseAmountNumber(groupMember.memberAmount) + parseAmountNumber(groupMember.employerAmount))
  );

  if (currentBaseAmount > 0) {
    return currentBaseAmount;
  }

  const inferredAmount = inferAmountFromRateLabel(getRegistrationPayloadRateLabel(groupMember));
  if (inferredAmount <= 0 || !groupMember?.id) {
    return 0;
  }

  const normalizedPayorType = String(groupMember.payorType || '').trim().toLowerCase();
  const fallbackMemberAmount = normalizedPayorType === 'full' ? inferredAmount : inferredAmount;
  const fallbackEmployerAmount = 0;

  try {
    await updateGroupMember(groupMember.id, {
      totalAmount: parseAmount(inferredAmount),
      memberAmount: parseAmount(fallbackMemberAmount),
      employerAmount: parseAmount(fallbackEmployerAmount),
    });

    groupMember.totalAmount = inferredAmount;
    groupMember.memberAmount = fallbackMemberAmount;
    groupMember.employerAmount = fallbackEmployerAmount;
  } catch (error) {
    console.warn('[Group Enrollment] Failed persisting inferred group member amounts:', {
      groupMemberId: groupMember.id,
      error,
    });
  }

  return inferredAmount;
};

const normalizePaymentStatus = (value: unknown): string =>
  String(value || '').trim().toLowerCase();

const getCycleKey = (date: Date): string => {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
};

const roundCurrency = (value: number): number => Math.round(value * 100) / 100;

const toIsoDateOnly = (value: Date): string => value.toISOString().slice(0, 10);

const buildSyntheticGroupMemberId = (groupMemberId: number): string => `group_member:${groupMemberId}`;

const parseCycleDate = (value?: string | null): Date => {
  if (value && isISODateString(value)) {
    return new Date(`${value}T00:00:00.000Z`);
  }

  return new Date();
};

type CommissionSplit = { agentId: string; percentage: number };

const toCommissionMemberType = (tierOrRelationship: unknown): string => {
  const normalized = String(tierOrRelationship || '').trim().toLowerCase();
  if (normalized === 'spouse' || normalized.includes('spouse')) {
    return 'member/spouse';
  }
  if (normalized === 'child' || normalized === 'dependent' || normalized.includes('child')) {
    return 'member/child';
  }
  if (normalized === 'family' || normalized === 'fam') {
    return 'family';
  }
  return 'member only';
};

const PBM_FLAG_FIELD_ALIASES = new Set([
  'addrxvalet',
  'rxvaletenrolled',
  'rxvalet',
  'pbm',
  'pbmenrolled',
  'pbmselected',
  'prochoicerx',
  'rxaddon',
  'pharmacybenefit',
]);

const PBM_AMOUNT_FIELD_ALIASES = new Set([
  'rxvaletamount',
  'pbmamount',
  'rxaddonamount',
  'pharmacybenefitamount',
]);

const PBM_TRUTHY_MARKERS = new Set([
  'true',
  '1',
  'yes',
  'y',
  'on',
  'selected',
  'enrolled',
  'optin',
  'included',
  'add',
]);

const isTruthySelection = (value: unknown): boolean => {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return value > 0;
  }

  const normalized = normalizeImportKey(value);
  return normalized.length > 0 && PBM_TRUTHY_MARKERS.has(normalized);
};

const hasTruthyAliasSelection = (source: Record<string, any> | null, aliases: Set<string>): boolean => {
  if (!source) {
    return false;
  }

  for (const [key, value] of Object.entries(source)) {
    if (!aliases.has(normalizeImportKey(key))) {
      continue;
    }
    if (isTruthySelection(value)) {
      return true;
    }
  }

  return false;
};

const resolveGroupPbmEnabled = (...sources: Array<Record<string, any> | null>): boolean =>
  sources.some((source) => hasTruthyAliasSelection(source, PBM_FLAG_FIELD_ALIASES));

const resolveGroupPbmAmount = (...sources: Array<Record<string, any> | null>): number => {
  for (const source of sources) {
    if (!source) {
      continue;
    }

    for (const [key, value] of Object.entries(source)) {
      if (!PBM_AMOUNT_FIELD_ALIASES.has(normalizeImportKey(key))) {
        continue;
      }

      const parsed = parseAmountNumber(value);
      if (parsed > 0) {
        return roundCurrency(parsed);
      }
    }
  }

  return 0;
};

const resolveGroupMemberPlanName = (group: any, groupMember: any): string => {
  const payload = toObjectOrNull(groupMember?.registrationPayload) || {};
  const memberMetadata = toObjectOrNull(groupMember?.metadata) || {};
  const groupMetadata = toObjectOrNull(group?.metadata) || {};

  const directPlan = String(
    payload.planName
    || payload.selectedPlanName
    || memberMetadata.planName
    || groupMetadata.planName
    || ''
  ).trim();

  if (directPlan.length > 0) {
    return directPlan;
  }

  const memberType = toCommissionMemberType(groupMember?.tier || groupMember?.relationship);
  const membershipAmount = roundCurrency(
    parseAmountNumber(groupMember?.totalAmount)
    || (parseAmountNumber(groupMember?.memberAmount) + parseAmountNumber(groupMember?.employerAmount))
  );

  const planCandidates = ['MyPremierPlan Base', 'MyPremierPlan+', 'MyPremierPlan Elite'];
  let bestPlan = 'MyPremierPlan Base';
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const candidate of planCandidates) {
    const result = calculateCommission(candidate, memberType, false);
    if (!result) {
      continue;
    }

    const distance = Math.abs(result.totalCost - membershipAmount);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestPlan = candidate;
    }
  }

  return bestPlan;
};

const resolveGroupCommissionContext = (group: any, groupMember: any, membershipAmount: number) => {
  const payload = toObjectOrNull(groupMember?.registrationPayload) || {};
  const memberMetadata = toObjectOrNull(groupMember?.metadata) || {};
  const relationship = normalizeMemberRelationship(groupMember?.relationship, groupMember?.tier);
  const memberType = toCommissionMemberType(groupMember?.tier || relationship);
  const planName = resolveGroupMemberPlanName(group, groupMember);
  const addRxValet = resolveGroupPbmEnabled(payload, memberMetadata);

  const commissionResult = calculateCommission(planName, memberType, addRxValet);
  if (!commissionResult) {
    return {
      planName,
      memberType,
      addRxValet,
      coverageType: 'group',
      commissionBaseAmount: roundCurrency(membershipAmount),
      membershipAmount: roundCurrency(membershipAmount),
    };
  }

  return {
    planName,
    memberType,
    addRxValet,
    coverageType: 'group',
    commissionBaseAmount: roundCurrency(commissionResult.commission),
    membershipAmount: roundCurrency(membershipAmount),
  };
};

const filterEligibleCommissionSplits = async (splits: CommissionSplit[]): Promise<CommissionSplit[]> => {
  if (!splits.length) {
    return [];
  }

  const agentIds = [...new Set(splits.map((split) => split.agentId))];
  const { data, error } = await supabase
    .from('users')
    .select('id, role, is_active')
    .in('id', agentIds);

  if (error) {
    console.warn('[Group Enrollment] Failed validating assigned commission agents:', error);
    return [];
  }

  const usersById = new Map((data || []).map((row: any) => [String(row.id), row]));
  return splits.filter((split) => {
    const user = usersById.get(split.agentId);
    return Boolean(user && user.role === 'agent' && user.is_active !== false);
  });
};

const normalizeCommissionSplitInput = (input: unknown): CommissionSplit[] => {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .map((entry: any) => {
      const agentId = typeof entry?.agentId === 'string' ? entry.agentId.trim() : '';
      const percentage = typeof entry?.percentage === 'number'
        ? entry.percentage
        : parseInt(String(entry?.percentage ?? ''), 10);

      return { agentId, percentage };
    })
    .filter((entry) => entry.agentId.length > 0 && Number.isFinite(entry.percentage) && entry.percentage > 0);
};

const pickAttributionSplitsForDate = (
  metadata: Record<string, any>,
  asOfDateIso: string,
): CommissionSplit[] => {
  const attribution = metadata.commissionAttribution && typeof metadata.commissionAttribution === 'object'
    ? metadata.commissionAttribution
    : {};

  const activeSplits = normalizeCommissionSplitInput(attribution.splits);
  const pendingChange = attribution.pendingChange && typeof attribution.pendingChange === 'object'
    ? attribution.pendingChange
    : null;

  if (!pendingChange) {
    return activeSplits;
  }

  const pendingEffectiveDate = typeof pendingChange.effectiveDate === 'string' ? pendingChange.effectiveDate : null;
  if (!pendingEffectiveDate || !isISODateString(pendingEffectiveDate)) {
    return activeSplits;
  }

  if (pendingEffectiveDate > asOfDateIso) {
    return activeSplits;
  }

  return normalizeCommissionSplitInput(pendingChange.splits);
};

const parseConfiguredCommissionSplits = (
  metadata: Record<string, any>,
  fallbackAgentId: string | null,
  asOfDateIso: string,
): CommissionSplit[] => {
  const parsed = pickAttributionSplitsForDate(metadata, asOfDateIso);

  if (parsed.length > 0) {
    return parsed;
  }

  if (!fallbackAgentId) {
    return [];
  }

  return [{ agentId: fallbackAgentId, percentage: 100 }];
};

const validateCommissionSplits = (splits: CommissionSplit[]): string | null => {
  if (splits.length === 0) {
    return 'No eligible agent attribution configured for group commissions';
  }

  const nonWhole = splits.find((split) => !Number.isInteger(split.percentage));
  if (nonWhole) {
    return 'Commission split percentages must be whole numbers';
  }

  const total = splits.reduce((sum, split) => sum + split.percentage, 0);
  if (total !== 100) {
    return `Commission split percentages must total 100 (received ${total})`;
  }

  return null;
};

const resolveAssignedAgentForDate = async (
  groupId: string,
  metadata: Record<string, any>,
  asOfDateIso: string,
): Promise<string | null> => {
  const assignmentState = getGroupAssignmentState(metadata);
  const fallbackAgentId = assignmentState.currentAssignedAgentId;

  const { data, error } = await supabase
    .from(GROUP_ASSIGNMENT_HISTORY_TABLE)
    .select('new_agent_id,effective_date,changed_at')
    .eq('group_id', groupId)
    .lte('effective_date', asOfDateIso)
    .order('effective_date', { ascending: false })
    .order('changed_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn('[Group Enrollment] Failed resolving assignment history for commission attribution:', error);
    return fallbackAgentId;
  }

  if (!data?.new_agent_id || typeof data.new_agent_id !== 'string') {
    return fallbackAgentId;
  }

  const trimmed = data.new_agent_id.trim();
  return trimmed.length > 0 ? trimmed : fallbackAgentId;
};

const hasExistingGroupCommissionForCycle = async (
  syntheticMemberId: string,
  agentId: string,
  cycleKey: string,
): Promise<boolean> => {
  const { data, error } = await supabase
    .from('agent_commissions')
    .select('id')
    .eq('member_id', syntheticMemberId)
    .eq('agent_id', agentId)
    .ilike('notes', `%cycle:${cycleKey}%`)
    .limit(1);

  if (error) {
    console.warn('[Group Enrollment] Failed checking existing group commission:', error);
    return false;
  }

  return Array.isArray(data) && data.length > 0;
};

const getExistingGroupCommissionForCycle = async (
  groupId: string,
  groupMemberId: number,
  syntheticMemberId: string,
  agentId: string,
  cycleKey: string,
): Promise<any | null> => {
  const { data, error } = await supabase
    .from('agent_commissions')
    .select('id, payment_captured, payment_status, commission_amount')
    .eq('member_id', syntheticMemberId)
    .eq('agent_id', agentId)
    .ilike('notes', `%group:${groupId}%`)
    .ilike('notes', `%groupMember:${groupMemberId}%`)
    .ilike('notes', `%cycle:${cycleKey}%`)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn('[Group Enrollment] Failed loading existing group commission for cycle:', error);
    return null;
  }

  return data || null;
};

const createExpectedGroupMemberCommissionsForCycle = async (
  group: any,
  groupMembers: any[],
  cycleAnchor: Date,
  triggeredBy: string | null,
): Promise<{ created: number; updated: number; skipped: number; expectedTotal: number; cycleKey: string }> => {
  const metadata = group.metadata && typeof group.metadata === 'object'
    ? (group.metadata as Record<string, any>)
    : {};

  const cycleKey = getCycleKey(cycleAnchor);
  const asOfDateIso = toIsoDateOnly(cycleAnchor);
  const assignedAgentId = await resolveAssignedAgentForDate(group.id, metadata, asOfDateIso);
  const configuredSplits = await filterEligibleCommissionSplits(
    parseConfiguredCommissionSplits(metadata, assignedAgentId, asOfDateIso)
  );
  const splitError = validateCommissionSplits(configuredSplits);
  if (splitError && configuredSplits.length > 0) {
    throw new Error(splitError);
  }

  if (configuredSplits.length === 0) {
    return {
      created: 0,
      updated: 0,
      skipped: groupMembers.length,
      expectedTotal: 0,
      cycleKey,
    };
  }

  const primaryAgentId = configuredSplits[0].agentId;
  let created = 0;
  let updated = 0;
  let skipped = 0;
  let expectedTotal = 0;

  for (const groupMember of groupMembers) {
    if (groupMember.status === 'terminated') {
      continue;
    }

    const syntheticMemberId = buildSyntheticGroupMemberId(groupMember.id);
    const baseAmount = await resolveGroupMemberBaseAmount(groupMember);

    if (baseAmount <= 0) {
      skipped += 1;
      continue;
    }

    const commissionContext = resolveGroupCommissionContext(group, groupMember, baseAmount);
    const commissionBaseAmount = commissionContext.commissionBaseAmount;

    expectedTotal = roundCurrency(expectedTotal + commissionBaseAmount);

    let allocated = 0;
    for (let index = 0; index < configuredSplits.length; index += 1) {
      const split = configuredSplits[index];
      const isLast = index === configuredSplits.length - 1;
      const splitAmount = isLast
        ? roundCurrency(commissionBaseAmount - allocated)
        : roundCurrency(commissionBaseAmount * (split.percentage / 100));
      allocated = roundCurrency(allocated + splitAmount);

      if (splitAmount <= 0) {
        continue;
      }

      const existingCommission = await getExistingGroupCommissionForCycle(
        group.id,
        groupMember.id,
        syntheticMemberId,
        split.agentId,
        cycleKey,
      );

      const expectedNotes = [
        'Group member commission',
        `group:${group.id}`,
        `groupMember:${groupMember.id}`,
        `cycle:${cycleKey}`,
        'stage:expected',
        `groupName:${group.name || ''}`,
        `plan:${commissionContext.planName}`,
        `memberType:${commissionContext.memberType}`,
        `membershipFee:${commissionContext.membershipAmount.toFixed(2)}`,
        `split:${split.percentage}`,
        triggeredBy ? `triggeredBy:${triggeredBy}` : null,
      ].filter(Boolean).join(' | ');

      if (existingCommission?.id) {
        if (existingCommission.payment_captured) {
          skipped += 1;
          continue;
        }

        const { error: updateError } = await supabase
          .from('agent_commissions')
          .update({
            commission_amount: splitAmount,
            status: 'pending',
            payment_status: 'unpaid',
            payment_captured: false,
            payment_captured_at: null,
            payment_eligible_date: null,
            commission_type: index === 0 ? 'direct' : 'override',
            override_for_agent_id: index === 0 ? null : primaryAgentId,
            base_premium: commissionContext.membershipAmount,
            notes: expectedNotes,
          })
          .eq('id', existingCommission.id);

        if (updateError) {
          throw new Error(`Failed updating expected group commission for agent ${split.agentId}: ${updateError.message}`);
        }

        updated += 1;
        continue;
      }

      const commissionPayload = {
        agent_id: split.agentId,
        member_id: syntheticMemberId,
        enrollment_id: null,
        commission_amount: splitAmount,
        coverage_type: commissionContext.coverageType as any,
        status: 'pending',
        payment_status: 'unpaid',
        payment_captured: false,
        payment_captured_at: null,
        payment_eligible_date: null,
        commission_type: index === 0 ? 'direct' : 'override',
        override_for_agent_id: index === 0 ? null : primaryAgentId,
        base_premium: commissionContext.membershipAmount,
        notes: expectedNotes,
      };

      const { error: commissionError } = await supabase
        .from('agent_commissions')
        .insert(commissionPayload);

      if (commissionError) {
        throw new Error(`Failed creating expected group commission for agent ${split.agentId}: ${commissionError.message}`);
      }

      created += 1;
    }
  }

  return {
    created,
    updated,
    skipped,
    expectedTotal,
    cycleKey,
  };
};

const buildGroupBillingSnapshot = async (
  group: any,
  groupMembers: any[],
  cycleAnchor: Date,
  preferredPaymentMethod: PreferredPaymentMethod,
  triggeredBy: string | null,
  expectedCommissionTotal: number,
): Promise<Record<string, any>> => {
  const metadata = group.metadata && typeof group.metadata === 'object'
    ? (group.metadata as Record<string, any>)
    : {};

  const asOfDateIso = toIsoDateOnly(cycleAnchor);
  const assignedAgentId = await resolveAssignedAgentForDate(group.id, metadata, asOfDateIso);
  const configuredSplits = parseConfiguredCommissionSplits(metadata, assignedAgentId, asOfDateIso);

  const tierCounts = {
    memberOnly: 0,
    spouse: 0,
    child: 0,
    family: 0,
  };

  const productMix: Record<string, { count: number; amount: number }> = {};
  let eeCount = 0;
  let dependentCount = 0;
  let grossInvoiceAmount = 0;
  let employerTotal = 0;
  let memberTotal = 0;
  let discountTotal = 0;
  let pbmEnrolledCount = 0;
  let pbmTotalAmount = 0;

  for (const member of groupMembers) {
    if (member.status === 'terminated') {
      continue;
    }

    const normalizedTier = normalizeMemberTier(member.tier);
    if (normalizedTier === 'member') tierCounts.memberOnly += 1;
    if (normalizedTier === 'spouse') tierCounts.spouse += 1;
    if (normalizedTier === 'child') tierCounts.child += 1;
    if (normalizedTier === 'family') tierCounts.family += 1;

    const relationship = normalizeMemberRelationship(member.relationship, normalizedTier);
    if (relationship === 'primary') eeCount += 1;
    else dependentCount += 1;

    const totalAmount = roundCurrency(
      parseAmountNumber(member.totalAmount)
      || (parseAmountNumber(member.memberAmount) + parseAmountNumber(member.employerAmount))
    );
    grossInvoiceAmount = roundCurrency(grossInvoiceAmount + totalAmount);
    employerTotal = roundCurrency(employerTotal + parseAmountNumber(member.employerAmount));
    memberTotal = roundCurrency(memberTotal + parseAmountNumber(member.memberAmount));
    discountTotal = roundCurrency(discountTotal + parseAmountNumber(member.discountAmount));

    const payload = toObjectOrNull(member.registrationPayload) || {};
    const memberMetadata = toObjectOrNull(member.metadata) || {};
    const productLabel = String(
      payload.planName
      || payload.selectedPlanName
      || memberMetadata.planName
      || memberMetadata.productName
      || 'unspecified_plan'
    ).trim();

    if (!productMix[productLabel]) {
      productMix[productLabel] = { count: 0, amount: 0 };
    }

    productMix[productLabel].count += 1;
    productMix[productLabel].amount = roundCurrency(productMix[productLabel].amount + totalAmount);

    const pbmEnabled = resolveGroupPbmEnabled(payload, memberMetadata);

    if (pbmEnabled) {
      pbmEnrolledCount += 1;
      const pbmAmount = resolveGroupPbmAmount(payload, memberMetadata);
      pbmTotalAmount = roundCurrency(pbmTotalAmount + pbmAmount);
    }
  }

  const directSplit = configuredSplits[0]?.percentage || 100;
  const directExpected = roundCurrency(expectedCommissionTotal * (directSplit / 100));
  const overrideExpected = roundCurrency(Math.max(0, expectedCommissionTotal - directExpected));

  return {
    capturedAt: new Date().toISOString(),
    capturedBy: triggeredBy,
    cycleKey: getCycleKey(cycleAnchor),
    cycleDate: asOfDateIso,
    groupId: group.id,
    payment: {
      method: preferredPaymentMethod,
      status: 'pending',
    },
    financials: {
      grossInvoiceAmount,
      employerTotal,
      memberTotal,
      discountTotal,
      netPayableAmount: grossInvoiceAmount,
    },
    tierMix: {
      ...tierCounts,
      eeCount,
      dependentCount,
    },
    productMix,
    pbm: {
      enrolledCount: pbmEnrolledCount,
      totalAmount: pbmTotalAmount,
    },
    commissions: {
      expectedTotal: expectedCommissionTotal,
      directExpected,
      overrideExpected,
      attributionSplits: configuredSplits,
    },
  };
};

const buildGroupFinancialSummary = (
  group: any,
  groupMembers: any[],
) => {
  let monthlyRevenue = 0;
  let employerTotal = 0;
  let memberTotal = 0;
  let discountTotal = 0;
  let projectedMonthlyCommission = 0;
  let activeMemberCount = 0;
  let terminatedMemberCount = 0;

  for (const groupMember of groupMembers) {
    if (groupMember.status === 'terminated') {
      terminatedMemberCount += 1;
      continue;
    }

    activeMemberCount += 1;

    const employerAmount = parseAmountNumber(groupMember.employerAmount);
    const memberAmount = parseAmountNumber(groupMember.memberAmount);
    const discountAmount = parseAmountNumber(groupMember.discountAmount);
    const explicitTotal = parseAmountNumber(groupMember.totalAmount);
    const membershipAmount = roundCurrency(
      explicitTotal > 0 ? explicitTotal : (employerAmount + memberAmount - discountAmount)
    );

    monthlyRevenue = roundCurrency(monthlyRevenue + membershipAmount);
    employerTotal = roundCurrency(employerTotal + employerAmount);
    memberTotal = roundCurrency(memberTotal + memberAmount);
    discountTotal = roundCurrency(discountTotal + discountAmount);

    const commissionContext = resolveGroupCommissionContext(group, groupMember, membershipAmount);
    projectedMonthlyCommission = roundCurrency(
      projectedMonthlyCommission + roundCurrency(commissionContext.commissionBaseAmount || 0)
    );
  }

  return {
    asOf: new Date().toISOString(),
    activeMemberCount,
    terminatedMemberCount,
    monthlyRevenue,
    yearlyProjectedRevenue: roundCurrency(monthlyRevenue * 12),
    projectedMonthlyCommission,
    projectedYearlyCommission: roundCurrency(projectedMonthlyCommission * 12),
    employerTotal,
    memberTotal,
    discountTotal,
  };
};

const createGroupMemberCommissionsForCapturedPayment = async (
  group: any,
  groupMember: any,
  paymentCapturedAt: Date,
  paymentStatusRaw: string,
  triggeredBy: string | null,
) => {
  const metadata = group.metadata && typeof group.metadata === 'object'
    ? (group.metadata as Record<string, any>)
    : {};

  const paymentDateIso = paymentCapturedAt.toISOString();
  const paymentDateOnly = paymentDateIso.slice(0, 10);
  const cycleKey = getCycleKey(paymentCapturedAt);
  const assignedAgentId = await resolveAssignedAgentForDate(group.id, metadata, paymentDateOnly);
  const configuredSplits = await filterEligibleCommissionSplits(
    parseConfiguredCommissionSplits(metadata, assignedAgentId, paymentDateOnly)
  );
  const splitError = validateCommissionSplits(configuredSplits);
  if (splitError && configuredSplits.length > 0) {
    throw new Error(splitError);
  }

  if (configuredSplits.length === 0) {
    return;
  }

  const syntheticMemberId = `group_member:${groupMember.id}`;
  const baseAmount = await resolveGroupMemberBaseAmount(groupMember);

  if (baseAmount <= 0) {
    throw new Error('Cannot create group commission because member total amount is zero');
  }

  const commissionContext = resolveGroupCommissionContext(group, groupMember, baseAmount);
  const commissionBaseAmount = commissionContext.commissionBaseAmount;

  const paymentEligibleDate = calculatePaymentEligibleDate(paymentCapturedAt);
  const primaryAgentId = configuredSplits[0].agentId;

  let allocated = 0;
  for (let index = 0; index < configuredSplits.length; index += 1) {
    const split = configuredSplits[index];
    const existingCommission = await getExistingGroupCommissionForCycle(
      group.id,
      groupMember.id,
      syntheticMemberId,
      split.agentId,
      cycleKey,
    );

    const isLast = index === configuredSplits.length - 1;
    const splitAmount = isLast
      ? roundCurrency(commissionBaseAmount - allocated)
      : roundCurrency(commissionBaseAmount * (split.percentage / 100));
    allocated = roundCurrency(allocated + splitAmount);

    if (splitAmount <= 0) {
      continue;
    }

    const commissionPayload = {
      agent_id: split.agentId,
      member_id: syntheticMemberId,
      enrollment_id: null,
      commission_amount: splitAmount,
      coverage_type: commissionContext.coverageType as any,
      status: 'approved',
      payment_status: 'unpaid',
      payment_captured: true,
      payment_captured_at: paymentDateIso,
      payment_eligible_date: paymentEligibleDate.toISOString(),
      commission_type: index === 0 ? 'direct' : 'override',
      override_for_agent_id: index === 0 ? null : primaryAgentId,
      base_premium: commissionContext.membershipAmount,
      notes: [
        `Group member commission`,
        `group:${group.id}`,
        `groupMember:${groupMember.id}`,
        `cycle:${cycleKey}`,
        `groupName:${group.name || ''}`,
        `plan:${commissionContext.planName}`,
        `memberType:${commissionContext.memberType}`,
        `membershipFee:${commissionContext.membershipAmount.toFixed(2)}`,
        'stage:payable',
        `paymentStatus:${paymentStatusRaw}`,
        `split:${split.percentage}`,
        triggeredBy ? `triggeredBy:${triggeredBy}` : null,
      ].filter(Boolean).join(' | '),
    };

    let commissionId: string;

    if (existingCommission?.id) {
      const { error: updateError } = await supabase
        .from('agent_commissions')
        .update(commissionPayload)
        .eq('id', existingCommission.id);

      if (updateError) {
        throw new Error(`Failed transitioning group commission to payable for agent ${split.agentId}: ${updateError.message}`);
      }

      commissionId = existingCommission.id;
    } else {
      const { data: createdCommission, error: commissionError } = await supabase
        .from('agent_commissions')
        .insert(commissionPayload)
        .select('id')
        .single();

      if (commissionError) {
        throw new Error(`Failed creating group commission for agent ${split.agentId}: ${commissionError.message}`);
      }

      commissionId = createdCommission.id;
    }

    await createMonthlyPayout({
      commissionId,
      paymentCapturedAt,
      amount: splitAmount,
      commissionType: index === 0 ? 'direct' : 'override',
      overrideForAgentId: index === 0 ? undefined : primaryAgentId,
    });
  }
};

const normalizeMemberTier = (value: unknown): string => {
  if (typeof value !== 'string') {
    return 'member';
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === 'dependent' || normalized === 'dep') {
    return 'child';
  }
  if (normalized === 'employee' || normalized === 'ee' || normalized === 'primary') {
    return 'member';
  }
  return ALLOWED_MEMBER_TIERS.has(normalized) ? normalized : 'member';
};

const normalizeMemberStatus = (value: unknown): string => {
  if (typeof value !== 'string') {
    return 'draft';
  }

  const normalized = value.trim().toLowerCase();
  return ALLOWED_MEMBER_STATUSES.has(normalized) ? normalized : 'draft';
};

const normalizeMemberRelationship = (value: unknown, fallbackTier?: string): string => {
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (ALLOWED_MEMBER_RELATIONSHIPS.has(normalized)) {
      return normalized;
    }
    if (normalized === 'child' || normalized === 'dependent' || normalized === 'dep') {
      return 'dependent';
    }
    if (
      normalized === 'employee'
      || normalized === 'member'
      || normalized === 'self'
      || normalized === 'subscriber'
      || normalized === 'ee'
    ) {
      return 'primary';
    }
  }

  const normalizedTier = normalizeMemberTier(fallbackTier);
  if (normalizedTier === 'spouse') return 'spouse';
  if (normalizedTier === 'child') return 'dependent';
  return 'primary';
};

const isPrimaryMemberRelationship = (value: unknown, fallbackTier?: string): boolean =>
  normalizeMemberRelationship(value, fallbackTier) === 'primary';

const normalizeDependentSuffix = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = typeof value === 'number' ? value : parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return null;
  }

  return parsed;
};

const normalizeMemberPayorType = (value: unknown, fallbackPayorType: string): string => {
  if (fallbackPayorType !== 'mixed') {
    return fallbackPayorType;
  }

  if (typeof value !== 'string') {
    return 'full';
  }

  const normalized = value.trim().toLowerCase();
  return ALLOWED_PAYOR_TYPES.has(normalized) ? normalized : 'full';
};

const hasOwn = (value: Record<string, any>, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(value, key);

const toObjectOrNull = (value: unknown): Record<string, any> | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return { ...(value as Record<string, any>) };
};

const stripSensitiveSsnFields = (value: unknown): Record<string, any> | null => {
  const objectValue = toObjectOrNull(value);
  if (!objectValue) {
    return null;
  }

  for (const key of Object.keys(objectValue)) {
    if (SSN_FIELD_ALIASES.has(normalizeImportKey(key))) {
      delete objectValue[key];
    }
  }

  delete objectValue.ssnEncrypted;
  delete objectValue.ssnLast4;
  delete objectValue.dependentSsnEncrypted;
  delete objectValue.dependentSsnLast4;
  return objectValue;
};

const normalizeRawSsnValue = (raw: unknown): string | null => {
  if (raw === null || raw === undefined) {
    return null;
  }

  const normalized = String(raw).trim();
  if (!normalized) {
    return null;
  }

  const digits = normalized.replace(/\D/g, '');
  if (!digits) {
    return null;
  }

  // Spreadsheet imports can coerce leading-zero SSNs into 8-digit numbers.
  if (digits.length === 8) {
    return `0${digits}`;
  }

  return digits;
};

const extractSsnIntent = (...sources: unknown[]): { provided: boolean; value: string | null } => {
  let sawSsnField = false;

  for (const source of sources) {
    const objectValue = toObjectOrNull(source);
    if (!objectValue) {
      continue;
    }

    for (const [key, raw] of Object.entries(objectValue)) {
      if (!SSN_FIELD_ALIASES.has(normalizeImportKey(key))) {
        continue;
      }

      sawSsnField = true;

      const normalizedSsn = normalizeRawSsnValue(raw);
      if (!normalizedSsn) {
        continue;
      }

      return { provided: true, value: normalizedSsn };
    }
  }

  if (sawSsnField) {
    return { provided: true, value: null };
  }

  return { provided: false, value: null };
};

const extractSsnIntentByAliases = (
  aliases: readonly string[],
  ...sources: unknown[]
): { provided: boolean; value: string | null } => {
  let sawAliasField = false;
  const normalizedAliases = new Set(aliases.map((alias) => normalizeImportKey(alias)));

  for (const source of sources) {
    const objectValue = toObjectOrNull(source);
    if (!objectValue) {
      continue;
    }

    for (const [key, raw] of Object.entries(objectValue)) {
      const normalizedKey = normalizeImportKey(key);
      if (!normalizedAliases.has(normalizedKey)) {
        continue;
      }

      sawAliasField = true;

      const normalizedSsn = normalizeRawSsnValue(raw);
      if (!normalizedSsn) {
        continue;
      }

      return { provided: true, value: normalizedSsn };
    }
  }

  if (sawAliasField) {
    return { provided: true, value: null };
  }

  return { provided: false, value: null };
};

const extractMemberSsnIntent = (
  isPrimaryMember: boolean,
  ...sources: unknown[]
): { provided: boolean; value: string | null } => {
  const relationshipSpecificIntent = isPrimaryMember
    ? extractSsnIntentByAliases(PRIMARY_MEMBER_SSN_ALIASES, ...sources)
    : extractSsnIntentByAliases(DEPENDENT_MEMBER_SSN_ALIASES, ...sources);

  if (relationshipSpecificIntent.provided) {
    return relationshipSpecificIntent;
  }

  return extractSsnIntent(...sources);
};

const extractDependentSsnIntent = (...sources: unknown[]): { provided: boolean; value: string | null } =>
  extractSsnIntentByAliases(DEPENDENT_MEMBER_SSN_ALIASES, ...sources);

const upsertEncryptedSsn = (
  metadataValue: Record<string, any> | null,
  ssn: string | null,
): Record<string, any> | null => {
  if (ssn === null) {
    if (!metadataValue) {
      return null;
    }

    delete metadataValue.ssnEncrypted;
    delete metadataValue.ssn;
    delete metadataValue.ssnLast4;
    return metadataValue;
  }

  const normalized = ssn.replace(/\D/g, '');
  if (!isNineDigitSsn(normalized)) {
    throw new Error('Invalid SSN format');
  }

  const nextMetadata = metadataValue || {};
  try {
    nextMetadata.ssnEncrypted = encryptSSN(normalized);
    delete nextMetadata.ssn;
    nextMetadata.ssnLast4 = normalized.slice(-4);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('SSN encryption key is not configured')) {
      // Keep member flows working when SSN encryption is not configured.
      delete nextMetadata.ssnEncrypted;
      nextMetadata.ssn = normalized;
      nextMetadata.ssnLast4 = normalized.slice(-4);
      console.warn('[Group Enrollment] SSN encryption key is missing; storing normalized SSN fallback.');
      return nextMetadata;
    }

    throw error;
  }

  return nextMetadata;
};

const upsertEncryptedDependentSsn = (
  metadataValue: Record<string, any> | null,
  ssn: string | null,
): Record<string, any> | null => {
  if (ssn === null) {
    if (!metadataValue) {
      return null;
    }

    delete metadataValue.dependentSsnEncrypted;
    delete metadataValue.dependentSsnLast4;
    return metadataValue;
  }

  const normalized = ssn.replace(/\D/g, '');
  if (!isNineDigitSsn(normalized)) {
    throw new Error('Invalid SSN format');
  }

  const nextMetadata = metadataValue || {};
  try {
    nextMetadata.dependentSsnEncrypted = encryptSSN(normalized);
    nextMetadata.dependentSsnLast4 = normalized.slice(-4);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('SSN encryption key is not configured')) {
      delete nextMetadata.dependentSsnEncrypted;
      nextMetadata.dependentSsnLast4 = normalized.slice(-4);
      console.warn('[Group Enrollment] SSN encryption key is missing; storing normalized dependent SSN fallback.');
      return nextMetadata;
    }

    throw error;
  }

  return nextMetadata;
};

const resolveMemberSsnDigits = (member: any): string | null => {
  const metadata = toObjectOrNull(member?.metadata);
  const registrationPayload = toObjectOrNull(member?.registrationPayload);
  const candidates: Array<string | null | undefined> = [
    metadata?.ssnEncrypted,
    metadata?.ssn,
    registrationPayload?.ssn,
    registrationPayload?.socialSecurityNumber,
    registrationPayload?.social_security_number,
  ];

  for (const candidate of candidates) {
    if (typeof candidate !== 'string' || !candidate.trim()) {
      continue;
    }

    const decrypted = decryptSSN(candidate);
    const decryptedDigits = String(decrypted || '').replace(/\D/g, '');
    if (isNineDigitSsn(decryptedDigits)) {
      return decryptedDigits;
    }

    const rawDigits = candidate.replace(/\D/g, '');
    if (isNineDigitSsn(rawDigits)) {
      return rawDigits;
    }
  }

  return null;
};

const canViewFullMemberSsn = (req: AuthRequest): boolean =>
  Boolean(req.user && (hasAtLeastRole(req.user.role, 'admin') || req.user.role === 'authorized'));

const canEditMemberSsn = (req: AuthRequest): boolean =>
  Boolean(req.user && (hasAtLeastRole(req.user.role, 'agent') || req.user.role === 'authorized'));

const shouldRevealMemberSsn = (req: AuthRequest): boolean => {
  if (!canViewFullMemberSsn(req)) {
    return false;
  }

  // Authorized users now get full SSN by default. Callers can still force masking.
  if (req.query?.revealSsn === 'false' || req.body?.revealSsn === false) {
    return false;
  }

  return true;
};

const toMemberResponse = (member: any, includeFullSsn: boolean) => {
  const isPrimaryMember = isPrimaryMemberRelationship(member?.relationship, member?.tier);
  const ssnDigits = resolveMemberSsnDigits(member);
  const fullSsn = ssnDigits && isPrimaryMember
    ? displaySSN(ssnDigits, { reveal: true, role: 'admin' })
    : null;
  const masked = ssnDigits && isPrimaryMember
    ? displaySSN(ssnDigits, { reveal: false, role: '' })
    : null;

  return {
    ...member,
    metadata: stripSensitiveSsnFields(member?.metadata),
    registrationPayload: stripSensitiveSsnFields(member?.registrationPayload),
    ssn: ssnDigits && isPrimaryMember ? (includeFullSsn ? fullSsn : masked) : null,
    ssnMasked: masked,
    hasSsn: Boolean(ssnDigits && isPrimaryMember),
  };
};

const auditGroupMemberSsnAction = async (
  req: AuthRequest,
  memberId: number,
  action: 'update_group_member_ssn' | 'delete_group_member_ssn',
  reason: string | null,
  metadata: Record<string, any>,
) => {
  try {
    await supabase.from('admin_logs').insert({
      log_type: 'sensitive_data_update',
      admin_id: req.user?.id,
      admin_email: req.user?.email,
      member_id: null,
      action,
      reason,
      metadata: {
        ...metadata,
        groupMemberId: memberId,
      },
      ip_address: req.ip,
      user_agent: req.get('user-agent'),
      created_at: new Date().toISOString(),
    });
  } catch (error) {
    console.warn('[Group Enrollment] Failed to write SSN audit log:', error);
  }
};

const sanitizeStorageFileName = (fileName: string): string => {
  const trimmed = fileName.trim();
  if (!trimmed) {
    return `upload-${Date.now()}.bin`;
  }

  const sanitized = trimmed
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return sanitized || `upload-${Date.now()}.bin`;
};

const ensureGroupDocumentsBucket = async () => {
  if (groupDocumentsBucketReady) {
    return;
  }

  const { data: buckets, error: listError } = await supabase.storage.listBuckets();
  if (listError) {
    throw new Error(`Unable to verify storage buckets: ${listError.message}`);
  }

  const exists = (buckets || []).some((bucket) => bucket.name === GROUP_DOCUMENTS_BUCKET);
  if (!exists) {
    const { error: createError } = await supabase.storage.createBucket(GROUP_DOCUMENTS_BUCKET, {
      public: false,
      fileSizeLimit: `${MAX_GROUP_DOCUMENT_BYTES}`,
    });

    if (createError && !createError.message.toLowerCase().includes('already exists')) {
      throw new Error(`Unable to create storage bucket: ${createError.message}`);
    }
  }

  groupDocumentsBucketReady = true;
};

router.use('/api/groups', authenticateToken, ensureGroupEnrollmentAccess);

router.get('/api/census-template', authenticateToken, ensureGroupEnrollmentAccess, async (_req: AuthRequest, res: Response) => {
  try {
    const record = await getPlatformSetting<CensusTemplateSettingValue>(CENSUS_TEMPLATE_SETTING_KEY);
    const value = record?.value;

    if (value && typeof value.base64 === 'string' && value.base64.trim()) {
      return res.json({
        source: 'custom',
        fileName: value.fileName || 'MyPremierPlans_Census_Template.xlsx',
        mimeType: value.mimeType || 'application/octet-stream',
        base64: value.base64,
        updatedAt: value.uploadedAt || record?.updatedAt || null,
      });
    }

    return res.json({
      source: 'default',
      fileName: 'MyPremierPlans_Census_Template.csv',
      url: '/templates/MyPremierPlans_Census_Template.csv',
    });
  } catch (error) {
    console.error('[Group Enrollment] Failed to fetch census template setting:', error);
    return res.status(500).json({ message: 'Failed to load census template configuration' });
  }
});

router.post('/api/admin/census-template', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !hasAtLeastRole(req.user.role, 'admin')) {
      return res.status(403).json({ message: 'Admin access required' });
    }

    const fileName = typeof req.body?.fileName === 'string' ? req.body.fileName.trim() : '';
    const mimeType = typeof req.body?.mimeType === 'string' ? req.body.mimeType.trim() : '';
    const base64 = typeof req.body?.base64 === 'string' ? req.body.base64.trim() : '';

    if (!fileName || !base64) {
      return res.status(400).json({ message: 'fileName and base64 are required' });
    }

    if (fileName.length > 200) {
      return res.status(400).json({ message: 'fileName is too long' });
    }

    const fileBuffer = Buffer.from(base64, 'base64');
    if (!fileBuffer.length) {
      return res.status(400).json({ message: 'Invalid file content' });
    }

    if (fileBuffer.length > MAX_CENSUS_TEMPLATE_BYTES) {
      return res.status(413).json({ message: 'Template file exceeds 5MB limit' });
    }

    const nextValue: CensusTemplateSettingValue = {
      fileName,
      mimeType: mimeType || 'application/octet-stream',
      base64,
      uploadedAt: new Date().toISOString(),
      uploadedBy: req.user?.id || null,
    };

    await upsertPlatformSetting(CENSUS_TEMPLATE_SETTING_KEY, nextValue, req.user?.id);

    return res.json({
      success: true,
      source: 'custom',
      fileName: nextValue.fileName,
      updatedAt: nextValue.uploadedAt,
    });
  } catch (error) {
    console.error('[Group Enrollment] Failed to upload census template:', error);
    return res.status(500).json({ message: 'Failed to upload census template' });
  }
});

router.get('/api/groups', async (req: AuthRequest, res: Response) => {
  try {
    const { status, payorType, search, currentAgentId, originalAgentId, reassignedOnly } = req.query;
    const limit = Number(req.query.limit ?? 50);
    const offset = Number(req.query.offset ?? 0);
    const isAdminOrHigher = Boolean(req.user && hasAtLeastRole(req.user.role, 'admin'));
    const normalizedCurrentAgentFilter = typeof currentAgentId === 'string' ? currentAgentId.trim() : '';
    const normalizedOriginalAgentFilter = typeof originalAgentId === 'string' ? originalAgentId.trim() : '';
    const filterReassignedOnly = normalizeBoolean(reassignedOnly);

    const { groups, count } = await listGroups({
      status: typeof status === 'string' ? status : undefined,
      payorType: typeof payorType === 'string' ? payorType : undefined,
      search: typeof search === 'string' ? search : undefined,
      limit: Number.isNaN(limit) ? undefined : limit,
      offset: Number.isNaN(offset) ? undefined : offset,
    });

    const groupsWithContext = groups.map((group) => {
      const groupProfileContext = getGroupProfileContext(group.metadata, group.payorType);
      const assignmentState = getGroupAssignmentState(group.metadata);
      return {
        ...group,
        groupProfileComplete: groupProfileContext.isComplete,
        currentAssignedAgentId: assignmentState.currentAssignedAgentId,
        originalAssignedAgentId: assignmentState.originalAssignedAgentId,
        hasReassignmentHistory: assignmentState.reassignmentCount > 0,
      };
    });

    let filteredGroups = groupsWithContext;

    if (!isAdminOrHigher) {
      filteredGroups = filteredGroups.filter((group) => canAccessGroupByAssignment(req, group.metadata));
    } else {
      if (normalizedCurrentAgentFilter) {
        if (normalizedCurrentAgentFilter === 'unassigned') {
          filteredGroups = filteredGroups.filter((group) => !group.currentAssignedAgentId);
        } else {
          filteredGroups = filteredGroups.filter((group) => group.currentAssignedAgentId === normalizedCurrentAgentFilter);
        }
      }

      if (normalizedOriginalAgentFilter) {
        if (normalizedOriginalAgentFilter === 'unassigned') {
          filteredGroups = filteredGroups.filter((group) => !group.originalAssignedAgentId);
        } else {
          filteredGroups = filteredGroups.filter((group) => group.originalAssignedAgentId === normalizedOriginalAgentFilter);
        }
      }

      if (filterReassignedOnly) {
        filteredGroups = filteredGroups.filter((group) => Boolean(group.hasReassignmentHistory));
      }
    }

    return res.json({ data: filteredGroups, count: filteredGroups.length ?? count ?? 0 });
  } catch (error) {
    console.error('[Group Enrollment] Failed to list groups:', error);
    const message = error instanceof Error ? error.message : 'Failed to list groups';
    return res.status(500).json({ message });
  }
});

router.post('/api/groups', async (req: AuthRequest, res: Response) => {
  try {
    const { name, payorType, groupType, discountCode, discountCodeId, metadata, groupProfile, assignedAgentId } = req.body || {};

    if (!name) {
      return res.status(400).json({ message: 'Group name is required' });
    }

    const existingMetadata = (metadata && typeof metadata === 'object') ? { ...metadata } : {};
    const normalizedIndustry = normalizeGroupIndustry(
      existingMetadata.groupIndustry ?? existingMetadata.industry,
    );
    existingMetadata.groupIndustry = normalizedIndustry;
    delete existingMetadata.industry;
    const normalizedProfile = normalizeGroupProfile(groupProfile, typeof payorType === 'string' ? payorType : undefined);
    const normalizedPayorType = typeof payorType === 'string'
      ? payorType
      : payorMixModeToPayorType(normalizedProfile.payorMix.mode);
    const resolvedDiscountCode = await resolveValidDiscountCode(discountCode);
    const isAdminOrHigher = Boolean(req.user && hasAtLeastRole(req.user.role, 'admin'));
    const selectedAssignedAgentId = normalizeAssignedAgentId(assignedAgentId);
    let nextMetadata = {
      ...existingMetadata,
      groupProfile: normalizedProfile,
    };

    let currentAssignedAgentId: string | null = null;

    if (isAdminOrHigher) {
      currentAssignedAgentId = selectedAssignedAgentId ?? null;
    } else if (req.user?.id) {
      currentAssignedAgentId = req.user.id;
    }

    nextMetadata = setGroupAssignmentMetadata(nextMetadata, {
      currentAssignedAgentId,
      originalAssignedAgentId: currentAssignedAgentId,
    });

    const group = await createGroup({
      name,
      payorType: normalizedPayorType,
      groupType,
      discountCode: resolvedDiscountCode.discountCode,
      discountCodeId: resolvedDiscountCode.discountCodeId ?? discountCodeId ?? null,
      metadata: nextMetadata,
      status: 'draft',
      createdBy: req.user?.id,
      updatedBy: req.user?.id,
    });

    const groupProfileContext = getGroupProfileContext(group.metadata, group.payorType);
    return res.status(201).json({ data: group, groupProfileContext });
  } catch (error) {
    console.error('[Group Enrollment] Failed to create group:', error);
    const message = error instanceof Error ? error.message : 'Failed to create group';
    return res.status(500).json({ message });
  }
});

router.get('/api/groups/:groupId', async (req: AuthRequest, res: Response) => {
  try {
    const { groupId } = req.params;
    const group = await resolveGroupById(groupId);

    if (!group) {
      console.warn('[Group Enrollment] Group detail not found', {
        groupId,
        userId: req.user?.id || null,
        userRole: req.user?.role || null,
      });
      return res.status(404).json({ message: 'Group not found' });
    }

    if (!canAccessGroupByAssignment(req, group.metadata)) {
      return res.status(403).json({ message: 'You do not have access to this group' });
    }

    const members = await listGroupMembers({ groupId });
    const financialSummary = buildGroupFinancialSummary(group, members);
    const assignmentHistory = await fetchGroupAssignmentHistory(groupId);
    const includeFullSsn = shouldRevealMemberSsn(req);
    const effectiveDateContext = getGroupEffectiveDateContext(req, group.metadata);
    const groupProfileContext = getGroupProfileContext(group.metadata, group.payorType);
    const assignmentState = getGroupAssignmentState(group.metadata);
    return res.json({
      data: {
        ...group,
        currentAssignedAgentId: assignmentState.currentAssignedAgentId,
        originalAssignedAgentId: assignmentState.originalAssignedAgentId,
        hasReassignmentHistory: assignmentState.reassignmentCount > 0,
      },
      members: members.map((member) => toMemberResponse(member, includeFullSsn)),
      groupFinancialSummary: financialSummary,
      assignmentHistory,
      effectiveDateContext,
      groupProfileContext,
    });
  } catch (error) {
    console.error('[Group Enrollment] Failed to fetch group:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch group';
    return res.status(500).json({ message });
  }
});

router.get('/api/groups/:groupId/commission-attribution', async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !hasAtLeastRole(req.user.role, 'admin')) {
      return res.status(403).json({ message: 'Only admins can view commission attribution' });
    }

    const { groupId } = req.params;
    const group = await resolveGroupById(groupId);
    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    const metadata = group.metadata && typeof group.metadata === 'object'
      ? (group.metadata as Record<string, any>)
      : {};
    const attribution = metadata.commissionAttribution && typeof metadata.commissionAttribution === 'object'
      ? metadata.commissionAttribution
      : {};
    const assignmentState = getGroupAssignmentState(metadata);

    return res.json({
      data: {
        splits: normalizeCommissionSplitInput(attribution.splits),
        pendingChange: attribution.pendingChange && typeof attribution.pendingChange === 'object'
          ? {
              effectiveDate: attribution.pendingChange.effectiveDate || null,
              splits: normalizeCommissionSplitInput(attribution.pendingChange.splits),
              scheduledBy: attribution.pendingChange.scheduledBy || null,
              scheduledAt: attribution.pendingChange.scheduledAt || null,
            }
          : null,
        fallbackAssignedAgentId: assignmentState.currentAssignedAgentId,
        updatedAt: attribution.updatedAt || null,
        updatedBy: attribution.updatedBy || null,
      },
    });
  } catch (error) {
    console.error('[Group Enrollment] Failed to load commission attribution:', error);
    const message = error instanceof Error ? error.message : 'Failed to load commission attribution';
    return res.status(500).json({ message });
  }
});

router.patch('/api/groups/:groupId/commission-attribution', async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !hasAtLeastRole(req.user.role, 'admin')) {
      return res.status(403).json({ message: 'Only admins can update commission attribution' });
    }

    const { groupId } = req.params;
    const group = await resolveGroupById(groupId);
    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    const splits = normalizeCommissionSplitInput(req.body?.splits);
    const splitError = validateCommissionSplits(splits);
    if (splitError) {
      return res.status(400).json({ message: splitError });
    }

    const uniqueAgentIds = Array.from(new Set(splits.map((split) => split.agentId)));
    const { data: agents, error: agentsError } = await supabase
      .from('users')
      .select('id, role')
      .in('id', uniqueAgentIds);

    if (agentsError) {
      return res.status(500).json({ message: `Unable to validate split agents: ${agentsError.message}` });
    }

    const allowedRoles = new Set(['agent', 'admin', 'super_admin']);
    const validAgentIds = new Set(
      (agents || [])
        .filter((agent: any) => typeof agent?.id === 'string' && allowedRoles.has(String(agent?.role || '').trim()))
        .map((agent: any) => String(agent.id).trim())
    );

    const missingAgent = uniqueAgentIds.find((agentId) => !validAgentIds.has(agentId));
    if (missingAgent) {
      return res.status(400).json({ message: `Invalid agent in commission split: ${missingAgent}` });
    }

    const requestedEffectiveDate = typeof req.body?.effectiveDate === 'string' ? req.body.effectiveDate.trim() : '';
    if (requestedEffectiveDate && !isISODateString(requestedEffectiveDate)) {
      return res.status(400).json({ message: 'effectiveDate must be YYYY-MM-DD when provided' });
    }

    const todayIso = new Date().toISOString().slice(0, 10);
    const shouldScheduleForFuture = requestedEffectiveDate && requestedEffectiveDate > todayIso;
    const existingMetadata = group.metadata && typeof group.metadata === 'object'
      ? { ...(group.metadata as Record<string, any>) }
      : {};
    const existingAttribution = existingMetadata.commissionAttribution && typeof existingMetadata.commissionAttribution === 'object'
      ? { ...(existingMetadata.commissionAttribution as Record<string, any>) }
      : {};

    let nextAttribution: Record<string, any>;
    if (shouldScheduleForFuture) {
      nextAttribution = {
        ...existingAttribution,
        pendingChange: {
          effectiveDate: requestedEffectiveDate,
          splits,
          scheduledBy: req.user.id,
          scheduledAt: new Date().toISOString(),
        },
      };
    } else {
      nextAttribution = {
        ...existingAttribution,
        splits,
        updatedBy: req.user.id,
        updatedAt: new Date().toISOString(),
      };
      delete nextAttribution.pendingChange;
    }

    existingMetadata.commissionAttribution = nextAttribution;
    const updated = await updateGroup(groupId, {
      metadata: existingMetadata,
      updatedBy: req.user.id,
    });

    return res.json({
      data: {
        groupId: updated.id,
        appliedImmediately: !shouldScheduleForFuture,
        effectiveDate: shouldScheduleForFuture ? requestedEffectiveDate : todayIso,
        splits,
        pendingChange: shouldScheduleForFuture
          ? {
              effectiveDate: requestedEffectiveDate,
              splits,
            }
          : null,
      },
    });
  } catch (error) {
    console.error('[Group Enrollment] Failed to update commission attribution:', error);
    const message = error instanceof Error ? error.message : 'Failed to update commission attribution';
    return res.status(500).json({ message });
  }
});

router.patch('/api/groups/:groupId/effective-date', async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !hasAtLeastRole(req.user.role, 'admin')) {
      return res.status(403).json({ message: 'Only admins can override group effective dates' });
    }

    const { groupId } = req.params;
    const group = await resolveGroupById(groupId);
    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    const { selectedEffectiveDate, overrideReason } = req.body || {};
    const availableEffectiveDates = getUpcomingPlanStartDates({ anchorCount: 3 }).map(formatPlanStartDateISO);
    const defaultEffectiveDate = availableEffectiveDates[0] ?? null;

    if (!defaultEffectiveDate) {
      return res.status(500).json({ message: 'No effective dates available' });
    }

    const normalizedSelected =
      typeof selectedEffectiveDate === 'string' && isISODateString(selectedEffectiveDate)
        ? selectedEffectiveDate
        : defaultEffectiveDate;

    if (!availableEffectiveDates.includes(normalizedSelected)) {
      return res.status(400).json({
        message: 'Selected effective date must be one of the next 3 active effective dates',
      });
    }

    const isOverride = normalizedSelected !== defaultEffectiveDate;
    const normalizedReason = typeof overrideReason === 'string' ? overrideReason.trim() : '';

    if (isOverride && normalizedReason.length < 5) {
      return res.status(400).json({
        message: 'Override reason is required and must be at least 5 characters',
      });
    }

    const existingMetadata = (group.metadata && typeof group.metadata === 'object') ? group.metadata : {};
    const nextMetadata = { ...existingMetadata } as Record<string, any>;

    if (isOverride) {
      nextMetadata.effectiveDateOverride = {
        selectedEffectiveDate: normalizedSelected,
        defaultEffectiveDate,
        availableEffectiveDatesSnapshot: availableEffectiveDates,
        overrideReason: normalizedReason,
        overriddenByUserId: req.user.id,
        overriddenByRole: req.user.role,
        overriddenAt: new Date().toISOString(),
      };
    } else {
      delete nextMetadata.effectiveDateOverride;
    }

    const updated = await updateGroup(groupId, {
      metadata: nextMetadata,
      updatedBy: req.user.id,
    });

    const effectiveDateContext = getGroupEffectiveDateContext(req, updated.metadata);
    return res.json({ data: updated, effectiveDateContext });
  } catch (error) {
    console.error('[Group Enrollment] Failed to update effective date override:', error);
    const message = error instanceof Error ? error.message : 'Failed to update effective date override';
    return res.status(500).json({ message });
  }
});

router.patch('/api/groups/:groupId', async (req: AuthRequest, res: Response) => {
  try {
    const { groupId } = req.params;
    const group = await resolveGroupById(groupId);
    if (!group) {
      console.warn('[Group Enrollment] Group update target not found', {
        groupId,
        userId: req.user?.id || null,
        userRole: req.user?.role || null,
      });
      return res.status(404).json({ message: 'Group not found' });
    }

    if (!canAccessGroupByAssignment(req, group.metadata)) {
      return res.status(403).json({ message: 'You do not have access to this group' });
    }

    const { groupProfile, metadata, assignedAgentId, ...otherFields } = req.body || {};
    const existingMetadata = (group.metadata && typeof group.metadata === 'object') ? group.metadata : {};
    const incomingMetadata = (metadata && typeof metadata === 'object') ? { ...metadata } : {};
    if (Object.prototype.hasOwnProperty.call(incomingMetadata, 'groupIndustry')
      || Object.prototype.hasOwnProperty.call(incomingMetadata, 'industry')) {
      incomingMetadata.groupIndustry = normalizeGroupIndustry(
        incomingMetadata.groupIndustry ?? incomingMetadata.industry,
      );
    }
    delete incomingMetadata.industry;
    const mergedMetadata = { ...existingMetadata, ...incomingMetadata } as Record<string, any>;
    const isAdminOrHigher = Boolean(req.user && hasAtLeastRole(req.user.role, 'admin'));
    const selectedAssignedAgentId = normalizeAssignedAgentId(assignedAgentId);

    let normalizedPayorType = typeof otherFields.payorType === 'string' ? otherFields.payorType : group.payorType;
    const includesDiscountCode = hasOwn(otherFields, 'discountCode');
    let resolvedDiscountCode: { discountCode: string | null; discountCodeId: string | null } | null = null;
    if (includesDiscountCode) {
      resolvedDiscountCode = await resolveValidDiscountCode(otherFields.discountCode);
    }

    if (groupProfile !== undefined) {
      const normalizedProfile = normalizeGroupProfile(groupProfile, normalizedPayorType);
      mergedMetadata.groupProfile = normalizedProfile;
      normalizedPayorType = payorMixModeToPayorType(normalizedProfile.payorMix.mode);
    }

    const existingAssignmentState = getGroupAssignmentState(existingMetadata);
    let nextCurrentAssignedAgentId = existingAssignmentState.currentAssignedAgentId;

    if (selectedAssignedAgentId !== undefined && isAdminOrHigher) {
      nextCurrentAssignedAgentId = selectedAssignedAgentId ?? null;
    }

    if (!nextCurrentAssignedAgentId && req.user?.id && !isAdminOrHigher) {
      nextCurrentAssignedAgentId = req.user.id;
    }

    const nextOriginalAssignedAgentId = existingAssignmentState.originalAssignedAgentId
      ?? existingAssignmentState.currentAssignedAgentId
      ?? nextCurrentAssignedAgentId;

    const normalizedMetadata = setGroupAssignmentMetadata(mergedMetadata, {
      currentAssignedAgentId: nextCurrentAssignedAgentId,
      originalAssignedAgentId: nextOriginalAssignedAgentId,
      readOnlyAgentIds: existingAssignmentState.readOnlyAgentIds,
      reassignmentCount: existingAssignmentState.reassignmentCount,
    });

    const updated = await updateGroup(groupId, {
      ...otherFields,
      ...(resolvedDiscountCode
        ? {
          discountCode: resolvedDiscountCode.discountCode,
          discountCodeId: resolvedDiscountCode.discountCodeId,
        }
        : {}),
      payorType: normalizedPayorType,
      metadata: normalizedMetadata,
      updatedBy: req.user?.id,
    });

    const groupProfileContext = getGroupProfileContext(updated.metadata, updated.payorType);
    return res.json({ data: updated, groupProfileContext });
  } catch (error) {
    console.error('[Group Enrollment] Failed to update group:', error);
    const message = error instanceof Error ? error.message : 'Failed to update group';
    return res.status(500).json({ message });
  }
});

router.get('/api/groups/:groupId/assignment-history', async (req: AuthRequest, res: Response) => {
  try {
    const { groupId } = req.params;
    const group = await resolveGroupById(groupId);
    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    if (!canAccessGroupByAssignment(req, group.metadata)) {
      return res.status(403).json({ message: 'You do not have access to this group' });
    }

    const history = await fetchGroupAssignmentHistory(groupId);
    return res.json({ data: history });
  } catch (error) {
    console.error('[Group Enrollment] Failed to fetch assignment history:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch assignment history';
    return res.status(500).json({ message });
  }
});

router.post('/api/groups/:groupId/reassign', async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !hasAtLeastRole(req.user.role, 'admin')) {
      return res.status(403).json({ message: 'Only admins can reassign groups' });
    }

    const { groupId } = req.params;
    const group = await resolveGroupById(groupId);
    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    const assignmentState = getGroupAssignmentState(group.metadata);
    const oldAgentId = assignmentState.currentAssignedAgentId;
    const normalizedNewAgentId = normalizeAssignedAgentId(req.body?.newAgentId);
    if (!normalizedNewAgentId) {
      return res.status(400).json({ message: 'A new agent is required for reassignment' });
    }

    if (oldAgentId && normalizedNewAgentId === oldAgentId) {
      return res.status(400).json({ message: 'The new agent matches the current assigned agent' });
    }

    const reason = toTrimmedOrNull(req.body?.reason);
    if (!reason || reason.length < 3) {
      return res.status(400).json({ message: 'Reason is required and must be at least 3 characters' });
    }

    const notes = toTrimmedOrNull(req.body?.notes);
    const effectiveDate = (typeof req.body?.effectiveDate === 'string' && isISODateString(req.body.effectiveDate))
      ? req.body.effectiveDate
      : new Date().toISOString().slice(0, 10);
    const transferLinkedEmployees = true;
    const transferOpenWorkflows = normalizeBoolean(req.body?.transferOpenWorkflows);
    const previousAgentReadOnly = normalizeBoolean(req.body?.previousAgentReadOnly);

    const nextReadOnlyAgents = previousAgentReadOnly && oldAgentId
      ? normalizeStringArray([...assignmentState.readOnlyAgentIds, oldAgentId]).filter((agentId) => agentId !== normalizedNewAgentId)
      : assignmentState.readOnlyAgentIds.filter((agentId) => agentId !== normalizedNewAgentId);

    const nowIso = new Date().toISOString();
    const updatedMetadata = setGroupAssignmentMetadata(group.metadata, {
      currentAssignedAgentId: normalizedNewAgentId,
      originalAssignedAgentId: assignmentState.originalAssignedAgentId || oldAgentId || normalizedNewAgentId,
      readOnlyAgentIds: nextReadOnlyAgents,
      reassignmentCount: assignmentState.reassignmentCount + 1,
      lastReassignedAt: nowIso,
      lastReassignmentEffectiveDate: effectiveDate,
      previousAssignedAgentId: oldAgentId,
      previousAgentKeepsReadOnlyAccess: previousAgentReadOnly,
    });

    let linkedEmployeesTransferred = 0;
    let openWorkflowsTransferred = 0;

    const groupMembers = await listGroupMembers({ groupId });

    const linkedMemberIds = Array.from(
      new Set(
        groupMembers
          .map((member) => member.memberId)
          .filter((memberId): memberId is number => typeof memberId === 'number' && Number.isFinite(memberId)),
      ),
    );

    if (linkedMemberIds.length > 0) {
      const { data: transferredMembers, error: transferError } = await supabase
        .from('members')
        .update({
          enrolled_by_agent_id: normalizedNewAgentId,
          updated_at: nowIso,
        })
        .in('id', linkedMemberIds)
        .select('id');

      if (transferError) {
        console.warn('[Group Enrollment] Failed to transfer linked employees:', transferError);
      } else {
        linkedEmployeesTransferred = transferredMembers?.length || 0;
      }
    }

    if (transferOpenWorkflows) {
      const openMembers = groupMembers.filter((member) => {
        const memberStatus = typeof member.status === 'string' ? member.status.toLowerCase() : 'draft';
        return GROUP_WORKFLOW_OPEN_STATUSES.has(memberStatus);
      });

      for (const member of openMembers) {
        const existingMetadata = member.metadata && typeof member.metadata === 'object'
          ? (member.metadata as Record<string, any>)
          : {};

        const nextMetadata = {
          ...existingMetadata,
          workflowAssignment: {
            ...(existingMetadata.workflowAssignment || {}),
            currentAssignedAgentId: normalizedNewAgentId,
            previousAssignedAgentId: oldAgentId,
            transferredAt: nowIso,
            transferredBy: req.user.id,
          },
        };

        await updateGroupMember(member.id, {
          metadata: nextMetadata,
        });
      }

      openWorkflowsTransferred = openMembers.length;
    }

    const updatedGroup = await updateGroup(groupId, {
      metadata: updatedMetadata,
      updatedBy: req.user.id,
    });

    const { error: historyError } = await supabase
      .from(GROUP_ASSIGNMENT_HISTORY_TABLE)
      .insert({
        group_id: groupId,
        old_agent_id: oldAgentId,
        new_agent_id: normalizedNewAgentId,
        changed_by: req.user.id,
        changed_at: nowIso,
        effective_date: effectiveDate,
        reason,
        notes,
        transfer_linked_employees: transferLinkedEmployees,
        transfer_open_workflows: transferOpenWorkflows,
        previous_agent_read_only: previousAgentReadOnly,
        cascade_summary: {
          linkedEmployeesTransferred,
          openWorkflowsTransferred,
        },
      });

    if (historyError) {
      console.warn('[Group Enrollment] Failed to persist assignment history:', historyError);
    }

    const assignmentHistory = await fetchGroupAssignmentHistory(groupId);
    return res.json({
      data: updatedGroup,
      assignmentHistory,
      transferSummary: {
        linkedEmployeesTransferred,
        openWorkflowsTransferred,
      },
    });
  } catch (error) {
    console.error('[Group Enrollment] Failed to reassign group:', error);
    const message = error instanceof Error ? error.message : 'Failed to reassign group';
    return res.status(500).json({ message });
  }
});

router.post('/api/groups/:groupId/members', async (req: AuthRequest, res: Response) => {
  try {
    const { groupId } = req.params;
    const group = await resolveGroupById(groupId);
    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    if (!canAccessGroupByAssignment(req, group.metadata)) {
      return res.status(403).json({ message: 'You do not have access to this group' });
    }

    const {
      tier,
      payorType,
      firstName,
      lastName,
      email,
      phone,
      dateOfBirth,
      employerAmount,
      memberAmount,
      discountAmount,
      totalAmount,
      metadata,
      registrationPayload,
      status,
    } = req.body || {};

    const normalizedTier = normalizeMemberTier(tier);
    const normalizedRelationship = normalizeMemberRelationship(req.body?.relationship, normalizedTier);
    const isPrimaryMember = normalizedRelationship === 'primary';
    const providedEmail = toTrimmedOrNull(email)?.toLowerCase() || null;

    if (!tier || !firstName || !lastName) {
      return res.status(400).json({ message: 'Tier, first name, and last name are required' });
    }

    if (isPrimaryMember && !providedEmail) {
      return res.status(400).json({ message: 'Primary member email is required' });
    }

    if (isPrimaryMember && providedEmail && !EMAIL_REGEX.test(providedEmail)) {
      return res.status(400).json({ message: 'Invalid email format' });
    }

    const persistedEmail = isPrimaryMember
      ? (providedEmail as string)
      : buildDependentMemberFallbackEmail(String(firstName), String(lastName), groupId, Date.now());
    const existingMembers = await listGroupMembers({ groupId });
    const householdIdentifiers = resolveHouseholdIdentifiers({
      groupId,
      isPrimaryMember,
      members: existingMembers,
      explicitHouseholdBaseNumber: toTrimmedOrNull(req.body?.householdBaseNumber),
      explicitHouseholdMemberNumber: toTrimmedOrNull(req.body?.householdMemberNumber),
      explicitDependentSuffix: normalizeDependentSuffix(req.body?.dependentSuffix),
    });

    const ssnIntent = extractMemberSsnIntent(isPrimaryMember, req.body, metadata, registrationPayload);
    const dependentSsnIntent = isPrimaryMember
      ? extractDependentSsnIntent(req.body, metadata, registrationPayload)
      : { provided: false, value: null as string | null };
    const sanitizedMetadata = stripSensitiveSsnFields(metadata);
    const sanitizedRegistrationPayload = stripSensitiveSsnFields(registrationPayload || req.body);
    let nextMetadata = ssnIntent.provided
      ? upsertEncryptedSsn(sanitizedMetadata, ssnIntent.value)
      : sanitizedMetadata;
    if (dependentSsnIntent.provided) {
      nextMetadata = upsertEncryptedDependentSsn(nextMetadata, dependentSsnIntent.value);
    }

    const memberRecord = await addGroupMember(groupId, {
      groupId,
      tier: normalizedTier,
      relationship: normalizedRelationship,
      householdBaseNumber: householdIdentifiers.householdBaseNumber,
      householdMemberNumber: householdIdentifiers.householdMemberNumber,
      dependentSuffix: householdIdentifiers.dependentSuffix,
      payorType: payorType || group.payorType,
      firstName,
      lastName,
      email: persistedEmail,
      phone,
      dateOfBirth: normalizeGroupMemberDateOfBirth(dateOfBirth),
      employerAmount: parseAmount(employerAmount),
      memberAmount: parseAmount(memberAmount),
      discountAmount: parseAmount(discountAmount),
      totalAmount: parseAmount(totalAmount),
      metadata: nextMetadata,
      registrationPayload: sanitizedRegistrationPayload,
      status: status || 'draft',
    });

    return res.status(201).json({ data: toMemberResponse(memberRecord, shouldRevealMemberSsn(req)) });
  } catch (error) {
    console.error('[Group Enrollment] Failed to add group member:', error);
    const message = error instanceof Error ? error.message : 'Failed to add group member';
    if (message === 'Invalid SSN format') {
      return res.status(400).json({ message });
    }
    return res.status(500).json({ message });
  }
});

const mergeImportedMetadata = (existingMetadata: unknown, incomingMetadata: unknown): Record<string, any> | null => {
  const baseMetadata = stripSensitiveSsnFields(existingMetadata) || {};
  const nextMetadata = stripSensitiveSsnFields(incomingMetadata) || {};

  const merged: Record<string, any> = {
    ...baseMetadata,
    ...nextMetadata,
  };

  const baseEmployment = toObjectOrNull(baseMetadata.employmentProfile);
  const nextEmployment = toObjectOrNull(nextMetadata.employmentProfile);
  if (baseEmployment || nextEmployment) {
    merged.employmentProfile = {
      ...(baseEmployment || {}),
      ...(nextEmployment || {}),
    };
  }

  return merged;
};

const mergeImportedRegistrationPayload = (
  existingRegistrationPayload: unknown,
  source: Record<string, any>,
): Record<string, any> | null => {
  const basePayload = stripSensitiveSsnFields(existingRegistrationPayload) || {};
  const nextPayload = stripSensitiveSsnFields(source.registrationPayload || source) || {};

  const merged: Record<string, any> = {
    ...basePayload,
    ...nextPayload,
  };

  const baseEmployment = toObjectOrNull(basePayload.employmentProfile);
  const nextEmployment = toObjectOrNull(nextPayload.employmentProfile);
  if (baseEmployment || nextEmployment) {
    merged.employmentProfile = {
      ...(baseEmployment || {}),
      ...(nextEmployment || {}),
    };
  }

  return merged;
};

const getImportedMemberSex = (source: Record<string, any>): string | null => {
  const direct = toTrimmedOrNull(source.sex ?? source.gender);
  if (direct) {
    return direct;
  }

  const registrationPayload = toObjectOrNull(source.registrationPayload);
  const payloadEmploymentProfile = toObjectOrNull(registrationPayload?.employmentProfile);
  return toTrimmedOrNull(
    payloadEmploymentProfile?.sex
      ?? payloadEmploymentProfile?.gender
      ?? registrationPayload?.sex
      ?? registrationPayload?.gender,
  );
};

const findExistingMemberForSync = (
  existingMembers: any[],
  options: {
    isPrimaryMember: boolean;
    normalizedRelationship: string;
    providedEmail: string | null;
    firstName: string;
    lastName: string;
    normalizedDateOfBirth: string | null;
    householdBaseNumber: string | null;
    householdMemberNumber: string | null;
    dependentSuffix: number | null;
  },
): any | null => {
  const {
    isPrimaryMember,
    normalizedRelationship,
    providedEmail,
    firstName,
    lastName,
    normalizedDateOfBirth,
    householdBaseNumber,
    householdMemberNumber,
    dependentSuffix,
  } = options;

  const byHouseholdMemberNumber = householdMemberNumber
    ? existingMembers.find((member) => String(member.householdMemberNumber || '').trim() === householdMemberNumber)
    : null;
  if (byHouseholdMemberNumber) return byHouseholdMemberNumber;

  const byHouseholdBaseAndSuffix = householdBaseNumber
    ? existingMembers.find((member) => {
      const matchesBase = String(member.householdBaseNumber || '').trim() === householdBaseNumber;
      if (!matchesBase) return false;

      if (dependentSuffix === null || dependentSuffix === undefined) {
        return true;
      }

      return normalizeDependentSuffix(member.dependentSuffix) === dependentSuffix;
    })
    : null;
  if (byHouseholdBaseAndSuffix) return byHouseholdBaseAndSuffix;

  if (isPrimaryMember && providedEmail) {
    const byPrimaryEmail = existingMembers.find((member) => {
      const memberRelationship = normalizeMemberRelationship(member.relationship, member.tier);
      const memberEmail = toTrimmedOrNull(member.email)?.toLowerCase() || null;
      return memberRelationship === 'primary' && memberEmail === providedEmail;
    });
    if (byPrimaryEmail) return byPrimaryEmail;
  }

  const normalizedFirstName = firstName.trim().toLowerCase();
  const normalizedLastName = lastName.trim().toLowerCase();

  const byIdentity = existingMembers.find((member) => {
    const memberRelationship = normalizeMemberRelationship(member.relationship, member.tier);
    if (memberRelationship !== normalizedRelationship) {
      return false;
    }

    const memberFirst = toTrimmedOrNull(member.firstName)?.toLowerCase() || '';
    const memberLast = toTrimmedOrNull(member.lastName)?.toLowerCase() || '';
    if (memberFirst !== normalizedFirstName || memberLast !== normalizedLastName) {
      return false;
    }

    const memberDob = normalizeGroupMemberDateOfBirth(member.dateOfBirth);
    if (normalizedDateOfBirth && memberDob) {
      return normalizedDateOfBirth === memberDob;
    }

    return true;
  });

  return byIdentity || null;
};

const inferTierFromRelationship = (relationship: string, fallbackTier: string): string => {
  if (relationship === 'spouse') {
    return 'spouse';
  }

  if (relationship === 'dependent') {
    return 'child';
  }

  if (relationship === 'primary') {
    return 'member';
  }

  return fallbackTier;
};

const getNextDependentSuffixForHousehold = (
  members: any[],
  householdBaseNumber: string,
  excludeMemberId?: number,
): number => {
  const suffixes = members
    .filter((member) => Number(member.id) !== Number(excludeMemberId))
    .filter((member) => String(member.householdBaseNumber || '').trim() === householdBaseNumber)
    .map((member) => normalizeDependentSuffix(member.dependentSuffix))
    .filter((value): value is number => value !== null);

  if (suffixes.length === 0) {
    return 1;
  }

  return Math.max(...suffixes) + 1;
};

const formatHouseholdMemberNumber = (householdBaseNumber: string, dependentSuffix: number): string =>
  `${householdBaseNumber}-${String(Math.max(0, dependentSuffix)).padStart(2, '0')}`;

const isStructuredHouseholdMemberNumber = (value: string | null): boolean =>
  Boolean(toTrimmedOrNull(value)?.match(/^.+-\d{1,2}$/));

const extractHouseholdBaseNumberFromMemberNumber = (value: string | null): string | null => {
  const trimmed = toTrimmedOrNull(value);
  if (!trimmed) {
    return null;
  }

  const match = trimmed.match(/^(.*?)-\d{1,2}$/);
  const candidate = match?.[1]?.trim();
  return candidate || null;
};

const resolveHouseholdIdentifiers = (
  options: {
    groupId: string;
    isPrimaryMember: boolean;
    members: any[];
    excludeMemberId?: number;
    explicitHouseholdBaseNumber?: string | null;
    explicitHouseholdMemberNumber?: string | null;
    explicitDependentSuffix?: number | null;
    existingHouseholdBaseNumber?: string | null;
    existingHouseholdMemberNumber?: string | null;
    existingDependentSuffix?: number | null;
  },
): { householdBaseNumber: string; householdMemberNumber: string; dependentSuffix: number } => {
  const {
    groupId,
    isPrimaryMember,
    members,
    excludeMemberId,
    explicitHouseholdBaseNumber,
    explicitHouseholdMemberNumber,
    explicitDependentSuffix,
    existingHouseholdBaseNumber,
    existingHouseholdMemberNumber,
    existingDependentSuffix,
  } = options;

  const normalizedExplicitHouseholdMemberNumber = toTrimmedOrNull(explicitHouseholdMemberNumber || null);
  const normalizedExistingHouseholdMemberNumber = toTrimmedOrNull(existingHouseholdMemberNumber || null);

  const explicitBaseFromMemberNumber = extractHouseholdBaseNumberFromMemberNumber(normalizedExplicitHouseholdMemberNumber);
  const existingBaseFromMemberNumber = extractHouseholdBaseNumberFromMemberNumber(normalizedExistingHouseholdMemberNumber);

  const primaryAnchor = members.find((member) =>
    Number(member.id) !== Number(excludeMemberId)
    && normalizeMemberRelationship(member.relationship, member.tier) === 'primary'
    && member.status !== 'terminated'
  );

  const anchorBaseNumber = toTrimmedOrNull(primaryAnchor?.householdBaseNumber)
    || extractHouseholdBaseNumberFromMemberNumber(toTrimmedOrNull(primaryAnchor?.householdMemberNumber))
    || (primaryAnchor ? String(primaryAnchor.id) : null);

  const generatedBaseNumber = `HH${groupId.replace(/-/g, '').slice(-6)}${Date.now().toString().slice(-4)}`;
  const householdBaseNumber = toTrimmedOrNull(explicitHouseholdBaseNumber)
    || explicitBaseFromMemberNumber
    || toTrimmedOrNull(existingHouseholdBaseNumber)
    || existingBaseFromMemberNumber
    || anchorBaseNumber
    || generatedBaseNumber;

  if (isPrimaryMember) {
    const dependentSuffix = 0;
    const householdMemberNumber = (isStructuredHouseholdMemberNumber(normalizedExplicitHouseholdMemberNumber)
      ? normalizedExplicitHouseholdMemberNumber
      : null)
      || (isStructuredHouseholdMemberNumber(normalizedExistingHouseholdMemberNumber)
        ? normalizedExistingHouseholdMemberNumber
        : null)
      || formatHouseholdMemberNumber(householdBaseNumber, dependentSuffix);

    return { householdBaseNumber, householdMemberNumber, dependentSuffix };
  }

  const dependentSuffix = explicitDependentSuffix
    || existingDependentSuffix
    || getNextDependentSuffixForHousehold(members, householdBaseNumber, excludeMemberId);
  const householdMemberNumber = (isStructuredHouseholdMemberNumber(normalizedExplicitHouseholdMemberNumber)
    ? normalizedExplicitHouseholdMemberNumber
    : null)
    || formatHouseholdMemberNumber(householdBaseNumber, dependentSuffix);

  return { householdBaseNumber, householdMemberNumber, dependentSuffix };
};

router.post('/api/groups/:groupId/members/bulk', async (req: AuthRequest, res: Response) => {
  try {
    const { groupId } = req.params;
    const group = await resolveGroupById(groupId);
    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    if (!canAccessGroupByAssignment(req, group.metadata)) {
      return res.status(403).json({ message: 'You do not have access to this group' });
    }

    const incomingMembers = Array.isArray(req.body?.members) ? req.body.members : [];
    if (incomingMembers.length === 0) {
      return res.status(400).json({ message: 'No members provided for bulk import' });
    }

    const existingMembers = await listGroupMembers({ groupId });

    const created: any[] = [];
    const failed: Array<{ row: number; email?: string; reason: string }> = [];

    for (let index = 0; index < incomingMembers.length; index += 1) {
      const source = incomingMembers[index] || {};
      const rowNumber = index + 2;
      const firstName = toTrimmedOrNull(source.firstName);
      const lastName = toTrimmedOrNull(source.lastName);
      const normalizedTier = normalizeMemberTier(source.tier);
      const normalizedRelationship = normalizeMemberRelationship(source.relationship ?? source.memberRelationship, normalizedTier);
      const isPrimaryMember = normalizedRelationship === 'primary';
      const providedEmail = toTrimmedOrNull(source.email)?.toLowerCase() || null;
      const normalizedDateOfBirth = normalizeGroupMemberDateOfBirth(source.dateOfBirth);
      const importedSex = getImportedMemberSex(source);

      if (!firstName || !lastName) {
        failed.push({ row: rowNumber, email: providedEmail || undefined, reason: 'Missing firstName or lastName' });
        continue;
      }

      if (isPrimaryMember && !providedEmail) {
        failed.push({ row: rowNumber, email: providedEmail || undefined, reason: 'Primary member email is required' });
        continue;
      }

      if (isPrimaryMember && providedEmail && !EMAIL_REGEX.test(providedEmail)) {
        failed.push({ row: rowNumber, email: providedEmail, reason: 'Invalid email format' });
        continue;
      }

      if (!isPrimaryMember && !normalizedDateOfBirth) {
        failed.push({ row: rowNumber, email: providedEmail || undefined, reason: 'Dependent dateOfBirth is required' });
        continue;
      }

      if (!isPrimaryMember && !importedSex) {
        failed.push({ row: rowNumber, email: providedEmail || undefined, reason: 'Dependent sex is required' });
        continue;
      }

      const email = isPrimaryMember
        ? (providedEmail as string)
        : buildDependentMemberFallbackEmail(firstName, lastName, groupId, rowNumber);

      try {
        const ssnIntent = extractMemberSsnIntent(isPrimaryMember, source, source?.metadata, source?.registrationPayload);
        const dependentSsnIntent = isPrimaryMember
          ? extractDependentSsnIntent(source, source?.metadata, source?.registrationPayload)
          : { provided: false, value: null as string | null };
        const sanitizedMetadata = stripSensitiveSsnFields(source.metadata);
        const sanitizedRegistrationPayload = stripSensitiveSsnFields(source.registrationPayload || source);
        let nextMetadata = ssnIntent.provided
          ? upsertEncryptedSsn(sanitizedMetadata, ssnIntent.value)
          : sanitizedMetadata;
        if (dependentSsnIntent.provided) {
          nextMetadata = upsertEncryptedDependentSsn(nextMetadata, dependentSsnIntent.value);
        }

        const householdIdentifiers = resolveHouseholdIdentifiers({
          groupId,
          isPrimaryMember,
          members: existingMembers,
          explicitHouseholdBaseNumber: toTrimmedOrNull(source.householdBaseNumber ?? source.baseMemberNumber),
          explicitHouseholdMemberNumber: toTrimmedOrNull(source.householdMemberNumber ?? source.memberNumber),
          explicitDependentSuffix: normalizeDependentSuffix(source.dependentSuffix),
        });

        const memberRecord = await addGroupMember(groupId, {
          groupId,
          tier: normalizedTier,
          relationship: normalizedRelationship,
          householdBaseNumber: householdIdentifiers.householdBaseNumber,
          householdMemberNumber: householdIdentifiers.householdMemberNumber,
          dependentSuffix: householdIdentifiers.dependentSuffix,
          payorType: normalizeMemberPayorType(source.payorType, group.payorType),
          firstName,
          lastName,
          email,
          phone: toDigitsOrNull(source.phone),
          dateOfBirth: normalizedDateOfBirth,
          employerAmount: parseAmount(source.employerAmount),
          memberAmount: parseAmount(source.memberAmount),
          discountAmount: parseAmount(source.discountAmount),
          totalAmount: parseAmount(source.totalAmount),
          metadata: nextMetadata,
          registrationPayload: sanitizedRegistrationPayload,
          status: normalizeMemberStatus(source.status),
        });

        created.push(toMemberResponse(memberRecord, shouldRevealMemberSsn(req)));
        existingMembers.push(memberRecord);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to add row';
        failed.push({ row: rowNumber, email, reason: message });
      }
    }

    const summary = {
      received: incomingMembers.length,
      created: created.length,
      failed: failed.length,
    };

    return res.status(failed.length > 0 ? 207 : 201).json({
      message: failed.length > 0
        ? 'Bulk import completed with partial failures'
        : 'Bulk import completed successfully',
      summary,
      created,
      failed,
    });
  } catch (error) {
    console.error('[Group Enrollment] Failed to bulk import group members:', error);
    const message = error instanceof Error ? error.message : 'Failed to bulk import group members';
    return res.status(500).json({ message });
  }
});

router.post('/api/groups/:groupId/members/sync', async (req: AuthRequest, res: Response) => {
  try {
    const { groupId } = req.params;
    const group = await resolveGroupById(groupId);
    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    if (!canAccessGroupByAssignment(req, group.metadata)) {
      return res.status(403).json({ message: 'You do not have access to this group' });
    }

    const incomingMembers = Array.isArray(req.body?.members) ? req.body.members : [];
    if (incomingMembers.length === 0) {
      return res.status(400).json({ message: 'No members provided for census sync' });
    }

    const existingMembers = await listGroupMembers({ groupId });
    const created: any[] = [];
    const updated: any[] = [];
    const failed: Array<{ row: number; email?: string; reason: string }> = [];

    for (let index = 0; index < incomingMembers.length; index += 1) {
      const source = incomingMembers[index] || {};
      const rowNumber = index + 2;
      const firstName = toTrimmedOrNull(source.firstName);
      const lastName = toTrimmedOrNull(source.lastName);
      const normalizedTier = normalizeMemberTier(source.tier);
      const normalizedRelationship = normalizeMemberRelationship(source.relationship ?? source.memberRelationship, normalizedTier);
      const isPrimaryMember = normalizedRelationship === 'primary';
      const providedEmail = toTrimmedOrNull(source.email)?.toLowerCase() || null;
      const normalizedDateOfBirth = normalizeGroupMemberDateOfBirth(source.dateOfBirth);
      const householdBaseNumber = toTrimmedOrNull(source.householdBaseNumber ?? source.baseMemberNumber);
      const householdMemberNumber = toTrimmedOrNull(source.householdMemberNumber ?? source.memberNumber);
      const dependentSuffix = normalizeDependentSuffix(source.dependentSuffix);
      const importedSex = getImportedMemberSex(source);

      if (!firstName || !lastName) {
        failed.push({ row: rowNumber, email: providedEmail || undefined, reason: 'Missing firstName or lastName' });
        continue;
      }

      if (isPrimaryMember && !providedEmail) {
        failed.push({ row: rowNumber, email: providedEmail || undefined, reason: 'Primary member email is required' });
        continue;
      }

      if (isPrimaryMember && providedEmail && !EMAIL_REGEX.test(providedEmail)) {
        failed.push({ row: rowNumber, email: providedEmail, reason: 'Invalid email format' });
        continue;
      }

      if (!isPrimaryMember && !normalizedDateOfBirth) {
        failed.push({ row: rowNumber, email: providedEmail || undefined, reason: 'Dependent dateOfBirth is required' });
        continue;
      }

      if (!isPrimaryMember && !importedSex) {
        failed.push({ row: rowNumber, email: providedEmail || undefined, reason: 'Dependent sex is required' });
        continue;
      }

      const email = isPrimaryMember
        ? (providedEmail as string)
        : buildDependentMemberFallbackEmail(firstName, lastName, groupId, rowNumber);

      try {
        const matched = findExistingMemberForSync(existingMembers, {
          isPrimaryMember,
          normalizedRelationship,
          providedEmail,
          firstName,
          lastName,
          normalizedDateOfBirth,
          householdBaseNumber,
          householdMemberNumber,
          dependentSuffix,
        });

        const ssnIntent = extractMemberSsnIntent(isPrimaryMember, source, source?.metadata, source?.registrationPayload);
        const dependentSsnIntent = isPrimaryMember
          ? extractDependentSsnIntent(source, source?.metadata, source?.registrationPayload)
          : { provided: false, value: null as string | null };

        if (matched) {
          const householdIdentifiers = resolveHouseholdIdentifiers({
            groupId,
            isPrimaryMember,
            members: existingMembers,
            excludeMemberId: matched.id,
            explicitHouseholdBaseNumber: householdBaseNumber,
            explicitHouseholdMemberNumber: householdMemberNumber,
            explicitDependentSuffix: dependentSuffix,
            existingHouseholdBaseNumber: toTrimmedOrNull(matched.householdBaseNumber),
            existingHouseholdMemberNumber: toTrimmedOrNull(matched.householdMemberNumber),
            existingDependentSuffix: normalizeDependentSuffix(matched.dependentSuffix),
          });

          const mergedMetadata = mergeImportedMetadata(matched.metadata, source.metadata);
          const mergedRegistrationPayload = mergeImportedRegistrationPayload(matched.registrationPayload, source);
          let nextMetadata = ssnIntent.provided
            ? upsertEncryptedSsn(mergedMetadata, ssnIntent.value)
            : mergedMetadata;
          if (dependentSsnIntent.provided) {
            nextMetadata = upsertEncryptedDependentSsn(nextMetadata, dependentSsnIntent.value);
          }

          const updatedRecord = await updateGroupMember(matched.id, {
            tier: normalizedTier,
            relationship: normalizedRelationship,
            householdBaseNumber: householdIdentifiers.householdBaseNumber,
            householdMemberNumber: householdIdentifiers.householdMemberNumber,
            dependentSuffix: householdIdentifiers.dependentSuffix,
            payorType: normalizeMemberPayorType(source.payorType, group.payorType),
            firstName,
            lastName,
            email: isPrimaryMember ? email : (matched.email || email),
            phone: toDigitsOrNull(source.phone),
            dateOfBirth: normalizedDateOfBirth,
            employerAmount: parseAmount(source.employerAmount),
            memberAmount: parseAmount(source.memberAmount),
            discountAmount: parseAmount(source.discountAmount),
            totalAmount: parseAmount(source.totalAmount),
            metadata: nextMetadata,
            registrationPayload: mergedRegistrationPayload,
            status: normalizeMemberStatus(source.status || matched.status),
          });

          updated.push(toMemberResponse(updatedRecord, shouldRevealMemberSsn(req)));

          const existingIndex = existingMembers.findIndex((member) => member.id === matched.id);
          if (existingIndex >= 0) {
            existingMembers[existingIndex] = updatedRecord;
          }

          continue;
        }

        const sanitizedMetadata = stripSensitiveSsnFields(source.metadata);
        const sanitizedRegistrationPayload = mergeImportedRegistrationPayload(null, source);
        const householdIdentifiers = resolveHouseholdIdentifiers({
          groupId,
          isPrimaryMember,
          members: existingMembers,
          explicitHouseholdBaseNumber: householdBaseNumber,
          explicitHouseholdMemberNumber: householdMemberNumber,
          explicitDependentSuffix: dependentSuffix,
        });
        let nextMetadata = ssnIntent.provided
          ? upsertEncryptedSsn(sanitizedMetadata, ssnIntent.value)
          : sanitizedMetadata;
        if (dependentSsnIntent.provided) {
          nextMetadata = upsertEncryptedDependentSsn(nextMetadata, dependentSsnIntent.value);
        }

        const createdRecord = await addGroupMember(groupId, {
          groupId,
          tier: normalizedTier,
          relationship: normalizedRelationship,
          householdBaseNumber: householdIdentifiers.householdBaseNumber,
          householdMemberNumber: householdIdentifiers.householdMemberNumber,
          dependentSuffix: householdIdentifiers.dependentSuffix,
          payorType: normalizeMemberPayorType(source.payorType, group.payorType),
          firstName,
          lastName,
          email,
          phone: toDigitsOrNull(source.phone),
          dateOfBirth: normalizedDateOfBirth,
          employerAmount: parseAmount(source.employerAmount),
          memberAmount: parseAmount(source.memberAmount),
          discountAmount: parseAmount(source.discountAmount),
          totalAmount: parseAmount(source.totalAmount),
          metadata: nextMetadata,
          registrationPayload: sanitizedRegistrationPayload,
          status: normalizeMemberStatus(source.status),
        });

        created.push(toMemberResponse(createdRecord, shouldRevealMemberSsn(req)));
        existingMembers.push(createdRecord);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to sync row';
        failed.push({ row: rowNumber, email, reason: message });
      }
    }

    const summary = {
      received: incomingMembers.length,
      created: created.length,
      updated: updated.length,
      failed: failed.length,
    };

    return res.status(failed.length > 0 ? 207 : 200).json({
      message: failed.length > 0
        ? 'Census sync completed with partial failures'
        : 'Census sync completed successfully',
      summary,
      created,
      updated,
      failed,
    });
  } catch (error) {
    console.error('[Group Enrollment] Failed to sync group members:', error);
    const message = error instanceof Error ? error.message : 'Failed to sync group members';
    return res.status(500).json({ message });
  }
});

router.post('/api/groups/:groupId/documents', async (req: AuthRequest, res: Response) => {
  try {
    const { groupId } = req.params;
    const group = await resolveGroupById(groupId);
    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    if (!canAccessGroupByAssignment(req, group.metadata)) {
      return res.status(403).json({ message: 'You do not have access to this group' });
    }

    const documentType = typeof req.body?.documentType === 'string' ? req.body.documentType.trim().toLowerCase() : '';
    const fileName = typeof req.body?.fileName === 'string' ? req.body.fileName.trim() : '';
    const contentType = typeof req.body?.contentType === 'string' ? req.body.contentType.trim() : 'application/octet-stream';
    const base64Data = typeof req.body?.base64Data === 'string' ? req.body.base64Data.trim() : '';

    if (!ALLOWED_GROUP_DOCUMENT_TYPES.has(documentType)) {
      return res.status(400).json({ message: 'Unsupported document type' });
    }

    if (!fileName || !base64Data) {
      return res.status(400).json({ message: 'fileName and base64Data are required' });
    }

    const binary = Buffer.from(base64Data, 'base64');
    if (!binary || binary.length === 0) {
      return res.status(400).json({ message: 'Uploaded file is empty' });
    }

    if (binary.length > MAX_GROUP_DOCUMENT_BYTES) {
      return res.status(400).json({ message: 'File exceeds maximum size (10MB)' });
    }

    await ensureGroupDocumentsBucket();

    const safeFileName = sanitizeStorageFileName(fileName);
    const timestamp = Date.now();
    const storagePath = `groups/${groupId}/${documentType}/${timestamp}-${safeFileName}`;

    const { error: uploadError } = await supabase.storage
      .from(GROUP_DOCUMENTS_BUCKET)
      .upload(storagePath, binary, {
        contentType,
        upsert: false,
      });

    if (uploadError) {
      throw new Error(uploadError.message);
    }

    const existingMetadata = (group.metadata && typeof group.metadata === 'object') ? group.metadata : {};
    const existingDocuments = Array.isArray((existingMetadata as any).groupDocuments)
      ? (existingMetadata as any).groupDocuments
      : [];

    const documentRecord = {
      id: `${timestamp}-${Math.random().toString(36).slice(2, 8)}`,
      type: documentType,
      fileName: safeFileName,
      contentType,
      storageBucket: GROUP_DOCUMENTS_BUCKET,
      storagePath,
      sizeBytes: binary.length,
      uploadedAt: new Date().toISOString(),
      uploadedBy: req.user?.id || null,
      uploadedByRole: req.user?.role || null,
    };

    const updated = await updateGroup(groupId, {
      metadata: {
        ...existingMetadata,
        groupDocuments: [documentRecord, ...existingDocuments].slice(0, 20),
      },
      updatedBy: req.user?.id,
    });

    return res.status(201).json({
      message: 'Document uploaded successfully',
      document: documentRecord,
      data: updated,
    });
  } catch (error) {
    console.error('[Group Enrollment] Failed to upload group document:', error);
    const message = error instanceof Error ? error.message : 'Failed to upload group document';
    return res.status(500).json({ message });
  }
});

router.get('/api/groups/:groupId/members', async (req: AuthRequest, res: Response) => {
  try {
    const { groupId } = req.params;
    const group = await resolveGroupById(groupId);
    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    if (!canAccessGroupByAssignment(req, group.metadata)) {
      return res.status(403).json({ message: 'You do not have access to this group' });
    }

    const members = await listGroupMembers({
      groupId,
      status: typeof req.query.status === 'string' ? req.query.status : undefined,
    });

    return res.json({ data: members.map((member) => toMemberResponse(member, shouldRevealMemberSsn(req))) });
  } catch (error) {
    console.error('[Group Enrollment] Failed to list group members:', error);
    const message = error instanceof Error ? error.message : 'Failed to list group members';
    return res.status(500).json({ message });
  }
});

router.patch('/api/groups/:groupId/members/:memberId', async (req: AuthRequest, res: Response) => {
  try {
    const { groupId, memberId } = req.params;
    const group = await resolveGroupById(groupId);
    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    if (!canAccessGroupByAssignment(req, group.metadata)) {
      return res.status(403).json({ message: 'You do not have access to this group' });
    }

    const numericMemberId = Number(memberId);
    if (Number.isNaN(numericMemberId)) {
      return res.status(400).json({ message: 'Invalid member id' });
    }

    const existingMember = await getGroupMemberById(numericMemberId);
    if (!existingMember || existingMember.groupId !== groupId) {
      return res.status(404).json({ message: 'Group member not found' });
    }

    const bodyHasTier = hasOwn(req.body || {}, 'tier');
    const bodyHasRelationship = hasOwn(req.body || {}, 'relationship');
    const baseRequestedTier = bodyHasTier
      ? normalizeMemberTier(req.body?.tier)
      : normalizeMemberTier(existingMember.tier);
    const requestedRelationship = normalizeMemberRelationship(
      bodyHasRelationship ? req.body?.relationship : existingMember.relationship,
      baseRequestedTier,
    );
    const requestedTier = bodyHasTier
      ? baseRequestedTier
      : inferTierFromRelationship(requestedRelationship, baseRequestedTier);
    const isPrimaryMember = requestedRelationship === 'primary';

    const includeSsnIntentRaw = extractMemberSsnIntent(
      isPrimaryMember,
      req.body,
      req.body?.metadata,
      req.body?.registrationPayload,
    );
    const includeSsnIntent = includeSsnIntentRaw;
    const canEditSsn = canEditMemberSsn(req);
    if (includeSsnIntentRaw.provided && !canEditSsn) {
      return res.status(403).json({ message: 'Only assigned agents and admins can edit SSN values' });
    }

    const incomingBody = (req.body && typeof req.body === 'object') ? req.body : {};
    const { metadata, registrationPayload, ssn, socialSecurityNumber, social_security_number, ...otherUpdates } = incomingBody;
    void ssn;
    void socialSecurityNumber;
    void social_security_number;

    const metadataProvided = hasOwn(incomingBody, 'metadata');
    const registrationPayloadProvided = hasOwn(incomingBody, 'registrationPayload');
    const baseMetadata = metadataProvided ? stripSensitiveSsnFields(metadata) : stripSensitiveSsnFields(existingMember.metadata);
    const baseRegistrationPayload = registrationPayloadProvided
      ? stripSensitiveSsnFields(registrationPayload)
      : stripSensitiveSsnFields(existingMember.registrationPayload);

    const nextMetadata = includeSsnIntent.provided
      ? upsertEncryptedSsn(baseMetadata, includeSsnIntent.value)
      : baseMetadata;

    const updatePayload: Record<string, any> = {
      ...otherUpdates,
      tier: requestedTier,
      relationship: requestedRelationship,
      dateOfBirth: hasOwn(incomingBody, 'dateOfBirth')
        ? normalizeGroupMemberDateOfBirth(otherUpdates?.dateOfBirth)
        : existingMember.dateOfBirth,
      employerAmount: parseAmount(req.body?.employerAmount ?? existingMember.employerAmount),
      memberAmount: parseAmount(req.body?.memberAmount ?? existingMember.memberAmount),
      discountAmount: parseAmount(req.body?.discountAmount ?? existingMember.discountAmount),
      totalAmount: parseAmount(req.body?.totalAmount ?? existingMember.totalAmount),
    };

    if (!isPrimaryMember) {
      const allMembers = await listGroupMembers({ groupId });
      const householdIdentifiers = resolveHouseholdIdentifiers({
        groupId,
        isPrimaryMember,
        members: allMembers,
        excludeMemberId: numericMemberId,
        explicitHouseholdBaseNumber: hasOwn(incomingBody, 'householdBaseNumber')
          ? toTrimmedOrNull(incomingBody?.householdBaseNumber)
          : null,
        explicitHouseholdMemberNumber: hasOwn(incomingBody, 'householdMemberNumber')
          ? toTrimmedOrNull(incomingBody?.householdMemberNumber)
          : null,
        explicitDependentSuffix: hasOwn(incomingBody, 'dependentSuffix')
          ? normalizeDependentSuffix(incomingBody?.dependentSuffix)
          : null,
        existingHouseholdBaseNumber: toTrimmedOrNull(existingMember.householdBaseNumber),
        existingHouseholdMemberNumber: toTrimmedOrNull(existingMember.householdMemberNumber),
        existingDependentSuffix: normalizeDependentSuffix(existingMember.dependentSuffix),
      });

      updatePayload.householdBaseNumber = householdIdentifiers.householdBaseNumber;
      updatePayload.dependentSuffix = householdIdentifiers.dependentSuffix;
      updatePayload.householdMemberNumber = householdIdentifiers.householdMemberNumber;

      if (!hasOwn(incomingBody, 'memberAmount')) {
        updatePayload.memberAmount = null;
      }
      if (!hasOwn(incomingBody, 'totalAmount')) {
        updatePayload.totalAmount = null;
      }
      if (!hasOwn(incomingBody, 'employerAmount')) {
        updatePayload.employerAmount = null;
      }
      if (!hasOwn(incomingBody, 'discountAmount')) {
        updatePayload.discountAmount = null;
      }
    } else {
      const allMembers = await listGroupMembers({ groupId });
      const householdIdentifiers = resolveHouseholdIdentifiers({
        groupId,
        isPrimaryMember: true,
        members: allMembers,
        excludeMemberId: numericMemberId,
        explicitHouseholdBaseNumber: hasOwn(incomingBody, 'householdBaseNumber')
          ? toTrimmedOrNull(incomingBody?.householdBaseNumber)
          : null,
        explicitHouseholdMemberNumber: hasOwn(incomingBody, 'householdMemberNumber')
          ? toTrimmedOrNull(incomingBody?.householdMemberNumber)
          : null,
        existingHouseholdBaseNumber: toTrimmedOrNull(existingMember.householdBaseNumber),
        existingHouseholdMemberNumber: toTrimmedOrNull(existingMember.householdMemberNumber),
      });

      updatePayload.householdBaseNumber = householdIdentifiers.householdBaseNumber;
      updatePayload.dependentSuffix = householdIdentifiers.dependentSuffix;
      updatePayload.householdMemberNumber = householdIdentifiers.householdMemberNumber;
    }

    const effectiveFirstName = toTrimmedOrNull(otherUpdates?.firstName) || existingMember.firstName;
    const effectiveLastName = toTrimmedOrNull(otherUpdates?.lastName) || existingMember.lastName;

    if (isPrimaryMember) {
      if (hasOwn(incomingBody, 'email')) {
        const normalizedEmail = toTrimmedOrNull(otherUpdates?.email)?.toLowerCase() || null;
        if (!normalizedEmail) {
          return res.status(400).json({ message: 'Primary member email is required' });
        }
        if (!EMAIL_REGEX.test(normalizedEmail)) {
          return res.status(400).json({ message: 'Invalid email format' });
        }
        updatePayload.email = normalizedEmail;
      }
    } else {
      updatePayload.email = buildDependentMemberFallbackEmail(
        effectiveFirstName,
        effectiveLastName,
        groupId,
        numericMemberId,
      );
    }

    if (metadataProvided || includeSsnIntent.provided) {
      updatePayload.metadata = nextMetadata;
    }

    if (registrationPayloadProvided || includeSsnIntent.provided) {
      updatePayload.registrationPayload = baseRegistrationPayload;
    }

    const updated = await updateGroupMember(numericMemberId, updatePayload);

    if (includeSsnIntentRaw.provided && isPrimaryMember && canEditSsn) {
      await auditGroupMemberSsnAction(
        req,
        numericMemberId,
        includeSsnIntentRaw.value ? 'update_group_member_ssn' : 'delete_group_member_ssn',
        typeof req.body?.reason === 'string' ? req.body.reason : null,
        {},
      );
    }

    return res.json({ data: toMemberResponse(updated, shouldRevealMemberSsn(req)) });
  } catch (error) {
    console.error('[Group Enrollment] Failed to update group member:', error);
    const message = error instanceof Error ? error.message : 'Failed to update group member';
    if (message === 'Invalid SSN format') {
      return res.status(400).json({ message });
    }
    return res.status(500).json({ message });
  }
});

router.delete('/api/groups/:groupId/members/:memberId/ssn', async (req: AuthRequest, res: Response) => {
  try {
    if (!canEditMemberSsn(req)) {
      return res.status(403).json({ message: 'Only assigned agents and admins can delete SSN values' });
    }

    const { groupId, memberId } = req.params;
    const group = await resolveGroupById(groupId);
    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    if (!canAccessGroupByAssignment(req, group.metadata)) {
      return res.status(403).json({ message: 'You do not have access to this group' });
    }

    const numericMemberId = Number(memberId);
    if (Number.isNaN(numericMemberId)) {
      return res.status(400).json({ message: 'Invalid member id' });
    }

    const existingMember = await getGroupMemberById(numericMemberId);
    if (!existingMember || existingMember.groupId !== groupId) {
      return res.status(404).json({ message: 'Group member not found' });
    }

    const nextMetadata = upsertEncryptedSsn(stripSensitiveSsnFields(existingMember.metadata), null);
    const nextRegistrationPayload = stripSensitiveSsnFields(existingMember.registrationPayload);
    const updated = await updateGroupMember(numericMemberId, {
      metadata: nextMetadata,
      registrationPayload: nextRegistrationPayload,
    });

    await auditGroupMemberSsnAction(
      req,
      numericMemberId,
      'delete_group_member_ssn',
      typeof req.query.reason === 'string' ? req.query.reason : null,
      {},
    );

    return res.json({ data: toMemberResponse(updated, shouldRevealMemberSsn(req)) });
  } catch (error) {
    console.error('[Group Enrollment] Failed to delete group member SSN:', error);
    const message = error instanceof Error ? error.message : 'Failed to delete group member SSN';
    return res.status(500).json({ message });
  }
});

router.delete('/api/groups/:groupId/members/:memberId', async (req: AuthRequest, res: Response) => {
  try {
    const { groupId, memberId } = req.params;
    const group = await resolveGroupById(groupId);
    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    if (!canAccessGroupByAssignment(req, group.metadata)) {
      return res.status(403).json({ message: 'You do not have access to this group' });
    }

    const numericMemberId = Number(memberId);
    if (Number.isNaN(numericMemberId)) {
      return res.status(400).json({ message: 'Invalid member id' });
    }

    const existingMember = await getGroupMemberById(numericMemberId);
    if (!existingMember || existingMember.groupId !== groupId) {
      return res.status(404).json({ message: 'Group member not found' });
    }

    const existingMetadata =
      existingMember.metadata && typeof existingMember.metadata === 'object'
        ? (existingMember.metadata as Record<string, any>)
        : {};

    const existingLifecycle =
      existingMetadata.lifecycle && typeof existingMetadata.lifecycle === 'object'
        ? (existingMetadata.lifecycle as Record<string, any>)
        : {};

    const nextMetadata = {
      ...existingMetadata,
      lifecycle: {
        ...existingLifecycle,
        previousStatus: existingMember.status || 'draft',
        terminatedAt: new Date().toISOString(),
        terminatedBy: req.user?.id || null,
        terminationReason: typeof req.query.reason === 'string' ? req.query.reason : null,
      },
    };

    const terminated = await updateGroupMember(numericMemberId, {
      status: 'terminated',
      terminatedAt: new Date(),
      metadata: nextMetadata,
    });

    return res.status(200).json({
      message: 'Group member terminated and retained for history',
      data: toMemberResponse(terminated, shouldRevealMemberSsn(req)),
    });
  } catch (error) {
    console.error('[Group Enrollment] Failed to delete group member:', error);
    const message = error instanceof Error ? error.message : 'Failed to delete group member';
    return res.status(500).json({ message });
  }
});

router.delete('/api/groups/:groupId/members/:memberId/hard', async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !hasAtLeastRole(req.user.role, 'admin')) {
      return res.status(403).json({ message: 'Only admins can permanently delete group members' });
    }

    const { groupId, memberId } = req.params;
    const group = await resolveGroupById(groupId);
    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    const numericMemberId = Number(memberId);
    if (Number.isNaN(numericMemberId)) {
      return res.status(400).json({ message: 'Invalid member id' });
    }

    const existingMember = await getGroupMemberById(numericMemberId);
    if (!existingMember || existingMember.groupId !== groupId) {
      return res.status(404).json({ message: 'Group member not found' });
    }

    if (normalizeMemberStatus(existingMember.status) !== 'terminated') {
      return res.status(400).json({
        message: 'Only terminated members can be permanently deleted',
      });
    }

    await deleteGroupMember(numericMemberId);

    return res.status(200).json({
      message: 'Group member permanently deleted',
      data: { id: numericMemberId },
    });
  } catch (error) {
    console.error('[Group Enrollment] Failed to hard delete group member:', error);
    const message = error instanceof Error ? error.message : 'Failed to hard delete group member';
    return res.status(500).json({ message });
  }
});

router.post('/api/groups/:groupId/members/:memberId/restore', async (req: AuthRequest, res: Response) => {
  try {
    const { groupId, memberId } = req.params;
    const group = await resolveGroupById(groupId);
    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    if (!canAccessGroupByAssignment(req, group.metadata)) {
      return res.status(403).json({ message: 'You do not have access to this group' });
    }

    const numericMemberId = Number(memberId);
    if (Number.isNaN(numericMemberId)) {
      return res.status(400).json({ message: 'Invalid member id' });
    }

    const existingMember = await getGroupMemberById(numericMemberId);
    if (!existingMember || existingMember.groupId !== groupId) {
      return res.status(404).json({ message: 'Group member not found' });
    }

    const existingMetadata =
      existingMember.metadata && typeof existingMember.metadata === 'object'
        ? (existingMember.metadata as Record<string, any>)
        : {};
    const existingLifecycle =
      existingMetadata.lifecycle && typeof existingMetadata.lifecycle === 'object'
        ? (existingMetadata.lifecycle as Record<string, any>)
        : {};

    const preferredStatus = typeof existingLifecycle.previousStatus === 'string'
      ? normalizeMemberStatus(existingLifecycle.previousStatus)
      : 'draft';

    const nextLifecycle = {
      ...existingLifecycle,
      restoredAt: new Date().toISOString(),
      restoredBy: req.user?.id || null,
    } as Record<string, any>;

    delete nextLifecycle.terminatedAt;
    delete nextLifecycle.terminatedBy;
    delete nextLifecycle.terminationReason;
    delete nextLifecycle.previousStatus;

    const restored = await updateGroupMember(numericMemberId, {
      status: preferredStatus,
      terminatedAt: null,
      metadata: {
        ...existingMetadata,
        lifecycle: nextLifecycle,
      },
    });

    return res.status(200).json({
      message: 'Group member restored',
      data: toMemberResponse(restored, shouldRevealMemberSsn(req)),
    });
  } catch (error) {
    console.error('[Group Enrollment] Failed to restore group member:', error);
    const message = error instanceof Error ? error.message : 'Failed to restore group member';
    return res.status(500).json({ message });
  }
});

router.post('/api/groups/:groupId/members/:memberId/payment', async (req: AuthRequest, res: Response) => {
  try {
    const { groupId, memberId } = req.params;
    const numericMemberId = Number(memberId);

    if (Number.isNaN(numericMemberId)) {
      return res.status(400).json({ message: 'Invalid member id' });
    }

    const group = await resolveGroupById(groupId);
    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    if (!canAccessGroupByAssignment(req, group.metadata)) {
      return res.status(403).json({ message: 'You do not have access to this group' });
    }

    const groupProfileContext = getGroupProfileContext(group.metadata, group.payorType);
    if (!canCollectMemberPaymentsForMode(groupProfileContext.profile.paymentResponsibilityMode)) {
      return res.status(409).json({
        message: `Member-level payment updates are disabled for payment responsibility mode: ${groupProfileContext.profile.paymentResponsibilityMode}`,
      });
    }

    const existingMember = await getGroupMemberById(numericMemberId);
    if (!existingMember || existingMember.groupId !== groupId) {
      return res.status(404).json({ message: 'Group member not found' });
    }

    const nextPaymentStatus = req.body?.paymentStatus || 'paid';
    const updated = await setGroupMemberPaymentStatus(numericMemberId, nextPaymentStatus, {
      status: req.body?.status,
      metadata: req.body?.metadata,
    });

    const normalizedPaymentStatus = normalizePaymentStatus(nextPaymentStatus);
    if (CAPTURED_PAYMENT_STATUSES.has(normalizedPaymentStatus) && updated.status !== 'terminated') {
      try {
        await transitionGroupPaymentToPayable({
          groupId,
          groupMemberId: updated.id,
          paymentStatusRaw: normalizedPaymentStatus,
          paymentCapturedAt: new Date(),
          triggeredBy: req.user?.id || null,
          transitionSource: 'group-member-payment-endpoint',
          updateMemberPaymentStatus: false,
        });
      } catch (commissionError) {
        console.error('[Group Enrollment] Failed to create commissions for captured group payment:', commissionError);
        return res.status(400).json({
          message: commissionError instanceof Error
            ? commissionError.message
            : 'Failed to create group commissions from captured payment',
        });
      }
    }

    return res.json({ data: updated });
  } catch (error) {
    console.error('[Group Enrollment] Failed to update payment status:', error);
    const message = error instanceof Error ? error.message : 'Failed to update payment status';
    return res.status(500).json({ message });
  }
});

router.post('/api/groups/:groupId/commission-pricing-repair', async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !hasAtLeastRole(req.user.role, 'admin')) {
      return res.status(403).json({ message: 'Only admins can run commission pricing repair' });
    }

    const { groupId } = req.params;
    const group = await resolveGroupById(groupId);
    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    const allMembers = await listGroupMembers({ groupId });
    const activeMembers = allMembers.filter((member) => member.status !== 'terminated');
    const overrides = Array.isArray(req.body?.overrides) ? req.body.overrides : [];
    const applyInferred = req.body?.applyInferred !== false;
    const refreshExpectedCommissions = req.body?.refreshExpectedCommissions === true;

    const appliedOverrides: Array<{ memberId: number; totalAmount: number; memberAmount: number; employerAmount: number }> = [];
    const skippedOverrides: Array<{ memberId: number | null; reason: string }> = [];

    for (const override of overrides) {
      const memberId = Number(override?.memberId);
      if (Number.isNaN(memberId)) {
        skippedOverrides.push({ memberId: null, reason: 'invalid-member-id' });
        continue;
      }

      const member = activeMembers.find((row) => row.id === memberId);
      if (!member) {
        skippedOverrides.push({ memberId, reason: 'member-not-found-or-terminated' });
        continue;
      }

      let totalAmount = roundCurrency(parseAmountNumber(override?.totalAmount));
      let memberAmount = roundCurrency(parseAmountNumber(override?.memberAmount));
      let employerAmount = roundCurrency(parseAmountNumber(override?.employerAmount));

      if (totalAmount <= 0) {
        totalAmount = roundCurrency(memberAmount + employerAmount);
      }

      if (totalAmount <= 0) {
        skippedOverrides.push({ memberId, reason: 'non-positive-amount' });
        continue;
      }

      if (memberAmount <= 0 && employerAmount <= 0) {
        memberAmount = totalAmount;
        employerAmount = 0;
      }

      await updateGroupMember(member.id, {
        totalAmount: parseAmount(totalAmount),
        memberAmount: parseAmount(memberAmount),
        employerAmount: parseAmount(employerAmount),
      });

      member.totalAmount = parseAmount(totalAmount);
      member.memberAmount = parseAmount(memberAmount);
      member.employerAmount = parseAmount(employerAmount);

      appliedOverrides.push({ memberId, totalAmount, memberAmount, employerAmount });
    }

    const inferredApplied: Array<{ memberId: number; inferredAmount: number; rateLabel: string | null }> = [];
    const unresolvedMembers: Array<{ memberId: number; reason: string; rateLabel: string | null }> = [];

    if (applyInferred) {
      for (const member of activeMembers) {
        const currentAmount = roundCurrency(
          parseAmountNumber(member.totalAmount)
          || (parseAmountNumber(member.memberAmount) + parseAmountNumber(member.employerAmount))
        );

        if (currentAmount > 0) {
          continue;
        }

        const rateLabel = getRegistrationPayloadRateLabel(member);
        const resolvedAmount = await resolveGroupMemberBaseAmount(member);

        if (resolvedAmount > 0) {
          inferredApplied.push({ memberId: member.id, inferredAmount: resolvedAmount, rateLabel });
        } else {
          unresolvedMembers.push({ memberId: member.id, reason: 'no-parseable-rate-label', rateLabel });
        }
      }
    }

    let expectedCommissionResult: {
      created: number;
      updated: number;
      skipped: number;
      expectedTotal: number;
      cycleKey: string;
    } | null = null;

    if (refreshExpectedCommissions) {
      const metadata = group.metadata && typeof group.metadata === 'object'
        ? (group.metadata as Record<string, any>)
        : {};
      const billingScheduler = metadata.billingScheduler && typeof metadata.billingScheduler === 'object'
        ? (metadata.billingScheduler as Record<string, any>)
        : {};
      const cycleAnchor = parseCycleDate(
        typeof billingScheduler.scheduledStartDate === 'string' ? billingScheduler.scheduledStartDate : null,
      );

      expectedCommissionResult = await createExpectedGroupMemberCommissionsForCycle(
        group,
        activeMembers,
        cycleAnchor,
        req.user.id,
      );
    }

    return res.status(200).json({
      message: 'Group commission pricing repair completed',
      summary: {
        appliedOverrideCount: appliedOverrides.length,
        skippedOverrideCount: skippedOverrides.length,
        inferredAppliedCount: inferredApplied.length,
        unresolvedMemberCount: unresolvedMembers.length,
      },
      appliedOverrides,
      skippedOverrides,
      inferredApplied,
      unresolvedMembers,
      expectedCommissionResult,
    });
  } catch (error) {
    console.error('[Group Enrollment] Failed running commission pricing repair:', error);
    const message = error instanceof Error ? error.message : 'Failed to run commission pricing repair';
    return res.status(500).json({ message });
  }
});

router.post('/api/groups/:groupId/complete', async (req: AuthRequest, res: Response) => {
  try {
    const { groupId } = req.params;
    const group = await resolveGroupById(groupId);
    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    if (!canAccessGroupByAssignment(req, group.metadata)) {
      return res.status(403).json({ message: 'You do not have access to this group' });
    }

    const groupProfileContext = getGroupProfileContext(group.metadata, group.payorType);

    const members = await listGroupMembers({ groupId });
    const activeMembers = members.filter((member) => member.status !== 'terminated');
    const activeMemberCount = activeMembers.length;
    if (activeMemberCount <= 0) {
      return res.status(400).json({ message: 'At least one active member is required before marking ready.' });
    }

    const missingMemberRequirements = activeMembers
      .map((member) => {
        const missingFields = getMissingRequiredMemberFields(member);
        return {
          memberId: member.id,
          memberName: `${member.firstName || ''} ${member.lastName || ''}`.trim() || `Member ${member.id}`,
          missingFields,
        };
      })
      .filter((entry) => entry.missingFields.length > 0);

    const pendingDataFollowUp = {
      groupProfileMissingFields: groupProfileContext.isComplete ? [] : groupProfileContext.missingFields,
      memberRequirements: missingMemberRequirements,
      requiresFollowUp: !groupProfileContext.isComplete || missingMemberRequirements.length > 0,
    };

    const completed = await completeGroupRegistration(groupId, {
      hostedCheckoutLink: req.body?.hostedCheckoutLink,
      hostedCheckoutStatus: req.body?.hostedCheckoutStatus,
      status: req.body?.status,
    });

    const nowIso = new Date().toISOString();
    const effectiveDateContext = getGroupEffectiveDateContext(req, completed.metadata);
    const schedulerStartDate = effectiveDateContext.selectedEffectiveDate;
    const expectedCycleAnchor = parseCycleDate(schedulerStartDate);

    const expectedCommissionResult = await createExpectedGroupMemberCommissionsForCycle(
      group,
      activeMembers,
      expectedCycleAnchor,
      req.user?.id || null,
    );

    const billingSnapshot = await buildGroupBillingSnapshot(
      completed,
      activeMembers,
      expectedCycleAnchor,
      groupProfileContext.profile?.preferredPaymentMethod || null,
      req.user?.id || null,
      expectedCommissionResult.expectedTotal,
    );

    const existingMetadata =
      completed.metadata && typeof completed.metadata === 'object'
        ? (completed.metadata as Record<string, any>)
        : {};

    const existingSnapshots = Array.isArray(existingMetadata.groupBillingSnapshots)
      ? existingMetadata.groupBillingSnapshots
      : [];

    const nextMetadata = {
      ...existingMetadata,
      billingScheduler: {
        ...(existingMetadata.billingScheduler && typeof existingMetadata.billingScheduler === 'object'
          ? existingMetadata.billingScheduler
          : {}),
        queueState: 'ready',
        queueSource: 'group_enrollment_complete',
        queueTriggeredAt: nowIso,
        queueTriggeredBy: req.user?.id || null,
        scheduledStartDate: schedulerStartDate,
        activeMemberCount,
      },
      enrollmentDataFollowUp: {
        ...(existingMetadata.enrollmentDataFollowUp && typeof existingMetadata.enrollmentDataFollowUp === 'object'
          ? existingMetadata.enrollmentDataFollowUp
          : {}),
        ...pendingDataFollowUp,
        lastQueuedAt: nowIso,
        lastQueuedBy: req.user?.id || null,
      },
      groupBillingLifecycle: {
        ...(existingMetadata.groupBillingLifecycle && typeof existingMetadata.groupBillingLifecycle === 'object'
          ? existingMetadata.groupBillingLifecycle
          : {}),
        state: 'waiting_for_payment',
        cycleKey: expectedCommissionResult.cycleKey,
        expectedCycleDate: toIsoDateOnly(expectedCycleAnchor),
        movedToWaitingAt: nowIso,
        movedToWaitingBy: req.user?.id || null,
        expectedCommissions: {
          created: expectedCommissionResult.created,
          updated: expectedCommissionResult.updated,
          skipped: expectedCommissionResult.skipped,
          expectedTotal: expectedCommissionResult.expectedTotal,
        },
      },
      groupBillingSnapshot: billingSnapshot,
      groupBillingSnapshots: [billingSnapshot, ...existingSnapshots].slice(0, 24),
    };

    const completedWithScheduler = await updateGroup(groupId, {
      metadata: nextMetadata,
      updatedBy: req.user?.id,
    });

    let notificationCreated = false;
    try {
      const assignmentState = getGroupAssignmentState(nextMetadata);
      await createAdminNotification({
        type: pendingDataFollowUp.requiresFollowUp
          ? 'group_enrollment_ready_with_missing_data'
          : 'group_enrollment_ready_for_billing',
        errorMessage: pendingDataFollowUp.requiresFollowUp
          ? `Group ${completed.name || groupId} marked ready with missing data follow-up required.`
          : `Group ${completed.name || groupId} marked ready and queued for payment scheduling.`,
        metadata: {
          groupId,
          groupName: completed.name || null,
          groupStatus: completedWithScheduler.status,
          scheduledStartDate: schedulerStartDate,
          activeMemberCount,
          preferredPaymentMethod: groupProfileContext.profile?.preferredPaymentMethod || null,
          markedReadyBy: req.user?.id || null,
          markedReadyAt: nowIso,
          currentAssignedAgentId: assignmentState.currentAssignedAgentId,
          originalAssignedAgentId: assignmentState.originalAssignedAgentId,
          followUp: pendingDataFollowUp,
        },
      });
      notificationCreated = true;
    } catch (notificationError) {
      console.warn('[Group Enrollment] Failed to create admin notification for group readiness:', notificationError);
    }

    return res.json({
      data: completedWithScheduler,
      scheduler: {
        queueState: 'ready',
        scheduledStartDate: schedulerStartDate,
      },
      followUp: pendingDataFollowUp,
      adminNotificationCreated: notificationCreated,
    });
  } catch (error) {
    console.error('[Group Enrollment] Failed to complete group registration:', error);
    const message = error instanceof Error ? error.message : 'Failed to complete group registration';
    return res.status(500).json({ message });
  }
});

router.post('/api/groups/:groupId/activate', async (req: AuthRequest, res: Response) => {
  try {
    const { groupId } = req.params;
    const group = await resolveGroupById(groupId);
    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    if (!canAccessGroupByAssignment(req, group.metadata)) {
      return res.status(403).json({ message: 'You do not have access to this group' });
    }

    if (!['registered', 'active'].includes(group.status)) {
      return res.status(400).json({
        message: 'Complete enrollment before activating this group.',
      });
    }

    const members = await listGroupMembers({ groupId });
    const activeMemberCount = members.filter((member) => member.status !== 'terminated').length;
    if (activeMemberCount <= 0) {
      return res.status(400).json({ message: 'At least one active member is required before activation.' });
    }

    if (group.status === 'active') {
      return res.json({ data: group });
    }

    const updatedGroup = await updateGroup(groupId, {
      status: 'active',
      updatedBy: req.user?.id,
    });

    return res.json({ data: updatedGroup });
  } catch (error) {
    console.error('[Group Enrollment] Failed to activate group:', error);
    const message = error instanceof Error ? error.message : 'Failed to activate group';
    return res.status(500).json({ message });
  }
});

export default router;
