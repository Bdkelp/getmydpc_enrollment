import { Router, Response, NextFunction } from 'express';
import { authenticateToken, type AuthRequest } from '../auth/supabaseAuth';
import { hasAtLeastRole } from '../auth/roles';
import { formatPlanStartDateISO, getUpcomingPlanStartDates } from '../../shared/planStartDates';
import { supabase } from '../lib/supabaseClient';
import { decryptSSN, encryptSSN, formatSSN, isValidSSN, maskSSN } from '../utils/encryption';
import {
  addGroupMember,
  completeGroupRegistration,
  createGroup,
  deleteGroupMember,
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
const ALLOWED_MEMBER_STATUSES = new Set(['draft', 'ready', 'registered']);
const ALLOWED_PAYOR_TYPES = new Set(['full', 'member']);
const SSN_FIELD_ALIASES = ['ssn', 'socialSecurityNumber', 'social_security_number'] as const;
const GROUP_DOCUMENTS_BUCKET = 'group-documents';
const MAX_GROUP_DOCUMENT_BYTES = 10 * 1024 * 1024;
const ALLOWED_GROUP_DOCUMENT_TYPES = new Set(['authorized_payment_form']);

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

const toDigitsOrNull = (value: unknown): string | null => {
  const normalized = toTrimmedOrNull(value);
  if (!normalized) {
    return null;
  }
  const digits = normalized.replace(/\D/g, '');
  return digits.length > 0 ? digits : null;
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

  for (const alias of SSN_FIELD_ALIASES) {
    delete objectValue[alias];
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

    for (const alias of SSN_FIELD_ALIASES) {
      if (!hasOwn(objectValue, alias)) {
        continue;
      }

      const raw = objectValue[alias];
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
    delete metadataValue.ssnLast4;
    return metadataValue;
  }

  const normalized = ssn.replace(/\D/g, '');
  if (!isValidSSN(normalized)) {
    throw new Error('Invalid SSN format');
  }

  const nextMetadata = metadataValue || {};
  nextMetadata.ssnEncrypted = encryptSSN(normalized);
  nextMetadata.ssnLast4 = normalized.slice(-4);
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
  Boolean(req.user);

const toMemberResponse = (member: any, includeFullSsn: boolean) => {
  const ssnDigits = resolveMemberSsnDigits(member);
  const formatted = ssnDigits ? formatSSN(ssnDigits) : null;
  const masked = ssnDigits ? maskSSN(ssnDigits) : null;

  return {
    ...member,
    metadata: stripSensitiveSsnFields(member?.metadata),
    registrationPayload: stripSensitiveSsnFields(member?.registrationPayload),
    ssn: ssnDigits ? (includeFullSsn ? formatted : masked) : null,
    ssnMasked: masked,
    hasSsn: Boolean(ssnDigits),
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
    const { status, payorType, search } = req.query;
    const limit = Number(req.query.limit ?? 50);
    const offset = Number(req.query.offset ?? 0);

    const { groups, count } = await listGroups({
      status: typeof status === 'string' ? status : undefined,
      payorType: typeof payorType === 'string' ? payorType : undefined,
      search: typeof search === 'string' ? search : undefined,
      limit: Number.isNaN(limit) ? undefined : limit,
      offset: Number.isNaN(offset) ? undefined : offset,
    });

    const groupsWithContext = groups.map((group) => {
      const groupProfileContext = getGroupProfileContext(group.metadata, group.payorType);
      return {
        ...group,
        groupProfileComplete: groupProfileContext.isComplete,
      };
    });

    return res.json({ data: groupsWithContext, count });
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
      return res.status(400).json({ message: 'Group name and payor type are required' });
    }

    const existingMetadata = (metadata && typeof metadata === 'object') ? metadata : {};
    const normalizedProfile = normalizeGroupProfile(groupProfile, typeof payorType === 'string' ? payorType : undefined);
    const normalizedPayorType = typeof payorType === 'string'
      ? payorType
      : payorMixModeToPayorType(normalizedProfile.payorMix.mode);
    const isAdminOrHigher = Boolean(req.user && hasAtLeastRole(req.user.role, 'admin'));
    const selectedAssignedAgentId = normalizeAssignedAgentId(assignedAgentId);
    const nextMetadata = {
      ...existingMetadata,
      groupProfile: normalizedProfile,
    };

    if (isAdminOrHigher) {
      if (selectedAssignedAgentId) {
        nextMetadata.assignedAgentId = selectedAssignedAgentId;
      }
    } else if (req.user?.id) {
      nextMetadata.assignedAgentId = req.user.id;
    }

    const group = await createGroup({
      name,
      payorType: normalizedPayorType,
      groupType,
      discountCode,
      discountCodeId,
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

    const members = await listGroupMembers({ groupId });
    const includeFullSsn = canViewFullMemberSsn(req);
    const effectiveDateContext = getGroupEffectiveDateContext(req, group.metadata);
    const groupProfileContext = getGroupProfileContext(group.metadata, group.payorType);
    return res.json({
      data: group,
      members: members.map((member) => toMemberResponse(member, includeFullSsn)),
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

    const { groupProfile, metadata, assignedAgentId, ...otherFields } = req.body || {};
    const existingMetadata = (group.metadata && typeof group.metadata === 'object') ? group.metadata : {};
    const incomingMetadata = (metadata && typeof metadata === 'object') ? metadata : {};
    const mergedMetadata = { ...existingMetadata, ...incomingMetadata } as Record<string, any>;
    const isAdminOrHigher = Boolean(req.user && hasAtLeastRole(req.user.role, 'admin'));
    const selectedAssignedAgentId = normalizeAssignedAgentId(assignedAgentId);

    let normalizedPayorType = typeof otherFields.payorType === 'string' ? otherFields.payorType : group.payorType;

    if (groupProfile !== undefined) {
      const normalizedProfile = normalizeGroupProfile(groupProfile, normalizedPayorType);
      mergedMetadata.groupProfile = normalizedProfile;
      normalizedPayorType = payorMixModeToPayorType(normalizedProfile.payorMix.mode);
    }

    if (selectedAssignedAgentId !== undefined && isAdminOrHigher) {
      if (selectedAssignedAgentId) {
        mergedMetadata.assignedAgentId = selectedAssignedAgentId;
      } else {
        delete mergedMetadata.assignedAgentId;
      }
    }

    if (!mergedMetadata.assignedAgentId && req.user?.id && !isAdminOrHigher) {
      mergedMetadata.assignedAgentId = req.user.id;
    }

    const updated = await updateGroup(groupId, {
      ...otherFields,
      payorType: normalizedPayorType,
      metadata: mergedMetadata,
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

router.post('/api/groups/:groupId/members', async (req: AuthRequest, res: Response) => {
  try {
    const { groupId } = req.params;
    const group = await getGroupById(groupId);
    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
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

    if (!tier || !firstName || !lastName || !email) {
      return res.status(400).json({ message: 'Tier, first name, last name, and email are required' });
    }

    const ssnIntent = extractSsnIntent(req.body, metadata, registrationPayload);
    const sanitizedMetadata = stripSensitiveSsnFields(metadata);
    const sanitizedRegistrationPayload = stripSensitiveSsnFields(registrationPayload || req.body);
    const nextMetadata = ssnIntent.provided
      ? upsertEncryptedSsn(sanitizedMetadata, ssnIntent.value)
      : sanitizedMetadata;

    const memberRecord = await addGroupMember(groupId, {
      tier,
      payorType: payorType || group.payorType,
      firstName,
      lastName,
      email,
      phone,
      dateOfBirth,
      employerAmount: parseAmount(employerAmount),
      memberAmount: parseAmount(memberAmount),
      discountAmount: parseAmount(discountAmount),
      totalAmount: parseAmount(totalAmount),
      metadata: nextMetadata,
      registrationPayload: sanitizedRegistrationPayload,
      status: status || 'draft',
    });

    return res.status(201).json({ data: toMemberResponse(memberRecord, canViewFullMemberSsn(req)) });
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
      const email = toTrimmedOrNull(source.email)?.toLowerCase() || null;

      if (!firstName || !lastName || !email) {
        failed.push({ row: rowNumber, email: email || undefined, reason: 'Missing firstName, lastName, or email' });
        continue;
      }

      if (!EMAIL_REGEX.test(email)) {
        failed.push({ row: rowNumber, email, reason: 'Invalid email format' });
        continue;
      }

      try {
        const ssnIntent = extractSsnIntent(source, source?.metadata, source?.registrationPayload);
        const sanitizedMetadata = stripSensitiveSsnFields(source.metadata);
        const sanitizedRegistrationPayload = stripSensitiveSsnFields(source.registrationPayload || source);
        const nextMetadata = ssnIntent.provided
          ? upsertEncryptedSsn(sanitizedMetadata, ssnIntent.value)
          : sanitizedMetadata;

        const memberRecord = await addGroupMember(groupId, {
          tier: normalizeMemberTier(source.tier),
          payorType: normalizeMemberPayorType(source.payorType, group.payorType),
          firstName,
          lastName,
          email,
          phone: toDigitsOrNull(source.phone),
          dateOfBirth: toTrimmedOrNull(source.dateOfBirth),
          employerAmount: parseAmount(source.employerAmount),
          memberAmount: parseAmount(source.memberAmount),
          discountAmount: parseAmount(source.discountAmount),
          totalAmount: parseAmount(source.totalAmount),
          metadata: nextMetadata,
          registrationPayload: sanitizedRegistrationPayload,
          status: normalizeMemberStatus(source.status),
        });

        created.push(toMemberResponse(memberRecord, canViewFullMemberSsn(req)));
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

    const members = await listGroupMembers({
      groupId,
      status: typeof req.query.status === 'string' ? req.query.status : undefined,
    });

    return res.json({ data: members.map((member) => toMemberResponse(member, canViewFullMemberSsn(req))) });
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

    const numericMemberId = Number(memberId);
    if (Number.isNaN(numericMemberId)) {
      return res.status(400).json({ message: 'Invalid member id' });
    }

    const existingMember = await getGroupMemberById(numericMemberId);
    if (!existingMember || existingMember.groupId !== groupId) {
      return res.status(404).json({ message: 'Group member not found' });
    }

    const includeSsnIntent = extractSsnIntent(req.body, req.body?.metadata, req.body?.registrationPayload);
    const canEditSsn = canViewFullMemberSsn(req);
    if (includeSsnIntent.provided && !canEditSsn) {
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
      employerAmount: parseAmount(req.body?.employerAmount ?? existingMember.employerAmount),
      memberAmount: parseAmount(req.body?.memberAmount ?? existingMember.memberAmount),
      discountAmount: parseAmount(req.body?.discountAmount ?? existingMember.discountAmount),
      totalAmount: parseAmount(req.body?.totalAmount ?? existingMember.totalAmount),
    };

    if (metadataProvided || includeSsnIntent.provided) {
      updatePayload.metadata = nextMetadata;
    }

    if (registrationPayloadProvided || includeSsnIntent.provided) {
      updatePayload.registrationPayload = baseRegistrationPayload;
    }

    const updated = await updateGroupMember(numericMemberId, updatePayload);

    if (includeSsnIntent.provided && canEditSsn) {
      await auditGroupMemberSsnAction(
        req,
        numericMemberId,
        includeSsnIntent.value ? 'update_group_member_ssn' : 'delete_group_member_ssn',
        typeof req.body?.reason === 'string' ? req.body.reason : null,
        {
          maskedSsn: includeSsnIntent.value ? maskSSN(includeSsnIntent.value) : null,
        },
      );
    }

    return res.json({ data: toMemberResponse(updated, canViewFullMemberSsn(req)) });
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
      { maskedSsn: null },
    );

    return res.json({ data: toMemberResponse(updated, true) });
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

    const numericMemberId = Number(memberId);
    if (Number.isNaN(numericMemberId)) {
      return res.status(400).json({ message: 'Invalid member id' });
    }

    const existingMember = await getGroupMemberById(numericMemberId);
    if (!existingMember || existingMember.groupId !== groupId) {
      return res.status(404).json({ message: 'Group member not found' });
    }

    await deleteGroupMember(numericMemberId);
    return res.status(204).send();
  } catch (error) {
    console.error('[Group Enrollment] Failed to delete group member:', error);
    const message = error instanceof Error ? error.message : 'Failed to delete group member';
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

    const groupProfileContext = getGroupProfileContext(group.metadata, group.payorType);
    if (!groupProfileContext.isComplete) {
      return res.status(400).json({
        message: 'Group profile is incomplete. Please complete profile fields before marking ready.',
        missingFields: groupProfileContext.missingFields,
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

export default router;
