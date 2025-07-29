export interface WindowPosition {
  x: number | string;
  y: number | string;
}

export interface Window {
  id: string;
  title: string;
  isOpen: boolean;
  position: WindowPosition;
  size: { width: number; height: number };
}

export interface WindowState {
  windows: Record<string, Window>;
}

export const initialWindowState: WindowState = {
  windows: {
    lookup: {
      id: 'lookup',
      title: 'Player Lookup',
      isOpen: false,
      position: { x: '50%', y: '50%' },
      size: { width: 600, height: 500 }
    }
  }
};

export const windowActions = {
  open: (state: WindowState, id: string): WindowState => ({
    ...state,
    windows: {
      ...state.windows,
      [id]: {
        ...state.windows[id],
        isOpen: true
      }
    }
  }),
  
  close: (state: WindowState, id: string): WindowState => ({
    ...state,
    windows: {
      ...state.windows,
      [id]: {
        ...state.windows[id],
        isOpen: false
      }
    }
  }),
  
  updatePosition: (state: WindowState, id: string, position: WindowPosition): WindowState => ({
    ...state,
    windows: {
      ...state.windows,
      [id]: {
        ...state.windows[id],
        position
      }
    }
  }),
  
  updateSize: (state: WindowState, id: string, size: { width: number; height: number }): WindowState => ({
    ...state,
    windows: {
      ...state.windows,
      [id]: {
        ...state.windows[id],
        size
      }
    }
  }),
  
  bringToFront: (state: WindowState, id: string): WindowState => {
    // Would handle z-index logic in a more complex implementation
    return state;
  }
};
