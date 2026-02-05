import { useRef, useEffect, useState, ReactNode } from 'react';
import { X, Maximize2, Minimize2, ChevronUp, ChevronDown, User, RefreshCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { WindowPosition } from '@modl-gg/shared-web/types';
import { Button } from '@modl-gg/shared-web/components/ui/button';

// Global static tracker for last player window state to share between instances
const lastPlayerWindowConfig: {
  size: { width: number, height: number },
  position: { x: number, y: number }
} = {
  size: { width: 650, height: 550 },
  position: { x: 100, y: 100 }
};

interface ResizableWindowProps {
  id: string;
  title: string;
  isOpen: boolean;
  initialPosition?: WindowPosition;
  initialSize?: { width: number; height: number };
  onClose: () => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  children: ReactNode;
}

const ResizableWindow = ({
  id,
  title,
  isOpen,
  initialPosition = { x: '50%', y: '50%' },
  initialSize = { width: 600, height: 500 },
  onClose,
  onRefresh,
  isRefreshing,
  children
}: ResizableWindowProps) => {
  const windowRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const minimizedHeaderRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState(initialPosition);
  const [size, setSize] = useState(initialSize);
  const [isMaximized, setIsMaximized] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [windowOffset, setWindowOffset] = useState({ x: 0, y: 0 });
  const [windowBeforeMinimize, setWindowBeforeMinimize] = useState<{
    position: WindowPosition;
    size: { width: number; height: number };
  }>({ position: initialPosition, size: initialSize });
  const [isInitialized, setIsInitialized] = useState(false);

  // Track last opened window size/position for new windows
  const [lastKnownConfig, setLastKnownConfig] = useState<{ 
    size: { width: number, height: number }, 
    position: WindowPosition 
  } | null>(null);

  // Initialize position once
  useEffect(() => {
    if (!isOpen || !windowRef.current || isInitialized) return;
    
// Use the global last known window configuration for player windows
    if (id.startsWith('player-')) {
      // Apply the size from the last window 
      setSize(lastPlayerWindowConfig.size);
      
      // Stagger the position slightly for multiple windows
      const offset = 20;
      const totalOpen = document.querySelectorAll('.resizable-window').length - 1;
      
      if (typeof lastPlayerWindowConfig.position.x === 'number' && 
          typeof lastPlayerWindowConfig.position.y === 'number') {
        setPosition({ 
          x: lastPlayerWindowConfig.position.x + (offset * totalOpen),
          y: lastPlayerWindowConfig.position.y + (offset * totalOpen)
        });
      } else {
        setPosition(lastPlayerWindowConfig.position);
      }
      
      setIsInitialized(true);
    }
    // Center the window if initial position is percentage based
    if (typeof initialPosition.x === 'string' && initialPosition.x.includes('%')) {
      const windowWidth = windowRef.current.offsetWidth;
      const windowHeight = windowRef.current.offsetHeight;
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      
      // Safe parsing of percentage values
      let xPercent = 0.5; // Default to 50%
      let yPercent = 0.5; // Default to 50%
      
      if (typeof initialPosition.x === 'string') {
        const parsedX = parseFloat(initialPosition.x);
        if (!isNaN(parsedX)) {
          xPercent = parsedX / 100;
        }
      }
      
      if (typeof initialPosition.y === 'string') {
        const parsedY = parseFloat(initialPosition.y);
        if (!isNaN(parsedY)) {
          yPercent = parsedY / 100;
        }
      }
      
      const xPos = viewportWidth * xPercent - windowWidth * xPercent;
      const yPos = viewportHeight * yPercent - windowHeight * yPercent;
      
      setPosition({ x: xPos, y: yPos });
      setIsInitialized(true);
      
      // Store this as the last known configuration if it's a player window
      if (id.startsWith('player-')) {
        // Update the global config
        lastPlayerWindowConfig.size = { width: windowWidth, height: windowHeight };
        lastPlayerWindowConfig.position = { x: xPos, y: yPos };
      }
    }
  }, [isOpen, initialPosition, isInitialized, lastKnownConfig, id]);

  // Handle dragging
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging || !windowRef.current) return;

      e.preventDefault();
      
      const newX = e.clientX - dragStart.x;
      const newY = e.clientY - dragStart.y;
      
      // Constrain to viewport
      const maxX = window.innerWidth - windowRef.current.offsetWidth;
      const maxY = window.innerHeight - windowRef.current.offsetHeight;
      
      setPosition({
        x: Math.max(0, Math.min(newX, maxX)),
        y: Math.max(0, Math.min(newY, maxY))
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      
      // Save position for new windows
      if (id.startsWith('player-')) {
        // Update the global window state
        lastPlayerWindowConfig.size = size;
        lastPlayerWindowConfig.position = {
          x: typeof position.x === 'number' ? position.x : 0,
          y: typeof position.y === 'number' ? position.y : 0
        };
      }
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragStart]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!windowRef.current) return;
    
    setIsMaximized(false);
    setIsDragging(true);
    setDragStart({
      x: e.clientX - (typeof position.x === 'number' ? position.x : 0),
      y: e.clientY - (typeof position.y === 'number' ? position.y : 0)
    });
  };

  const handleMaximize = () => {
    if (isMinimized) {
      // If minimized, restore to normal first
      handleMinimize();
    }
    
    if (isMaximized) {
      // Restore
      setIsMaximized(false);
      setPosition({ x: windowOffset.x, y: windowOffset.y });
      setSize(initialSize);
    } else {
      // Maximize
      setIsMaximized(true);
      setWindowOffset({ 
        x: typeof position.x === 'number' ? position.x : 0, 
        y: typeof position.y === 'number' ? position.y : 0 
      });
      setPosition({ x: 0, y: 0 });
      setSize({ width: window.innerWidth, height: window.innerHeight });
    }
  };
  
  const handleMinimize = () => {
    if (isMinimized) {
      // Restore from minimized state
      setIsMinimized(false);
      
      // Make sure we restore to the previous size and position
      if (windowBeforeMinimize.size.width > 0 && windowBeforeMinimize.size.height > 0) {
        setSize(windowBeforeMinimize.size);
        setPosition(windowBeforeMinimize.position);
        
        // Update global window config after restore if it's a player window
        if (id.startsWith('player-')) {
          lastPlayerWindowConfig.size = windowBeforeMinimize.size;
          lastPlayerWindowConfig.position = {
            x: typeof windowBeforeMinimize.position.x === 'number' ? windowBeforeMinimize.position.x : 0,
            y: typeof windowBeforeMinimize.position.y === 'number' ? windowBeforeMinimize.position.y : 0
          };
        }
      }
    } else {
      // Minimize
      setIsMinimized(true);
      
      // Store current window state to restore later - only if we have valid dimensions
      if (size.width > 0 && size.height > 0) {
        setWindowBeforeMinimize({
          position: {
            x: typeof position.x === 'number' ? position.x : 0,
            y: typeof position.y === 'number' ? position.y : 0
          },
          size: { width: size.width, height: size.height }
        });
      }
      
      // Just set the width for minimized state, height will be controlled by the header element
      setSize({ width: 250, height: 28 });
    }
  };

  if (!isOpen) return null;

  // Determine transform style based on position type
  const transformStyle = (typeof position.x === 'string' && position.x.includes('%')) 
    ? 'translate(-50%, -50%)' 
    : 'none';

  // Function to handle resize from any direction
  const handleResize = (e: React.MouseEvent, direction: string) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (isMaximized) return; // Don't allow resize when maximized
    
    const startX = e.clientX;
    const startY = e.clientY;
    const startWidth = size.width;
    const startHeight = size.height;
    const startPosition = { 
      x: typeof position.x === 'number' ? position.x : 0,
      y: typeof position.y === 'number' ? position.y : 0 
    };
    
    const handleMouseMove = (moveEvent: MouseEvent) => {
      // Handle right side resizing
      if (direction.includes('right')) {
        const newWidth = Math.max(300, startWidth + (moveEvent.clientX - startX));
        setSize(prev => ({ ...prev, width: newWidth }));
      }
      
      // Handle left side resizing
      if (direction.includes('left')) {
        const deltaX = startX - moveEvent.clientX;
        if (startWidth + deltaX >= 300) {
          setSize(prev => ({ ...prev, width: startWidth + deltaX }));
          setPosition(prev => ({ 
            ...prev, 
            x: typeof prev.x === 'number' ? startPosition.x - deltaX : prev.x 
          }));
        }
      }
      
      // Handle bottom side resizing
      if (direction.includes('bottom')) {
        const newHeight = Math.max(200, startHeight + (moveEvent.clientY - startY));
        setSize(prev => ({ ...prev, height: newHeight }));
      }
      
      // Handle top side resizing
      if (direction.includes('top')) {
        const deltaY = startY - moveEvent.clientY;
        if (startHeight + deltaY >= 200) {
          setSize(prev => ({ ...prev, height: startHeight + deltaY }));
          setPosition(prev => ({ 
            ...prev, 
            y: typeof prev.y === 'number' ? startPosition.y - deltaY : prev.y 
          }));
        }
      }
    };
    
    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      
      // Save the current configuration for future windows
      if (id.startsWith('player-')) {
        // Update the global state
        lastPlayerWindowConfig.size = size;
        lastPlayerWindowConfig.position = {
          x: typeof position.x === 'number' ? position.x : 0,
          y: typeof position.y === 'number' ? position.y : 0
        };
      }
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  // For minimized state, we use a completely separate component with only a header
  if (isMinimized) {
    return (
      <div
        ref={windowRef}
        id={id}
        className="fixed"
        style={{
          top: typeof position.y === 'number' ? `${position.y}px` : position.y,
          left: typeof position.x === 'number' ? `${position.x}px` : position.x,
          zIndex: 9999
        }}
      >
        <div 
          ref={minimizedHeaderRef}
          className="px-3 flex items-center justify-between rounded-lg shadow-md cursor-move bg-card h-7 hover:bg-card/90 border border-border/50"
          style={{ width: '250px' }}
          onMouseDown={handleMouseDown}
        >
          {/* Window title with user icon for player windows */}
          <div className="text-xs font-medium truncate flex-1 mr-2 flex items-center gap-1 text-left">
            {id.startsWith('player-') && <User className="h-3 w-3 text-muted-foreground" />}
            {title || id}
          </div>
          
          {/* Control buttons */}
          <div className="flex space-x-2 ml-auto">
            {/* Refresh button */}
            {onRefresh && (
              <div
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  onRefresh();
                }}
                className={`h-5 w-5 flex items-center justify-center p-0 text-muted-foreground hover:text-foreground cursor-pointer ${isRefreshing ? 'pointer-events-none' : ''}`}
                title="Refresh"
              >
                <RefreshCcw className={`h-3 w-3 ${isRefreshing ? 'animate-spin' : ''}`} />
              </div>
            )}

            {/* Restore button */}
            <div
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                handleMinimize();
              }}
              className="h-5 w-5 flex items-center justify-center p-0 text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <ChevronUp className="h-3 w-3" />
            </div>

            {/* Close button */}
            <div
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              className="h-5 w-5 flex items-center justify-center p-0 text-muted-foreground hover:text-destructive cursor-pointer"
            >
              <X className="h-3 w-3" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Regular (non-minimized) window
  return (
    <div
      ref={windowRef}
      id={id}
      className={cn(
        "resizable-window fixed bg-background border border-border rounded-lg shadow-lg",
        isMaximized && "!top-0 !left-0 !w-full !h-full !max-w-none !max-h-none !resize-none"
      )}
      style={{
        top: typeof position.y === 'number' ? `${position.y}px` : position.y,
        left: typeof position.x === 'number' ? `${position.x}px` : position.x,
        width: isMaximized ? '100%' : size.width,
        height: isMaximized ? '100%' : size.height,
        transform: transformStyle,
        zIndex: 9999
      }}
    >
      {/* Header area */}
      <div 
        ref={headerRef}
        className="px-3 py-0.5 flex items-center justify-between border-b border-border cursor-move z-40 bg-card h-7"
        onMouseDown={handleMouseDown}
      >
        {/* Window title with user icon for player windows */}
        <div className="text-xs font-medium truncate flex-1 mr-2 flex items-center gap-1">
          {id.startsWith('player-') && <User className="h-3 w-3 text-muted-foreground" />}
          {title || id}
        </div>
        
        {/* Control buttons */}
        <div className="flex space-x-1 ml-auto">
          {/* Refresh button */}
          {onRefresh && (
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => {
                e.stopPropagation();
                onRefresh();
              }}
              disabled={isRefreshing}
              className="h-5 w-5 min-w-0 p-0 text-muted-foreground hover:text-foreground z-50"
              title="Refresh"
            >
              <RefreshCcw className={`h-3 w-3 ${isRefreshing ? 'animate-spin' : ''}`} />
            </Button>
          )}

          {/* Minimize button */}
          <Button
            variant="ghost"
            size="icon"
            onClick={handleMinimize}
            className="h-5 w-5 min-w-0 p-0 text-muted-foreground hover:text-foreground z-50"
          >
            <ChevronDown className="h-3 w-3" />
          </Button>

          {/* Close button */}
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-5 w-5 min-w-0 p-0 text-muted-foreground hover:text-destructive z-50"
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>
      
      {/* Content area - completely removed when minimized */}
      {!isMinimized && (
        <div className="p-4 h-[calc(100%-28px)] w-full overflow-y-auto scrollbar">
          {children}
        </div>
      )}
      
      {/* Resize handles */}
      {!isMaximized && !isMinimized && (
        <>
          {/* Edge resize handles */}
          <div 
            className="absolute top-8 right-0 h-[calc(100%-16px)] w-3 cursor-e-resize z-20"
            onMouseDown={(e) => handleResize(e, 'right')}
          />
          <div 
            className="absolute bottom-0 left-0 w-full h-3 cursor-s-resize z-20"
            onMouseDown={(e) => handleResize(e, 'bottom')}
          />
          <div 
            className="absolute top-8 left-0 h-[calc(100%-16px)] w-3 cursor-w-resize z-20"
            onMouseDown={(e) => handleResize(e, 'left')}
          />
          <div 
            className="absolute top-0 left-0 w-full h-3 cursor-n-resize z-20"
            onMouseDown={(e) => handleResize(e, 'top')}
          />
          
          {/* Corner resize handles */}
          <div 
            className="absolute bottom-0 right-0 w-8 h-8 cursor-se-resize flex items-end justify-end pb-0.5 pr-0.5 z-30"
            onMouseDown={(e) => handleResize(e, 'right bottom')}
          >
            <div className="w-3 h-3 flex flex-col items-end">
              <div className="h-[2px] w-[2px] bg-border mb-[1px]"></div>
              <div className="h-[2px] w-[5px] bg-border mb-[1px]"></div>
              <div className="h-[2px] w-[8px] bg-border"></div>
            </div>
          </div>
          
          <div 
            className="absolute bottom-0 left-0 w-8 h-8 cursor-sw-resize z-30"
            onMouseDown={(e) => handleResize(e, 'left bottom')}
          />
          
          <div 
            className="absolute top-8 right-0 w-8 h-8 cursor-ne-resize z-30"
            onMouseDown={(e) => handleResize(e, 'right top')}
          />
          
          <div 
            className="absolute top-8 left-0 w-8 h-8 cursor-nw-resize z-30"
            onMouseDown={(e) => handleResize(e, 'left top')}
          />
        </>
      )}
    </div>
  );
};

export default ResizableWindow;
