/**
 * Hook to determine if the app is running in demo mode.
 * Reads from the VITE_PROMPTFOO_DEMO_MODE environment variable.
 * @returns
 */
export default function useDemoMode(): {
  isDemoMode: boolean;
} {
  const envFlag = import.meta.env.VITE_PROMPTFOO_DEMO_MODE;
  return {
    isDemoMode: envFlag ? envFlag === 'true' : false,
  };
}
