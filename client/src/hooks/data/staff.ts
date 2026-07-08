import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { create } from '@bufbuild/protobuf';
import {
  PanelStaffListResponseSchema,
  PanelRoleListResponseSchema,
  PermissionsResponseSchema,
  RoleRequestSchema,
  RoleMutationResponseSchema,
  AssignMinecraftPlayerRequestSchema,
  StaffMutationResponseSchema,
} from '@modl-gg/proto/modl/v1/staff_pb.ts';
import { protoFetch, protoSend } from '@/lib/proto-fetch';
import { toNum } from '@/lib/proto-ui';

export interface StaffMember {
  id: string;
  email: string;
  username: string;
  role: string;
  status: string;
  createdAt: string;
  assignedMinecraftUuid?: string;
  assignedMinecraftUsername?: string;
}

export interface StaffRole {
  id: string;
  name: string;
  description: string;
  permissions: string[];
  isDefault: boolean;
  order: number;
  userCount: number;
}

export interface RolesResult {
  roles: StaffRole[];
}

export type StaffPermissionCategory = 'punishment' | 'ticket' | 'admin' | 'staff';

export interface StaffPermission {
  id: string;
  name: string;
  description: string;
  category: StaffPermissionCategory;
  parentId: string | null;
}

export interface PermissionsResult {
  permissions: StaffPermission[];
  categories: { [key: string]: string };
}

export function useStaff() {
  return useQuery<StaffMember[]>({
    queryKey: ['/v1/panel/staff'],
    queryFn: async () => {
      const res = await protoFetch(PanelStaffListResponseSchema, '/v1/panel/staff');
      return res.staff.map((member) => ({
        id: member.id,
        email: member.email,
        username: member.username,
        role: member.role,
        status: member.status,
        createdAt: new Date(toNum(member.createdAt)).toISOString(),
        assignedMinecraftUuid: member.assignedMinecraftUuid || undefined,
        assignedMinecraftUsername: member.assignedMinecraftUsername || undefined,
      }));
    },
    staleTime: 1000 * 60 * 5,
  });
}

export function useRoles() {
  return useQuery<RolesResult>({
    queryKey: ['/v1/panel/roles'],
    queryFn: async () => {
      const res = await protoFetch(PanelRoleListResponseSchema, '/v1/panel/roles');
      return {
        roles: res.roles.map((role) => ({
          id: role.id,
          name: role.name,
          description: role.description,
          permissions: role.permissions,
          isDefault: role.isDefault,
          order: role.order,
          userCount: role.userCount,
        })),
      };
    },
  });
}

export function usePermissions() {
  return useQuery<PermissionsResult>({
    queryKey: ['/v1/panel/roles/permissions'],
    queryFn: async () => {
      const res = await protoFetch(PermissionsResponseSchema, '/v1/panel/roles/permissions');
      return {
        permissions: res.permissions.map((permission) => ({
          id: permission.id,
          name: permission.name,
          description: permission.description,
          category: permission.category as StaffPermissionCategory,
          parentId: permission.parentId ?? null,
        })),
        categories: res.categories,
      };
    },
  });
}

export function useCreateRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (roleData: { name: string; description: string; permissions: string[] }) =>
      protoSend(
        'POST',
        '/v1/panel/roles',
        RoleRequestSchema,
        create(RoleRequestSchema, roleData),
        RoleMutationResponseSchema,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/v1/panel/roles'] });
    },
  });
}

export function useUpdateRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, ...roleData }: { id: string; name: string; description: string; permissions: string[] }) =>
      protoSend(
        'PUT',
        `/v1/panel/roles/${id}`,
        RoleRequestSchema,
        create(RoleRequestSchema, roleData),
        RoleMutationResponseSchema,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/v1/panel/roles'] });
    },
  });
}

export function useDeleteRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (roleId: string) =>
      protoFetch(RoleMutationResponseSchema, `/v1/panel/roles/${roleId}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/v1/panel/roles'] });
    },
  });
}

export function useAssignMinecraftPlayer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      email,
      minecraftUuid,
      minecraftUsername
    }: {
      email: string;
      minecraftUuid?: string;
      minecraftUsername?: string;
    }) =>
      protoSend(
        'PATCH',
        `/v1/panel/staff/${encodeURIComponent(email)}/minecraft-player`,
        AssignMinecraftPlayerRequestSchema,
        create(AssignMinecraftPlayerRequestSchema, { minecraftUuid, minecraftUsername }),
        StaffMutationResponseSchema,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/v1/panel/staff'] });
    },
  });
}
