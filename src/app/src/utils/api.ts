import useApiConfig from '@app/stores/apiConfig';

export function getApiBaseUrl(): string {
  const { apiBaseUrl } = useApiConfig.getState();
  if (apiBaseUrl) {
    return apiBaseUrl.replace(/\/$/, '');
  }
  // Use base path from build-time config for local deployments behind reverse proxy
  return import.meta.env.VITE_PUBLIC_BASENAME || '';
}

export async function callApi(path: string, options: RequestInit = {}): Promise<Response> {
  return fetch(`${getApiBaseUrl()}/api${path}`, options);
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

export async function fetchPylonEmailHash(): Promise<string | null> {
  try {
    const response = await callApi('/user/pylon', {
      method: 'GET',
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return data.pylonEmailHash;
  } catch (error) {
    console.error('Error fetching pylon email hash:', error);
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
