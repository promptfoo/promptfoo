interface SocketConfigOptions {
  basePath?: string;
  origin?: string;
}

function socketPathFromBasePath(basePath: string) {
  const normalizedBasePath = basePath.replace(/\/$/, '');
  return normalizedBasePath && normalizedBasePath !== '/'
    ? `${normalizedBasePath}/socket.io`
    : '/socket.io';
}

export function getSocketConfig(apiBaseUrl?: string, options: SocketConfigOptions = {}) {
  let socketPath = '/socket.io';
  let socketUrl = '';

  if (apiBaseUrl) {
    const origin = options.origin ?? window.location.origin;
    try {
      const url = new URL(apiBaseUrl, origin);
      if (url.origin === origin) {
        socketPath = socketPathFromBasePath(url.pathname);
      } else {
        socketUrl = apiBaseUrl;
      }
    } catch {
      // Invalid API base URLs fall back to same-origin defaults.
    }
  } else {
    socketPath = socketPathFromBasePath(
      options.basePath ?? import.meta.env.VITE_PUBLIC_BASENAME ?? '',
    );
  }

  return { socketPath, socketUrl };
}
