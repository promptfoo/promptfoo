import { useEffect } from 'react';

export default function usePolling(fn: () => Promise<void>, interval: number, deps: any[]) {
  useEffect(() => {
    const intervalId = setInterval(fn, interval);
    return () => clearInterval(intervalId);
  }, [fn, interval, ...deps]);
}