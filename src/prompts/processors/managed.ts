import type { Prompt } from '../../types';
import logger from '../../logger';
import { PromptManager } from '../management/PromptManager';
import { versionToPrompt } from '../management/promptAnalyzer';

/**
 * Process managed prompts with pf:// prefix
 * Format: pf://prompt-id, pf://prompt-id:version, or pf://prompt-id:environment
 */
export async function processManagedPrompt(prompt: Partial<Prompt>): Promise<Prompt[]> {
  if (!prompt.raw || !prompt.raw.startsWith('pf://')) {
    return [];
  }

  const url = prompt.raw.substring(5); // Remove 'pf://' prefix
  const parts = url.split(':');
  const promptId = parts[0];
  const versionOrEnv = parts[1];

  // Validate prompt ID format
  if (!promptId || promptId.trim() === '') {
    throw new Error('Invalid managed prompt reference: missing prompt ID');
  }

  const manager = new PromptManager();

  try {
    const managedPrompt = await manager.getPrompt(promptId);

    if (!managedPrompt) {
      throw new Error(`Managed prompt not found: ${promptId}`);
    }

    let targetVersion: number;

    if (versionOrEnv) {
      // Check if it's a number (version) or string (environment)
      const versionNum = Number.parseInt(versionOrEnv);
      if (isNaN(versionNum)) {
        // It's an environment name
        const deployedVersion = managedPrompt.deployments?.[versionOrEnv];
        if (!deployedVersion) {
          throw new Error(`No deployment found for environment: ${versionOrEnv}`);
        }
        targetVersion = deployedVersion;
      } else {
        targetVersion = versionNum;
      }
    } else {
      // Use current version
      targetVersion = managedPrompt.currentVersion;
    }

    // Find the specific version
    const version = managedPrompt.versions.find((v) => v.version === targetVersion);
    if (!version) {
      throw new Error(`Version ${targetVersion} not found for prompt: ${promptId}`);
    }

    // Track usage asynchronously
    manager
      .trackUsage(promptId)
      .catch((err) => logger.debug(`Failed to track usage for prompt ${promptId}: ${err}`));

    // Convert version to prompt object with all features
    const resultPrompt = versionToPrompt(version);

    // Merge any additional properties from the original prompt
    if (prompt.config) {
      resultPrompt.config = { ...resultPrompt.config, ...prompt.config };
    }
    if (prompt.label && !resultPrompt.label) {
      resultPrompt.label = prompt.label;
    }

    // Handle function prompts
    if (version.contentType === 'function' && version.functionSource) {
      try {
        // Evaluate the function source
        const func = eval(`(${version.functionSource})`);
        resultPrompt.function = func;
        resultPrompt.raw = func.toString();
      } catch (error) {
        logger.error(`Failed to evaluate function prompt: ${error}`);
        // Fall back to string content
      }
    }

    return [resultPrompt];
  } catch (error) {
    logger.error(`Error processing managed prompt ${promptId}: ${error}`);
    throw error;
  }
}
