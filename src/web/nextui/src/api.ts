import useApiConfig from './state/apiConfig';

export function getApiBaseUrl(): string {
  const apiConfig = useApiConfig.getState();
  return apiConfig.apiBaseUrl || '';
}

export async function callApi(path: string, options: RequestInit = {}): Promise<Response> {
  const apiBaseUrl = getApiBaseUrl();
  return fetch(`${apiBaseUrl}/api${path}`, options);
}
