import * as fs from 'fs';
import matter from 'gray-matter';
import logger from '../../logger';
import type { Prompt } from '../../types';
import { renderVarsInObject } from '../../util';

interface PromptyFrontmatter {
  name?: string;
  description?: string;
  authors?: string[];
  tags?: string[];
  version?: string;
  model?: {
    api?: 'chat' | 'completion' | 'embedding' | 'image';
    configuration?: {
      type: 'azure_openai' | 'openai' | 'azure_serverless';
      api_key?: string;
      api_version?: string;
      azure_deployment?: string;
      azure_endpoint?: string;
      name?: string;
      organization?: string;
      connection?: string;
      [key: string]: any;
    };
    parameters?: Record<string, any>;
    response?: 'first' | 'all';
  };
  sample?: Record<string, any>;
  inputs?: {
    [key: string]: {
      type: string;
      description?: string;
      default?: any;
      is_required?: boolean;
      json_schema?: any;
    };
  };
  outputs?: {
    [key: string]: {
      type: string;
      description?: string;
      json_schema?: any;
    };
  };
}

interface ParsedMessage {
  role: 'system' | 'user' | 'assistant' | 'function';
  content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
}

/**
 * Resolves environment variables in a value using ${env:VAR_NAME} syntax
 */
function resolveEnvVariables(value: any): any {
  if (typeof value === 'string') {
    return value.replace(/\$\{env:(\w+)\}/g, (_, envVar) => {
      const envValue = process.env[envVar];
      if (envValue === undefined) {
        logger.warn(`Environment variable ${envVar} is not defined`);
        return '';
      }
      return envValue;
    });
  }

  if (Array.isArray(value)) {
    return value.map((item) => resolveEnvVariables(item));
  }

  if (typeof value === 'object' && value !== null) {
    const resolved: Record<string, any> = {};
    for (const [key, val] of Object.entries(value)) {
      resolved[key] = resolveEnvVariables(val);
    }
    return resolved;
  }

  return value;
}

/**
 * Parses role-based content for chat API prompts
 */
function parseChatContent(content: string): ParsedMessage[] {
  const messages: ParsedMessage[] = [];
  const roles = ['system', 'user', 'assistant', 'function'];
  // Updated regex to also match 'A:' as assistant role
  const roleRegex = new RegExp(`\\s*#?\\s*(${roles.join('|')}|A)\\s*:\\s*\\n`, 'gim');

  // Split content by role markers
  const parts = content
    .split(roleRegex)
    .map((part) => part.trim())
    .filter(Boolean);

  // If the first part is not a role, assume it's system content
  if (
    parts.length > 0 &&
    !roles.includes(parts[0].toLowerCase()) &&
    parts[0].toLowerCase() !== 'a'
  ) {
    parts.unshift('system');
  }

  // Process role-content pairs
  for (let i = 0; i < parts.length - 1; i += 2) {
    let role = parts[i].toLowerCase();
    // Convert 'a' to 'assistant'
    if (role === 'a') {
      role = 'assistant';
    }
    const messageContent = parts[i + 1];

    if ((roles.includes(role) || role === 'assistant') && messageContent) {
      // Check for images in content
      const imageRegex = /!\[(.*?)\]\((.*?)\)/g;
      const contentParts: Array<{ type: string; text?: string; image_url?: { url: string } }> = [];
      let lastIndex = 0;
      let match;

      while ((match = imageRegex.exec(messageContent)) !== null) {
        // Add text before image
        const textBefore = messageContent.slice(lastIndex, match.index).trim();
        if (textBefore) {
          contentParts.push({ type: 'text', text: textBefore });
        }

        // Add image
        const imageUrl = match[2].trim();
        contentParts.push({ type: 'image_url', image_url: { url: imageUrl } });

        lastIndex = match.index + match[0].length;
      }

      // Add remaining text
      const remainingText = messageContent.slice(lastIndex).trim();
      if (remainingText) {
        contentParts.push({ type: 'text', text: remainingText });
      }

      // If no images were found, use simple string content
      if (contentParts.length === 0) {
        messages.push({ role: role as ParsedMessage['role'], content: messageContent });
      } else if (contentParts.length === 1 && contentParts[0].type === 'text') {
        messages.push({ role: role as ParsedMessage['role'], content: contentParts[0].text! });
      } else {
        messages.push({ role: role as ParsedMessage['role'], content: contentParts });
      }
    }
  }

  return messages;
}

/**
 * Maps prompty model configuration to promptfoo provider format
 */
function mapModelConfig(frontmatter: PromptyFrontmatter): Record<string, any> | undefined {
  const params = frontmatter.model?.parameters || {};

  // If there's no configuration, just return the parameters
  if (!frontmatter.model?.configuration) {
    return Object.keys(params).length > 0 ? params : undefined;
  }

  // Resolve environment variables in configuration
  const config = resolveEnvVariables(frontmatter.model.configuration);

  // Build provider config based on type
  let providerConfig: Record<string, any> = {};

  switch (config.type) {
    case 'azure_openai':
      providerConfig = {
        ...params,
      };
      if (config.api_key) {
        providerConfig.apiKey = config.api_key;
      }
      if (config.api_version) {
        providerConfig.apiVersion = config.api_version;
      }
      if (config.azure_deployment) {
        providerConfig.deployment = config.azure_deployment;
      }
      if (config.azure_endpoint) {
        providerConfig.endpoint = config.azure_endpoint;
      }
      break;

    case 'openai':
      providerConfig = {
        ...params,
      };
      if (config.name) {
        providerConfig.model = config.name;
      }
      if (config.organization) {
        providerConfig.organization = config.organization;
      }
      if (config.api_key) {
        providerConfig.apiKey = config.api_key;
      }
      break;

    case 'azure_serverless':
      providerConfig = {
        ...params,
      };
      if (config.azure_endpoint) {
        providerConfig.endpoint = config.azure_endpoint;
      }
      if (config.api_key) {
        providerConfig.apiKey = config.api_key;
      }
      break;

    default:
      // Pass through unknown configurations
      providerConfig = {
        ...config,
        ...params,
      };
  }

  return providerConfig;
}

/**
 * Processes a Prompty file to extract prompts
 * @param filePath - Path to the .prompty file
 * @param prompt - Base prompt configuration
 * @returns Array of processed prompts
 */
export async function processPromptyFile(
  filePath: string,
  prompt: Partial<Prompt>,
): Promise<Prompt[]> {
  try {
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const parsed = matter(fileContent);
    const frontmatter = parsed.data as PromptyFrontmatter;
    const content = parsed.content.trim();

    logger.debug(`Processing prompty file: ${filePath}`);
    logger.debug(`Prompty API type: ${frontmatter.model?.api || 'chat'}`);

    // Determine the prompt format based on API type
    const apiType = frontmatter.model?.api || 'chat';
    let processedContent: string;

    if (apiType === 'chat') {
      // Parse role-based content for chat API
      const messages = parseChatContent(content);
      processedContent = JSON.stringify(messages);
    } else {
      // For completion API, use content as-is
      processedContent = content;
    }

    // Map model configuration to promptfoo format
    const modelConfig = mapModelConfig(frontmatter);

    // Merge configurations
    const finalConfig = {
      ...modelConfig,
      ...prompt.config,
    };

    // Create the prompt object
    const processedPrompt: Prompt = {
      raw: processedContent,
      label: prompt.label || frontmatter.name || `${filePath}`,
      config: Object.keys(finalConfig).length > 0 ? finalConfig : undefined,
    };

    // If sample data is provided, create a function that pre-fills variables
    if (frontmatter.sample && Object.keys(frontmatter.sample).length > 0) {
      const originalRaw = processedPrompt.raw;
      processedPrompt.function = async (context) => {
        // Merge sample data with provided vars (vars take precedence)
        const mergedVars = {
          ...frontmatter.sample,
          ...context.vars,
        };

        // Render the template with merged variables
        let rendered: string;
        if (apiType === 'chat') {
          // For chat messages, we need to render each message content
          const messages = JSON.parse(originalRaw);
          const renderedMessages = messages.map((msg: any) => {
            if (typeof msg.content === 'string') {
              return {
                ...msg,
                content: renderVarsInObject(msg.content, mergedVars),
              };
            } else if (Array.isArray(msg.content)) {
              // Handle multi-part content
              return {
                ...msg,
                content: msg.content.map((part: any) => {
                  if (part.type === 'text' && part.text) {
                    return {
                      ...part,
                      text: renderVarsInObject(part.text, mergedVars),
                    };
                  }
                  return part;
                }),
              };
            }
            return msg;
          });
          rendered = JSON.stringify(renderedMessages);
        } else {
          // For completion API, render the content directly
          rendered = renderVarsInObject(originalRaw, mergedVars);
        }

        return rendered;
      };
    }

    return [processedPrompt];
  } catch (error) {
    logger.error(`Error processing prompty file ${filePath}: ${error}`);
    throw new Error(`Failed to process prompty file ${filePath}: ${error}`);
  }
}
