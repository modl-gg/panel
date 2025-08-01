/**
 * Shared core role hierarchy utilities
 * Contains pure functions with no dependencies on database or caching
 */

export interface RoleHierarchyInfo {
  name: string;
  order: number;
  permissions: string[];
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
 * Check if user can modify another user's role
 */
export function canModifyRole(
  modifierRole: string,
  targetRole: string,
  newRole: string,
  roleHierarchy: Map<string, RoleHierarchyInfo>
): boolean {
  // Super Admin role cannot be modified
  if (isSuperAdminRole(targetRole)) {
    return false;
  }
  
  // Only Super Admin can assign Super Admin role
  if (isSuperAdminRole(newRole) && !isSuperAdminRole(modifierRole)) {
    return false;
  }
  
  // User must have higher authority than both target and new role
  return hasHigherAuthority(modifierRole, targetRole, roleHierarchy) && 
         hasHigherAuthority(modifierRole, newRole, roleHierarchy);
}

/**
 * Check if user can remove another user
 */
export function canRemoveUser(
  removerRole: string,
  targetRole: string,
  roleHierarchy: Map<string, RoleHierarchyInfo>
): boolean {
  // Super Admin cannot be removed
  if (isSuperAdminRole(targetRole)) {
    return false;
  }
  
  // Must have higher authority to remove
  return hasHigherAuthority(removerRole, targetRole, roleHierarchy);
}

/**
 * Check if user can assign Minecraft player to another user
 */
export function canAssignMinecraftPlayer(
  assignerRole: string,
  targetRole: string,
  roleHierarchy: Map<string, RoleHierarchyInfo>
): boolean {
  // Must have higher or equal authority
  return hasHigherOrEqualAuthority(assignerRole, targetRole, roleHierarchy);
}

/**
 * Check if user can reorder roles
 */
export function canReorderRoles(
  userRole: string,
  roleHierarchy: Map<string, RoleHierarchyInfo>
): boolean {
  // Only Super Admin can reorder roles
  return isSuperAdminRole(userRole);
}

/**
 * Get the order value for a user's role (lower = higher authority)
 */
export function getUserRoleOrder(userRole: string, roleHierarchy: Map<string, RoleHierarchyInfo>): number {
  const roleInfo = roleHierarchy.get(userRole);
  return roleInfo ? roleInfo.order : 999; // Default to lowest authority if role not found
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
 * Get all permissions for a user's role
 */
export function getUserPermissions(
  userRole: string,
  roleHierarchy: Map<string, RoleHierarchyInfo>
): string[] {
  const roleInfo = roleHierarchy.get(userRole);
  return roleInfo ? roleInfo.permissions : [];
}

/**
 * Build role hierarchy map from role data array
 */
export function buildRoleHierarchy(roles: any[]): Map<string, RoleHierarchyInfo> {
  const roleMap = new Map<string, RoleHierarchyInfo>();
  
  for (const role of roles) {
    roleMap.set(role.name, {
      name: role.name,
      order: role.order ?? 999,
      permissions: role.permissions || []
    });
  }
  
  return roleMap;
}