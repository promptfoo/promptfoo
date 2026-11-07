/**
 * Custom promptfoo provider that pre-fetches a cognitive scaffold from the
 * Ejentum Logic API for the given mode, then delegates the completion to
 * Promptfoo's maintained OpenAI provider with the scaffold spliced into the prompt.
 *
 * Both the baseline and augmented providers use Promptfoo's maintained OpenAI
 * request path, ensuring identical model options, decoding parameters, and endpoint routing.
 */

const DEFAULT_EJENTUM_URL = 'https://api.ejentum.com/logicv1/';

let loadApiProviderFn;

async function getLoadApiProvider() {
  if (loadApiProviderFn) {
    return loadApiProviderFn;
  }
  try {
    const pf = await import('promptfoo');
    loadApiProviderFn = pf.loadApiProvider || pf.default?.loadApiProvider;
    if (loadApiProviderFn) {
      return loadApiProviderFn;
    }
  } catch {}
  try {
    const pf = await import('../../src/providers/index.js');
    loadApiProviderFn = pf.loadApiProvider;
    if (loadApiProviderFn) {
      return loadApiProviderFn;
    }
  } catch {}
  try {
    const pf = await import('../../dist/src/providers/index.js');
    loadApiProviderFn = pf.loadApiProvider;
    if (loadApiProviderFn) {
      return loadApiProviderFn;
    }
  } catch {}
  throw new Error('Unable to resolve Promptfoo loadApiProvider.');
}

function getEjentumKey(config, env = {}) {
  const customEnvar = config.ejentumApiKeyEnvar;
  return (
    config.ejentumApiKey ||
    (customEnvar ? env[customEnvar] || process.env[customEnvar] : undefined) ||
    env.EJENTUM_API_KEY ||
    process.env.EJENTUM_API_KEY
  );
}

function getRequestTimeoutMs(config, env = {}) {
  const configured = config.timeoutMs || config.requestTimeoutMs;
  const envTimeout = env.REQUEST_TIMEOUT_MS || process.env.REQUEST_TIMEOUT_MS;
  const parsed = Number(configured ?? envTimeout);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

async function fetchScaffold(url, key, prompt, mode, timeoutMs) {
  try {
    const fetchOptions = {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: prompt, mode }),
    };

    if (
      typeof timeoutMs === 'number' &&
      timeoutMs > 0 &&
      typeof AbortSignal?.timeout === 'function'
    ) {
      fetchOptions.signal = AbortSignal.timeout(timeoutMs);
    }

    const response = await fetch(url, fetchOptions);
    const data = await response.json();
    if (!response.ok) {
      return {
        error: `Ejentum API ${response.status}: ${JSON.stringify(data)}`,
      };
    }
    const scaffold =
      Array.isArray(data) && typeof data[0]?.[mode] === 'string' ? data[0][mode].trim() : '';
    return scaffold
      ? { scaffold }
      : {
          error: `Ejentum API response did not include a non-empty "${mode}" scaffold.`,
        };
  } catch (err) {
    return { error: `Ejentum fetch failed: ${String(err)}` };
  }
}

function formatAugmentedPrompt(prompt, scaffold) {
  const scaffoldInstruction =
    `Apply the cognitive scaffold below, then answer the user's task.\n\n` +
    `[COGNITIVE SCAFFOLD]\n${scaffold}\n[END SCAFFOLD]`;

  const trimmed = typeof prompt === 'string' ? prompt.trim() : '';
  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return JSON.stringify([{ role: 'system', content: scaffoldInstruction }, ...parsed]);
      }
    } catch {}
  }

  return JSON.stringify([
    { role: 'system', content: scaffoldInstruction },
    { role: 'user', content: prompt },
  ]);
}

class EjentumAugmentedProvider {
  constructor(options = {}) {
    this.config = options.config || {};
    this.env = options.env || {};
    this.providerId = options.id || `ejentum:${this.config.mode || 'reasoning'}`;
    this.underlyingProvider = options.underlyingProvider;
    this.loadApiProvider = options.loadApiProvider;
    this.initPromise = null;
  }

  id() {
    return this.providerId;
  }

  async getUnderlyingProvider() {
    if (this.underlyingProvider) {
      return this.underlyingProvider;
    }
    if (this.initPromise) {
      return this.initPromise;
    }

    const {
      mode: _mode,
      apiUrl: _apiUrl,
      ejentumApiKey: _ejentumApiKey,
      ejentumApiKeyEnvar: _ejentumApiKeyEnvar,
      model = 'gpt-5.4-mini',
      ...forwardedConfig
    } = this.config;

    const loadApiProvider = this.loadApiProvider || (await getLoadApiProvider());
    const providerPath = model.startsWith('openai:') ? model : `openai:chat:${model}`;

    this.initPromise = (async () => {
      const provider = await loadApiProvider(providerPath, {
        options: {
          config: forwardedConfig,
          env: this.env,
        },
      });
      this.underlyingProvider = provider;
      return provider;
    })();

    return this.initPromise;
  }

  async cleanup() {
    let provider = this.underlyingProvider;
    if (!provider && this.initPromise) {
      try {
        provider = await this.initPromise;
      } catch {}
    }
    if (provider && typeof provider.cleanup === 'function') {
      await provider.cleanup();
    }
  }

  async callApi(prompt, context) {
    const config = { ...this.config, ...(context?.prompt?.config || {}) };
    const ejentumKey = getEjentumKey(config, this.env);
    if (!ejentumKey) {
      return {
        error: 'EJENTUM_API_KEY is not set. Get a key at https://ejentum.com/dashboard',
      };
    }

    const mode = config.mode || 'reasoning';
    const ejentumUrl =
      config.apiUrl ||
      this.env.EJENTUM_API_URL ||
      process.env.EJENTUM_API_URL ||
      DEFAULT_EJENTUM_URL;

    const timeoutMs = getRequestTimeoutMs(config, this.env);

    // 1. Fetch cognitive scaffold from Ejentum with timeout applied
    const scaffoldResult = await fetchScaffold(ejentumUrl, ejentumKey, prompt, mode, timeoutMs);
    if (scaffoldResult.error) {
      return scaffoldResult;
    }

    // 2. Format augmented prompt with scaffold injected
    const augmentedPrompt = formatAugmentedPrompt(prompt, scaffoldResult.scaffold);

    // 3. Delegate to Promptfoo's maintained OpenAI provider
    const provider = await this.getUnderlyingProvider();
    return provider.callApi(augmentedPrompt, context);
  }
}

export default EjentumAugmentedProvider;
