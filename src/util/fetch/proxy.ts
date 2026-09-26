import { getEnvOverrides } from '../../envars';

const DEFAULT_PORTS: Record<string, number> = {
  ftp: 21,
  gopher: 70,
  http: 80,
  https: 443,
  ws: 80,
  wss: 443,
};

/** Capture proxy settings together so an SDK client keeps its invocation's configuration. */
export function getProxyEnvironment(): Record<string, string> {
  const layers = [getEnvOverrides(), getEnvOverrides('file'), process.env];
  return Object.fromEntries(
    [...Object.keys(DEFAULT_PORTS), 'all', 'no'].map((protocol) => {
      const name = `${protocol}_proxy`;
      for (const layer of layers) {
        const lower = layer?.[name];
        const upper = layer?.[name.toUpperCase()];
        if (lower !== undefined || upper !== undefined) {
          // Lowercase wins within a layer; an explicit empty layer masks inherited values.
          return [name, lower || upper || ''];
        }
      }
      return [name, ''];
    }),
  );
}

/** Resolve protocol proxies and NO_PROXY without exporting scoped values to process.env. */
export function getProxyForUrl(url: string, env = getProxyEnvironment()): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return '';
  }
  if (!parsed.hostname) {
    return '';
  }
  const protocol = parsed.protocol.slice(0, -1);
  const port = Number(parsed.port) || DEFAULT_PORTS[protocol] || 0;
  const hostname = parsed.hostname.toLowerCase();
  const bypass = (env.no_proxy || '')
    .toLowerCase()
    .split(/[,\s]+/)
    .some((entry) => {
      if (!entry) {
        return false;
      }
      const hostPort = entry.match(/^(.+):(\d+)$/);
      if (hostPort && Number(hostPort[2]) && Number(hostPort[2]) !== port) {
        return false;
      }
      const host = hostPort?.[1] ?? entry;
      return /^[.*]/.test(host) ? hostname.endsWith(host.replace(/^\*/, '')) : hostname === host;
    });
  if (bypass) {
    return '';
  }
  const proxy = env[`${protocol}_proxy`] || env.all_proxy || '';
  return proxy && !proxy.includes('://') ? `${protocol}://${proxy}` : proxy;
}
