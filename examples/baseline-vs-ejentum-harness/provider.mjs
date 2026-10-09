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

function getEjentumKey(config, env) {
  return (
    config.ejentumApiKey ||
    (config.ejentumApiKeyEnvar
      ? process.env[config.ejentumApiKeyEnvar] || env[config.ejentumApiKeyEnvar]
      : undefined) ||
    env.EJENTUM_API_KEY ||
    process.env.EJENTUM_API_KEY
  );
}

async function fetchScaffold(url, key, prompt, mode) {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: prompt, mode }),
    });
    const data = await response.json();
    if (!response.ok) {
      return { error: `Ejentum API ${response.status}: ${JSON.stringify(data)}` };
    }
    const scaffold =
      Array.isArray(data) && typeof data[0]?.[mode] === 'string' ? data[0][mode].trim() : '';
    return scaffold
      ? { scaffold }
      : { error: `Ejentum API response did not include a non-empty "${mode}" scaffold.` };
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
        return JSON.stringify([
          { role: 'system', content: scaffoldInstruction },
          ...parsed,
        ]);
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
  }

  id() {
    return this.providerId;
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

    // 1. Fetch cognitive scaffold from Ejentum
    const scaffoldResult = await fetchScaffold(ejentumUrl, ejentumKey, prompt, mode);
    if (scaffoldResult.error) {
      return scaffoldResult;
    }

    // 2. Format augmented prompt with scaffold injected
    const augmentedPrompt = formatAugmentedPrompt(prompt, scaffoldResult.scaffold);

    // 3. Delegate to Promptfoo's maintained OpenAI provider
    const {
      mode: _mode,
      apiUrl: _apiUrl,
      ejentumApiKey: _ejentumApiKey,
      ejentumApiKeyEnvar: _ejentumApiKeyEnvar,
      model = 'gpt-5.4-mini',
      ...forwardedConfig
    } = config;

    let provider = this.underlyingProvider;
    if (!provider) {
      const loadApiProvider = await getLoadApiProvider();
      const providerPath = model.startsWith('openai:') ? model : `openai:chat:${model}`;
      provider = await loadApiProvider(providerPath, {
        options: {
          config: forwardedConfig,
          env: this.env,
        },
      });
    }

    return provider.callApi(augmentedPrompt, context);
  }
}

export default EjentumAugmentedProvider;
