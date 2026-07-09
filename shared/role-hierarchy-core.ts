export interface RoleHierarchyInfo {
  name: string;
  order: number;
  permissions: string[];
}

export interface RoleDefinition {
  name: string;
  order?: number;
  permissions?: string[];
}

/** Lower order number = higher authority */
export function hasHigherOrEqualAuthority(
  user1Role: string,
  user2Role: string,
  roleHierarchy: Map<string, RoleHierarchyInfo>
): boolean {
  const user1Info = roleHierarchy.get(user1Role);
  const user2Info = roleHierarchy.get(user2Role);
  if (!user1Info || !user2Info) return false;
  return user1Info.order <= user2Info.order;
}

export function hasHigherAuthority(
  user1Role: string,
  user2Role: string,
  roleHierarchy: Map<string, RoleHierarchyInfo>
): boolean {
  const user1Info = roleHierarchy.get(user1Role);
  const user2Info = roleHierarchy.get(user2Role);
  if (!user1Info || !user2Info) return false;
  return user1Info.order < user2Info.order;
}

export function isSuperAdminRole(roleName: string): boolean {
  return roleName === 'Super Admin';
}

export function canModifyRole(
  modifierRole: string,
  targetRole: string,
  newRole: string,
  roleHierarchy: Map<string, RoleHierarchyInfo>
): boolean {
  if (isSuperAdminRole(targetRole)) return false;
  if (isSuperAdminRole(newRole) && !isSuperAdminRole(modifierRole)) return false;

  const canModifyTarget = hasHigherAuthority(modifierRole, targetRole, roleHierarchy);
  // Mirror backend StaffService.validateGrantableRole: a performer may only grant a role with
  // STRICTLY higher authority (performer.order < target.order); equal-order (peer) grants are forbidden.
  const canAssignNewRole = hasHigherAuthority(modifierRole, newRole, roleHierarchy);

  return canModifyTarget && canAssignNewRole;
}

export function canRemoveUser(
  removerRole: string,
  targetRole: string,
  roleHierarchy: Map<string, RoleHierarchyInfo>
): boolean {
  if (isSuperAdminRole(targetRole)) return false;
  return hasHigherAuthority(removerRole, targetRole, roleHierarchy);
}

export function canAssignMinecraftPlayer(
  assignerRole: string,
  targetRole: string,
  roleHierarchy: Map<string, RoleHierarchyInfo>
): boolean {
  return hasHigherOrEqualAuthority(assignerRole, targetRole, roleHierarchy);
}

export function canReorderRoles(
  userRole: string,
  _roleHierarchy: Map<string, RoleHierarchyInfo>
): boolean {
  return isSuperAdminRole(userRole);
}

export function getUserRoleOrder(userRole: string, roleHierarchy: Map<string, RoleHierarchyInfo>): number {
  const roleInfo = roleHierarchy.get(userRole);
  return roleInfo ? roleInfo.order : 999;
}

export function hasPermission(
  userRole: string,
  permission: string,
  roleHierarchy: Map<string, RoleHierarchyInfo>
): boolean {
  const roleInfo = roleHierarchy.get(userRole);
  if (!roleInfo) return false;
  return roleInfo.permissions.some(p => p === permission || permission.startsWith(p + '.'));
}

export function getUserPermissions(
  userRole: string,
  roleHierarchy: Map<string, RoleHierarchyInfo>
): string[] {
  const roleInfo = roleHierarchy.get(userRole);
  return roleInfo ? roleInfo.permissions : [];
}

export function buildRoleHierarchy(roles: RoleDefinition[]): Map<string, RoleHierarchyInfo> {
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