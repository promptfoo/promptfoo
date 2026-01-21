/**
 * Centralized authentication manager for Google AI providers.
 *
 * This module handles authentication for both Google AI Studio and Vertex AI,
 * with support for API keys, OAuth/ADC, and service account credentials.
 *
 * Environment variable priority is aligned with the Python SDK:
 * 1. config.apiKey (explicit)
 * 2. VERTEX_API_KEY (Vertex mode only)
 * 3. GOOGLE_API_KEY (primary - Python SDK alignment)
 * 4. GEMINI_API_KEY (secondary)
 */

import { getEnvString } from '../../envars';
import logger from '../../logger';
import { maybeLoadFromExternalFile } from '../../util/file';
import type { GoogleAuthOptions } from 'google-auth-library';

import type { EnvOverrides } from '../../types/env';
import type { CompletionOptions } from './types';

/**
 * Configuration for Google authentication
 */
export interface GoogleAuthConfig {
  /** API key for Google AI Studio or Vertex AI express mode */
  apiKey?: string;
  /** Service account credentials (JSON string or file:// path) */
  credentials?: string;
  /** Google Cloud project ID */
  projectId?: string;
  /** Google Cloud region for Vertex AI */
  region?: string;
  /** Whether to use Vertex AI mode */
  vertexai?: boolean;
  /** Google auth library options passthrough */
  googleAuthOptions?: Partial<GoogleAuthOptions>;
  /** Path to service account key file */
  keyFilename?: string;
  /** Custom OAuth scopes */
  scopes?: string | string[];
  /**
   * Control mutual exclusivity validation behavior.
   * When true: Throws an error if both apiKey AND projectId/region are explicitly set.
   * When false (default): Only warns about conflicts for backward compatibility.
   * @default false
   */
  strictMutualExclusivity?: boolean;
}

/**
 * Options for creating OAuth client
 */
export interface OAuthClientOptions {
  /** Service account credentials (JSON string or file:// path) */
  credentials?: string;
  /** Google auth library options passthrough */
  googleAuthOptions?: Partial<GoogleAuthOptions>;
  /** Custom OAuth scopes */
  scopes?: string | string[];
  /** Path to service account key file */
  keyFilename?: string;
}

/**
 * Result of API key resolution
 */
export interface ApiKeyResult {
  /** The resolved API key, or undefined if not found */
  apiKey: string | undefined;
  /** The source of the API key for debugging */
  source:
    | 'config'
    | 'VERTEX_API_KEY'
    | 'GOOGLE_API_KEY'
    | 'GEMINI_API_KEY'
    | 'PALM_API_KEY'
    | 'none';
}

/**
 * Centralized authentication manager for Google AI providers.
 *
 * Handles:
 * - API key resolution with proper priority
 * - OAuth client creation for Vertex AI
 * - Service account credential loading
 * - Conflict detection and warnings
 */
export class GoogleAuthManager {
  /**
   * Get API key with proper priority order.
   *
   * Priority (aligned with Python SDK):
   * 1. config.apiKey (explicit)
   * 2. VERTEX_API_KEY (Vertex mode only)
   * 3. GOOGLE_API_KEY (primary - Python SDK alignment)
   * 4. GEMINI_API_KEY (secondary)
   * 5. PALM_API_KEY (legacy)
   *
   * @param config - Provider configuration
   * @param env - Environment overrides
   * @param isVertexMode - Whether in Vertex AI mode
   * @returns The resolved API key and its source
   */
  static getApiKey(
    config: CompletionOptions,
    env?: EnvOverrides,
    isVertexMode: boolean = false,
  ): ApiKeyResult {
    // 1. Explicit config always wins
    if (config.apiKey) {
      return { apiKey: config.apiKey, source: 'config' };
    }

    // 2. Vertex-specific API key (only in Vertex mode) - deprecated, not in SDK
    if (isVertexMode) {
      const vertexKey = env?.VERTEX_API_KEY || getEnvString('VERTEX_API_KEY');
      if (vertexKey) {
        logger.warn(
          '[Google] VERTEX_API_KEY is not a standard SDK env var. Use GOOGLE_API_KEY instead.',
        );
        return { apiKey: vertexKey, source: 'VERTEX_API_KEY' };
      }
    }

    // 3. GOOGLE_API_KEY (primary - SDK aligned)
    const googleKey = env?.GOOGLE_API_KEY || getEnvString('GOOGLE_API_KEY');

    // 4. GEMINI_API_KEY (secondary - not in SDK, for backward compatibility)
    const geminiKey = env?.GEMINI_API_KEY || getEnvString('GEMINI_API_KEY');

    // 5. PALM_API_KEY (legacy, AI Studio only - deprecated)
    const palmKey = isVertexMode ? undefined : env?.PALM_API_KEY || getEnvString('PALM_API_KEY');

    // SDK alignment: note when both GOOGLE_API_KEY and GEMINI_API_KEY are set
    // This is not an error - GOOGLE_API_KEY correctly takes precedence (SDK-aligned)
    if (googleKey && geminiKey) {
      logger.debug(
        '[Google] Both GOOGLE_API_KEY and GEMINI_API_KEY are set. Using GOOGLE_API_KEY.',
      );
    }

    if (googleKey) {
      return { apiKey: googleKey, source: 'GOOGLE_API_KEY' };
    }

    if (geminiKey) {
      logger.debug(
        '[Google] GEMINI_API_KEY is not a standard SDK env var. Consider using GOOGLE_API_KEY.',
      );
      return { apiKey: geminiKey, source: 'GEMINI_API_KEY' };
    }

    if (palmKey) {
      logger.warn('[Google] PALM_API_KEY is deprecated. Use GOOGLE_API_KEY instead.');
      return { apiKey: palmKey, source: 'PALM_API_KEY' };
    }

    return { apiKey: undefined, source: 'none' };
  }

  /**
   * Validate authentication configuration and emit warnings or throw errors for issues.
   *
   * @param config - Authentication configuration
   * @param env - Environment overrides
   * @throws Error if strictMutualExclusivity is true and mutual exclusivity violation detected
   */
  static validateAndWarn(config: GoogleAuthConfig, env?: EnvOverrides): void {
    const { apiKey, credentials, projectId, region, vertexai, strictMutualExclusivity } = config;

    // Default to permissive mode (backward compatible)
    const isStrict = strictMutualExclusivity === true;

    // Check for Python SDK environment variables
    const useVertexEnv = getEnvString('GOOGLE_GENAI_USE_VERTEXAI');
    const cloudProject = getEnvString('GOOGLE_CLOUD_PROJECT');

    // SDK alignment: project/location and apiKey are mutually exclusive
    // Only applies to explicit config values, not env vars (matching SDK behavior)
    if ((projectId || region) && apiKey) {
      const message =
        '[Google] Project/location and API key are mutually exclusive in the client initializer. ' +
        'Use either apiKey for express mode OR projectId/region for OAuth mode, not both.';
      if (isStrict) {
        throw new Error(message);
      } else {
        logger.warn(message);
      }
    }

    // Warn if Python SDK env vars are set but not being used
    if (useVertexEnv && vertexai === false) {
      logger.warn(
        '[Google] GOOGLE_GENAI_USE_VERTEXAI is set but vertexai: false was specified in config. ' +
          'Config takes precedence.',
      );
    }

    if (cloudProject && projectId && cloudProject !== projectId) {
      logger.warn(
        '[Google] Both GOOGLE_CLOUD_PROJECT and config.projectId are set with different values. ' +
          'Using config.projectId.',
      );
    }

    // Check for conflicting auth methods (apiKey + credentials)
    // When both are set, API key takes precedence (express mode is automatic)
    if (apiKey && credentials) {
      logger.debug(
        '[Google] Both apiKey and credentials are set. Using API key (express mode). ' +
          'Set expressMode: false to use OAuth/ADC instead.',
      );
    }

    // Vertex mode requires either API key or project ID
    if (vertexai && !apiKey && !projectId && !cloudProject && !credentials) {
      const hasAdc = Boolean(
        env?.GOOGLE_APPLICATION_CREDENTIALS || process.env.GOOGLE_APPLICATION_CREDENTIALS,
      );
      if (!hasAdc) {
        logger.debug(
          '[Google] Vertex AI mode enabled but no projectId, credentials, or ADC detected. ' +
            'Authentication may fail.',
        );
      }
    }
  }

  /**
   * Determine if Vertex AI mode should be used.
   *
   * Priority:
   * 1. Explicit vertexai config flag
   * 2. GOOGLE_GENAI_USE_VERTEXAI env var (Python SDK compatibility)
   * 3. Auto-detect from projectId/credentials presence
   * 4. Default: false (Google AI Studio)
   *
   * @param config - Provider configuration
   * @param env - Environment overrides
   * @returns Whether to use Vertex AI mode
   */
  static determineVertexMode(
    config: CompletionOptions & { vertexai?: boolean },
    env?: EnvOverrides,
  ): boolean {
    // 1. Explicit config flag takes precedence
    if (config.vertexai !== undefined) {
      return config.vertexai;
    }

    // 2. Python SDK env var
    const useVertexEnv = getEnvString('GOOGLE_GENAI_USE_VERTEXAI');
    if (useVertexEnv === 'true' || useVertexEnv === '1') {
      logger.debug('[Google] Vertex AI mode enabled via GOOGLE_GENAI_USE_VERTEXAI');
      return true;
    }
    if (useVertexEnv === 'false' || useVertexEnv === '0') {
      return false;
    }

    // 3. Auto-detect from config/env (explicit project/credentials suggests Vertex)
    const hasProjectId = Boolean(
      config.projectId ||
        env?.VERTEX_PROJECT_ID ||
        getEnvString('VERTEX_PROJECT_ID') ||
        env?.GOOGLE_PROJECT_ID ||
        getEnvString('GOOGLE_PROJECT_ID') ||
        getEnvString('GOOGLE_CLOUD_PROJECT'),
    );
    const hasCredentials = Boolean(config.credentials);

    if (hasProjectId || hasCredentials) {
      logger.debug(
        '[Google] Auto-detected Vertex AI mode from projectId/credentials. ' +
          'Set vertexai: true/false explicitly to suppress this message.',
      );
      return true;
    }

    // 4. Default: Google AI Studio mode
    return false;
  }

  /**
   * Load credentials from file or return as-is.
   *
   * Supports:
   * - file:// prefix to load from external file
   * - Raw JSON string
   * - Pre-parsed object (from config loading pipeline)
   *
   * @param credentials - Credentials string, file path, or pre-parsed object
   * @returns Processed credentials JSON string
   */
  static loadCredentials(credentials?: string | object): string | undefined {
    if (!credentials) {
      return undefined;
    }

    // If credentials is already an object (e.g., parsed by config loading pipeline
    // when processing file:// paths to JSON files), convert it to a JSON string
    if (typeof credentials === 'object') {
      return JSON.stringify(credentials);
    }

    if (credentials.startsWith('file://')) {
      try {
        const loaded = maybeLoadFromExternalFile(credentials);
        // maybeLoadFromExternalFile returns parsed object for JSON files,
        // but we need a JSON string for the Google Auth library
        if (typeof loaded === 'object') {
          return JSON.stringify(loaded);
        }
        return loaded as string;
      } catch (error) {
        throw new Error(`Failed to load credentials from file: ${error}`);
      }
    }

    return credentials;
  }

  /**
   * Get or create a Google OAuth client.
   *
   * Supports googleAuthOptions passthrough for advanced configuration
   * like custom scopes, keyFilename, universeDomain, etc.
   *
   * @param options - OAuth client options (can also pass string for backward compatibility)
   * @returns OAuth client and detected project ID
   */
  static async getOAuthClient(
    options: OAuthClientOptions | string = {},
  ): Promise<{ client: any; projectId: string | undefined }> {
    // Handle backward compatibility: string argument means credentials
    const opts: OAuthClientOptions =
      typeof options === 'string' ? { credentials: options } : options;
    const { credentials, googleAuthOptions, scopes, keyFilename } = opts;

    // Determine scopes: explicit > googleAuthOptions > default
    const resolvedScopes =
      scopes ?? googleAuthOptions?.scopes ?? 'https://www.googleapis.com/auth/cloud-platform';

    // Build merged auth options
    const authOptions: Partial<GoogleAuthOptions> = {
      ...googleAuthOptions,
      scopes: resolvedScopes,
    };

    // Handle keyFilename (deprecated but functional)
    if (keyFilename && !authOptions.keyFilename) {
      authOptions.keyFilename = keyFilename;
    }

    // Import google-auth-library
    let GoogleAuthClass;
    try {
      const importedModule = await import('google-auth-library');
      GoogleAuthClass = importedModule.GoogleAuth;
    } catch {
      throw new Error(
        'The google-auth-library package is required for Vertex AI. ' +
          'Please install it: npm install google-auth-library',
      );
    }

    // Create auth instance with merged options
    const auth = new GoogleAuthClass(authOptions);

    // Handle explicit credentials
    const processedCredentials = this.loadCredentials(credentials);

    let client;
    if (processedCredentials) {
      let parsedCredentials;
      try {
        parsedCredentials = JSON.parse(processedCredentials);
      } catch (parseError) {
        const errorMsg = parseError instanceof Error ? parseError.message : String(parseError);
        throw new Error(`[Google] Invalid credentials JSON format: ${errorMsg}`);
      }

      try {
        client = await auth.fromJSON(parsedCredentials);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        logger.error(`[Google] Could not load credentials: ${errorMsg}`);
        throw new Error(`[Google] Could not load credentials: ${errorMsg}`);
      }
    } else {
      client = await auth.getClient();
    }

    // Try to get project ID from Google Auth Library
    let projectId;
    try {
      projectId = await auth.getProjectId();
    } catch {
      // If Google Auth Library can't detect project ID,
      // let resolveProjectId handle the fallback logic
      projectId = undefined;
    }

    return { client, projectId };
  }

  /**
   * Resolve project ID from multiple sources.
   *
   * Priority:
   * 1. config.projectId
   * 2. VERTEX_PROJECT_ID env var
   * 3. GOOGLE_PROJECT_ID env var
   * 4. GOOGLE_CLOUD_PROJECT env var (Python SDK compatibility)
   * 5. Auto-detected from OAuth credentials
   *
   * @param config - Provider configuration
   * @param env - Environment overrides
   * @returns Resolved project ID
   */
  static async resolveProjectId(
    config: {
      projectId?: string;
      credentials?: string;
      googleAuthOptions?: Partial<GoogleAuthOptions>;
      keyFilename?: string;
      scopes?: string | string[];
    },
    env?: EnvOverrides,
  ): Promise<string> {
    const { projectId: authProjectId } = await this.getOAuthClient({
      credentials: config.credentials,
      googleAuthOptions: config.googleAuthOptions,
      keyFilename: config.keyFilename,
      scopes: config.scopes,
    });

    // Check for non-SDK env vars and warn
    const vertexProjectId = env?.VERTEX_PROJECT_ID || getEnvString('VERTEX_PROJECT_ID');
    const googleProjectId = env?.GOOGLE_PROJECT_ID || getEnvString('GOOGLE_PROJECT_ID');
    const cloudProject = getEnvString('GOOGLE_CLOUD_PROJECT');

    if (vertexProjectId && !config.projectId) {
      logger.debug(
        '[Google] VERTEX_PROJECT_ID is not a standard SDK env var. Consider using GOOGLE_CLOUD_PROJECT.',
      );
    }
    if (googleProjectId && !config.projectId && !vertexProjectId) {
      logger.debug(
        '[Google] GOOGLE_PROJECT_ID is not a standard SDK env var. Consider using GOOGLE_CLOUD_PROJECT.',
      );
    }

    return (
      config.projectId || vertexProjectId || googleProjectId || cloudProject || authProjectId || ''
    );
  }

  /**
   * Resolve region from multiple sources.
   *
   * Priority:
   * 1. config.region
   * 2. VERTEX_REGION env var
   * 3. GOOGLE_CLOUD_LOCATION env var (Python SDK compatibility)
   * 4. Default: 'global' for Vertex AI without API key (SDK aligned), 'us-central1' otherwise
   *
   * @param config - Provider configuration
   * @param env - Environment overrides
   * @param hasApiKey - Whether an API key is configured (affects default region)
   * @returns Resolved region
   */
  static resolveRegion(
    config: { region?: string },
    env?: EnvOverrides,
    hasApiKey?: boolean,
  ): string {
    // Check for non-SDK env vars
    const vertexRegion = env?.VERTEX_REGION || getEnvString('VERTEX_REGION');
    const cloudLocation = getEnvString('GOOGLE_CLOUD_LOCATION');

    if (vertexRegion && !config.region) {
      logger.debug(
        '[Google] VERTEX_REGION is not a standard SDK env var. Consider using GOOGLE_CLOUD_LOCATION.',
      );
    }

    const configuredRegion = config.region || vertexRegion || cloudLocation;

    if (configuredRegion) {
      return configuredRegion;
    }

    // SDK alignment: default to 'global' when Vertex AI mode without API key
    // This matches Google's official SDK behavior
    if (hasApiKey === false) {
      return 'global';
    }

    // Default for API key mode or when hasApiKey is undefined (backward compatibility)
    return 'us-central1';
  }

  /**
   * Check if Application Default Credentials are available.
   *
   * @returns True if ADC is available
   */
  static async hasDefaultCredentials(): Promise<boolean> {
    try {
      await this.getOAuthClient();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Clear the cached auth client (useful for testing).
   * @deprecated No longer uses instance-level caching; Google's auth library handles token caching internally.
   */
  static clearCache(): void {
    // No-op: Instance-level caching was removed. Token caching is handled
    // internally by google-auth-library (tokens are refreshed as needed).
    // This matches Google's official SDK behavior where each client instance
    // manages its own auth state.
  }
}

// Re-export for backwards compatibility with existing code that imports from util.ts
export const loadCredentials = GoogleAuthManager.loadCredentials.bind(GoogleAuthManager);
export const getGoogleClient = GoogleAuthManager.getOAuthClient.bind(GoogleAuthManager);
export const resolveProjectId = GoogleAuthManager.resolveProjectId.bind(GoogleAuthManager);
export const hasGoogleDefaultCredentials =
  GoogleAuthManager.hasDefaultCredentials.bind(GoogleAuthManager);
export const clearCachedAuth = GoogleAuthManager.clearCache.bind(GoogleAuthManager);

// Note: OAuthClientOptions is already exported as an interface above
