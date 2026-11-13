import logger from '../logger';

import type { ApiProvider } from '../types/providers';

/**
 * Formats config body for troubleshooting display
 */
export function formatConfigBody({ body }: { body: unknown }): string {
  if (!body) {
    return 'None configured';
  }

  try {
    // Try to parse and pretty-print JSON strings
    // If it's already an object, stringify it
    const parsed = typeof body === 'string' ? JSON.parse(body) : body;
    return (
      '\n' +
      JSON.stringify(parsed, null, 2)
        .split('\n')
        .map((line) => `    ${line}`)
        .join('\n')
    );
  } catch (error) {
    if (typeof body === 'string') {
      // If not JSON, just indent it
      return '\n    ' + body;
    }
    throw error;
  }
}

/**
 * Formats config headers for troubleshooting display
 */
export function formatConfigHeaders({
  headers,
}: {
  headers: Record<string, unknown> | undefined;
}): string {
  if (!headers) {
    return 'None configured';
  }

  const headerLines = Object.entries(headers)
    .map(([key, value]) => `    ${key}: ${value}`)
    .join('\n');
  return `\n${headerLines}`;
}

/**
 * Validates session configuration for both client and server sessions
 * Logs warnings if configuration looks invalid but does not prevent test execution
 */
export function validateSessionConfig({
  provider,
  sessionSource,
  sessionConfig,
}: {
  provider: ApiProvider;
  sessionSource: string;
  sessionConfig?: { sessionSource?: string; sessionParser?: string };
}): void {
  const configStr = JSON.stringify(provider.config || {});
  const hasSessionIdTemplate = configStr.includes('{{sessionId}}');

  // Both client and server sessions require {{sessionId}} in the config
  if (!hasSessionIdTemplate) {
    const reasonMessage =
      sessionSource === 'client'
        ? 'When using client-side sessions, you should include {{sessionId}} in your request headers or body to send the client-generated session ID.'
        : 'When using server-side or endpoint sessions, you should include {{sessionId}} in your request headers or body to send the session ID in subsequent requests.';

    logger.warn(
      '[testProviderSession] Warning: {{sessionId}} not found in provider configuration. ' +
        reasonMessage,
      {
        providerId: provider.id,
        sessionSource,
      },
    );
  }

  // Server sessions additionally require a sessionParser
  if (sessionSource === 'server') {
    const sessionParser = sessionConfig?.sessionParser || provider.config?.sessionParser;

    if (!sessionParser || sessionParser.trim() === '') {
      logger.warn(
        '[testProviderSession] Warning: Session source is server but no session parser configured. ' +
          'When using server-side sessions, you should configure a session parser to extract the session ID from the response.',
        {
          providerId: provider.id,
        },
      );
    }
  }
}

/**
 * Determines the effective session source based on config and defaults
 */
export function determineEffectiveSessionSource({
  provider,
  sessionConfig,
}: {
  provider: ApiProvider;
  sessionConfig?: { sessionSource?: string; sessionParser?: string };
}): string {
  return (
    sessionConfig?.sessionSource ||
    provider.config?.sessionSource ||
    (provider.config?.sessionParser ? 'server' : 'client')
  );
}
