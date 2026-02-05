import path from 'path';

import cliState from '../../cliState';
import { importModule } from '../../esm';
import logger from '../../logger';
import type { Agent } from '@openai/agents';

import type { AgentDefinition, HandoffDefinition, ToolDefinition } from './agents-types';

/**
 * Load agent definition from file path or return inline definition
 */
export async function loadAgentDefinition(
  agentConfig: Agent<any, any> | string | AgentDefinition,
): Promise<Agent<any, any>> {
  // If it's already an Agent instance, return it
  if (isAgentInstance(agentConfig)) {
    logger.debug('[AgentsLoader] Using provided Agent instance');
    return agentConfig;
  }

  // If it's a file path, load from file
  if (typeof agentConfig === 'string' && agentConfig.startsWith('file://')) {
    logger.debug('[AgentsLoader] Loading agent from file', { path: agentConfig });
    return await loadAgentFromFile(agentConfig);
  }

  // If it's an inline definition, convert to Agent
  if (typeof agentConfig === 'object') {
    logger.debug('[AgentsLoader] Creating agent from inline definition');
    return await createAgentFromDefinition(agentConfig as AgentDefinition);
  }

  logger.debug('[AgentsLoader] Invalid agent configuration', {
    type: typeof agentConfig,
    keys:
      typeof agentConfig === 'object' && agentConfig !== null
        ? Object.keys(agentConfig as any).slice(0, 5)
        : undefined,
  });
  throw new Error(
    'Invalid agent configuration: expected Agent instance, file:// URL, or inline definition',
  );
}

/**
 * Load tools from file path or return inline definitions
 */
export async function loadTools(
  toolsConfig?: string | ToolDefinition[],
): Promise<ToolDefinition[] | undefined> {
  if (!toolsConfig) {
    return undefined;
  }

  // If it's a file path, load from file
  if (typeof toolsConfig === 'string' && toolsConfig.startsWith('file://')) {
    logger.debug('[AgentsLoader] Loading tools from file', { path: toolsConfig });
    return await loadToolsFromFile(toolsConfig);
  }

  // If it's an array, return as is
  if (Array.isArray(toolsConfig)) {
    logger.debug('[AgentsLoader] Using inline tool definitions');
    return toolsConfig;
  }

  logger.debug('[AgentsLoader] Invalid tools configuration', {
    type: typeof toolsConfig,
    isArray: Array.isArray(toolsConfig),
  });
  throw new Error('Invalid tools configuration: expected file:// URL or array');
}

/**
 * Load handoffs from file path or return inline definitions
 */
export async function loadHandoffs(
  handoffsConfig?: string | HandoffDefinition[],
): Promise<HandoffDefinition[] | undefined> {
  if (!handoffsConfig) {
    return undefined;
  }

  // If it's a file path, load from file
  if (typeof handoffsConfig === 'string' && handoffsConfig.startsWith('file://')) {
    logger.debug('[AgentsLoader] Loading handoffs from file', { path: handoffsConfig });
    return await loadHandoffsFromFile(handoffsConfig);
  }

  // If it's an array, return as is
  if (Array.isArray(handoffsConfig)) {
    logger.debug('[AgentsLoader] Using inline handoff definitions');
    return handoffsConfig;
  }

  logger.debug('[AgentsLoader] Invalid handoffs configuration', {
    type: typeof handoffsConfig,
    isArray: Array.isArray(handoffsConfig),
  });
  throw new Error('Invalid handoffs configuration: expected file:// URL or array');
}

/**
 * Load agent from file
 */
async function loadAgentFromFile(filePath: string): Promise<Agent<any, any>> {
  const resolvedPath = resolveFilePath(filePath);
  logger.debug('[AgentsLoader] Loading agent from resolved path', { path: resolvedPath });

  try {
    const module = await importModule(resolvedPath);
    const agent = module.default || module;

    if (!isAgentInstance(agent)) {
      throw new Error(`File ${resolvedPath} does not export an Agent instance`);
    }

    return agent;
  } catch (error) {
    logger.error('[AgentsLoader] Failed to load agent from file', { path: resolvedPath, error });
    throw new Error(`Failed to load agent from ${resolvedPath}: ${error}`);
  }
}

/**
 * Load tools from file
 */
async function loadToolsFromFile(filePath: string): Promise<ToolDefinition[]> {
  const resolvedPath = resolveFilePath(filePath);
  logger.debug('[AgentsLoader] Loading tools from resolved path', { path: resolvedPath });

  try {
    const module = await importModule(resolvedPath);
    const tools = module.default || module;

    if (!Array.isArray(tools)) {
      throw new Error(`File ${resolvedPath} does not export an array of tools`);
    }

    return tools;
  } catch (error) {
    logger.error('[AgentsLoader] Failed to load tools from file', { path: resolvedPath, error });
    throw new Error(`Failed to load tools from ${resolvedPath}: ${error}`);
  }
}

/**
 * Load handoffs from file
 */
async function loadHandoffsFromFile(filePath: string): Promise<HandoffDefinition[]> {
  const resolvedPath = resolveFilePath(filePath);
  logger.debug('[AgentsLoader] Loading handoffs from resolved path', { path: resolvedPath });

  try {
    const module = await importModule(resolvedPath);
    const handoffs = module.default || module;

    if (!Array.isArray(handoffs)) {
      throw new Error(`File ${resolvedPath} does not export an array of handoffs`);
    }

    return handoffs;
  } catch (error) {
    logger.error('[AgentsLoader] Failed to load handoffs from file', {
      path: resolvedPath,
      error,
    });
    throw new Error(`Failed to load handoffs from ${resolvedPath}: ${error}`);
  }
}

/**
 * Create an Agent instance from an inline definition
 */
async function createAgentFromDefinition(definition: AgentDefinition): Promise<Agent<any, any>> {
  try {
    // Dynamically import Agent class
    const { Agent } = await import('@openai/agents');

    // Create agent with definition
    // Note: tools and handoffs should be actual Tool/Handoff objects, not definitions
    // They should be included in the definition if needed
    const agent = new Agent({
      name: definition.name,
      instructions: definition.instructions,
      model: definition.model,
      handoffDescription: definition.handoffDescription,
      // @ts-ignore - outputType might be various types
      outputType: definition.outputType,
      // @ts-ignore - tools and handoffs will be added separately if needed
      tools: definition.tools,
      // @ts-ignore
      handoffs: definition.handoffs,
    });

    return agent;
  } catch (error) {
    logger.error('[AgentsLoader] Failed to create agent from definition', {
      name: definition?.name,
      model: definition?.model,
      toolCount: definition?.tools?.length,
      handoffCount: definition?.handoffs?.length,
      error,
    });
    throw new Error(`Failed to create agent from definition: ${error}`);
  }
}

/**
 * Check if a value is an Agent instance
 */
function isAgentInstance(value: any): value is Agent<any, any> {
  // Check if it has the Agent class properties/methods
  return (
    value &&
    typeof value === 'object' &&
    'name' in value &&
    'instructions' in value &&
    typeof value.name === 'string'
  );
}

/**
 * Resolve file:// path to absolute file system path
 */
function resolveFilePath(filePath: string): string {
  // Remove file:// prefix
  const cleanPath = filePath.replace(/^file:\/\//, '');

  // If it's already absolute, return it
  if (path.isAbsolute(cleanPath)) {
    return cleanPath;
  }

  // Otherwise, resolve relative to current working directory
  const basePath = cliState.basePath || process.cwd();
  const resolvedPath = path.resolve(basePath, cleanPath);

  logger.debug('[AgentsLoader] Resolved file path', {
    original: filePath,
    basePath,
    resolved: resolvedPath,
  });

  return resolvedPath;
}
