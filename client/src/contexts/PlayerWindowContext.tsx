import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import PlayerWindow from '@/components/windows/PlayerWindow';

interface WindowPosition {
  x: number;
  y: number;
}

interface PlayerWindowState {
  id: string;
  playerId: string;
  isOpen: boolean;
  position: WindowPosition;
}

interface PlayerWindowContextType {
  windows: PlayerWindowState[];
  openPlayerWindow: (playerId: string, username?: string) => void;
  closePlayerWindow: (windowId: string) => void;
  focusPlayerWindow: (playerId: string, username?: string) => void;
}

const PlayerWindowContext = createContext<PlayerWindowContextType | undefined>(undefined);

const generateWindowId = (playerId: string) => `player-window-${playerId}`;

const getNextWindowPosition = (existingWindows: PlayerWindowState[]): WindowPosition => {
  const baseX = 100;
  const baseY = 100;
  const offset = 50;

  const count = existingWindows.length;
  return {
    x: baseX + (count * offset),
    y: baseY + (count * offset)
  };
};

const setPlayerUrlParam = (playerId: string) => {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  if (url.searchParams.get('player') === playerId) return;
  url.searchParams.set('player', playerId);
  window.history.replaceState({}, '', url.toString());
};

const clearPlayerUrlParam = (playerId: string) => {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  if (url.searchParams.get('player') !== playerId) return;
  url.searchParams.delete('player');
  url.searchParams.delete('punishment');
  window.history.replaceState({}, '', url.toString());
};

export function PlayerWindowProvider({ children }: { children: ReactNode }) {
  const [windows, setWindows] = useState<PlayerWindowState[]>([]);

  const openPlayerWindow = useCallback((playerId: string, _username?: string) => {
    setPlayerUrlParam(playerId);
    setWindows(prevWindows => {
      const windowId = generateWindowId(playerId);

      const existingWindow = prevWindows.find(w => w.id === windowId);
      if (existingWindow) {
        const otherWindows = prevWindows.filter(w => w.id !== windowId);
        return [...otherWindows, { ...existingWindow, isOpen: true }];
      }

      const position = getNextWindowPosition(prevWindows);
      const newWindow: PlayerWindowState = {
        id: windowId,
        playerId,
        isOpen: true,
        position
      };

      return [...prevWindows, newWindow];
    });
  }, []);

  const closePlayerWindow = useCallback((windowId: string) => {
    setWindows(prevWindows => {
      const closing = prevWindows.find(w => w.id === windowId);
      if (closing) {
        clearPlayerUrlParam(closing.playerId);
      }
      return prevWindows.filter(w => w.id !== windowId);
    });
  }, []);

  const focusPlayerWindow = useCallback((playerId: string, username?: string) => {
    openPlayerWindow(playerId, username);
  }, [openPlayerWindow]);

  const contextValue = useMemo<PlayerWindowContextType>(() => ({
    windows,
    openPlayerWindow,
    closePlayerWindow,
    focusPlayerWindow
  }), [windows, openPlayerWindow, closePlayerWindow, focusPlayerWindow]);

  return (
    <PlayerWindowContext.Provider value={contextValue}>
      {children}
      {typeof document !== 'undefined' && createPortal(
        <div data-player-windows>
          {windows.map(window => (
            <PlayerWindow
              key={window.id}
              playerId={window.playerId}
              isOpen={window.isOpen}
              onClose={() => closePlayerWindow(window.id)}
              initialPosition={window.position}
            />
          ))}
        </div>,
        document.body
      )}
    </PlayerWindowContext.Provider>
  );
}

export function usePlayerWindow() {
  const context = useContext(PlayerWindowContext);
  if (!context) {
    throw new Error('usePlayerWindow must be used within a PlayerWindowProvider');
  }
  return context;
}