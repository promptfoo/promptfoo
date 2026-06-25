import { callApi } from '@app/utils/api';
import type { ShareCheckDomainResponse } from '@promptfoo/types/api/server';

const DEFAULT_DISABLED_REASON =
  'Sharing is not configured. Run `promptfoo auth login` to enable cloud sharing.';

export class ShareAvailabilityError extends Error {
  constructor(
    message: string,
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'ShareAvailabilityError';
  }
}

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function isShareCheckDomainResponse(value: unknown): value is ShareCheckDomainResponse {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const response = value as Record<string, unknown>;
  return (
    typeof response.domain === 'string' &&
    typeof response.isCloudEnabled === 'boolean' &&
    typeof response.sharingEnabled === 'boolean' &&
    typeof response.isRetryable === 'boolean' &&
    (response.sharingDisabledReason === undefined ||
      typeof response.sharingDisabledReason === 'string')
  );
}

export async function checkShareAvailability(
  evalId: string,
  signal?: AbortSignal,
): Promise<ShareCheckDomainResponse> {
  let response: Response;
  try {
    response = await callApi(`/results/share/check-domain?id=${encodeURIComponent(evalId)}`, {
      signal,
    });
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }
    throw new ShareAvailabilityError(
      'Could not connect to the Promptfoo server. Check your network connection and try again.',
      true,
    );
  }

  if (!response.ok) {
    const retryable = response.status === 408 || response.status === 429 || response.status >= 500;
    throw new ShareAvailabilityError(
      `Failed to check sharing availability (HTTP ${response.status}).`,
      retryable,
    );
  }

  const data: unknown = await response.json().catch(() => undefined);

  if (!isShareCheckDomainResponse(data)) {
    throw new ShareAvailabilityError(
      'Received an invalid response while checking sharing availability.',
      true,
    );
  }

  if (!data.sharingEnabled && !data.sharingDisabledReason) {
    return { ...data, sharingDisabledReason: DEFAULT_DISABLED_REASON };
  }
  return data;
}
