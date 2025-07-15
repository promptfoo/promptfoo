import type { Prompt, PromptConfig } from '../../types';
import type { PromptVersion } from '../../types/prompt-management';
import { isJavascriptFile } from '../../util/fileExtensions';

export interface PromptAnalysis {
  contentType: 'string' | 'json' | 'function' | 'file';
  config?: Record<string, any>;
  functionSource?: string;
  functionName?: string;
  fileFormat?: string;
  transform?: string;
  label?: string;
}

/**
 * Analyzes a prompt object to extract all its features for storage in managed prompts
 */
export function analyzePrompt(prompt: Prompt): PromptAnalysis {
  const analysis: PromptAnalysis = {
    contentType: 'string',
  };

  // Extract label
  if (prompt.label) {
    analysis.label = prompt.label;
  }

  // Extract configuration
  if (prompt.config) {
    analysis.config = prompt.config;
  }

  // Check if it's a function prompt
  if (prompt.function) {
    analysis.contentType = 'function';
    analysis.functionSource = prompt.function.toString();
    if (prompt.function.name) {
      analysis.functionName = prompt.function.name;
    }
  }
  // Check if content is JSON (chat format)
  else if (typeof prompt.raw === 'object' || isJsonString(prompt.raw)) {
    analysis.contentType = 'json';
  }
  // Check if it's a file reference
  else if (typeof prompt.raw === 'string' && prompt.raw.startsWith('file://')) {
    analysis.contentType = 'file';
    const filePath = prompt.raw.substring(7);
    const extension = filePath.substring(filePath.lastIndexOf('.'));
    if (extension) {
      analysis.fileFormat = extension;
    }
  }

  return analysis;
}

/**
 * Converts a managed prompt version back to a Prompt object
 */
export function versionToPrompt(version: PromptVersion): Prompt {
  const prompt: Prompt = {
    raw: version.content,
    label: version.label || version.promptId,
  };

  if (version.config) {
    prompt.config =
      typeof version.config === 'string' ? JSON.parse(version.config) : version.config;
  }

  if (version.contentType === 'function' && version.functionSource) {
    // For function prompts, we'll need to evaluate the function
    // This will be handled by the processManagedPrompt function
    prompt.raw = version.functionSource;
  } else if (version.contentType === 'json') {
    try {
      prompt.raw = JSON.parse(version.content);
    } catch {
      // If parsing fails, keep as string
    }
  }

  return prompt;
}

function isJsonString(str: string): boolean {
  try {
    JSON.parse(str);
    return true;
  } catch {
    return false;
  }
}
