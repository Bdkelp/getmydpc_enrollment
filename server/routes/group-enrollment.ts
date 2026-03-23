import { Router, Response, NextFunction } from 'express';
import { authenticateToken, type AuthRequest } from '../auth/supabaseAuth';
import { hasAtLeastRole } from '../auth/roles';
import { formatPlanStartDateISO, getUpcomingPlanStartDates } from '../../shared/planStartDates';
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
    const { name, payorType, groupType, discountCode, discountCodeId, metadata, groupProfile } = req.body || {};

    if (!name) {
      return res.status(400).json({ message: 'Group name and payor type are required' });
    }

    const existingMetadata = (metadata && typeof metadata === 'object') ? metadata : {};
    const normalizedProfile = normalizeGroupProfile(groupProfile, typeof payorType === 'string' ? payorType : undefined);
    const normalizedPayorType = typeof payorType === 'string'
      ? payorType
      : payorMixModeToPayorType(normalizedProfile.payorMix.mode);
    const nextMetadata = {
      ...existingMetadata,
      groupProfile: normalizedProfile,
    };

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
    const effectiveDateContext = getGroupEffectiveDateContext(req, group.metadata);
    const groupProfileContext = getGroupProfileContext(group.metadata, group.payorType);
    return res.json({ data: group, members, effectiveDateContext, groupProfileContext });
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

    const { groupProfile, metadata, ...otherFields } = req.body || {};
    const existingMetadata = (group.metadata && typeof group.metadata === 'object') ? group.metadata : {};
    const incomingMetadata = (metadata && typeof metadata === 'object') ? metadata : {};
    const mergedMetadata = { ...existingMetadata, ...incomingMetadata } as Record<string, any>;

    let normalizedPayorType = typeof otherFields.payorType === 'string' ? otherFields.payorType : group.payorType;

    if (groupProfile !== undefined) {
      const normalizedProfile = normalizeGroupProfile(groupProfile, normalizedPayorType);
      mergedMetadata.groupProfile = normalizedProfile;
      normalizedPayorType = payorMixModeToPayorType(normalizedProfile.payorMix.mode);
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
      metadata,
      registrationPayload: registrationPayload || req.body,
      status: status || 'draft',
    });

    return res.status(201).json({ data: memberRecord });
  } catch (error) {
    console.error('[Group Enrollment] Failed to add group member:', error);
    const message = error instanceof Error ? error.message : 'Failed to add group member';
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

    return res.json({ data: members });
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

    const updated = await updateGroupMember(numericMemberId, {
      ...req.body,
      employerAmount: parseAmount(req.body?.employerAmount ?? existingMember.employerAmount),
      memberAmount: parseAmount(req.body?.memberAmount ?? existingMember.memberAmount),
      discountAmount: parseAmount(req.body?.discountAmount ?? existingMember.discountAmount),
      totalAmount: parseAmount(req.body?.totalAmount ?? existingMember.totalAmount),
    });

    return res.json({ data: updated });
  } catch (error) {
    console.error('[Group Enrollment] Failed to update group member:', error);
    const message = error instanceof Error ? error.message : 'Failed to update group member';
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
