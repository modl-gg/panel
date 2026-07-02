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
  open: (state: WindowState, id: string): WindowState => {
    const window = state.windows[id];
    if (!window) return state;
    return {
      ...state,
      windows: { ...state.windows, [id]: { ...window, isOpen: true } }
    };
  },

  close: (state: WindowState, id: string): WindowState => {
    const window = state.windows[id];
    if (!window) return state;
    return {
      ...state,
      windows: { ...state.windows, [id]: { ...window, isOpen: false } }
    };
  },

  updatePosition: (state: WindowState, id: string, position: WindowPosition): WindowState => {
    const window = state.windows[id];
    if (!window) return state;
    return {
      ...state,
      windows: { ...state.windows, [id]: { ...window, position } }
    };
  },

  updateSize: (state: WindowState, id: string, size: { width: number; height: number }): WindowState => {
    const window = state.windows[id];
    if (!window) return state;
    return {
      ...state,
      windows: { ...state.windows, [id]: { ...window, size } }
    };
  },

  bringToFront: (state: WindowState, _id: string): WindowState => {
    // Would handle z-index logic in a more complex implementation
    return state;
  }
};
