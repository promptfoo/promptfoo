import { cloudConfig } from '../globalConfig/cloud';
import logger from '../logger';
import { makeRequest, isCloudProvider, getCloudDatabaseId } from './cloud';

import type { ApiProvider, UnifiedConfig } from '../types/index';
import type { TargetPurposeDiscoveryResult } from '../redteam/commands/discover';

// ApplicationDescription type matching the cloud server's schema
export interface ApplicationDescription {
  purpose?: string;
  systemPrompt?: string;
  redteamUser?: string;
  accessToData?: string;
  forbiddenData?: string;
  accessToActions?: string;
  forbiddenActions?: string;
  connectedSystems?: string;
  features?: string;
  industry?: string;
  attackConstraints?: string;
  hasAccessTo?: string;
  doesNotHaveAccessTo?: string;
  userTypes?: string;
  securityRequirements?: string;
  sensitiveDataTypes?: string;
  exampleIdentifiers?: string;
  criticalActions?: string;
  forbiddenTopics?: string;
  competitors?: string;
  testGenerationInstructions?: string;
}

/**
 * Maps discovery results to an ApplicationDescription format suitable for storage.
 * Merges new discovery data with existing application description if provided.
 */
export function mapDiscoveryToApplicationDescription(
  discovery: TargetPurposeDiscoveryResult,
  existing?: ApplicationDescription,
): ApplicationDescription {
  // Format tools as a readable string for the accessToActions field
  const formatToolsAsActions = (tools: Array<any>): string => {
    if (!tools || tools.length === 0) {
      return existing?.accessToActions || '';
    }

    return tools
      .map((tool) => {
        const args = tool.arguments?.map((arg: any) => `${arg.name}: ${arg.type}`).join(', ');
        return `${tool.name}: ${tool.description}${args ? ` (${args})` : ''}`;
      })
      .join('; ');
  };

  return {
    // Preserve existing values where discovery doesn't provide new data
    purpose: discovery.purpose || existing?.purpose || '',
    redteamUser: discovery.user || existing?.redteamUser || '',

    // Map discovery tools to accessible actions
    accessToActions: formatToolsAsActions(discovery.tools) || existing?.accessToActions || '',

    // Discovery limitations can inform what data/actions are forbidden
    forbiddenData: existing?.forbiddenData || '',
    forbiddenActions: discovery.limitations || existing?.forbiddenActions || '',

    // Preserve other existing fields
    accessToData: existing?.accessToData || '',
    connectedSystems: existing?.connectedSystems || '',
    systemPrompt: existing?.systemPrompt || '',
    features: existing?.features || '',
    industry: existing?.industry || '',
    attackConstraints: existing?.attackConstraints || '',
    hasAccessTo: existing?.hasAccessTo || '',
    doesNotHaveAccessTo: existing?.doesNotHaveAccessTo || '',
    userTypes: existing?.userTypes || '',
    securityRequirements: existing?.securityRequirements || '',
    sensitiveDataTypes: existing?.sensitiveDataTypes || '',
    exampleIdentifiers: existing?.exampleIdentifiers || '',
    criticalActions: existing?.criticalActions || '',
    forbiddenTopics: existing?.forbiddenTopics || '',
    competitors: existing?.competitors || '',
    testGenerationInstructions: existing?.testGenerationInstructions || '',
  };
}

/**
 * Saves discovery results to a cloud provider's application description.
 * Only operates if cloud is enabled and the target is a cloud-based provider.
 *
 * @param target The API provider that was discovered
 * @param discoveryResult The discovery results to save
 * @param config Optional unified config containing provider metadata
 * @returns Promise that resolves when save is complete or fails gracefully
 */
export async function saveDiscoveryToCloud(
  target: ApiProvider,
  discoveryResult: TargetPurposeDiscoveryResult,
  config?: UnifiedConfig,
): Promise<void> {
  // Only proceed if cloud is enabled
  if (!cloudConfig.isEnabled()) {
    logger.debug('[Discovery] Cloud is not enabled, skipping discovery save');
    return;
  }

  try {
    // Check if this is a cloud provider
    let providerId: string | undefined;

    // First try to get provider ID from the target itself
    if (target.id && isCloudProvider(target.id)) {
      providerId = getCloudDatabaseId(target.id);
    }
    // If target doesn't have cloud ID, check if it came from cloud config
    else if (config?.providers && config.providers.length > 0) {
      // Look for a cloud provider in the config that matches this target
      const cloudProvider = config.providers.find((p) => {
        if (typeof p === 'string' && isCloudProvider(p)) {
          return true;
        }
        if (typeof p === 'object' && p.id && isCloudProvider(p.id)) {
          return true;
        }
        return false;
      });

      if (cloudProvider) {
        const id = typeof cloudProvider === 'string' ? cloudProvider : cloudProvider.id;
        if (id && isCloudProvider(id)) {
          providerId = getCloudDatabaseId(id);
        }
      }
    }

    if (!providerId) {
      logger.debug('[Discovery] Target is not a cloud provider, skipping cloud save');
      return;
    }

    logger.info(`[Discovery] Saving discovery results to cloud provider ${providerId}`);

    // Make API call to save discovery results
    const response = await makeRequest(`providers/${providerId}/discovery`, 'PUT', {
      discoveryResult,
      mergeStrategy: 'merge', // Default to merging with existing data
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.warn(
        `[Discovery] Failed to save discovery results to cloud: ${response.status} - ${errorText}`,
      );
      // Don't throw - we want discovery to continue even if save fails
      return;
    }

    const result = await response.json();
    logger.info('[Discovery] Successfully saved discovery results to cloud');
    logger.debug('[Discovery] Cloud save response:', result);
  } catch (error) {
    // Log error but don't throw - discovery should continue even if cloud save fails
    logger.warn('[Discovery] Error saving discovery results to cloud:', error);
  }
}

