import { useEffect, useState } from "react";

/**
 * Returns the height of the viewport in pixels.
 * Responds to window resize events.
 * 
 * @returns The height of the viewport in pixels.
 * 
 * @example
 * const viewportHeight = useViewportHeight();
 * console.log(viewportHeight); // 1000
 */
export default function useViewportHeight() {
  const [viewportHeight, setViewportHeight] = useState(window.innerHeight);

  useEffect(() => {
    const handleResize = () => setViewportHeight(window.innerHeight);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return viewportHeight;
}