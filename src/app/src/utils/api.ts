import { z } from 'zod';
import useApiConfig from '@app/stores/apiConfig';

export async function callApi(path: string, options: RequestInit = {}): Promise<Response> {
  const { apiBaseUrl } = useApiConfig.getState();
  return fetch(`${apiBaseUrl}/api${path}`, options);
}

/**
 * Makes an API call and validates the response against a Zod schema.
 * Automatically infers TypeScript types from the schema.
 *
 * @param path - API endpoint path (e.g., '/user/email')
 * @param schema - Zod schema to validate the response
 * @param options - Fetch options (method, headers, body, etc.)
 * @returns Promise with validated and typed response data
 * @throws Error if API call fails or response doesn't match schema
 *
 * @example
 * const userData = await callApiValidated('/user/email', ApiSchemas.User.Get.Response);
 * // TypeScript knows: { email: string | null }
 */
export async function callApiValidated<T extends z.ZodType>(
  path: string,
  schema: T,
  options?: RequestInit,
): Promise<z.infer<T>> {
  const response = await callApi(path, options);

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(`API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  return schema.parse(data);
}

export async function fetchUserEmail(): Promise<string | null> {
  try {
    const { api } = await import('@promptfoo/server/schemas');
    const data = await callApiValidated('/user/email', api.user.email.get.res);
    return data.email;
  } catch (error) {
    console.error('Error fetching user email:', error);
    return null;
  }
}

export async function fetchUserId(): Promise<string | null> {
  try {
    const { api } = await import('@promptfoo/server/schemas');
    const data = await callApiValidated('/user/id', api.user.id.get.res);
    return data.id;
  } catch (error) {
    console.error('Error fetching user ID:', error);
    return null;
  }
}

export async function updateEvalAuthor(evalId: string, author: string) {
  const { api } = await import('@promptfoo/server/schemas');
  return callApiValidated(`/eval/${evalId}/author`, api.eval.author.update.res, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ author }),
  });
}
