export function getApiBaseUrl(): string {
  return process.env.NEXT_PUBLIC_PROMPTFOO_REMOTE_API_BASE_URL || '';
}

export async function callApi(path: string, options: RequestInit = {}): Promise<Response> {
  const apiBaseUrl = getApiBaseUrl();
  return fetch(`${apiBaseUrl}/api${path}`, options);
}
