import { ReactNode } from 'react';
import { usePermissions } from '@/hooks/use-permissions';

interface PermissionWrapperProps {
  children: ReactNode;
  permissions?: string[];
  settingsTab?: string;
  fallback?: ReactNode;
}

export function PermissionWrapper({ 
  children, 
  permissions = [], 
  settingsTab,
  fallback = null 
}: PermissionWrapperProps) {
  const { hasAllPermissions, canAccessSettingsTab } = usePermissions();

  // Check permissions based on provided criteria
  const hasAccess = settingsTab 
    ? canAccessSettingsTab(settingsTab as any)
    : (permissions && permissions.length === 0) || hasAllPermissions(permissions || []);

  return hasAccess ? <>{children}</> : <>{fallback}</>;
}

// Higher-order component for conditional API calls
export function withPermissionCheck<T extends object>(
  Component: React.ComponentType<T>,
  requiredPermissions: string[] = [],
  settingsTab?: string
) {
  return function PermissionCheckedComponent(props: T) {
    const { hasAllPermissions, canAccessSettingsTab } = usePermissions();
    
    const hasAccess = settingsTab 
      ? canAccessSettingsTab(settingsTab as any)
      : (requiredPermissions && requiredPermissions.length === 0) || hasAllPermissions(requiredPermissions || []);

    if (!hasAccess) {
      return (
        <div className="flex items-center justify-center h-64 border-2 border-dashed border-muted rounded-lg">
          <p className="text-muted-foreground">You do not have permission to view this content.</p>
        </div>
      );
    }

    return <Component {...props} />;
  };
}