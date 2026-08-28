export function normalizeOpenAiApiBaseUrl(apiBaseUrl: string): string {
  try {
    const url = new URL(apiBaseUrl);
    if (url.pathname === '' || url.pathname === '/') {
      url.pathname = '/v1';
      return url.toString();
    }
  } catch {
    // Preserve malformed URLs so the request path can report the existing validation error.
  }

  return apiBaseUrl;
}
