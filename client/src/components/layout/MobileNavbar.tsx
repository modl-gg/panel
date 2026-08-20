import { useLocation } from 'wouter';
import {
  Home,
  Search,
  Ticket,
  Settings,
  AlertCircle,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { usePermissions, PERMISSIONS } from '@/hooks/use-permissions';

const MobileNavbar = () => {
  const { t } = useTranslation();
  const [location, navigate] = useLocation();
  const { hasPermission, isPermissionsLoading } = usePermissions();

  const isActive = (path: string) => {
    return location === path
      ? "text-primary"
      : "text-muted-foreground";
  };

  const allNavItems = [
    {
      icon: <Home className="h-5 w-5" />,
      label: t('nav.home'),
      path: "/panel",
      onClick: () => navigate('/panel')
    },
    {
      icon: <Search className="h-5 w-5" />,
      label: t('nav.lookup'),
      path: "/panel/lookup",
      onClick: () => navigate('/panel/lookup')
    },
    {
      icon: <Ticket className="h-5 w-5" />,
      label: t('nav.tickets'),
      path: "/panel/tickets",
      onClick: () => navigate('/panel/tickets')
    },
    {
      icon: <AlertCircle className="h-5 w-5" />,
      label: t('nav.audit'),
      path: "/panel/audit",
      permission: PERMISSIONS.ADMIN_AUDIT_VIEW,
      onClick: () => navigate('/panel/audit')
    },
    {
      icon: <Settings className="h-5 w-5" />,
      label: t('nav.settings'),
      path: "/panel/settings",
      onClick: () => navigate('/panel/settings')
    }
  ];

  // Filter nav items based on permissions, mirroring Sidebar's gating
  const navItems = allNavItems.filter(item => {
    if (!item.permission) return true;
    if (isPermissionsLoading) return false;
    return hasPermission(item.permission);
  });

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-background border-t border-border z-50 shadow-md pb-safe">
      <div className={`grid h-16`} style={{ gridTemplateColumns: `repeat(${navItems.length}, minmax(0, 1fr))` }}>
        {navItems.map((item, index) => (
          <NavItem 
            key={index}
            icon={item.icon} 
            label={item.label} 
            isActive={isActive(item.path)} 
            onClick={item.onClick} 
          />
        ))}
      </div>
    </div>
  );
};

interface NavItemProps {
  icon: React.ReactNode;
  label: string;
  isActive: string;
  onClick: () => void;
}

const NavItem = ({ icon, label, isActive, onClick }: NavItemProps) => {
  return (
    <button 
      className={`flex flex-col items-center justify-center ${isActive}`}
      onClick={onClick}
    >
      <div className="mb-0.5">
        {icon}
      </div>
      <span className="text-[10px]">{label}</span>
    </button>
  );
};

export default MobileNavbar;