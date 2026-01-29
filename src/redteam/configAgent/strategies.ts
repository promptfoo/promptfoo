/**
 * Discovery Strategies
 *
 * Each strategy defines a set of probes to identify how to use a target endpoint.
 * Strategies are tried in order of specificity (most specific first).
 */

import { randomUUID } from 'crypto';

import type { DiscoveredConfig, DiscoveryStrategy, ProbeResult, StrategyMatch } from './types';

/**
 * Helper to create a probe with a unique ID
 */
function probe(
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
  headers?: Record<string, string>,
  description?: string,
) {
  return {
    id: randomUUID(),
    method,
    path,
    body,
    headers: { 'Content-Type': 'application/json', ...headers },
    description,
  };
}

/**
 * OpenAI Chat Completions API format
 */
export const openaiStrategy: DiscoveryStrategy = {
  id: 'openai_compatible',
  name: 'OpenAI Compatible',
  description: 'OpenAI Chat Completions API format (/v1/chat/completions)',
  minConfidence: 0.8,
  probes: [
    probe(
      'POST',
      '/v1/chat/completions',
      {
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Say "hello" and nothing else.' }],
        max_tokens: 10,
      },
      {},
      'OpenAI chat completions format',
    ),
    probe('GET', '/v1/models', undefined, {}, 'List available models'),
  ],
};

/**
 * Anthropic Messages API format
 */
export const anthropicStrategy: DiscoveryStrategy = {
  id: 'anthropic_compatible',
  name: 'Anthropic Compatible',
  description: 'Anthropic Messages API format (/v1/messages)',
  minConfidence: 0.8,
  probes: [
    probe(
      'POST',
      '/v1/messages',
      {
        model: 'claude-3-sonnet-20240229',
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Say "hello" and nothing else.' }],
      },
      { 'anthropic-version': '2023-06-01' },
      'Anthropic messages format',
    ),
  ],
};

/**
 * Azure OpenAI format (different URL structure)
 */
export const azureOpenaiStrategy: DiscoveryStrategy = {
  id: 'azure_openai',
  name: 'Azure OpenAI',
  description: 'Azure OpenAI API format',
  minConfidence: 0.8,
  probes: [
    probe(
      'POST',
      '/openai/deployments/gpt-4/chat/completions',
      {
        messages: [{ role: 'user', content: 'Say "hello" and nothing else.' }],
        max_tokens: 10,
      },
      {},
      'Azure OpenAI chat format',
    ),
  ],
};

/**
 * Generic patterns - try common field names
 */
export const genericStrategy: DiscoveryStrategy = {
  id: 'generic_json',
  name: 'Generic JSON API',
  description: 'Try common JSON API patterns',
  minConfidence: 0.5,
  probes: [
    probe('POST', '', { prompt: 'Say hello' }, {}, 'prompt field'),
    probe('POST', '', { message: 'Say hello' }, {}, 'message field'),
    probe('POST', '', { input: 'Say hello' }, {}, 'input field'),
    probe('POST', '', { query: 'Say hello' }, {}, 'query field'),
    probe('POST', '', { text: 'Say hello' }, {}, 'text field'),
    probe('POST', '', { content: 'Say hello' }, {}, 'content field'),
    probe('POST', '', { messages: [{ role: 'user', content: 'Say hello' }] }, {}, 'messages array'),
    probe('POST', '/chat', { message: 'Say hello' }, {}, '/chat endpoint'),
    probe('POST', '/completions', { prompt: 'Say hello' }, {}, '/completions endpoint'),
    probe('POST', '/generate', { prompt: 'Say hello' }, {}, '/generate endpoint'),
    probe('POST', '/api/chat', { message: 'Say hello' }, {}, '/api/chat endpoint'),
    probe('POST', '/api/generate', { prompt: 'Say hello' }, {}, '/api/generate endpoint'),
  ],
};

/**
 * All strategies in order of specificity
 */
export const ALL_STRATEGIES: DiscoveryStrategy[] = [
  openaiStrategy,
  anthropicStrategy,
  azureOpenaiStrategy,
  genericStrategy,
];

/**
 * Analyze probe results to find the best matching strategy
 */
export function analyzeProbeResults(
  strategyId: string,
  results: ProbeResult[],
): StrategyMatch | null {
  const strategy = ALL_STRATEGIES.find((s) => s.id === strategyId);
  if (!strategy) {
    return null;
  }

  // Find successful responses (2xx status)
  const successfulResults = results.filter((r) => r.status && r.status >= 200 && r.status < 300);

  if (successfulResults.length === 0) {
    // Check for auth errors - this still tells us the format might be right
    const authErrors = results.filter((r) => r.status === 401 || r.status === 403);
    if (authErrors.length > 0) {
      // Format might be correct, just needs auth
      return analyzeAuthErrorResults(strategy, authErrors);
    }
    return null;
  }

  // Analyze based on strategy type
  switch (strategyId) {
    case 'openai_compatible':
      return analyzeOpenAIResults(successfulResults, results);
    case 'anthropic_compatible':
      return analyzeAnthropicResults(successfulResults);
    case 'azure_openai':
      return analyzeAzureResults(successfulResults);
    case 'generic_json':
      return analyzeGenericResults(successfulResults);
    default:
      return null;
  }
}

function analyzeAuthErrorResults(
  strategy: DiscoveryStrategy,
  authErrors: ProbeResult[],
): StrategyMatch | null {
  const result = authErrors[0];
  const evidence: string[] = [`Got ${result.status} - authentication required`];

  // Try to detect auth type from error response
  let authType: 'api_key' | 'bearer' | 'unknown' = 'unknown';
  let headerName: string | undefined;

  const errorText = (result.body || '').toLowerCase();
  const _errorJson = result.json as Record<string, unknown> | null;

  if (
    errorText.includes('api key') ||
    errorText.includes('api_key') ||
    errorText.includes('apikey')
  ) {
    authType = 'api_key';
    evidence.push('Error mentions API key');

    // Try to find header name
    if (errorText.includes('x-api-key')) {
      headerName = 'X-API-Key';
    } else if (errorText.includes('authorization')) {
      headerName = 'Authorization';
    }
  } else if (errorText.includes('bearer') || errorText.includes('token')) {
    authType = 'bearer';
    headerName = 'Authorization';
    evidence.push('Error mentions bearer token');
  }

  // Check WWW-Authenticate header
  const wwwAuth = result.headers['www-authenticate'];
  if (wwwAuth) {
    if (wwwAuth.toLowerCase().includes('bearer')) {
      authType = 'bearer';
      headerName = 'Authorization';
      evidence.push('WWW-Authenticate header indicates Bearer auth');
    }
  }

  // Build partial config based on strategy
  const baseConfig = getBaseConfigForStrategy(strategy.id);

  return {
    strategyId: strategy.id,
    confidence: 0.6, // Lower confidence since we couldn't verify
    discoveredConfig: {
      ...baseConfig,
      auth: {
        type: authType,
        location: 'header',
        headerName,
      },
    },
    evidence,
  };
}

function getBaseConfigForStrategy(strategyId: string): DiscoveredConfig {
  switch (strategyId) {
    case 'openai_compatible':
      return {
        apiType: 'openai_compatible',
        method: 'POST',
        path: '/v1/chat/completions',
        headers: { 'Content-Type': 'application/json' },
        body: {
          model: '{{model}}',
          messages: [{ role: 'user', content: '{{prompt}}' }],
        },
        transformResponse: 'json.choices[0].message.content',
      };
    case 'anthropic_compatible':
      return {
        apiType: 'anthropic_compatible',
        method: 'POST',
        path: '/v1/messages',
        headers: {
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01',
        },
        body: {
          model: '{{model}}',
          max_tokens: 1024,
          messages: [{ role: 'user', content: '{{prompt}}' }],
        },
        transformResponse: 'json.content[0].text',
      };
    case 'azure_openai':
      return {
        apiType: 'azure_openai',
        method: 'POST',
        path: '/openai/deployments/{{model}}/chat/completions',
        headers: { 'Content-Type': 'application/json' },
        body: {
          messages: [{ role: 'user', content: '{{prompt}}' }],
        },
        transformResponse: 'json.choices[0].message.content',
      };
    default:
      return {
        apiType: 'unknown',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { prompt: '{{prompt}}' },
        transformResponse: 'json',
      };
  }
}

function analyzeOpenAIResults(
  successfulResults: ProbeResult[],
  allResults: ProbeResult[],
): StrategyMatch | null {
  const chatResult = successfulResults.find((r) => r.probe.path === '/v1/chat/completions');
  if (!chatResult?.json) {
    return null;
  }

  const json = chatResult.json as Record<string, unknown>;
  const evidence: string[] = [];

  // Check for OpenAI response structure
  if (!json.choices || !Array.isArray(json.choices)) {
    return null;
  }

  evidence.push('Response has choices array');

  const choice = (json.choices as unknown[])[0] as Record<string, unknown> | undefined;
  if (choice?.message && typeof choice.message === 'object') {
    const message = choice.message as Record<string, unknown>;
    if (typeof message.content === 'string') {
      evidence.push('Response has message.content field');
    }
  }

  // Check for models endpoint
  const modelsResult = allResults.find((r) => r.probe.path === '/v1/models');
  let models: string[] | undefined;
  if (modelsResult?.json) {
    const modelsJson = modelsResult.json as Record<string, unknown>;
    if (modelsJson.data && Array.isArray(modelsJson.data)) {
      models = (modelsJson.data as Array<{ id: string }>).map((m) => m.id);
      evidence.push(`Found ${models.length} available models`);
    }
  }

  return {
    strategyId: 'openai_compatible',
    confidence: 0.95,
    discoveredConfig: {
      apiType: 'openai_compatible',
      method: 'POST',
      path: '/v1/chat/completions',
      headers: { 'Content-Type': 'application/json' },
      body: {
        model: '{{model}}',
        messages: [{ role: 'user', content: '{{prompt}}' }],
      },
      transformResponse: 'json.choices[0].message.content',
      models,
      defaultModel: models?.[0] || 'gpt-4',
      supportsStreaming: true,
    },
    evidence,
  };
}

function analyzeAnthropicResults(successfulResults: ProbeResult[]): StrategyMatch | null {
  const result = successfulResults[0];
  if (!result?.json) {
    return null;
  }

  const json = result.json as Record<string, unknown>;
  const evidence: string[] = [];

  // Check for Anthropic response structure
  if (!json.content || !Array.isArray(json.content)) {
    return null;
  }

  evidence.push('Response has content array');

  const content = (json.content as unknown[])[0] as Record<string, unknown> | undefined;
  if (content?.text && typeof content.text === 'string') {
    evidence.push('Response has text field in content');
  }

  if (json.model) {
    evidence.push(`Model: ${json.model}`);
  }

  return {
    strategyId: 'anthropic_compatible',
    confidence: 0.95,
    discoveredConfig: {
      apiType: 'anthropic_compatible',
      method: 'POST',
      path: '/v1/messages',
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
      },
      body: {
        model: '{{model}}',
        max_tokens: 1024,
        messages: [{ role: 'user', content: '{{prompt}}' }],
      },
      transformResponse: 'json.content[0].text',
      defaultModel: (json.model as string) || 'claude-3-sonnet-20240229',
      supportsStreaming: true,
    },
    evidence,
  };
}

function analyzeAzureResults(successfulResults: ProbeResult[]): StrategyMatch | null {
  const result = successfulResults[0];
  if (!result?.json) {
    return null;
  }

  const json = result.json as Record<string, unknown>;
  const evidence: string[] = [];

  // Check for OpenAI-style response (Azure uses same format)
  if (!json.choices || !Array.isArray(json.choices)) {
    return null;
  }

  evidence.push('Response has choices array (Azure OpenAI format)');

  return {
    strategyId: 'azure_openai',
    confidence: 0.9,
    discoveredConfig: {
      apiType: 'azure_openai',
      method: 'POST',
      path: '/openai/deployments/{{model}}/chat/completions',
      headers: { 'Content-Type': 'application/json', 'api-version': '2024-02-01' },
      body: {
        messages: [{ role: 'user', content: '{{prompt}}' }],
      },
      transformResponse: 'json.choices[0].message.content',
    },
    evidence,
  };
}

function analyzeGenericResults(successfulResults: ProbeResult[]): StrategyMatch | null {
  // Find the first successful result and analyze its response
  for (const result of successfulResults) {
    if (!result.json) {
      continue;
    }

    const json = result.json as Record<string, unknown>;
    const responseField = findTextResponseField(json);

    if (responseField) {
      const evidence = [
        `Found response in field: ${responseField.path}`,
        `Request body format: ${JSON.stringify(result.probe.body)}`,
      ];

      if (result.probe.path) {
        evidence.push(`Endpoint path: ${result.probe.path}`);
      }

      // Determine which field name was used for the prompt
      const requestBody = result.probe.body as Record<string, unknown>;
      const promptField = Object.keys(requestBody)[0];

      return {
        strategyId: 'generic_json',
        confidence: 0.7,
        discoveredConfig: {
          apiType: 'generic_json',
          method: result.probe.method as 'POST',
          path: result.probe.path,
          headers: { 'Content-Type': 'application/json' },
          body: { [promptField]: '{{prompt}}' },
          transformResponse: responseField.path,
        },
        evidence,
      };
    }
  }

  return null;
}

/**
 * Recursively find a text response field in a JSON object
 */
function findTextResponseField(
  obj: unknown,
  path = 'json',
): { path: string; value: string } | null {
  if (typeof obj === 'string' && obj.length > 0 && obj.length < 10000) {
    return { path, value: obj };
  }

  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      const result = findTextResponseField(obj[i], `${path}[${i}]`);
      if (result) {
        return result;
      }
    }
  }

  if (obj && typeof obj === 'object') {
    // Prioritize common response field names
    const priorityFields = [
      'content',
      'text',
      'response',
      'output',
      'message',
      'answer',
      'result',
      'generated_text',
      'completion',
    ];

    const objRecord = obj as Record<string, unknown>;

    for (const field of priorityFields) {
      if (field in objRecord) {
        const result = findTextResponseField(objRecord[field], `${path}.${field}`);
        if (result) {
          return result;
        }
      }
    }

    // Then try all other fields
    for (const [key, value] of Object.entries(objRecord)) {
      if (!priorityFields.includes(key)) {
        const result = findTextResponseField(value, `${path}.${key}`);
        if (result) {
          return result;
        }
      }
    }
  }

  return null;
}
