import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import {
  Home,
  Search,
  Ticket,
  Settings,
  AlertCircle,
  BookOpen,
} from 'lucide-react';
import { usePermissions, PERMISSIONS } from '@/hooks/use-permissions';
import { useTranslation } from 'react-i18next';

const MobileNavbar = () => {
  const { t } = useTranslation();
  const [location, navigate] = useLocation();
  const { hasPermission } = usePermissions();
  
  const isActive = (path: string) => {
    return location === path 
      ? "text-primary" 
      : "text-muted-foreground";
  };

  // Define nav items with conditional analytics
  const navItems = [
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
      onClick: () => navigate('/panel/audit')
    },
    {
      icon: <Settings className="h-5 w-5" />,
      label: t('nav.settings'),
      path: "/panel/settings",
      onClick: () => navigate('/panel/settings')
    }
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-background border-t border-border z-50 shadow-md pb-safe">
      <div className="grid grid-cols-5 h-16">
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