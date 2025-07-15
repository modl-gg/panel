import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
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
  
  // Find the next available position by offsetting from existing windows
  const count = existingWindows.length;
  return {
    x: baseX + (count * offset),
    y: baseY + (count * offset)
  };
};

export function PlayerWindowProvider({ children }: { children: ReactNode }) {
  const [windows, setWindows] = useState<PlayerWindowState[]>([]);

  const openPlayerWindow = useCallback((playerId: string, username?: string) => {
    setWindows(prevWindows => {
      const windowId = generateWindowId(playerId);
      
      // Check if window already exists
      const existingWindowIndex = prevWindows.findIndex(w => w.id === windowId);
      if (existingWindowIndex !== -1) {
        // Window exists, just bring it to front by moving it to the end of the array
        const existingWindow = prevWindows[existingWindowIndex];
        const otherWindows = prevWindows.filter((_, index) => index !== existingWindowIndex);
        return [...otherWindows, { ...existingWindow, isOpen: true }];
      }
      
      // Create new window
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
    setWindows(prevWindows => 
      prevWindows.map(window => 
        window.id === windowId 
          ? { ...window, isOpen: false }
          : window
      )
    );
  }, []);

  const focusPlayerWindow = useCallback((playerId: string, username?: string) => {
    // Same as openPlayerWindow - if exists, bring to front; if not, create new
    openPlayerWindow(playerId, username);
  }, [openPlayerWindow]);

  const contextValue: PlayerWindowContextType = {
    windows,
    openPlayerWindow,
    closePlayerWindow,
    focusPlayerWindow
  };

  return (
    <PlayerWindowContext.Provider value={contextValue}>
      {children}
      {/* Render all player windows */}
      {windows.map(window => (
        <PlayerWindow
          key={window.id}
          playerId={window.playerId}
          isOpen={window.isOpen}
          onClose={() => closePlayerWindow(window.id)}
          initialPosition={window.position}
        />
      ))}
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