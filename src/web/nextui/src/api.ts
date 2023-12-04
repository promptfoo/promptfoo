let apiBaseUrl: string | undefined;
export async function getApiBaseUrl(): Promise<string> {
  if (!apiBaseUrl) {
    const response = await fetch('/api/config');
    const config = (await response.json()) as { apiBaseUrl: string };
    apiBaseUrl = config.apiBaseUrl;
  }
  return apiBaseUrl;
}
