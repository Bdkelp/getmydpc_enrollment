/**
 * Role-Based Access Control (RBAC) Middleware
 * 
 * Permission Hierarchy:
 * - super_admin: Full access to everything (all data, all operations)
 * - admin: Full access to admin info + all agent info (cannot modify super_admin)
 * - agent: Access to own data + downline agents (if has downline)
 * 
 * Data Separation:
 * - users table: Staff (admins/agents) with login access
 * - members table: DPC enrollees (customers) - NO login access
 */

import { Response, NextFunction } from 'express';
import { supabase } from '../lib/supabaseClient';
import { hasAtLeastRole, isAtLeastAdmin, type Role } from '../auth/roles';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: Role;
    agent_number?: string;
  };
}

// ============================================================
// ROLE CHECKING UTILITIES
// ============================================================

/**
 * Check if user has admin-level access (admin OR super_admin)
 */
export const isAdmin = (role: string | undefined): boolean => {
  return isAtLeastAdmin(role);
};

/**
 * Check if user is super admin
 */
export const isSuperAdmin = (role: string | undefined): boolean => {
  return hasAtLeastRole(role, 'super_admin');
};

/**
 * Check if user is a regular agent
 */
export const isAgent = (role: string | undefined): boolean => {
  return role === 'agent';
};

// ============================================================
// AGENT HIERARCHY UTILITIES
// ============================================================

/**
 * Get all agents in a user's downline (recursive)
 * @param agentId The agent's user ID
 * @returns Array of downline agent IDs
 */
export async function getDownlineAgents(agentId: string): Promise<string[]> {
  try {
    // Get direct downline
    const { data: directDownline, error } = await supabase
      .from('users')
      .select('id, upline_agent_id')
      .eq('upline_agent_id', agentId)
      .eq('role', 'agent');

    if (error) {
      console.error('[Permissions] Error fetching downline:', error);
      return [];
    }

    if (!directDownline || directDownline.length === 0) {
      return [];
    }

    // Get all downline IDs
    const downlineIds = directDownline.map(agent => agent.id);

    // Recursively get downline of downline
    const nestedDownline = await Promise.all(
      downlineIds.map(id => getDownlineAgents(id))
    );

    // Flatten and deduplicate
    const allDownline = [
      ...downlineIds,
      ...nestedDownline.flat()
    ];

    return [...new Set(allDownline)];
  } catch (error) {
    console.error('[Permissions] Error in getDownlineAgents:', error);
    return [];
  }
}

/**
 * Check if agent has any downline
 * @param agentId The agent's user ID
 * @returns True if agent has downline
 */
export async function hasDownline(agentId: string): Promise<boolean> {
  try {
    const { count, error } = await supabase
      .from('users')
      .select('id', { count: 'exact', head: true })
      .eq('upline_agent_id', agentId)
      .eq('role', 'agent');

    if (error) {
      console.error('[Permissions] Error checking downline:', error);
      return false;
    }

    return (count || 0) > 0;
  } catch (error) {
    console.error('[Permissions] Error in hasDownline:', error);
    return false;
  }
}

// ============================================================
// DATA ACCESS PERMISSIONS
// ============================================================

/**
 * Get list of user IDs the current user can view/edit
 * 
 * Rules:
 * - super_admin: ALL users (admins + agents)
 * - admin: ALL users EXCEPT super_admins
 * - agent: ONLY self + downline agents
 * 
 * @param userId Current user's ID
 * @param userRole Current user's role
 * @returns Array of accessible user IDs
 */
export async function getAccessibleUserIds(
  userId: string,
  userRole: Role
): Promise<string[]> {
  try {
    // Super admin can see everything
    if (userRole === 'super_admin') {
      const { data: allUsers, error } = await supabase
        .from('users')
        .select('id')
        .in('role', ['admin', 'agent', 'super_admin']);

      if (error) {
        console.error('[Permissions] Error fetching all users:', error);
        return [userId];
      }

      return allUsers?.map(u => u.id) || [userId];
    }

    // Admin can see all agents and other admins (but NOT super_admins)
    if (userRole === 'admin') {
      const { data: adminAccessible, error } = await supabase
        .from('users')
        .select('id')
        .in('role', ['admin', 'agent']);

      if (error) {
        console.error('[Permissions] Error fetching admin-accessible users:', error);
        return [userId];
      }

      return adminAccessible?.map(u => u.id) || [userId];
    }

    // Agent can see self + downline
    if (userRole === 'agent') {
      const downline = await getDownlineAgents(userId);
      return [userId, ...downline];
    }

    // Fallback: only see self
    return [userId];
  } catch (error) {
    console.error('[Permissions] Error in getAccessibleUserIds:', error);
    return [userId];
  }
}

/**
 * Check if user can view specific user data
 * 
 * @param viewerId ID of user trying to view
 * @param viewerRole Role of user trying to view
 * @param targetId ID of user being viewed
 * @param targetRole Role of user being viewed
 * @returns True if access allowed
 */
export async function canViewUser(
  viewerId: string,
  viewerRole: Role,
  targetId: string,
  targetRole?: Role
): Promise<boolean> {
  // Super admin can view anyone
  if (viewerRole === 'super_admin') {
    return true;
  }

  // Admin can view anyone EXCEPT super_admins
  if (viewerRole === 'admin') {
    // If target role is known and is super_admin, deny
    if (targetRole === 'super_admin') {
      return false;
    }
    // If target role unknown, check database
    if (!targetRole) {
      const { data: target, error } = await supabase
        .from('users')
        .select('role')
        .eq('id', targetId)
        .single();

      if (error || target?.role === 'super_admin') {
        return false;
      }
    }
    return true;
  }

  // Agent can view self
  if (viewerId === targetId) {
    return true;
  }

  // Agent can view downline
  const downline = await getDownlineAgents(viewerId);
  return downline.includes(targetId);
}

/**
 * Check if user can edit specific user data
 * 
 * Rules:
 * - super_admin: Can edit anyone
 * - admin: Can edit admins and agents (NOT super_admins)
 * - agent: Can edit ONLY self (NOT downline)
 * 
 * @param editorId ID of user trying to edit
 * @param editorRole Role of user trying to edit
 * @param targetId ID of user being edited
 * @param targetRole Role of user being edited
 * @returns True if edit allowed
 */
export async function canEditUser(
  editorId: string,
  editorRole: Role,
  targetId: string,
  targetRole?: Role
): Promise<boolean> {
  // Super admin can edit anyone
  if (editorRole === 'super_admin') {
    return true;
  }

  // Admin can edit anyone EXCEPT super_admins
  if (editorRole === 'admin') {
    // If target role is known and is super_admin, deny
    if (targetRole === 'super_admin') {
      return false;
    }
    // If target role unknown, check database
    if (!targetRole) {
      const { data: target, error } = await supabase
        .from('users')
        .select('role')
        .eq('id', targetId)
        .single();

      if (error || target?.role === 'super_admin') {
        return false;
      }
    }
    return true;
  }

  // Agent can ONLY edit self
  return editorId === targetId;
}

/**
 * Filter user list based on permissions
 * 
 * @param viewerId Current user's ID
 * @param viewerRole Current user's role
 * @param users Array of users to filter
 * @returns Filtered array
 */
export async function filterUsersByPermissions(
  viewerId: string,
  viewerRole: Role,
  users: any[]
): Promise<any[]> {
  // Super admin sees everything
  if (viewerRole === 'super_admin') {
    return users;
  }

  // Admin sees everything except super_admins
  if (viewerRole === 'admin') {
    return users.filter(u => u.role !== 'super_admin');
  }

  // Agent sees self + downline
  if (viewerRole === 'agent') {
    const accessibleIds = await getAccessibleUserIds(viewerId, viewerRole);
    return users.filter(u => accessibleIds.includes(u.id));
  }

  return [];
}

// ============================================================
// MIDDLEWARE FUNCTIONS
// ============================================================

/**
 * Require super admin access
 */
export function requireSuperAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  if (!isSuperAdmin(req.user.role)) {
    return res.status(403).json({ 
      message: 'Super admin access required',
      requiredRole: 'super_admin',
      currentRole: req.user.role
    });
  }

  next();
}

/**
 * Require admin-level access (admin OR super_admin)
 */
export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  if (!isAdmin(req.user.role)) {
    return res.status(403).json({ 
      message: 'Admin access required',
      requiredRole: 'admin or super_admin',
      currentRole: req.user.role
    });
  }

  next();
}

/**
 * Require any authenticated user
 */
export function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  next();
}

/**
 * Check if user can access specific user data (middleware)
 * Expects req.params.userId to be the target user ID
 */
export async function canAccessUserData(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  const targetUserId = (req as any).params?.userId || (req as any).params?.id;
  if (!targetUserId) {
    return res.status(400).json({ message: 'Target user ID required' });
  }

  const allowed = await canViewUser(req.user.id, req.user.role, targetUserId);
  
  if (!allowed) {
    return res.status(403).json({ 
      message: 'Access denied: You do not have permission to view this user',
      targetUserId
    });
  }

  next();
}

/**
 * Check if user can edit specific user data (middleware)
 * Expects req.params.userId to be the target user ID
 */
export async function canModifyUserData(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  const targetUserId = (req as any).params?.userId || (req as any).params?.id;
  if (!targetUserId) {
    return res.status(400).json({ message: 'Target user ID required' });
  }

  const allowed = await canEditUser(req.user.id, req.user.role, targetUserId);
  
  if (!allowed) {
    return res.status(403).json({ 
      message: 'Access denied: You do not have permission to edit this user',
      targetUserId
    });
  }

  next();
}

// ============================================================
// MEMBER ACCESS PERMISSIONS
// ============================================================

/**
 * Get member IDs the current user can access
 * 
 * Rules:
 * - super_admin: ALL members
 * - admin: ALL members
 * - agent: ONLY members enrolled by self or downline
 * 
 * @param userId Current user's ID
 * @param userRole Current user's role
 * @returns Array of accessible member IDs
 */
export async function getAccessibleMemberIds(
  userId: string,
  userRole: 'super_admin' | 'admin' | 'agent'
): Promise<number[]> {
  try {
    // Admin-level users can see all members
    if (isAdmin(userRole)) {
      const { data: allMembers, error } = await supabase
        .from('members')
        .select('id');

      if (error) {
        console.error('[Permissions] Error fetching all members:', error);
        return [];
      }

      return allMembers?.map(m => m.id) || [];
    }

    // Agent can see members enrolled by self + downline
    if (userRole === 'agent') {
      const accessibleAgents = await getAccessibleUserIds(userId, userRole);
      
      const { data: agentMembers, error } = await supabase
        .from('members')
        .select('id')
        .in('enrolled_by_agent_id', accessibleAgents);

      if (error) {
        console.error('[Permissions] Error fetching agent members:', error);
        return [];
      }

      return agentMembers?.map(m => m.id) || [];
    }

    return [];
  } catch (error) {
    console.error('[Permissions] Error in getAccessibleMemberIds:', error);
    return [];
  }
}

/**
 * Check if user can view specific member
 * 
 * @param viewerId ID of user trying to view
 * @param viewerRole Role of user trying to view
 * @param memberId ID of member being viewed
 * @returns True if access allowed
 */
export async function canViewMember(
  viewerId: string,
  viewerRole: 'super_admin' | 'admin' | 'agent',
  memberId: number
): Promise<boolean> {
  // Admin-level can view all members
  if (isAdmin(viewerRole)) {
    return true;
  }

  // Agent can view members enrolled by self or downline
  if (viewerRole === 'agent') {
    const accessibleMemberIds = await getAccessibleMemberIds(viewerId, viewerRole);
    return accessibleMemberIds.includes(memberId);
  }

  return false;
}

/**
 * Filter members based on permissions
 * 
 * @param viewerId Current user's ID
 * @param viewerRole Current user's role
 * @param members Array of members to filter
 * @returns Filtered array
 */
export async function filterMembersByPermissions(
  viewerId: string,
  viewerRole: 'super_admin' | 'admin' | 'agent',
  members: any[]
): Promise<any[]> {
  // Admin-level sees all members
  if (isAdmin(viewerRole)) {
    return members;
  }

  // Agent sees only their enrolled members + downline enrolled members
  if (viewerRole === 'agent') {
    const accessibleIds = await getAccessibleMemberIds(viewerId, viewerRole);
    return members.filter(m => accessibleIds.includes(m.id));
  }

  return [];
}

export default {
  // Role checks
  isAdmin,
  isSuperAdmin,
  isAgent,
  
  // Hierarchy utilities
  getDownlineAgents,
  hasDownline,
  
  // User permissions
  getAccessibleUserIds,
  canViewUser,
  canEditUser,
  filterUsersByPermissions,
  
  // Member permissions
  getAccessibleMemberIds,
  canViewMember,
  filterMembersByPermissions,
  
  // Middleware
  requireSuperAdmin,
  requireAdmin,
  requireAuth,
  canAccessUserData,
  canModifyUserData,
};
