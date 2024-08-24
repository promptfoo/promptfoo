let apiBaseUrl: string | undefined;
let fetchPromise: Promise<string | undefined> | undefined;

export async function getApiBaseUrl(): Promise<string> {
  if (!apiBaseUrl) {
    if (!fetchPromise) {
      fetchPromise = fetch('/api/config')
        .then((response) => response.json())
        .then((config) => {
          apiBaseUrl = config.apiBaseUrl;
          return apiBaseUrl;
        });
    }
    await fetchPromise;
  }
  if (apiBaseUrl === undefined) {
    throw new Error('API base URL is undefined');
  }
  return apiBaseUrl;
}
