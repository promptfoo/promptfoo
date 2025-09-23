import { useEffect, useState } from 'react';

/**
 * Hook to determine if the app is running in demo mode.
 * Reads from the VITE_PROMPTFOO_DEMO_MODE environment variable.
 * @returns
 */
export default function useDemoMode(): {
  isDemoMode: boolean;
  setEmailAddress: (email: string) => void;
  emailAddressSet: boolean;
} {
  const [emailAddress, setEmailAddress] = useState<string | null>(null);

  useEffect(() => {
    if (emailAddress) {
      console.log('Email address set:', emailAddress);
    }
  }, [emailAddress]);

  const envFlag = import.meta.env.VITE_PROMPTFOO_DEMO_MODE;

  return {
    isDemoMode: envFlag ? envFlag === 'true' : false,
    setEmailAddress,
    emailAddressSet: emailAddress !== null,
  };
}
