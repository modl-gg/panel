import { createContext, useContext, useState, ReactNode, useCallback } from 'react';

interface SidebarContextType {
  isSearchActive: boolean;
  setIsSearchActive: (isSearchActive: boolean) => void;
}

const SidebarContext = createContext<SidebarContextType | undefined>(undefined);

export const SidebarProvider = ({ children }: { children: ReactNode }) => {
  const [isSearchActive, setIsSearchActive] = useState(false);

  return (
    <SidebarContext.Provider value={{ 
      isSearchActive,
      setIsSearchActive
    }}>
      {children}
    </SidebarContext.Provider>
  );
};

export const useSidebar = (): SidebarContextType => {
  const context = useContext(SidebarContext);
  if (context === undefined) {
    throw new Error('useSidebar must be used within a SidebarProvider');
  }
  return context;
};
