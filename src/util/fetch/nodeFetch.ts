import { CLOUD_API_HOST, cloudConfig } from '../../globalConfig/cloud';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const originalFetch = global.fetch || require('node-fetch');

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
    const token = cloudConfig.getApiKey();
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
