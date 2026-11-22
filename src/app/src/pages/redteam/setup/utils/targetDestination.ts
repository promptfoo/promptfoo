import type { ProviderOptions } from '../types';

export function missingEndpoint({ id, config }: ProviderOptions): boolean {
  return (
    (id === 'http' || id === 'https') &&
    !config?.request &&
    (typeof config?.url !== 'string' || !config.url.trim())
  );
}

export function targetDestination(target: ProviderOptions): string {
  if (missingEndpoint(target)) {
    return 'Not connected';
  }
  const { id, config } = target;
  const url = config?.url || config?.apiBaseUrl || (/^https?:/i.test(id) ? id : undefined);
  if (url) {
    try {
      return new URL(url).host;
    } catch {
      return 'Custom endpoint';
    }
  }
  return /^[\w.:/-]+$/.test(id) ? id : 'Custom target';
}
