export function getApiBaseUrl(): string {
  return process.env.PROMPTFOO_REMOTE_API_BASE_URL || 'http://localhost:15500';
}

export async function callApi(path: string, options: RequestInit = {}): Promise<Response> {
  const apiBaseUrl = getApiBaseUrl();
  return fetch(`${apiBaseUrl}/api${path}`, options);
}
