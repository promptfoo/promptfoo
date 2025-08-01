import { readGlobalConfig } from '../../globalConfig/globalConfig';

// Define CLOUD_API_HOST locally to avoid circular dependency
const CLOUD_API_HOST = 'https://api.promptfoo.app';

const originalFetch = global.fetch;

// Override global fetch
global.fetch = async (...args) => {
  const [url, options] = args;

  const opts = {
    ...options,
  };

  if (
    (typeof url === 'string' && url.startsWith(CLOUD_API_HOST)) ||
    (url instanceof URL && url.host === CLOUD_API_HOST.replace(/^https?:\/\//, ''))
  ) {
    const globalConfig = readGlobalConfig();
    const token = globalConfig.cloud?.apiKey;
    if (token) {
      opts.headers = {
        ...(options?.headers || {}),
        Authorization: `Bearer ${token}`,
      };
    }
  }

  // Call the original fetch
  const response = await originalFetch(url, opts);
  return response;
};
