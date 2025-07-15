import { useState, useEffect } from 'react';

/**
 * Hook to detect if the current device is a mobile device based on screen width
 * @returns Boolean indicating whether the current device is mobile
 */
export function useIsMobile() {
  // Default to non-mobile when rendering on the server
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    // Initial check
    const checkIfMobile = () => {
      setIsMobile(window.innerWidth < 768); // Consider devices with width < 768px as mobile
    };
    
    // Check immediately
    checkIfMobile();
    
    // Add resize listener
    window.addEventListener('resize', checkIfMobile);
    
    // Clean up listener on unmount
    return () => {
      window.removeEventListener('resize', checkIfMobile);
    };
  }, []);

  return isMobile;
}