import { Router, Response, NextFunction } from 'express';
import { authenticateToken, type AuthRequest } from '../auth/supabaseAuth';
import { hasAtLeastRole } from '../auth/roles';
import {
  addGroupMember,
  completeGroupRegistration,
  createGroup,
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

    return res.json({ data: groups, count });
  } catch (error) {
    console.error('[Group Enrollment] Failed to list groups:', error);
    const message = error instanceof Error ? error.message : 'Failed to list groups';
    return res.status(500).json({ message });
  }
});

router.post('/api/groups', async (req: AuthRequest, res: Response) => {
  try {
    const { name, payorType, groupType, discountCode, discountCodeId, metadata } = req.body || {};

    if (!name || !payorType) {
      return res.status(400).json({ message: 'Group name and payor type are required' });
    }

    const group = await createGroup({
      name,
      payorType,
      groupType,
      discountCode,
      discountCodeId,
      metadata,
      status: 'draft',
      createdBy: req.user?.id,
      updatedBy: req.user?.id,
    });

    return res.status(201).json({ data: group });
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
    return res.json({ data: group, members });
  } catch (error) {
    console.error('[Group Enrollment] Failed to fetch group:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch group';
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

    const updated = await updateGroup(groupId, {
      ...req.body,
      updatedBy: req.user?.id,
    });

    return res.json({ data: updated });
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
