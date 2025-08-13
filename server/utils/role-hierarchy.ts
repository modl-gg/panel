import { Connection } from 'mongoose';
// Import shared core functions and types
import {
  buildRoleHierarchy,
  hasHigherOrEqualAuthority,
  hasHigherAuthority,
  canModifyRole as canModifyRoleHierarchy,
  canRemoveUser as canRemoveUserHierarchy,
  canAssignMinecraftPlayer as canAssignMinecraftPlayerHierarchy,
  isSuperAdminRole,
  hasPermission,
  getUserPermissions,
  getUserRoleOrder,
  canReorderRoles as canReorderRolesShared,
  type RoleHierarchyInfo
} from '../../shared/role-hierarchy-core.js';

// Re-export shared functions explicitly
export {
  buildRoleHierarchy,
  hasHigherOrEqualAuthority,
  hasHigherAuthority,
  canModifyRoleHierarchy as canModifyRole,
  canRemoveUserHierarchy as canRemoveUser,
  canAssignMinecraftPlayerHierarchy as canAssignMinecraftPlayer,
  isSuperAdminRole,
  hasPermission,
  getUserPermissions,
  getUserRoleOrder,
  canReorderRolesShared
};

// Re-export types separately
export type { RoleHierarchyInfo };

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
    // Return empty hierarchy on error
    return new Map();
  }
}

/**
 * Clear role hierarchy cache (useful when roles are updated)
 */
export function clearRoleHierarchyCache(serverName?: string): void {
  if (serverName) {
    roleHierarchyCache.delete(serverName);
  } else {
    roleHierarchyCache.clear();
  }
}

/**
 * Server-specific canReorderRoles function that returns detailed information
 * about which roles can be reordered and which cannot
 */
export function canReorderRoles(
  userRole: string,
  rolesToReorder: string[],
  roleHierarchy: Map<string, RoleHierarchyInfo>
): { canReorder: boolean; invalidRoles: string[] } {
  // Check if user has permission to reorder roles at all
  const hasReorderPermission = canReorderRolesShared(userRole, roleHierarchy);

  if (!hasReorderPermission) {
    return {
      canReorder: false,
      invalidRoles: rolesToReorder
    };
  }

  // If user has permission, they can reorder all roles
  return {
    canReorder: true,
    invalidRoles: []
  };
}