/**
 * Base class for Google AI providers.
 *
 * This abstract class provides shared functionality for both Google AI Studio
 * and Vertex AI providers, including:
 * - MCP (Model Context Protocol) client integration
 * - Function callback execution
 * - Tool normalization
 * - Resource cleanup
 *
 * Subclasses must implement:
 * - getApiEndpoint(): Returns the API endpoint URL
 * - getAuthHeaders(): Returns authentication headers
 * - callApi(): The main API call implementation
 */

import path from 'path';
import cliState from '../../cliState';
import { importModule } from '../../esm';
import logger from '../../logger';
import { isJavascriptFile } from '../../util/fileExtensions';
import { getNunjucksEngine } from '../../util/templates';
import { MCPClient } from '../mcp/client';
import { transformMCPToolsToGoogle } from '../mcp/transform';
import { REQUEST_TIMEOUT_MS } from '../shared';
import { GoogleAuthManager } from './auth';
import { normalizeTools } from './util';
import { maybeLoadToolsFromExternalFile } from '../../util/index';

import type { EnvOverrides } from '../../types/env';
import type {
  ApiProvider,
  CallApiContextParams,
  ProviderResponse,
} from '../../types/index';
import type { CompletionOptions, GoogleProviderConfig, Tool } from './types';

/**
 * Options for creating a Google provider instance.
 */
export interface GoogleProviderOptions {
  /** Provider configuration */
  config?: GoogleProviderConfig;
  /** Custom provider ID override */
  id?: string;
  /** Environment variable overrides */
  env?: EnvOverrides;
}

/**
 * Abstract base class for Google AI providers.
 *
 * Provides shared functionality for Google AI Studio and Vertex AI,
 * with abstract methods for endpoint and authentication that differ
 * between the two services.
 */
export abstract class GoogleGenericProvider implements ApiProvider {
  /** The model name (e.g., 'gemini-2.5-pro') */
  modelName: string;

  /** Provider configuration */
  config: GoogleProviderConfig;

  /** Environment variable overrides */
  env?: EnvOverrides;

  /** Whether this provider is in Vertex AI mode */
  protected isVertexMode: boolean;

  /** MCP client for tool integration */
  protected mcpClient: MCPClient | null = null;

  /** Promise that resolves when MCP initialization is complete */
  protected initializationPromise: Promise<void> | null = null;

  /** Cache of loaded function callbacks */
  protected loadedFunctionCallbacks: Record<string, Function> = {};

  /** Custom provider ID function */
  protected customId?: () => string;

  constructor(modelName: string, options: GoogleProviderOptions = {}) {
    const { config, id, env } = options;
    this.env = env;
    this.modelName = modelName;
    this.config = config || {};

    // Determine mode using auth manager
    this.isVertexMode = GoogleAuthManager.determineVertexMode(this.config, this.env);

    // Validate and warn about potential auth issues
    GoogleAuthManager.validateAndWarn(
      {
        apiKey: this.config.apiKey,
        credentials: this.config.credentials,
        projectId: this.config.projectId,
        region: this.config.region,
        vertexai: this.isVertexMode,
        googleAuthOptions: this.config.googleAuthOptions,
        keyFilename: this.config.keyFilename,
        scopes: this.config.scopes,
        strictMutualExclusivity: this.config.strictMutualExclusivity,
      },
      this.env,
    );

    // Custom ID support
    if (id) {
      this.customId = () => id;
    }

    // Initialize MCP if configured
    if (this.config.mcp?.enabled) {
      this.initializationPromise = this.initializeMCP();
    }
  }

  /**
   * Get the provider ID string.
   * Format: 'google:{model}' for AI Studio, 'vertex:{model}' for Vertex AI
   */
  id(): string {
    if (this.customId) {
      return this.customId();
    }
    return this.isVertexMode ? `vertex:${this.modelName}` : `google:${this.modelName}`;
  }

  /**
   * Get a string representation of the provider.
   */
  toString(): string {
    const service = this.isVertexMode ? 'Vertex AI' : 'Google AI Studio';
    return `[Google ${service} Provider ${this.modelName}]`;
  }

  /**
   * Get the API endpoint URL for requests.
   * Must be implemented by subclasses.
   */
  abstract getApiEndpoint(action?: string): string;

  /**
   * Get authentication headers for API requests.
   * Must be implemented by subclasses.
   *
   * @returns Headers object with authentication
   */
  abstract getAuthHeaders(): Promise<Record<string, string>>;

  /**
   * Make an API call with the given prompt.
   * Must be implemented by subclasses.
   */
  abstract callApi(prompt: string, context?: CallApiContextParams): Promise<ProviderResponse>;

  /**
   * Get the API key for this provider.
   * Applies Nunjucks rendering to support template variables.
   *
   * @returns The API key or undefined
   */
  getApiKey(): string | undefined {
    const { apiKey } = GoogleAuthManager.getApiKey(this.config, this.env, this.isVertexMode);
    if (apiKey) {
      return getNunjucksEngine().renderString(apiKey, {});
    }
    return undefined;
  }

  /**
   * Get the region for Vertex AI.
   *
   * @returns The region (default: 'global' for OAuth, 'us-central1' for API key)
   */
  getRegion(): string {
    const hasApiKey = Boolean(this.getApiKey());
    return GoogleAuthManager.resolveRegion(this.config, this.env, hasApiKey);
  }

  /**
   * Get the project ID for Vertex AI.
   *
   * @returns Promise resolving to the project ID
   */
  async getProjectId(): Promise<string> {
    return GoogleAuthManager.resolveProjectId(
      {
        projectId: this.config.projectId,
        credentials: this.config.credentials,
        googleAuthOptions: this.config.googleAuthOptions,
        keyFilename: this.config.keyFilename,
        scopes: this.config.scopes,
      },
      this.env,
    );
  }

  /**
   * Initialize the MCP client for tool integration.
   */
  protected async initializeMCP(): Promise<void> {
    if (!this.config.mcp) {
      return;
    }
    this.mcpClient = new MCPClient(this.config.mcp);
    await this.mcpClient.initialize();
  }

  /**
   * Get all tools for the request, combining MCP tools and config tools.
   *
   * @param context - Call context with variables
   * @returns Array of normalized tools
   */
  protected async getAllTools(context?: CallApiContextParams): Promise<Tool[]> {
    // Get MCP tools if client is available
    const mcpTools = this.mcpClient ? transformMCPToolsToGoogle(this.mcpClient.getAllTools()) : [];

    // Get tools from config (may be file reference)
    const configTools = this.config.tools;
    const fileTools = configTools
      ? await maybeLoadToolsFromExternalFile(configTools, context?.vars)
      : [];

    // Combine and normalize all tools
    const allTools = [
      ...mcpTools,
      ...(Array.isArray(fileTools) ? normalizeTools(fileTools) : fileTools ? [fileTools] : []),
    ];

    return allTools;
  }

  /**
   * Load a function from an external file.
   *
   * @param fileRef - File reference in format 'file://path/to/file:functionName'
   * @returns The loaded function
   */
  protected async loadExternalFunction(fileRef: string): Promise<Function> {
    let filePath = fileRef.slice('file://'.length);
    let functionName: string | undefined;

    if (filePath.includes(':')) {
      const splits = filePath.split(':');
      if (splits[0] && isJavascriptFile(splits[0])) {
        [filePath, functionName] = splits;
      }
    }

    try {
      const resolvedPath = path.resolve(cliState.basePath || '', filePath);
      logger.debug(`Loading function from ${resolvedPath}${functionName ? `:${functionName}` : ''}`);

      const requiredModule = await importModule(resolvedPath, functionName);

      if (typeof requiredModule === 'function') {
        return requiredModule;
      } else if (
        requiredModule &&
        typeof requiredModule === 'object' &&
        functionName &&
        functionName in requiredModule
      ) {
        const fn = requiredModule[functionName];
        if (typeof fn === 'function') {
          return fn;
        }
      }

      throw new Error(
        `Function callback malformed: ${filePath} must export ${
          functionName
            ? `a named function '${functionName}'`
            : 'a function or have a default export as a function'
        }`,
      );
    } catch (error: any) {
      throw new Error(`Error loading function from ${filePath}: ${error.message || String(error)}`);
    }
  }

  /**
   * Execute a function callback with proper error handling.
   *
   * @param functionName - Name of the function to execute
   * @param args - JSON string of function arguments
   * @param config - Config containing function callbacks
   * @returns The function result
   */
  protected async executeFunctionCallback(
    functionName: string,
    args: string,
    config: CompletionOptions,
  ): Promise<any> {
    try {
      // Check if we've already loaded this function
      let callback = this.loadedFunctionCallbacks[functionName];

      // If not loaded yet, try to load it now
      if (!callback) {
        const callbackRef = config.functionToolCallbacks?.[functionName];

        if (callbackRef && typeof callbackRef === 'string') {
          const callbackStr: string = callbackRef;
          if (callbackStr.startsWith('file://')) {
            callback = await this.loadExternalFunction(callbackStr);
          } else {
            callback = new Function('return ' + callbackStr)();
          }

          // Cache for future use
          this.loadedFunctionCallbacks[functionName] = callback;
        } else if (typeof callbackRef === 'function') {
          callback = callbackRef;
          this.loadedFunctionCallbacks[functionName] = callback;
        }
      }

      if (!callback) {
        throw new Error(`No callback found for function '${functionName}'`);
      }

      // Execute the callback
      logger.debug(`Executing function '${functionName}' with args: ${args}`);
      const result = await callback(args);

      return result;
    } catch (error: any) {
      logger.error(`Error executing function '${functionName}': ${error.message || String(error)}`);
      throw error;
    }
  }

  /**
   * Clean up resources (MCP client, etc.).
   * Should be called when the provider is no longer needed.
   */
  async cleanup(): Promise<void> {
    if (this.mcpClient) {
      await this.initializationPromise;
      await this.mcpClient.cleanup();
      this.mcpClient = null;
    }
  }

  /**
   * Get the request timeout in milliseconds.
   */
  protected getTimeout(): number {
    return this.config.timeoutMs || REQUEST_TIMEOUT_MS;
  }
}

/**
 * Default exports for the base module.
 */
export default GoogleGenericProvider;
