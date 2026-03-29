import { Router, Response, NextFunction } from 'express';
import { authenticateToken, type AuthRequest } from '../auth/supabaseAuth';
import { hasAtLeastRole } from '../auth/roles';
import { formatPlanStartDateISO, getUpcomingPlanStartDates } from '../../shared/planStartDates';
import { displaySSN } from '@shared/display-ssn';
import { supabase } from '../lib/supabaseClient';
import { decryptSSN, encryptSSN, formatSSN, isValidSSN } from '../utils/encryption';
import {
  addGroupMember,
  completeGroupRegistration,
  createGroup,
  getDiscountCodeByCode,
  getGroupById,
  getGroupMemberById,
  listGroupMembers,
  listGroups,
  setGroupMemberPaymentStatus,
  updateGroup,
  updateGroupMember,
} from '../storage';

const router = Router();

const ensureGroupEnrollmentAccess = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.user || !hasAtLeastRole(req.user.role, 'agent')) {
    return res.status(403).json({ message: 'Insufficient permissions for group enrollment' });
  }
  return next();
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
  'memberssn',
]);
const GROUP_DOCUMENTS_BUCKET = 'group-documents';
const GROUP_ASSIGNMENT_HISTORY_TABLE = 'group_assignment_history';
const GROUP_WORKFLOW_OPEN_STATUSES = new Set(['draft', 'ready', 'pending', 'pending_activation']);
const MAX_GROUP_DOCUMENT_BYTES = 10 * 1024 * 1024;
const ALLOWED_GROUP_DOCUMENT_TYPES = new Set(['authorized_payment_form']);
const REQUIRED_MEMBER_EMPLOYMENT_PROFILE_FIELDS = [
  'sex',
  'hireDate',
  'className',
  'division',
  'workEmail',
  'personalEmail',
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

let groupDocumentsBucketReady = false;

type PayorMixMode = 'full' | 'member' | 'fixed' | 'percentage';
type PreferredPaymentMethod = 'card' | 'ach' | null;

type GroupProfile = {
  ein: string | null;
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
  preferredPaymentMethod: PreferredPaymentMethod;
  achDetails: {
    routingNumber: string | null;
    accountNumber: string | null;
    bankName: string | null;
    accountType: string | null;
  };
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

  for (const fieldName of REQUIRED_MEMBER_EMPLOYMENT_PROFILE_FIELDS) {
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
  const preferredPaymentMethod = raw?.preferredPaymentMethod === 'card' || raw?.preferredPaymentMethod === 'ach'
    ? raw.preferredPaymentMethod
    : null;

  return {
    ein,
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

const normalizeMemberTier = (value: unknown): string => {
  if (typeof value !== 'string') {
    return 'member';
  }

  const normalized = value.trim().toLowerCase();
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
    if (normalized === 'child') {
      return 'dependent';
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
  return objectValue;
};

const extractSsnIntent = (...sources: unknown[]): { provided: boolean; value: string | null } => {
  for (const source of sources) {
    const objectValue = toObjectOrNull(source);
    if (!objectValue) {
      continue;
    }

    for (const [key, raw] of Object.entries(objectValue)) {
      if (!SSN_FIELD_ALIASES.has(normalizeImportKey(key))) {
        continue;
      }

      if (raw === null || raw === undefined) {
        return { provided: true, value: null };
      }

      if (typeof raw !== 'string') {
        return { provided: true, value: null };
      }

      const trimmed = raw.trim();
      if (!trimmed) {
        return { provided: true, value: null };
      }

      return { provided: true, value: trimmed };
    }
  }

  return { provided: false, value: null };
};

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
  if (!isValidSSN(normalized)) {
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
    if (isValidSSN(decryptedDigits)) {
      return decryptedDigits;
    }

    const rawDigits = candidate.replace(/\D/g, '');
    if (isValidSSN(rawDigits)) {
      return rawDigits;
    }
  }

  return null;
};

const canViewFullMemberSsn = (req: AuthRequest): boolean =>
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
    const group = await getGroupById(groupId);

    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    if (!canAccessGroupByAssignment(req, group.metadata)) {
      return res.status(403).json({ message: 'You do not have access to this group' });
    }

    const members = await listGroupMembers({ groupId });
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

router.patch('/api/groups/:groupId/effective-date', async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !hasAtLeastRole(req.user.role, 'admin')) {
      return res.status(403).json({ message: 'Only admins can override group effective dates' });
    }

    const { groupId } = req.params;
    const group = await getGroupById(groupId);
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
    const group = await getGroupById(groupId);
    if (!group) {
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
    const group = await getGroupById(groupId);
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
    const group = await getGroupById(groupId);
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
    const group = await getGroupById(groupId);
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

    const ssnIntent = isPrimaryMember
      ? extractSsnIntent(req.body, metadata, registrationPayload)
      : { provided: true, value: null as string | null };
    const sanitizedMetadata = stripSensitiveSsnFields(metadata);
    const sanitizedRegistrationPayload = stripSensitiveSsnFields(registrationPayload || req.body);
    const nextMetadata = ssnIntent.provided
      ? upsertEncryptedSsn(sanitizedMetadata, ssnIntent.value)
      : sanitizedMetadata;

    const memberRecord = await addGroupMember(groupId, {
      tier: normalizedTier,
      relationship: normalizedRelationship,
      householdBaseNumber: toTrimmedOrNull(req.body?.householdBaseNumber),
      householdMemberNumber: toTrimmedOrNull(req.body?.householdMemberNumber),
      dependentSuffix: normalizeDependentSuffix(req.body?.dependentSuffix),
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

router.post('/api/groups/:groupId/members/bulk', async (req: AuthRequest, res: Response) => {
  try {
    const { groupId } = req.params;
    const group = await getGroupById(groupId);
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

      const email = isPrimaryMember
        ? (providedEmail as string)
        : buildDependentMemberFallbackEmail(firstName, lastName, groupId, rowNumber);

      try {
        const ssnIntent = isPrimaryMember
          ? extractSsnIntent(source, source?.metadata, source?.registrationPayload)
          : { provided: true, value: null as string | null };
        const sanitizedMetadata = stripSensitiveSsnFields(source.metadata);
        const sanitizedRegistrationPayload = stripSensitiveSsnFields(source.registrationPayload || source);
        const nextMetadata = ssnIntent.provided
          ? upsertEncryptedSsn(sanitizedMetadata, ssnIntent.value)
          : sanitizedMetadata;

        const memberRecord = await addGroupMember(groupId, {
          tier: normalizedTier,
          relationship: normalizedRelationship,
          householdBaseNumber: toTrimmedOrNull(source.householdBaseNumber ?? source.baseMemberNumber),
          householdMemberNumber: toTrimmedOrNull(source.householdMemberNumber ?? source.memberNumber),
          dependentSuffix: normalizeDependentSuffix(source.dependentSuffix),
          payorType: normalizeMemberPayorType(source.payorType, group.payorType),
          firstName,
          lastName,
          email,
          phone: toDigitsOrNull(source.phone),
          dateOfBirth: normalizeGroupMemberDateOfBirth(source.dateOfBirth),
          employerAmount: parseAmount(source.employerAmount),
          memberAmount: parseAmount(source.memberAmount),
          discountAmount: parseAmount(source.discountAmount),
          totalAmount: parseAmount(source.totalAmount),
          metadata: nextMetadata,
          registrationPayload: sanitizedRegistrationPayload,
          status: normalizeMemberStatus(source.status),
        });

        created.push(toMemberResponse(memberRecord, shouldRevealMemberSsn(req)));
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

router.post('/api/groups/:groupId/documents', async (req: AuthRequest, res: Response) => {
  try {
    const { groupId } = req.params;
    const group = await getGroupById(groupId);
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
    const group = await getGroupById(groupId);
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
    const group = await getGroupById(groupId);
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

    const requestedTier = hasOwn(req.body || {}, 'tier')
      ? normalizeMemberTier(req.body?.tier)
      : normalizeMemberTier(existingMember.tier);
    const requestedRelationship = normalizeMemberRelationship(
      hasOwn(req.body || {}, 'relationship') ? req.body?.relationship : existingMember.relationship,
      requestedTier,
    );
    const isPrimaryMember = requestedRelationship === 'primary';

    const includeSsnIntentRaw = extractSsnIntent(req.body, req.body?.metadata, req.body?.registrationPayload);
    const includeSsnIntent = isPrimaryMember
      ? includeSsnIntentRaw
      : { provided: true, value: null as string | null };
    const canEditSsn = canViewFullMemberSsn(req);
    if (includeSsnIntentRaw.provided && isPrimaryMember && !canEditSsn) {
      return res.status(403).json({ message: 'Only admins can edit SSN values' });
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
      employerAmount: parseAmount(req.body?.employerAmount ?? existingMember.employerAmount),
      memberAmount: parseAmount(req.body?.memberAmount ?? existingMember.memberAmount),
      discountAmount: parseAmount(req.body?.discountAmount ?? existingMember.discountAmount),
      totalAmount: parseAmount(req.body?.totalAmount ?? existingMember.totalAmount),
    };

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
    if (!canViewFullMemberSsn(req)) {
      return res.status(403).json({ message: 'Only admins can delete SSN values' });
    }

    const { groupId, memberId } = req.params;
    const group = await getGroupById(groupId);
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
    const group = await getGroupById(groupId);
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

    const nextMetadata = {
      ...((existingMember.metadata && typeof existingMember.metadata === 'object') ? existingMember.metadata : {}),
      lifecycle: {
        ...(existingMember?.metadata?.lifecycle || {}),
        previousStatus: existingMember.status || 'draft',
        terminatedAt: new Date().toISOString(),
        terminatedBy: req.user?.id || null,
        terminationReason: typeof req.query.reason === 'string' ? req.query.reason : null,
      },
    };

    const terminated = await updateGroupMember(numericMemberId, {
      status: 'terminated',
      terminatedAt: new Date().toISOString(),
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

router.post('/api/groups/:groupId/members/:memberId/restore', async (req: AuthRequest, res: Response) => {
  try {
    const { groupId, memberId } = req.params;
    const group = await getGroupById(groupId);
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

    const group = await getGroupById(groupId);
    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    if (!canAccessGroupByAssignment(req, group.metadata)) {
      return res.status(403).json({ message: 'You do not have access to this group' });
    }

    const existingMember = await getGroupMemberById(numericMemberId);
    if (!existingMember || existingMember.groupId !== groupId) {
      return res.status(404).json({ message: 'Group member not found' });
    }

    const updated = await setGroupMemberPaymentStatus(numericMemberId, req.body?.paymentStatus || 'paid', {
      status: req.body?.status,
      metadata: req.body?.metadata,
    });

    return res.json({ data: updated });
  } catch (error) {
    console.error('[Group Enrollment] Failed to update payment status:', error);
    const message = error instanceof Error ? error.message : 'Failed to update payment status';
    return res.status(500).json({ message });
  }
});

router.post('/api/groups/:groupId/complete', async (req: AuthRequest, res: Response) => {
  try {
    const { groupId } = req.params;
    const group = await getGroupById(groupId);
    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    if (!canAccessGroupByAssignment(req, group.metadata)) {
      return res.status(403).json({ message: 'You do not have access to this group' });
    }

    const groupProfileContext = getGroupProfileContext(group.metadata, group.payorType);
    if (!groupProfileContext.isComplete) {
      return res.status(400).json({
        message: 'Group profile is incomplete. Please complete profile fields before marking ready.',
        missingFields: groupProfileContext.missingFields,
      });
    }

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

    if (missingMemberRequirements.length > 0) {
      return res.status(400).json({
        message: 'All active members must have required enrollment fields completed before final enrollment.',
        missingMemberRequirements,
      });
    }

    const completed = await completeGroupRegistration(groupId, {
      hostedCheckoutLink: req.body?.hostedCheckoutLink,
      hostedCheckoutStatus: req.body?.hostedCheckoutStatus,
      status: req.body?.status,
    });

    return res.json({ data: completed });
  } catch (error) {
    console.error('[Group Enrollment] Failed to complete group registration:', error);
    const message = error instanceof Error ? error.message : 'Failed to complete group registration';
    return res.status(500).json({ message });
  }
});

router.post('/api/groups/:groupId/activate', async (req: AuthRequest, res: Response) => {
  try {
    const { groupId } = req.params;
    const group = await getGroupById(groupId);
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
