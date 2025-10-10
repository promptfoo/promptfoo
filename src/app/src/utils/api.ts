import useApiConfig from '@app/stores/apiConfig';

export interface CallApiOptions extends RequestInit {
  timeout?: number; // Timeout in milliseconds
}

/**
 * Calls a given API endpoint w/ support for timeouts.
 * @param path - The path to the API endpoint
 * @param options - The options for the API call
 * @returns
 */
export async function callApi(path: string, options: CallApiOptions = {}): Promise<Response> {
  const { apiBaseUrl } = useApiConfig.getState();
  const { timeout, ...fetchOptions } = options;

  const url = `${apiBaseUrl}/api${path}`;

  try {
    return await fetch(url, {
      ...fetchOptions,
      signal: timeout ? AbortSignal.timeout(timeout) : fetchOptions.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') {
      throw new Error(`Request timed out after ${timeout}ms`);
    }
    throw error;
  }
}

export async function fetchUserEmail(): Promise<string | null> {
  try {
    const response = await callApi('/user/email', {
      method: 'GET',
    });

    if (!response.ok) {
      throw new Error('Failed to fetch user email');
    }

    const data = await response.json();
    return data.email;
  } catch (error) {
    console.error('Error fetching user email:', error);
    return null;
  }
}

export async function fetchUserId(): Promise<string | null> {
  try {
    const response = await callApi('/user/id', {
      method: 'GET',
    });

    if (!response.ok) {
      throw new Error('Failed to fetch user ID');
    }

    const data = await response.json();
    return data.id;
  } catch (error) {
    console.error('Error fetching user ID:', error);
    return null;
  }
}

export async function updateEvalAuthor(evalId: string, author: string) {
  const response = await callApi(`/eval/${evalId}/author`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ author }),
  });

  if (!response.ok) {
    throw new Error('Failed to update eval author');
  }

  return response.json();
}
