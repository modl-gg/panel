import { Connection } from 'mongoose';

export interface RoleHierarchyInfo {
  name: string;
  order: number;
  permissions: string[];
}

export interface RoleHierarchyCache {
  roles: Map<string, RoleHierarchyInfo>;
  lastUpdated: number;
  ttl: number; // Time to live in milliseconds
}

// Cache for role hierarchy to avoid frequent database queries
const roleHierarchyCache: Map<string, RoleHierarchyCache> = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Get role hierarchy information from database with caching
 */
export async function getRoleHierarchy(dbConnection: Connection, serverName?: string): Promise<Map<string, RoleHierarchyInfo>> {
  const cacheKey = serverName || 'default';
  const now = Date.now();
  
  // Check cache first
  const cached = roleHierarchyCache.get(cacheKey);
  if (cached && (now - cached.lastUpdated) < cached.ttl) {
    return cached.roles;
  }

  try {
    // Get role schema utilities
    const { getStaffRoleModel } = await import('./schema-utils');
    const StaffRoles = getStaffRoleModel(dbConnection);
    
    // Fetch all roles from database
    const roles = await StaffRoles.find({}).sort({ order: 1 }).lean();
    
    // Build role hierarchy map
    const roleMap = new Map<string, RoleHierarchyInfo>();
    
    for (const role of roles) {
      roleMap.set(role.name, {
        name: role.name,
        order: role.order ?? 999,
        permissions: role.permissions || []
      });
    }
    
    // Cache the result
    roleHierarchyCache.set(cacheKey, {
      roles: roleMap,
      lastUpdated: now,
      ttl: CACHE_TTL
    });
    
    return roleMap;
  } catch (error) {
    console.error('Error fetching role hierarchy:', error);
    
    // Return cached data if available, even if expired
    const cached = roleHierarchyCache.get(cacheKey);
    if (cached) {
      return cached.roles;
    }
    
    // Fallback to empty map
    return new Map();
  }
}

/**
 * Clear role hierarchy cache for a specific server or all servers
 */
export function clearRoleHierarchyCache(serverName?: string): void {
  if (serverName) {
    roleHierarchyCache.delete(serverName);
  } else {
    roleHierarchyCache.clear();
  }
}

/**
 * Check if user1 has higher or equal authority than user2 based on role hierarchy
 * Lower order number = higher authority
 */
export function hasHigherOrEqualAuthority(
  user1Role: string,
  user2Role: string,
  roleHierarchy: Map<string, RoleHierarchyInfo>
): boolean {
  const user1Info = roleHierarchy.get(user1Role);
  const user2Info = roleHierarchy.get(user2Role);
  
  // If either role is not found, default to no authority
  if (!user1Info || !user2Info) {
    return false;
  }
  
  // Lower order = higher authority
  return user1Info.order <= user2Info.order;
}

/**
 * Check if user1 has higher authority than user2 (strictly higher, not equal)
 */
export function hasHigherAuthority(
  user1Role: string,
  user2Role: string,
  roleHierarchy: Map<string, RoleHierarchyInfo>
): boolean {
  const user1Info = roleHierarchy.get(user1Role);
  const user2Info = roleHierarchy.get(user2Role);
  
  // If either role is not found, default to no authority
  if (!user1Info || !user2Info) {
    return false;
  }
  
  // Lower order = higher authority
  return user1Info.order < user2Info.order;
}

/**
 * Check if a role is the Super Admin role (immutable role with special privileges)
 */
export function isSuperAdminRole(roleName: string): boolean {
  return roleName === 'Super Admin';
}

/**
 * Check if user can modify another user's role based on hierarchy
 */
export function canModifyRole(
  currentUserRole: string,
  targetUserRole: string,
  newRole: string,
  roleHierarchy: Map<string, RoleHierarchyInfo>
): boolean {
  // Super Admin role cannot be modified
  if (isSuperAdminRole(targetUserRole)) {
    return false;
  }
  
  // Cannot modify your own role
  if (currentUserRole === targetUserRole) {
    return false;
  }
  
  // Must have higher authority than both current and new target roles
  return (
    hasHigherAuthority(currentUserRole, targetUserRole, roleHierarchy) &&
    hasHigherAuthority(currentUserRole, newRole, roleHierarchy)
  );
}

/**
 * Check if user can remove another user based on hierarchy
 */
export function canRemoveUser(
  currentUserRole: string,
  targetUserRole: string,
  roleHierarchy: Map<string, RoleHierarchyInfo>
): boolean {
  // Cannot remove Super Admin
  if (isSuperAdminRole(targetUserRole)) {
    return false;
  }
  
  // Cannot remove yourself
  if (currentUserRole === targetUserRole) {
    return false;
  }
  
  // Must have higher authority than target
  return hasHigherAuthority(currentUserRole, targetUserRole, roleHierarchy);
}

/**
 * Check if user can assign/modify minecraft player for another user
 */
export function canAssignMinecraftPlayer(
  currentUserRole: string,
  targetUserRole: string,
  currentUserId: string,
  targetUserId: string,
  roleHierarchy: Map<string, RoleHierarchyInfo>
): boolean {
  // Super Admin can change anyone's minecraft player
  if (isSuperAdminRole(currentUserRole)) {
    return true;
  }
  
  // For other roles, they can only change their own
  return currentUserId === targetUserId;
}

/**
 * Check if user can reorder roles based on hierarchy
 */
export function canReorderRoles(
  currentUserRole: string,
  rolesToReorder: string[],
  roleHierarchy: Map<string, RoleHierarchyInfo>
): { canReorder: boolean; invalidRoles: string[] } {
  const invalidRoles: string[] = [];
  
  // Super Admin can reorder all non-Super Admin roles
  if (isSuperAdminRole(currentUserRole)) {
    for (const roleName of rolesToReorder) {
      if (isSuperAdminRole(roleName)) {
        invalidRoles.push(roleName);
      }
    }
    return { canReorder: invalidRoles.length === 0, invalidRoles };
  }
  
  // Non-Super Admins can only reorder roles below their authority
  for (const roleName of rolesToReorder) {
    if (isSuperAdminRole(roleName) || !hasHigherAuthority(currentUserRole, roleName, roleHierarchy)) {
      invalidRoles.push(roleName);
    }
  }
  
  return { canReorder: invalidRoles.length === 0, invalidRoles };
}

/**
 * Get user's role order (lower = higher authority)
 */
export function getUserRoleOrder(userRole: string, roleHierarchy: Map<string, RoleHierarchyInfo>): number {
  const roleInfo = roleHierarchy.get(userRole);
  return roleInfo ? roleInfo.order : 999;
}

/**
 * Check if user has a specific permission
 */
export function hasPermission(
  userRole: string,
  permission: string,
  roleHierarchy: Map<string, RoleHierarchyInfo>
): boolean {
  const roleInfo = roleHierarchy.get(userRole);
  if (!roleInfo) {
    return false;
  }
  
  return roleInfo.permissions.includes(permission);
}

/**
 * Get all permissions for a user role
 */
export function getUserPermissions(
  userRole: string,
  roleHierarchy: Map<string, RoleHierarchyInfo>
): string[] {
  const roleInfo = roleHierarchy.get(userRole);
  return roleInfo ? roleInfo.permissions : [];
}