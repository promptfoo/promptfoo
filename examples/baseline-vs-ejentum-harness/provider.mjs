/**
 * Custom promptfoo provider that pre-fetches a cognitive scaffold from the
 * Ejentum Logic API for the given mode, then calls OpenAI with the scaffold
 * stitched into the system message. The baseline provider in the same config
 * uses plain openai:chat:gpt-5.4-mini so the eval table makes the lift visible.
 */

// The Ejentum Logic API base URL. Resolved in priority order:
//   1. `config.apiUrl` from the provider block in promptfooconfig.yaml
//   2. `EJENTUM_API_URL` environment variable
//   3. The default published endpoint below
// This pattern (config -> env -> default) is the transferable lesson:
// it lets readers point this provider at a staging endpoint, a self-hosted
// prompt-augmentation service, or any other compatible API without editing code.
const DEFAULT_EJENTUM_URL = 'https://ejentum-main-ab125c3.zuplo.app/logicv1/';
const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1';

function isGpt5Model(model) {
  return model.startsWith('gpt-5') || model.includes('/gpt-5');
}

function supportsReasoningEffort(model) {
  return isReasoningModel(model) || model.includes('gpt-oss');
}

function isReasoningModel(model) {
  return (
    isGpt5Model(model) ||
    model.startsWith('o1') ||
    model.startsWith('o3') ||
    model.startsWith('o4') ||
    model.includes('/o1') ||
    model.includes('/o3') ||
    model.includes('/o4')
  );
}

async function parseChatMessages(prompt) {
  const trimmedPrompt = prompt.trim();
  if (trimmedPrompt.startsWith('- role:')) {
    // Optional dependency: only YAML chat prompts need a YAML parser.
    // Install it in a copied example with: npm install js-yaml
    const yaml = await import('js-yaml');
    const parsed = yaml.load(prompt);
    return Array.isArray(parsed) ? parsed : [{ role: 'user', content: prompt }];
  }

  try {
    const parsed = JSON.parse(prompt);
    return Array.isArray(parsed) ? parsed : [{ role: 'user', content: prompt }];
  } catch {
    return [{ role: 'user', content: prompt }];
  }
}

function getOpenAiUrl(config, env) {
  const apiHost = config.apiHost || env.OPENAI_API_HOST || process.env.OPENAI_API_HOST;
  if (apiHost) {
    return `https://${apiHost}/v1/chat/completions`;
  }
  const baseUrl =
    config.apiBaseUrl ||
    env.OPENAI_API_BASE_URL ||
    env.OPENAI_BASE_URL ||
    process.env.OPENAI_API_BASE_URL ||
    process.env.OPENAI_BASE_URL ||
    DEFAULT_OPENAI_BASE_URL;
  return `${baseUrl.replace(/\/+$/, '')}/chat/completions`;
}

function getOpenAiKey(config, env) {
  return (
    config.apiKey ||
    (config.apiKeyEnvar ? process.env[config.apiKeyEnvar] || env[config.apiKeyEnvar] : undefined) ||
    env.OPENAI_API_KEY ||
    process.env.OPENAI_API_KEY
  );
}

function getOpenAiOrganization(config, env) {
  return config.organization || env.OPENAI_ORGANIZATION || process.env.OPENAI_ORGANIZATION;
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

function getNumberOption(config, env, option, envar, defaultValue) {
  const rawValue =
    config[option] ??
    env[envar] ??
    process.env[envar] ??
    (config.omitDefaults ? undefined : defaultValue);
  if (rawValue == null || rawValue === '') {
    return undefined;
  }
  const value = Number(rawValue);
  return Number.isFinite(value) ? value : undefined;
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

function buildOpenAiBody(model, messages, scaffold, config, env) {
  const reasoningModel = isReasoningModel(model);
  const maxTokens = reasoningModel
    ? undefined
    : getNumberOption(config, env, 'max_tokens', 'OPENAI_MAX_TOKENS', 1024);
  const maxCompletionTokens = reasoningModel
    ? getNumberOption(config, env, 'max_completion_tokens', 'OPENAI_MAX_COMPLETION_TOKENS')
    : undefined;
  const temperature = reasoningModel
    ? undefined
    : getNumberOption(config, env, 'temperature', 'OPENAI_TEMPERATURE', 0);

  return {
    model,
    messages: [
      {
        role: 'system',
        content:
          `Apply the cognitive scaffold below, then answer the user's task.\n\n` +
          `[COGNITIVE SCAFFOLD]\n${scaffold}\n[END SCAFFOLD]`,
      },
      ...messages,
    ],
    ...(maxTokens === undefined ? {} : { max_tokens: maxTokens }),
    ...(maxCompletionTokens === undefined ? {} : { max_completion_tokens: maxCompletionTokens }),
    ...(temperature === undefined ? {} : { temperature }),
    ...(supportsReasoningEffort(model) && config.reasoning_effort
      ? { reasoning_effort: config.reasoning_effort }
      : {}),
    ...(isGpt5Model(model) && config.verbosity ? { verbosity: config.verbosity } : {}),
  };
}

async function fetchCompletion(config, env, key, body) {
  try {
    const organization = getOpenAiOrganization(config, env);
    const response = await fetch(getOpenAiUrl(config, env), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(key ? { Authorization: `Bearer ${key}` } : {}),
        ...(organization ? { 'OpenAI-Organization': organization } : {}),
        ...config.headers,
      },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok || data.error) {
      return { error: `OpenAI error: ${data.error?.message || response.status}` };
    }
    const choice = data.choices?.[0];
    const output = choice?.message?.content;
    const tokenUsage = {
      prompt: data.usage?.prompt_tokens || 0,
      completion: data.usage?.completion_tokens || 0,
      total: data.usage?.total_tokens || 0,
    };
    if (typeof choice?.message?.refusal === 'string' && choice.message.refusal.trim()) {
      return {
        output: choice.message.refusal,
        tokenUsage,
        isRefusal: true,
        ...(choice.finish_reason ? { finishReason: choice.finish_reason } : {}),
        guardrails: { flagged: true },
      };
    }
    if (choice?.finish_reason === 'content_filter') {
      return {
        output: output || 'Content filtered by provider',
        tokenUsage,
        isRefusal: true,
        finishReason: 'content_filter',
        guardrails: { flagged: true },
      };
    }
    if (typeof output !== 'string' || output.trim() === '') {
      return { error: 'OpenAI response did not include non-empty assistant content.' };
    }
    return {
      output,
      tokenUsage,
    };
  } catch (err) {
    return { error: `OpenAI fetch failed: ${String(err)}` };
  }
}

class EjentumAugmentedProvider {
  constructor(options = {}) {
    this.config = options.config || {};
    this.env = options.env || {};
    this.providerId = options.id || `ejentum:${this.config.mode || 'reasoning'}`;
  }

  id() {
    return this.providerId;
  }

  async callApi(prompt, context) {
    const config = { ...this.config, ...(context?.prompt?.config || {}) };
    const ejentumKey = getEjentumKey(config, this.env);
    const openaiKey = getOpenAiKey(config, this.env);
    if (!ejentumKey) {
      return {
        error: 'EJENTUM_API_KEY is not set. Get a key at https://ejentum.com/dashboard',
      };
    }
    if (!openaiKey && (config.apiKeyRequired ?? true)) {
      return { error: 'OPENAI_API_KEY is not set.' };
    }

    const mode = config.mode || 'reasoning';
    const model = config.model || 'gpt-5.4-mini';
    const ejentumUrl =
      config.apiUrl ||
      this.env.EJENTUM_API_URL ||
      process.env.EJENTUM_API_URL ||
      DEFAULT_EJENTUM_URL;
    const messages = await parseChatMessages(prompt);

    const scaffoldResult = await fetchScaffold(ejentumUrl, ejentumKey, prompt, mode);
    if (scaffoldResult.error) {
      return scaffoldResult;
    }

    const body = buildOpenAiBody(model, messages, scaffoldResult.scaffold, config, this.env);
    return fetchCompletion(config, this.env, openaiKey, body);
  }
}

export default EjentumAugmentedProvider;
