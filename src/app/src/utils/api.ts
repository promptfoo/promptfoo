import useApiConfig from '@app/stores/apiConfig';

export async function callApi(path: string, options: RequestInit = {}): Promise<Response> {
  const { apiBaseUrl } = useApiConfig.getState();
  return fetch(`${apiBaseUrl}/api${path}`, options);
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
