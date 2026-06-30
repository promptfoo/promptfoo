import { fetchWithTimeout } from '../util/fetch/index';

export async function getLatestVersion() {
  const response = await fetchWithTimeout(
    'https://api.promptfoo.dev/api/latestVersion',
    {
      headers: { 'x-promptfoo-silent': 'true' },
    },
    10000,
  );
  if (!response.ok) {
    throw new Error('Failed to fetch package information for promptfoo');
  }
  const data = (await response.json()) as { latestVersion: string };
  return data.latestVersion;
}
