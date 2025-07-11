import type { Prompt } from '../../types';
import logger from '../../logger';
import { PromptManager } from '../management/PromptManager';

const VALID_ID_REGEX = /^[a-zA-Z0-9-_]+$/;

/**
 * Processes a managed prompt with pf:// prefix
 * Format: pf://prompt-id[:version|:environment]
 */
export async function processManagedPrompt(prompt: Partial<Prompt>): Promise<Prompt[]> {
  if (!prompt.raw || !prompt.raw.startsWith('pf://')) {
    throw new Error(`Invalid managed prompt format: ${prompt.raw}`);
  }

  // Parse the prompt reference
  const parts = prompt.raw.substring(5).split(':'); // Remove 'pf://' prefix
  const promptId = parts[0];
  const versionOrEnv = parts[1];

  // Validate prompt ID
  if (!VALID_ID_REGEX.test(promptId)) {
    throw new Error(`Invalid prompt ID: ${promptId}. Must contain only letters, numbers, hyphens, and underscores.`);
  }

  logger.debug(`Loading managed prompt: ${promptId} with version/env: ${versionOrEnv || 'current'}`);

  const manager = new PromptManager();
  const managedPrompt = await manager.getPrompt(promptId);

  if (!managedPrompt) {
    throw new Error(`Managed prompt not found: ${promptId}`);
  }

  let targetVersion: number;

  if (!versionOrEnv) {
    // Use current version
    targetVersion = managedPrompt.currentVersion;
  } else if (/^\d+$/.test(versionOrEnv)) {
    // It's a version number
    targetVersion = parseInt(versionOrEnv, 10);
  } else {
    // It's an environment name
    const deployedVersion = managedPrompt.deployments?.[versionOrEnv];
    if (!deployedVersion) {
      throw new Error(`No deployment found for environment: ${versionOrEnv}`);
    }
    targetVersion = deployedVersion;
  }

  // Find the specific version
  const version = managedPrompt.versions.find(v => v.version === targetVersion);
  if (!version) {
    throw new Error(`Version ${targetVersion} not found for prompt: ${promptId}`);
  }

  logger.debug(`Resolved managed prompt ${promptId} to version ${targetVersion}`);

  return [{
    ...prompt,
    raw: version.content,
    label: prompt.label || `${managedPrompt.name} v${targetVersion}`,
    display: `${managedPrompt.name} (v${targetVersion})`,
    // Preserve any config from the prompt reference
    config: prompt.config,
  } as Prompt];
} 