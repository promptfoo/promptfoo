import { useEffect, useRef, useState } from 'react';

import { Button } from '@app/components/ui/button';
import { callApi } from '@app/utils/api';
import type { ProviderOptions } from '@promptfoo/types';

interface SetupResult {
  success: boolean;
  message: string;
}

const CHECK_FAILED_MESSAGE = 'Setup check could not complete. Check the server logs and try again.';

export default function CodexSecuritySetupCheck({ provider }: { provider: ProviderOptions }) {
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<SetupResult>();
  const request = useRef<AbortController | undefined>(undefined);
  const configuration = JSON.stringify(provider);

  // biome-ignore lint/correctness/useExhaustiveDependencies: configuration changes invalidate the previous check and abort its request
  useEffect(() => {
    setResult(undefined);
    setPending(false);
    return () => request.current?.abort();
  }, [configuration]);

  const checkSetup = async () => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setPending(true);
    setResult(undefined);
    try {
      const response = await callApi('/providers/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerOptions: provider }),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(CHECK_FAILED_MESSAGE);
      }
      const data = await response.json().catch(() => {
        throw new Error(CHECK_FAILED_MESSAGE);
      });
      const testResult = data?.testResult;
      if (
        typeof testResult?.success !== 'boolean' ||
        (testResult.message !== undefined && typeof testResult.message !== 'string') ||
        (testResult.error !== undefined && typeof testResult.error !== 'string')
      ) {
        throw new Error(CHECK_FAILED_MESSAGE);
      }
      if (!controller.signal.aborted) {
        setResult({
          success: testResult.success,
          message:
            testResult.message ||
            testResult.error ||
            (testResult.success ? 'Local configuration checks completed.' : 'Setup check failed.'),
        });
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        setResult({
          success: false,
          message: error instanceof Error ? error.message : 'Setup check failed.',
        });
      }
    } finally {
      if (!controller.signal.aborted) {
        setPending(false);
      }
    }
  };

  return (
    <div className="space-y-2">
      <Button variant="outline" type="button" disabled={pending} onClick={checkSetup}>
        {pending ? 'Checking setup…' : 'Check setup'}
      </Button>
      <p className="text-sm text-muted-foreground">
        Checks local configuration and paths on the server. No scan or model call is run. Runtime,
        credentials, account access, and model availability are not verified. Use concrete paths;
        test-case variables are not resolved here.
      </p>
      {result && (
        <p role={result.success ? 'status' : 'alert'} className="text-sm">
          <strong>
            {result.success ? 'Local setup check passed. ' : 'Local setup check failed. '}
          </strong>
          {result.message}
        </p>
      )}
    </div>
  );
}
