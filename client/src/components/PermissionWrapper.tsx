import type { ReactNode } from 'react';
import { usePermissions, type SettingsTab } from '@/hooks/use-permissions';
import { useTranslation } from 'react-i18next';

interface PermissionWrapperProps {
  children: ReactNode;
  permissions?: string[];
  settingsTab?: SettingsTab;
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
    ? canAccessSettingsTab(settingsTab)
    : (permissions && permissions.length === 0) || hasAllPermissions(permissions || []);

  return hasAccess ? <>{children}</> : <>{fallback}</>;
}

// Higher-order component for conditional API calls
export function withPermissionCheck<T extends object>(
  Component: React.ComponentType<T>,
  requiredPermissions: string[] = [],
  settingsTab?: SettingsTab
) {
  return function PermissionCheckedComponent(props: T) {
    const { t } = useTranslation();
    const { hasAllPermissions, canAccessSettingsTab } = usePermissions();

    const hasAccess = settingsTab
      ? canAccessSettingsTab(settingsTab)
      : (requiredPermissions && requiredPermissions.length === 0) || hasAllPermissions(requiredPermissions || []);

    if (!hasAccess) {
      return (
        <div className="flex items-center justify-center h-64 border-2 border-dashed border-muted rounded-lg">
          <p className="text-muted-foreground">{t('permissions.noPermission')}</p>
        </div>
      );
    }

    return <Component {...props} />;
  };
}