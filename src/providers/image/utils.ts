import { fetchWithCache } from '../../cache';

/**
 * Shared raw transport for OpenAI-compatible image-generation providers that
 * do not use the OpenAI SDK directly.
 */
export async function callOpenAiImageApi(
  url: string,
  body: Record<string, any>,
  headers: Record<string, string>,
  timeout: number,
): Promise<{ data: any; cached: boolean; status: number; statusText: string; latencyMs?: number }> {
  return await fetchWithCache(
    url,
    {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    },
    timeout,
  );
}
