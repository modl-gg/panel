import { createContext, useContext, useReducer, ReactNode, useCallback } from 'react';
import { WindowPosition, WindowState } from '@modl-gg/shared-web/types';
import { windowActions, initialWindowState } from '@/lib/window-manager';

interface DashboardContextType {
  windowState: WindowState;
  openLookupWindow: () => void;
  closeLookupWindow: () => void;
  updateWindowPosition: (id: string, position: WindowPosition) => void;
  updateWindowSize: (id: string, size: { width: number; height: number }) => void;
}

const DashboardContext = createContext<DashboardContextType | undefined>(undefined);

type WindowAction =
  | { type: 'OPEN_WINDOW'; id: string }
  | { type: 'CLOSE_WINDOW'; id: string }
  | { type: 'UPDATE_POSITION'; id: string; position: WindowPosition }
  | { type: 'UPDATE_SIZE'; id: string; size: { width: number; height: number } }
  | { type: 'BRING_TO_FRONT'; id: string };

const windowReducer = (state: WindowState, action: WindowAction): WindowState => {
  switch (action.type) {
    case 'OPEN_WINDOW':
      return windowActions.open(state, action.id);
    case 'CLOSE_WINDOW':
      return windowActions.close(state, action.id);
    case 'UPDATE_POSITION':
      return windowActions.updatePosition(state, action.id, action.position);
    case 'UPDATE_SIZE':
      return windowActions.updateSize(state, action.id, action.size);
    case 'BRING_TO_FRONT':
      return windowActions.bringToFront(state, action.id);
    default:
      return state;
  }
};

export const DashboardProvider = ({ children }: { children: ReactNode }) => {
  const [windowState, dispatch] = useReducer(windowReducer, initialWindowState);

  const openLookupWindow = useCallback(() => {
    dispatch({ type: 'OPEN_WINDOW', id: 'lookup' });
  }, []);

  const closeLookupWindow = useCallback(() => {
    dispatch({ type: 'CLOSE_WINDOW', id: 'lookup' });
  }, []);

  const updateWindowPosition = useCallback((id: string, position: WindowPosition) => {
    dispatch({ type: 'UPDATE_POSITION', id, position });
  }, []);

  const updateWindowSize = useCallback((id: string, size: { width: number; height: number }) => {
    dispatch({ type: 'UPDATE_SIZE', id, size });
  }, []);

  return (
    <DashboardContext.Provider
      value={{
        windowState,
        openLookupWindow,
        closeLookupWindow,
        updateWindowPosition,
        updateWindowSize
      }}
    >
      {children}
    </DashboardContext.Provider>
  );
};

export const useDashboard = (): DashboardContextType => {
  const context = useContext(DashboardContext);
  if (context === undefined) {
    throw new Error('useDashboard must be used within a DashboardProvider');
  }
  return context;
};
