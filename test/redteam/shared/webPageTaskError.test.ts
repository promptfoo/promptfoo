import { describe, expect, it } from 'vitest';
import {
  createWebPageTaskError,
  WebPageTaskError,
} from '../../../src/redteam/shared/webPageTaskError';

describe('WebPageTaskError', () => {
  it('keeps the provided token usage on the error instance', () => {
    const tokenUsage = { total: 9, prompt: 5, completion: 4, numRequests: 1 };
    const error = new WebPageTaskError('failed', tokenUsage);

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('WebPageTaskError');
    expect(error.message).toBe('failed');
    expect(error.tokenUsage).toEqual(tokenUsage);
  });

  it('parses token usage from structured task failures', async () => {
    const tokenUsage = { total: 11, prompt: 6, completion: 5, numRequests: 1 };
    const response = {
      status: 502,
      text: async () => JSON.stringify({ tokenUsage }),
    };

    await expect(createWebPageTaskError(response, 'create web page')).resolves.toMatchObject({
      name: 'WebPageTaskError',
      message: `Failed to create web page: 502 ${JSON.stringify({ tokenUsage })}`,
      tokenUsage,
    });
  });

  it('still returns a useful error when the response body is not JSON', async () => {
    const response = {
      status: 500,
      text: async () => 'upstream timeout',
    };

    await expect(createWebPageTaskError(response, 'update web page')).resolves.toMatchObject({
      name: 'WebPageTaskError',
      message: 'Failed to update web page: 500 upstream timeout',
      tokenUsage: undefined,
    });
  });
});
