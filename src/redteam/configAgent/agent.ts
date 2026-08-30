/**
 * Configuration Agent
 *
 * Orchestrates the discovery process by running probes, analyzing results,
 * and generating configuration suggestions.
 */

import { randomUUID } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

import { Agent, interceptors } from 'undici';
import logger from '../../logger';
import { fetchWithProxy } from '../../util/fetch';
import {
  ALL_STRATEGIES,
  analyzeProbeResults,
  createAzureOpenaiStrategy,
  getAzureDeploymentFromPath,
  getBaseConfigForStrategy,
} from './strategies';

import type {
  AgentMessage,
  ConfigAgentSession,
  DiscoveredConfig,
  DiscoveryStrategy,
  Probe,
  ProbeResult,
  StrategyMatch,
  UserInput,
} from './types';

const DEFAULT_TIMEOUT = 10000;
const DNS_CACHE_TTL = DEFAULT_TIMEOUT;
const CLOUD_METADATA_HOSTS = new Set([
  'metadata.google.internal',
  'metadata.goog',
  'metadata',
  'instance-data',
]);

function cloneValue<T>(value: T): T {
  return structuredClone(value);
}

function renderTemplateValue(value: unknown, replacements: Record<string, string>): unknown {
  if (typeof value === 'string') {
    return Object.entries(replacements).reduce(
      (rendered, [key, replacement]) =>
        rendered.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), replacement),
      value,
    );
  }

  if (Array.isArray(value)) {
    return value.map((item) => renderTemplateValue(item, replacements));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, renderTemplateValue(item, replacements)]),
    );
  }

  return value;
}

function normalizeHostname(hostname: string): string {
  return hostname.toLowerCase().replace(/^\[|\]$/g, '');
}

function assertIpv4Allowed(hostname: string): void {
  const octets = hostname.split('.').map(Number);
  if (
    octets.length !== 4 ||
    octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)
  ) {
    throw new Error('Invalid URL format');
  }

  const [a, b] = octets;

  if (a === 127) {
    throw new Error('Access to loopback addresses is not allowed');
  }
  if (a === 0) {
    throw new Error('Access to reserved addresses is not allowed');
  }
  if (a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) {
    throw new Error('Access to private IP addresses is not allowed');
  }
  if (a === 169 && b === 254) {
    throw new Error('Access to link-local addresses is not allowed');
  }
  if (a === 100 && b >= 64 && b <= 127) {
    throw new Error('Access to private IP addresses is not allowed');
  }
  if (a >= 224) {
    throw new Error('Access to reserved addresses is not allowed');
  }
}

function assertIpv6Allowed(hostname: string): void {
  const normalized = hostname.toLowerCase();

  if (normalized === '::1' || normalized === '0:0:0:0:0:0:0:1') {
    throw new Error('Access to localhost is not allowed');
  }
  if (normalized === '::' || normalized === '0:0:0:0:0:0:0:0') {
    throw new Error('Access to reserved addresses is not allowed');
  }
  if (/^f[cd]/.test(normalized)) {
    throw new Error('Access to private IP addresses is not allowed');
  }
  if (/^fe[89ab]/.test(normalized)) {
    throw new Error('Access to link-local addresses is not allowed');
  }
  if (/^fe[c-f]/.test(normalized)) {
    throw new Error('Access to private IP addresses is not allowed');
  }
  if (normalized.startsWith('::ffff:')) {
    throw new Error('Access to private IP addresses is not allowed');
  }
}

function assertHostnameAllowed(hostname: string): void {
  const normalized = normalizeHostname(hostname);

  if (
    normalized === 'localhost' ||
    normalized === '127.0.0.1' ||
    normalized === '0.0.0.0' ||
    normalized.endsWith('.localhost')
  ) {
    throw new Error('Access to localhost is not allowed');
  }

  if (CLOUD_METADATA_HOSTS.has(normalized)) {
    throw new Error('Access to cloud metadata endpoints is not allowed');
  }

  const ipVersion = isIP(normalized);
  if (ipVersion === 4) {
    assertIpv4Allowed(normalized);
  } else if (ipVersion === 6) {
    assertIpv6Allowed(normalized);
  }
}

async function lookupAllowedHostname(
  hostname: string,
): Promise<Array<{ address: string; family: 4 | 6 }>> {
  const addresses = await lookup(hostname, { all: true, verbatim: true });

  return addresses.map((address) => {
    assertHostnameAllowed(address.address);

    const family = isIP(address.address);
    if (family !== 4 && family !== 6) {
      throw new Error('Invalid URL format');
    }

    return { address: address.address, family };
  });
}

// The DNS interceptor replaces a checked hostname with a checked IP address
// while preserving Host and TLS SNI for the target endpoint.
const guardedFetchDispatcher = new Agent()
  .compose(
    interceptors.dns({
      affinity: 4,
      maxTTL: DNS_CACHE_TTL,
      lookup: (origin, _options, callback) => {
        lookupAllowedHostname(origin.hostname)
          .then((addresses) =>
            callback(
              null,
              addresses.map((address) => ({ ...address, ttl: DNS_CACHE_TTL })),
            ),
          )
          .catch((error) =>
            callback(error instanceof Error ? error : new Error('DNS lookup failed'), []),
          );
      },
    }),
  )
  .compose(interceptors.decompress({ skipErrorResponses: false }));

/**
 * Configuration Agent for auto-discovering endpoint configuration
 */
export class ConfigurationAgent {
  private session: ConfigAgentSession;
  private abortController: AbortController | null = null;

  constructor(baseUrl: string) {
    this.session = {
      id: randomUUID(),
      baseUrl: this.normalizeUrl(baseUrl),
      startedAt: Date.now(),
      phase: 'initializing',
      triedStrategies: [],
      bestMatch: null,
      probeHistory: [],
      userInputs: {},
      messages: [],
      finalConfig: null,
      verified: false,
    };
  }

  /**
   * Get current session state
   */
  getSession(): ConfigAgentSession {
    return cloneValue(this.session);
  }

  /**
   * Get conversation messages
   */
  getMessages(): AgentMessage[] {
    return cloneValue(this.session.messages);
  }

  /**
   * Add a message to the conversation
   */
  private addMessage(
    type: AgentMessage['type'],
    content: string,
    metadata?: AgentMessage['metadata'],
  ): AgentMessage {
    const message: AgentMessage = {
      id: randomUUID(),
      type,
      content,
      timestamp: Date.now(),
      metadata,
    };
    this.session.messages.push(message);
    return message;
  }

  /**
   * Normalize URL (ensure protocol, remove trailing slash)
   * Includes SSRF protection to block internal/private addresses
   */
  private normalizeUrl(url: string): string {
    let normalized = url.trim();

    // Add https if no protocol
    if (normalized.startsWith('//')) {
      normalized = `https:${normalized}`;
    } else if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
      if (/^[a-z][a-z0-9+.-]*:\/\//i.test(normalized)) {
        throw new Error('Only HTTP and HTTPS protocols are allowed');
      }
      normalized = `https://${normalized}`;
    }

    // Remove trailing slash
    normalized = normalized.replace(/\/+$/, '');

    // Validate URL structure
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(normalized);
    } catch {
      throw new Error('Invalid URL format');
    }

    assertHostnameAllowed(parsedUrl.hostname);

    if (parsedUrl.username || parsedUrl.password) {
      throw new Error('Credentials in endpoint URLs are not allowed');
    }
    if (parsedUrl.hash) {
      throw new Error('URL fragments are not allowed');
    }

    // Only allow http and https protocols
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      throw new Error('Only HTTP and HTTPS protocols are allowed');
    }

    return normalized;
  }

  /**
   * Validate each request target before it reaches the guarded dispatcher.
   */
  private async assertUrlAllowed(url: string): Promise<void> {
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      throw new Error('Invalid URL format');
    }

    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      throw new Error('Only HTTP and HTTPS protocols are allowed');
    }

    const hostname = normalizeHostname(parsedUrl.hostname);
    assertHostnameAllowed(hostname);

    if (isIP(hostname)) {
      return;
    }

    await lookupAllowedHostname(hostname);
  }

  /**
   * Start the discovery process
   */
  async startDiscovery(): Promise<AgentMessage[]> {
    this.abortController = new AbortController();

    this.addMessage('info', `I'll help you configure the endpoint at ${this.session.baseUrl}`);
    this.addMessage('status', 'Checking connectivity...', { phase: 'connectivity' });

    // First, check basic connectivity
    const connectivityResult = await this.checkConnectivity();

    if (!connectivityResult.reachable) {
      this.session.phase = 'error';
      this.addMessage(
        'error',
        `Cannot reach the server: ${connectivityResult.error || 'Connection failed'}`,
      );
      this.addMessage('info', 'Please check the URL and try again.', {
        options: [
          { id: 'retry', label: 'Try again', value: 'retry', primary: true },
          { id: 'edit', label: 'Edit URL', value: 'edit' },
        ],
      });
      return this.session.messages;
    }

    this.addMessage('success', `Server is reachable (${connectivityResult.timing}ms)`);

    // Start trying discovery strategies
    this.session.phase = 'probing';
    await this.runDiscoveryStrategies();

    return this.session.messages;
  }

  /**
   * Check if the target is reachable
   */
  private async checkConnectivity(): Promise<{
    reachable: boolean;
    timing?: number;
    error?: string;
  }> {
    const start = Date.now();

    try {
      const _response = await this.fetchWithTimeout(this.session.baseUrl, {
        method: 'HEAD',
        signal: this.abortController?.signal,
      });

      // Even 4xx/5xx means server is reachable
      return {
        reachable: true,
        timing: Date.now() - start,
      };
    } catch (_error) {
      // Try GET as fallback (some servers don't support HEAD)
      try {
        await this.fetchWithTimeout(this.session.baseUrl, {
          method: 'GET',
          signal: this.abortController?.signal,
        });
        return {
          reachable: true,
          timing: Date.now() - start,
        };
      } catch (getError) {
        return {
          reachable: false,
          error: getError instanceof Error ? getError.message : 'Connection failed',
        };
      }
    }
  }

  /**
   * Run through discovery strategies
   */
  private async runDiscoveryStrategies(): Promise<void> {
    for (const strategy of this.getDiscoveryStrategies()) {
      if (this.abortController?.signal.aborted) {
        break;
      }

      this.addMessage('status', `Trying ${strategy.name} format...`, {
        phase: 'probing',
        strategyId: strategy.id,
      });

      const results = await this.runProbes(strategy.probes);
      this.session.triedStrategies.push(strategy.id);
      this.session.probeHistory.push(...results);

      const match = analyzeProbeResults(strategy.id, results);

      if (match && match.confidence >= strategy.minConfidence) {
        const normalizedMatch = this.normalizeStrategyMatch(match);
        this.session.bestMatch = normalizedMatch;
        this.session.phase = 'analyzing';
        await this.handleMatchFound(normalizedMatch, results);
        return;
      }

      // Check if auth is needed
      const authNeeded = results.some((r) => r.status === 401 || r.status === 403);
      if (authNeeded && match) {
        const normalizedMatch = this.normalizeStrategyMatch(match);
        // Format might be right, just needs auth
        this.session.bestMatch = normalizedMatch;
        this.session.phase = 'analyzing';
        await this.handleAuthRequired(normalizedMatch, results);
        return;
      }
    }

    // No strategy matched
    this.session.phase = 'analyzing';
    this.addMessage(
      'info',
      "I couldn't automatically detect the API format. Can you help me understand how to call this endpoint?",
      {
        options: [
          { id: 'example', label: 'Show me an example request', value: 'example' },
          { id: 'openai', label: "It's OpenAI-compatible", value: 'openai' },
          { id: 'anthropic', label: "It's Anthropic-compatible", value: 'anthropic' },
          { id: 'azure', label: "It's Azure OpenAI", value: 'azure' },
          { id: 'custom', label: "It's a custom API", value: 'custom' },
        ],
      },
    );
  }

  /**
   * Handle a successful strategy match
   */
  private async handleMatchFound(match: StrategyMatch, _results: ProbeResult[]): Promise<void> {
    const confidence = Math.round(match.confidence * 100);

    this.addMessage(
      'discovery',
      `Found a match: **${this.getStrategyDisplayName(match.strategyId)}** (${confidence}% confidence)`,
      {
        strategyId: match.strategyId,
        discoveredConfig: cloneValue(match.discoveredConfig),
      },
    );

    // Show what we discovered
    const config = match.discoveredConfig;
    let details = '**Discovered configuration:**\n';
    details += `- API Type: ${config.apiType}\n`;
    details += `- Method: ${config.method}\n`;
    if (config.path) {
      details += `- Path: ${config.path}\n`;
    }
    details += `- Response extraction: \`${config.transformResponse}\`\n`;

    if (config.models && config.models.length > 0) {
      details += `- Available models: ${config.models.slice(0, 5).join(', ')}`;
      if (config.models.length > 5) {
        details += ` (+${config.models.length - 5} more)`;
      }
      details += '\n';
    }

    this.addMessage('info', details);

    // Verify the configuration works
    this.addMessage('status', 'Verifying configuration with a test message...', {
      phase: 'confirming',
    });

    const verified = await this.verifyConfiguration(config);

    if (verified) {
      this.session.verified = true;
      this.session.finalConfig = config;
      this.session.phase = 'complete';

      this.addMessage('success', 'Configuration verified! The endpoint is working correctly.');
      this.addMessage('info', 'Ready to apply this configuration?', {
        options: [
          { id: 'apply', label: 'Apply configuration', value: 'apply', primary: true },
          { id: 'edit', label: 'Edit first', value: 'edit' },
          { id: 'test', label: 'Run another test', value: 'test' },
        ],
      });
    } else {
      this.addMessage(
        'error',
        'Verification failed. The endpoint returned an unexpected response.',
      );
      this.addMessage('info', 'Would you like to adjust the configuration?', {
        options: [
          { id: 'retry', label: 'Try again', value: 'retry', primary: true },
          { id: 'edit', label: 'Edit configuration', value: 'edit' },
          { id: 'skip', label: 'Use anyway', value: 'skip' },
        ],
      });
    }
  }

  /**
   * Handle case where auth is required
   */
  private async handleAuthRequired(match: StrategyMatch, results: ProbeResult[]): Promise<void> {
    const authResult = results.find((r) => r.status === 401 || r.status === 403);
    const auth = match.discoveredConfig.auth;

    this.addMessage(
      'discovery',
      `This looks like a **${this.getStrategyDisplayName(match.strategyId)}** endpoint, but it requires authentication.`,
      {
        strategyId: match.strategyId,
        discoveredConfig: match.discoveredConfig,
      },
    );

    // Try to parse error message for hints
    let authHint = '';
    if (authResult?.body) {
      try {
        const errorJson = JSON.parse(authResult.body);
        if (errorJson.error?.message) {
          authHint = errorJson.error.message;
        } else if (errorJson.message) {
          authHint = errorJson.message;
        } else if (typeof errorJson.error === 'string') {
          authHint = errorJson.error;
        }
      } catch {
        // Use raw body if not JSON
        if (authResult.body.length < 200) {
          authHint = authResult.body;
        }
      }
    }

    if (authHint) {
      this.addMessage('info', `Server says: "${authHint}"`);
    }

    // Ask for API key
    const authTypeDisplay = auth?.type === 'bearer' ? 'Bearer token' : 'API key';

    this.addMessage('question', `Do you have an ${authTypeDisplay} for this service?`, {
      inputRequest: {
        type: 'api_key',
        prompt: `Enter your ${authTypeDisplay}:`,
        field: 'apiKey',
        sensitive: true,
      },
      options: [
        { id: 'have_key', label: 'Yes, I have one', value: 'have_key', primary: true },
        { id: 'no_key', label: "No, I don't have one", value: 'no_key' },
        { id: 'diff_auth', label: 'It uses different auth', value: 'diff_auth' },
      ],
    });
  }

  /**
   * Handle user input
   */
  async handleUserInput(input: UserInput): Promise<AgentMessage[]> {
    // Add user message to conversation
    if (input.type === 'message') {
      this.addMessage('user', input.value as string);
    }

    // Store the input
    if (input.field) {
      this.session.userInputs[input.field] = input.value;
    }

    // Process based on input type and current state
    switch (input.type) {
      case 'api_key':
        return this.handleApiKeyInput(input.value as string);

      case 'option':
        return this.handleOptionSelect(input.value as string);

      case 'confirmation':
        return this.handleConfirmation(input.value as boolean);

      case 'message':
        return this.handleFreeformMessage(input.value as string, input.field);

      default:
        return this.session.messages;
    }
  }

  /**
   * Handle API key input
   */
  private async handleApiKeyInput(apiKey: string): Promise<AgentMessage[]> {
    if (!apiKey || apiKey.trim().length === 0) {
      this.addMessage('error', 'Please provide a valid API key.');
      return this.session.messages;
    }

    this.addMessage('user', '••••••••' + apiKey.slice(-4)); // Show masked key

    // Store API key
    this.session.userInputs['apiKey'] = apiKey;

    // Update config with auth
    if (this.session.bestMatch) {
      const config = this.session.bestMatch.discoveredConfig;
      const authHeader = this.getAuthHeader(config, apiKey);

      this.addMessage('status', 'Testing with authentication...', { phase: 'confirming' });

      // Re-run verification with auth
      const verified = await this.verifyConfiguration(config, authHeader);

      if (verified) {
        const verifiedConfig = {
          ...config,
          headers: { ...config.headers, ...authHeader },
          auth: {
            type: config.auth?.type || 'api_key',
            location: 'header',
            headerName: Object.keys(authHeader)[0],
          },
        } satisfies DiscoveredConfig;

        this.session.verified = true;
        this.session.finalConfig = verifiedConfig;
        this.session.bestMatch = {
          ...this.session.bestMatch,
          discoveredConfig: verifiedConfig,
        };
        this.session.phase = 'complete';

        this.addMessage('success', 'Authentication successful! Configuration verified.');
        this.addMessage('info', 'Ready to apply this configuration?', {
          options: [
            { id: 'apply', label: 'Apply configuration', value: 'apply', primary: true },
            { id: 'edit', label: 'Edit first', value: 'edit' },
          ],
        });
      } else {
        this.addMessage('error', 'Authentication failed. Please check your API key.');
        this.addMessage('info', '', {
          inputRequest: {
            type: 'api_key',
            prompt: 'Try a different API key:',
            field: 'apiKey',
            sensitive: true,
          },
          options: [
            { id: 'retry', label: 'Try again', value: 'retry', primary: true },
            { id: 'diff_auth', label: 'Use different auth method', value: 'diff_auth' },
          ],
        });
      }
    }

    return this.session.messages;
  }

  /**
   * Handle option selection
   */
  private async handleOptionSelect(optionId: string): Promise<AgentMessage[]> {
    this.addMessage('user', `Selected: ${optionId}`);

    switch (optionId) {
      case 'apply':
        return this.applyConfiguration();

      case 'retry':
        return this.startDiscovery();

      case 'have_key':
        this.addMessage('info', '', {
          inputRequest: {
            type: 'api_key',
            prompt: 'Enter your API key:',
            field: 'apiKey',
            sensitive: true,
          },
        });
        break;

      case 'no_key':
        this.addMessage(
          'info',
          "You'll need an API key to use this endpoint. Check the service's documentation for how to obtain one.",
        );
        break;

      case 'openai':
        this.session.bestMatch = {
          strategyId: 'openai_compatible',
          confidence: 0.9,
          discoveredConfig: this.normalizeConfigForBaseUrl(
            getBaseConfigForStrategy('openai_compatible'),
          ),
          evidence: ['User indicated OpenAI-compatible'],
        };
        this.addMessage('info', 'Using OpenAI-compatible format. Do you have an API key?', {
          inputRequest: {
            type: 'api_key',
            prompt: 'Enter your API key:',
            field: 'apiKey',
            sensitive: true,
          },
          options: [
            { id: 'have_key', label: 'Yes', value: 'have_key', primary: true },
            { id: 'no_auth', label: 'No auth needed', value: 'no_auth' },
          ],
        });
        break;

      case 'anthropic':
        this.session.bestMatch = {
          strategyId: 'anthropic_compatible',
          confidence: 0.9,
          discoveredConfig: this.normalizeConfigForBaseUrl(
            getBaseConfigForStrategy('anthropic_compatible'),
          ),
          evidence: ['User indicated Anthropic-compatible'],
        };
        this.addMessage('info', 'Using Anthropic-compatible format. Do you have an API key?', {
          inputRequest: {
            type: 'api_key',
            prompt: 'Enter your API key:',
            field: 'apiKey',
            sensitive: true,
          },
          options: [
            { id: 'have_key', label: 'Yes', value: 'have_key', primary: true },
            { id: 'no_auth', label: 'No auth needed', value: 'no_auth' },
          ],
        });
        break;

      case 'azure':
        this.addMessage('info', 'What is the Azure OpenAI deployment name?', {
          inputRequest: {
            type: 'text',
            prompt: 'Enter the deployment name configured in Azure OpenAI:',
            field: 'azureDeployment',
            placeholder: 'my-gpt4o-deployment',
          },
        });
        break;

      case 'example':
      case 'custom':
      case 'manual':
        this.addMessage(
          'info',
          'Can you show me an example of how to call this API? Include the request body format and what the response looks like.',
          {
            inputRequest: {
              type: 'text',
              prompt: 'Paste an example request or describe the format:',
              field: 'customFormat',
            },
          },
        );
        break;

      case 'diff_auth':
        if (!this.session.bestMatch) {
          this.addMessage('error', 'No detected API format is available to configure.');
          break;
        }
        this.addMessage('info', 'Which HTTP header carries the API key or token?', {
          inputRequest: {
            type: 'text',
            prompt: 'Enter the authentication header name:',
            field: 'customAuthHeader',
            placeholder: 'X-API-Key',
          },
        });
        break;

      case 'test': {
        const config = this.session.finalConfig || this.session.bestMatch?.discoveredConfig;
        if (!config) {
          this.addMessage('error', 'No configuration is available to test.');
          break;
        }
        this.addMessage('status', 'Running another test request...', { phase: 'confirming' });
        const verified = await this.verifyConfiguration(config);
        if (verified) {
          this.session.verified = true;
          this.session.finalConfig = cloneValue(config);
          this.session.phase = 'complete';
          this.addMessage('success', 'The configuration passed another test request.');
          this.addMessage('info', 'Ready to apply this configuration?', {
            options: [
              { id: 'apply', label: 'Apply configuration', value: 'apply', primary: true },
              { id: 'test', label: 'Run another test', value: 'test' },
            ],
          });
        } else {
          this.session.verified = false;
          this.addMessage('error', 'The additional test request failed.');
        }
        break;
      }

      case 'no_auth':
        // Try without auth
        if (this.session.bestMatch) {
          this.addMessage('status', 'Testing without authentication...', { phase: 'confirming' });
          const verified = await this.verifyConfiguration(this.session.bestMatch.discoveredConfig);
          if (verified) {
            this.session.verified = true;
            this.session.finalConfig = cloneValue(this.session.bestMatch.discoveredConfig);
            this.session.phase = 'complete';
            this.addMessage('success', 'Configuration verified!');
            this.addMessage('info', 'Ready to apply?', {
              options: [
                { id: 'apply', label: 'Apply configuration', value: 'apply', primary: true },
              ],
            });
          } else {
            this.addMessage('error', 'Request failed. This endpoint might require authentication.');
          }
        }
        break;

      case 'skip':
        // Use config anyway despite verification failure
        if (this.session.bestMatch) {
          this.session.finalConfig = cloneValue(this.session.bestMatch.discoveredConfig);
          this.session.phase = 'complete';
          this.addMessage(
            'info',
            'Using configuration without verification. Note: The endpoint might not respond as expected.',
          );
          this.addMessage('success', 'Configuration ready to apply.', {
            options: [
              { id: 'apply', label: 'Apply configuration', value: 'apply', primary: true },
              { id: 'edit', label: 'Edit first', value: 'edit' },
            ],
          });
        } else {
          this.addMessage('error', 'No configuration to skip to.');
        }
        break;

      case 'edit':
        this.addMessage(
          'info',
          'What would you like to change? You can describe the API format or provide an example request.',
          {
            inputRequest: {
              type: 'text',
              prompt: 'Describe the changes or paste an example:',
              field: 'editRequest',
            },
          },
        );
        break;

      default:
        this.addMessage('info', `I'll help you with that. What would you like to do next?`);
    }

    return this.session.messages;
  }

  /**
   * Handle confirmation
   */
  private async handleConfirmation(confirmed: boolean): Promise<AgentMessage[]> {
    if (confirmed && this.session.finalConfig) {
      return this.applyConfiguration();
    }
    return this.session.messages;
  }

  /**
   * Handle freeform message
   */
  private async handleFreeformMessage(message: string, field?: string): Promise<AgentMessage[]> {
    if (field === 'azureDeployment') {
      return this.handleAzureDeployment(message);
    }

    if (field === 'customAuthHeader') {
      const headerName = message.trim();
      if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(headerName)) {
        this.addMessage('error', 'Enter a valid HTTP header name without a colon.');
        return this.session.messages;
      }
      if (!this.session.bestMatch) {
        this.addMessage('error', 'No detected API format is available to configure.');
        return this.session.messages;
      }
      this.session.bestMatch = {
        ...this.session.bestMatch,
        discoveredConfig: {
          ...this.session.bestMatch.discoveredConfig,
          auth: { type: 'api_key', location: 'header', headerName },
        },
      };
      this.addMessage('info', '', {
        inputRequest: {
          type: 'api_key',
          prompt: `Enter the value for ${headerName}:`,
          field: 'apiKey',
          sensitive: true,
        },
      });
      return this.session.messages;
    }

    // Simple keyword detection for common requests
    const lower = message.toLowerCase();

    if (lower.includes('api key') || lower.includes('apikey') || lower.includes('auth')) {
      this.addMessage('info', '', {
        inputRequest: {
          type: 'api_key',
          prompt: 'Enter your API key:',
          field: 'apiKey',
          sensitive: true,
        },
      });
    } else if (
      lower.includes('try again') ||
      lower.includes('retry') ||
      lower.includes('restart')
    ) {
      return this.startDiscovery();
    } else if (lower.includes('help')) {
      this.addMessage(
        'info',
        'I can help you configure your API endpoint. You can:\n- Provide an API key\n- Tell me the API format (OpenAI, Anthropic, custom)\n- Show me an example request\n- Ask me to retry the discovery',
      );
    } else {
      // Store as potential hint for configuration
      this.session.userInputs['userHint'] = message;
      this.addMessage(
        'info',
        "Thanks for that information. I'll keep it in mind. What would you like to do next?",
        {
          options: [
            { id: 'retry', label: 'Retry discovery', value: 'retry', primary: true },
            { id: 'manual', label: 'Configure manually', value: 'manual' },
          ],
        },
      );
    }

    return this.session.messages;
  }

  /**
   * Apply the discovered configuration
   */
  private async applyConfiguration(): Promise<AgentMessage[]> {
    if (!this.session.finalConfig) {
      this.addMessage('error', 'No configuration to apply.');
      return this.session.messages;
    }

    this.addMessage(
      'success',
      'Configuration applied! You can now proceed with your red team setup.',
    );

    return this.session.messages;
  }

  /**
   * Get auth header based on config and key
   */
  private getAuthHeader(config: DiscoveredConfig, apiKey: string): Record<string, string> {
    const auth = config.auth;
    const apiType = config.apiType;

    // Handle explicit auth configuration
    if (auth?.headerName) {
      if (auth.headerName.toLowerCase() === 'authorization' && auth.type === 'bearer') {
        return {
          [auth.headerName]: /^bearer\s+/i.test(apiKey) ? apiKey : `Bearer ${apiKey}`,
        };
      }
      return { [auth.headerName]: apiKey };
    }

    if (auth?.type === 'bearer') {
      return { Authorization: `Bearer ${apiKey}` };
    }

    // Default based on API type
    if (apiType === 'anthropic_compatible') {
      return { 'x-api-key': apiKey };
    }

    if (apiType === 'azure_openai') {
      return { 'api-key': apiKey };
    }

    // OpenAI and others use Bearer token
    return { Authorization: `Bearer ${apiKey}` };
  }

  /**
   * Verify a configuration works by sending a test request
   */
  private async verifyConfiguration(
    config: DiscoveredConfig,
    extraHeaders?: Record<string, string>,
  ): Promise<boolean> {
    try {
      const url = this.resolveRequestUrl(config.path);

      // Build test body with a simple prompt
      const body = this.buildTestBody(config, 'Say "hello" and nothing else.');

      const response = await this.fetchWithTimeout(url, {
        method: config.method,
        headers: {
          ...config.headers,
          ...extraHeaders,
        },
        body: JSON.stringify(body),
        signal: this.abortController?.signal,
      });

      if (!response.ok) {
        logger.debug('[ConfigAgent] Verification failed', {
          status: response.status,
          statusText: response.statusText,
        });
        return false;
      }

      const responseText = await response.text();
      let responseJson: unknown;

      try {
        responseJson = JSON.parse(responseText);
      } catch {
        // Response is not JSON
        return responseText.length > 0;
      }

      // Try to extract response using the transform
      const extracted = this.extractResponse(responseJson, config.transformResponse);
      return extracted !== null && extracted !== undefined && String(extracted).length > 0;
    } catch (error) {
      logger.debug('[ConfigAgent] Verification error', { error });
      return false;
    }
  }

  /**
   * Build a test request body
   */
  private buildTestBody(config: DiscoveredConfig, prompt: string): unknown {
    const body = config.body;

    if (typeof body === 'object' && body !== null) {
      return renderTemplateValue(body, {
        prompt,
        model: config.defaultModel || 'gpt-4',
      });
    }

    return body;
  }

  /**
   * Extract response using a transform expression
   */
  private extractResponse(json: unknown, transform: string): unknown {
    try {
      // Simple path extraction (e.g., "json.choices[0].message.content")
      const path = transform.replace(/^json\.?/, '');
      if (!path) {
        return json;
      }

      let current: unknown = json;
      const parts = path.match(/([^.\[\]]+|\[\d+\])/g) || [];

      for (const part of parts) {
        if (current === null || current === undefined) {
          return null;
        }

        if (part.startsWith('[') && part.endsWith(']')) {
          // Array index
          const index = parseInt(part.slice(1, -1), 10);
          if (Array.isArray(current)) {
            current = current[index];
          } else {
            return null;
          }
        } else {
          // Object key
          if (typeof current === 'object') {
            current = (current as Record<string, unknown>)[part];
          } else {
            return null;
          }
        }
      }

      return current;
    } catch {
      return null;
    }
  }

  /**
   * Run a set of probes against the target
   */
  private async runProbes(probes: Probe[]): Promise<ProbeResult[]> {
    const results: ProbeResult[] = [];

    for (const probe of probes) {
      if (this.abortController?.signal.aborted) {
        break;
      }

      try {
        const url = this.resolveRequestUrl(probe.path);

        const start = Date.now();

        const response = await this.fetchWithTimeout(url, {
          method: probe.method,
          headers: probe.headers,
          body: probe.body ? JSON.stringify(probe.body) : undefined,
          signal: this.abortController?.signal,
        });

        const timing = Date.now() - start;
        const body = await response.text();

        let json: unknown = null;
        try {
          json = JSON.parse(body);
        } catch {
          // Not JSON
        }

        results.push({
          probeId: probe.id,
          probe,
          status: response.status,
          headers: Object.fromEntries(response.headers),
          body,
          json,
          timing: { total: timing },
          error: null,
        });
      } catch (error) {
        results.push({
          probeId: probe.id,
          probe,
          status: null,
          headers: {},
          body: '',
          json: null,
          timing: { total: 0 },
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return results;
  }

  /**
   * Fetch with timeout
   */
  private async fetchWithTimeout(
    url: string,
    options: RequestInit,
    timeout = DEFAULT_TIMEOUT,
  ): Promise<Response> {
    await this.assertUrlAllowed(url);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    const signal = options.signal
      ? AbortSignal.any([options.signal, controller.signal])
      : controller.signal;

    try {
      const fetchOptions = {
        ...options,
        dispatcher: guardedFetchDispatcher,
        redirect: 'manual' as const,
        signal,
      };
      const response = await fetchWithProxy(url, fetchOptions);
      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private getDiscoveryStrategies(): DiscoveryStrategy[] {
    const deployment = getAzureDeploymentFromPath(this.session.baseUrl);
    const apiVersion = new URL(this.session.baseUrl).searchParams.get('api-version') || undefined;

    return ALL_STRATEGIES.flatMap((strategy) => {
      if (strategy.id !== 'azure_openai') {
        return [strategy];
      }
      return deployment ? [createAzureOpenaiStrategy(deployment, apiVersion)] : [];
    });
  }

  private async handleAzureDeployment(deploymentInput: string): Promise<AgentMessage[]> {
    const deployment = deploymentInput.trim();
    if (!deployment || deployment.includes('/')) {
      this.addMessage('error', 'Enter a valid Azure deployment name.');
      return this.session.messages;
    }

    this.session.userInputs['azureDeployment'] = deployment;
    const strategy = createAzureOpenaiStrategy(deployment);
    this.addMessage('status', `Testing Azure deployment ${deployment}...`, {
      phase: 'probing',
      strategyId: strategy.id,
    });
    const results = await this.runProbes(strategy.probes);
    this.session.triedStrategies.push(strategy.id);
    this.session.probeHistory.push(...results);
    const match = analyzeProbeResults(strategy.id, results);

    if (match && match.confidence >= strategy.minConfidence) {
      const normalizedMatch = this.normalizeStrategyMatch(match);
      this.session.bestMatch = normalizedMatch;
      this.session.phase = 'analyzing';
      await this.handleMatchFound(normalizedMatch, results);
      return this.session.messages;
    }

    if (match && results.some((result) => result.status === 401 || result.status === 403)) {
      const normalizedMatch = this.normalizeStrategyMatch(match);
      this.session.bestMatch = normalizedMatch;
      this.session.phase = 'analyzing';
      await this.handleAuthRequired(normalizedMatch, results);
      return this.session.messages;
    }

    this.addMessage('error', `Could not verify Azure deployment ${deployment}.`);
    return this.session.messages;
  }

  private normalizeStrategyMatch(match: StrategyMatch): StrategyMatch {
    return {
      ...match,
      discoveredConfig: this.normalizeConfigForBaseUrl(match.discoveredConfig),
    };
  }

  private normalizeConfigForBaseUrl(config: DiscoveredConfig): DiscoveredConfig {
    if (!config.path || !this.baseUrlAlreadyIncludesPath(config.path)) {
      return config;
    }
    return { ...config, path: undefined };
  }

  private baseUrlAlreadyIncludesPath(path: string): boolean {
    const base = new URL(this.session.baseUrl);
    const requested = new URL(path, base.origin);
    const normalizePathname = (pathname: string) => pathname.replace(/\/+$/, '') || '/';

    if (normalizePathname(base.pathname) !== normalizePathname(requested.pathname)) {
      return false;
    }

    return [...requested.searchParams.entries()].every(([key, value]) =>
      base.searchParams.getAll(key).includes(value),
    );
  }

  private resolveRequestUrl(path?: string): string {
    if (!path) {
      return this.session.baseUrl;
    }

    const base = new URL(this.session.baseUrl);
    const requested = new URL(path, base.origin);
    const normalizePathname = (pathname: string) => pathname.replace(/\/+$/, '') || '/';

    if (normalizePathname(base.pathname) === normalizePathname(requested.pathname)) {
      for (const [key, value] of requested.searchParams) {
        if (!base.searchParams.has(key)) {
          base.searchParams.append(key, value);
        }
      }
      return base.toString();
    }

    const knownEndpointPatterns = [
      /\/v1\/chat\/completions$/,
      /\/v1\/messages$/,
      /\/openai\/deployments\/[^/]+\/chat\/completions$/,
    ];
    const endpointPattern = knownEndpointPatterns.find((pattern) => pattern.test(base.pathname));
    if (endpointPattern) {
      const prefix = base.pathname.replace(endpointPattern, '');
      base.pathname = `${prefix}${requested.pathname}`.replace(/\/+/g, '/');
    } else {
      base.pathname = `${base.pathname.replace(/\/+$/, '')}/${requested.pathname.replace(
        /^\/+/,
        '',
      )}`.replace(/\/+/g, '/');
    }

    for (const [key, value] of requested.searchParams) {
      base.searchParams.set(key, value);
    }
    return base.toString();
  }

  /**
   * Get display name for strategy
   */
  private getStrategyDisplayName(strategyId: string): string {
    const strategy = ALL_STRATEGIES.find((s) => s.id === strategyId);
    return strategy?.name || strategyId;
  }

  /**
   * Cancel the current operation
   */
  cancel(): void {
    this.abortController?.abort();
    this.addMessage('info', 'Discovery cancelled.');
  }

  /**
   * Get the final configuration (if verified)
   */
  getFinalConfig(): DiscoveredConfig | null {
    return this.session.finalConfig ? cloneValue(this.session.finalConfig) : null;
  }

  /**
   * Check if discovery is complete
   */
  isComplete(): boolean {
    return this.session.phase === 'complete' && this.session.verified;
  }
}
