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

/**
 * Build role hierarchy map from roles data
 */
export function buildRoleHierarchy(roles: any[]): Map<string, RoleHierarchyInfo> {
  const roleHierarchy = new Map<string, RoleHierarchyInfo>();
  
  for (const role of roles) {
    roleHierarchy.set(role.name, {
      name: role.name,
      order: role.order ?? 999,
      permissions: role.permissions || []
    });
  }
  
  return roleHierarchy;
}