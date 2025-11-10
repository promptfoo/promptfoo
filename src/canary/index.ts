import { cloudConfig } from '../globalConfig/cloud';
import logger from '../logger';
import type { ApiProvider, ProviderOptions } from '../types/providers';
import { makeRequest } from '../util/cloud';
import { sha256 } from '../util/createHash';

/**
 * Converts a provider configuration to a stable string representation for hashing
 * We only include properties that affect the provider behavior
 *
 * @param provider The provider configuration to serialize
 * @returns A stable JSON string of the provider configuration
 */
function serializeProviderForHashing(provider: ApiProvider | ProviderOptions): string {
  const configToHash: Record<string, any> = {};

  if ('id' in provider) {
    // Handle ApiProvider which has id as a function
    if (typeof provider.id === 'function') {
      configToHash.id = provider.id();
    } else {
      configToHash.id = provider.id;
    }
  }

  // Include relevant configuration properties
  if ('config' in provider && provider.config) {
    configToHash.config = provider.config;
  }

  if ('transform' in provider && provider.transform) {
    configToHash.transform = provider.transform;
  }

  // Sort keys to ensure stable serialization
  return JSON.stringify(configToHash, Object.keys(configToHash).sort());
}

/**
 * Generates a deterministic hash from a provider configuration
 * This hash will be the same for the same provider configuration
 *
 * @param provider The provider configuration to hash
 * @returns A SHA-256 hash as a hex string
 */
export function generateProviderHash(provider: ApiProvider | ProviderOptions): string {
  // Convert provider to a stable JSON string representation
  const providerConfig = serializeProviderForHashing(provider);

  // Generate hash from the stable string representation
  return sha256(providerConfig);
}

/**
 * Generates a shorter hash by truncating the full SHA-256 hash
 *
 * @param provider The provider configuration to hash
 * @param length The length of the shortened hash, default is 8
 * @returns A shortened hash string
 */
export function generateShortProviderHash(
  provider: ApiProvider | ProviderOptions,
  length: number = 8,
): string {
  const fullHash = generateProviderHash(provider);
  return fullHash.substring(0, length);
}

/**
 * Interface for canary data sent to and received from the server
 */
export interface CanaryData {
  providerHash: string;
  providerId: string;
  message: string;
  timestamp: string;
  status?: 'active' | 'inactive';
  lastChecked?: string;
  response?: string;
}

/**
 * Sends a canary message to the server
 *
 * @param providerId The provider ID or configuration
 * @param message The canary message to send
 * @returns The server response
 */
export async function sendCanary(
  provider: ApiProvider | ProviderOptions,
  message: string,
): Promise<CanaryData> {
  if (!cloudConfig.isEnabled()) {
    throw new Error(
      `Could not send canary. Cloud config is not enabled. Please run \`promptfoo auth login\` to login.`,
    );
  }

  try {
    const providerHash = generateShortProviderHash(provider);
    const providerId =
      'id' in provider
        ? typeof provider.id === 'function'
          ? provider.id()
          : provider.id
        : 'unknown';

    const canaryData: CanaryData = {
      providerHash,
      providerId: providerId || 'unknown',
      message,
      timestamp: new Date().toISOString(),
    };

    const response = await makeRequest('api/canary', 'POST', canaryData);

    if (!response.ok) {
      const errorMessage = await response.text();
      logger.error(
        `[Canary] Failed to send canary: ${errorMessage}. HTTP Status: ${response.status}`,
      );
      throw new Error(`Failed to send canary: ${response.statusText}`);
    }

    const responseData = await response.json();
    logger.debug(`Canary sent to cloud: ${JSON.stringify(responseData, null, 2)}`);
    return responseData;
  } catch (e) {
    logger.error(`Failed to send canary: ${e}`);
    throw e;
  }
}

/**
 * Checks canary status on the server
 *
 * @param provider The provider to check
 * @returns The canary status information
 */
export async function checkCanary(provider: ApiProvider | ProviderOptions): Promise<CanaryData> {
  if (!cloudConfig.isEnabled()) {
    throw new Error(
      `Could not check canary. Cloud config is not enabled. Please run \`promptfoo auth login\` to login.`,
    );
  }

  try {
    const providerHash = generateShortProviderHash(provider);

    const response = await makeRequest(`api/canary/${providerHash}`, 'GET');

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`No canary found for provider. Use canary send to create one first.`);
      }
      const errorMessage = await response.text();
      logger.error(
        `[Canary] Failed to check canary: ${errorMessage}. HTTP Status: ${response.status}`,
      );
      throw new Error(`Failed to check canary: ${response.statusText}`);
    }

    const canaryData = await response.json();
    logger.debug(`Canary status from cloud: ${JSON.stringify(canaryData, null, 2)}`);
    return canaryData;
  } catch (e) {
    logger.error(`Failed to check canary: ${e}`);
    throw e;
  }
}
