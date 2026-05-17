import path from 'path';

import {
  Agent,
  handoff,
  MemorySession,
  OpenAIConversationsSession,
  OpenAIResponsesCompactionSession,
  tool,
} from '@openai/agents';
import { Manifest, SandboxAgent } from '@openai/agents/sandbox';
import { DockerSandboxClient, UnixLocalSandboxClient } from '@openai/agents/sandbox/local';
import cliState from '../../cliState';
import { importModule } from '../../esm';
import logger from '../../logger';
import { resolveModelSettings } from './agents-model-settings';
import type {
  Handoff,
  InputGuardrail,
  Tool as OpenAiTool,
  OutputGuardrail,
  Session,
} from '@openai/agents';
import type { SandboxRunConfig } from '@openai/agents/sandbox';

import type {
  AgentDefinition,
  HandoffDefinition,
  OpenAiAgentsSandboxConfig,
  OpenAiAgentsSandboxDefinition,
  OpenAiAgentsSessionConfig,
  OpenAiAgentsSessionDefinition,
  ToolDefinition,
} from './agents-types';

/**
 * Load agent definition from file path or return inline definition
 */
export async function loadAgentDefinition(
  agentConfig: Agent<any, any> | string | AgentDefinition | null | undefined,
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
  if (agentConfig !== null && typeof agentConfig === 'object' && !Array.isArray(agentConfig)) {
    logger.debug('[AgentsLoader] Creating agent from inline definition');
    return await createAgentFromDefinition(agentConfig);
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
  toolsConfig?: string | Array<OpenAiTool<any> | ToolDefinition>,
): Promise<OpenAiTool<any>[] | undefined> {
  if (!toolsConfig) {
    return undefined;
  }

  // If it's a file path, load from file
  if (typeof toolsConfig === 'string' && toolsConfig.startsWith('file://')) {
    logger.debug('[AgentsLoader] Loading tools from file', { path: toolsConfig });
    return await loadToolsFromFile(toolsConfig);
  }

  if (Array.isArray(toolsConfig)) {
    logger.debug('[AgentsLoader] Using inline tool definitions');
    return normalizeTools(toolsConfig);
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
  handoffsConfig?: string | Array<Agent<any, any> | Handoff<any, any> | HandoffDefinition>,
): Promise<Array<Agent<any, any> | Handoff<any, any>> | undefined> {
  if (!handoffsConfig) {
    return undefined;
  }

  // If it's a file path, load from file
  if (typeof handoffsConfig === 'string' && handoffsConfig.startsWith('file://')) {
    logger.debug('[AgentsLoader] Loading handoffs from file', { path: handoffsConfig });
    return await loadHandoffsFromFile(handoffsConfig);
  }

  if (Array.isArray(handoffsConfig)) {
    logger.debug('[AgentsLoader] Using inline handoff definitions');
    return normalizeHandoffs(handoffsConfig);
  }

  logger.debug('[AgentsLoader] Invalid handoffs configuration', {
    type: typeof handoffsConfig,
    isArray: Array.isArray(handoffsConfig),
  });
  throw new Error('Invalid handoffs configuration: expected file:// URL or array');
}

/**
 * Load input guardrails from file path or return inline definitions
 */
export async function loadInputGuardrails(
  guardrailsConfig?: string | InputGuardrail[],
): Promise<InputGuardrail[] | undefined> {
  if (!guardrailsConfig) {
    return undefined;
  }

  if (typeof guardrailsConfig === 'string' && guardrailsConfig.startsWith('file://')) {
    logger.debug('[AgentsLoader] Loading input guardrails from file', { path: guardrailsConfig });
    return await loadArrayFromFile<InputGuardrail>(guardrailsConfig, 'input guardrails');
  }

  if (Array.isArray(guardrailsConfig)) {
    logger.debug('[AgentsLoader] Using inline input guardrails');
    return guardrailsConfig;
  }

  logger.debug('[AgentsLoader] Invalid input guardrails configuration', {
    type: typeof guardrailsConfig,
    isArray: Array.isArray(guardrailsConfig),
  });
  throw new Error('Invalid input guardrails configuration: expected file:// URL or array');
}

/**
 * Load output guardrails from file path or return inline definitions
 */
export async function loadOutputGuardrails(
  guardrailsConfig?: string | OutputGuardrail<any>[],
): Promise<OutputGuardrail<any>[] | undefined> {
  if (!guardrailsConfig) {
    return undefined;
  }

  if (typeof guardrailsConfig === 'string' && guardrailsConfig.startsWith('file://')) {
    logger.debug('[AgentsLoader] Loading output guardrails from file', { path: guardrailsConfig });
    return await loadArrayFromFile<OutputGuardrail<any>>(guardrailsConfig, 'output guardrails');
  }

  if (Array.isArray(guardrailsConfig)) {
    logger.debug('[AgentsLoader] Using inline output guardrails');
    return guardrailsConfig;
  }

  logger.debug('[AgentsLoader] Invalid output guardrails configuration', {
    type: typeof guardrailsConfig,
    isArray: Array.isArray(guardrailsConfig),
  });
  throw new Error('Invalid output guardrails configuration: expected file:// URL or array');
}

/**
 * Load a persistent conversation session from config, file export, or factory.
 */
export async function loadSessionDefinition(
  sessionConfig?: OpenAiAgentsSessionConfig,
  context?: any,
): Promise<Session | undefined> {
  if (!sessionConfig) {
    return undefined;
  }

  const resolved = await resolveConfigValue(sessionConfig, 'session', context);
  if (isSessionInstance(resolved)) {
    return resolved;
  }

  if (isSessionDefinition(resolved)) {
    return createSessionFromDefinition(resolved, context);
  }

  throw new Error(
    'Invalid session configuration: expected Session instance, file:// URL, factory, or supported inline definition',
  );
}

/**
 * Load sandbox runtime config from config, file export, or factory.
 */
export async function loadSandboxConfig(
  sandboxConfig?: OpenAiAgentsSandboxConfig,
  context?: any,
): Promise<SandboxRunConfig | undefined> {
  if (!sandboxConfig) {
    return undefined;
  }

  const resolved = await resolveConfigValue<any>(sandboxConfig as any, 'sandbox config', context);
  if (!resolved || typeof resolved !== 'object') {
    throw new Error(
      'Invalid sandbox configuration: expected SandboxRunConfig, file:// URL, factory, or supported inline definition',
    );
  }

  if (isSandboxDefinition(resolved)) {
    return createSandboxConfigFromDefinition(resolved);
  }

  return normalizeSandboxRunConfig(resolved as SandboxRunConfig);
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
async function loadToolsFromFile(filePath: string): Promise<OpenAiTool<any>[]> {
  const tools = await loadArrayFromFile<OpenAiTool<any> | ToolDefinition>(filePath, 'tools');
  return (await normalizeTools(tools)) ?? [];
}

/**
 * Load handoffs from file
 */
async function loadHandoffsFromFile(
  filePath: string,
): Promise<Array<Agent<any, any> | Handoff<any, any>>> {
  const handoffs = await loadArrayFromFile<Agent<any, any> | Handoff<any, any> | HandoffDefinition>(
    filePath,
    'handoffs',
  );
  return (await normalizeHandoffs(handoffs)) ?? [];
}

/**
 * Create an Agent instance from an inline definition
 */
async function createAgentFromDefinition(definition: AgentDefinition): Promise<Agent<any, any>> {
  try {
    const tools = await normalizeTools(definition.tools);
    const handoffs = await normalizeHandoffs(definition.handoffs);
    const baseConfig = {
      name: definition.name,
      instructions: definition.instructions,
      prompt: definition.prompt,
      model: definition.model,
      modelSettings: resolveModelSettings(definition.modelSettings),
      handoffDescription: definition.handoffDescription,
      handoffOutputTypeWarningEnabled: definition.handoffOutputTypeWarningEnabled,
      outputType: definition.outputType,
      tools,
      handoffs,
      inputGuardrails: definition.inputGuardrails,
      outputGuardrails: definition.outputGuardrails,
      mcpServers: definition.mcpServers,
      toolUseBehavior: definition.toolUseBehavior,
      resetToolChoice: definition.resetToolChoice,
    };

    const agent =
      definition.type === 'sandbox'
        ? new SandboxAgent({
            ...baseConfig,
            defaultManifest: normalizeManifest(definition.defaultManifest),
            baseInstructions: definition.baseInstructions,
            capabilities: definition.capabilities,
            runAs: definition.runAs,
          })
        : new Agent(baseConfig);

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
  return value instanceof Agent;
}

function isToolInstance(value: unknown): value is OpenAiTool<any> {
  return (
    !!value &&
    typeof value === 'object' &&
    'type' in value &&
    typeof (value as OpenAiTool<any>).type === 'string'
  );
}

function isHandoffInstance(value: unknown): value is Handoff<any, any> {
  return (
    !!value &&
    typeof value === 'object' &&
    'agent' in value &&
    'getHandoffAsFunctionTool' in value &&
    typeof (value as Handoff<any, any>).getHandoffAsFunctionTool === 'function'
  );
}

async function normalizeTools(
  definitions?: Array<OpenAiTool<any> | ToolDefinition>,
): Promise<OpenAiTool<any>[] | undefined> {
  if (!definitions?.length) {
    return undefined;
  }

  return definitions.map((definition) => {
    if (isToolInstance(definition)) {
      return definition;
    }

    return tool({
      name: definition.name,
      description: definition.description,
      parameters: definition.parameters,
      strict: definition.strict ?? true,
      deferLoading: definition.deferLoading,
      execute:
        typeof definition.execute === 'function'
          ? definition.execute
          : async () => definition.execute,
    });
  });
}

async function normalizeHandoffs(
  definitions?: Array<Agent<any, any> | Handoff<any, any> | HandoffDefinition>,
): Promise<Array<Agent<any, any> | Handoff<any, any>> | undefined> {
  if (!definitions?.length) {
    return undefined;
  }

  return Promise.all(
    definitions.map(async (definition) => {
      if (isAgentInstance(definition) || isHandoffInstance(definition)) {
        return definition;
      }

      const agent = await loadAgentDefinition(definition.agent);
      if (!definition.description) {
        return agent;
      }

      return handoff(agent, {
        toolDescriptionOverride: definition.description,
      });
    }),
  );
}

async function loadArrayFromFile<T>(filePath: string, label: string): Promise<T[]> {
  const resolvedPath = resolveFilePath(filePath);
  logger.debug(`[AgentsLoader] Loading ${label} from resolved path`, { path: resolvedPath });

  try {
    const module = await importModule(resolvedPath);
    const exported = module.default || module;

    if (!Array.isArray(exported)) {
      throw new Error(`File ${resolvedPath} does not export an array of ${label}`);
    }

    return exported as T[];
  } catch (error) {
    logger.error(`[AgentsLoader] Failed to load ${label} from file`, {
      path: resolvedPath,
      error,
    });
    throw new Error(`Failed to load ${label} from ${resolvedPath}: ${error}`);
  }
}

export async function loadValueFromFile<T>(filePath: string, label: string): Promise<T> {
  const resolvedPath = resolveFilePath(filePath);
  logger.debug(`[AgentsLoader] Loading ${label} from resolved path`, { path: resolvedPath });

  try {
    const module = await importModule(resolvedPath);
    return (module.default || module) as T;
  } catch (error) {
    logger.error(`[AgentsLoader] Failed to load ${label} from file`, {
      path: resolvedPath,
      error,
    });
    throw new Error(`Failed to load ${label} from ${resolvedPath}: ${error}`);
  }
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

async function resolveConfigValue<T>(
  config: T | string | ((context?: any) => T | Promise<T>),
  label: string,
  context?: any,
): Promise<T> {
  let resolved = config;

  if (typeof resolved === 'string' && resolved.startsWith('file://')) {
    resolved = await loadValueFromFile<any>(resolved, label);
  }

  if (typeof resolved === 'function') {
    return await (resolved as (context?: any) => T | Promise<T>)(context);
  }

  return resolved as T;
}

function isSessionInstance(value: unknown): value is Session {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof (value as Session).getSessionId === 'function' &&
    typeof (value as Session).getItems === 'function' &&
    typeof (value as Session).addItems === 'function' &&
    typeof (value as Session).popItem === 'function' &&
    typeof (value as Session).clearSession === 'function'
  );
}

function isSessionDefinition(value: unknown): value is OpenAiAgentsSessionDefinition {
  return (
    !!value &&
    typeof value === 'object' &&
    'type' in value &&
    ['memory', 'openai-conversations', 'openai-responses-compaction'].includes(
      String((value as { type?: unknown }).type),
    )
  );
}

async function createSessionFromDefinition(
  definition: OpenAiAgentsSessionDefinition,
  context?: any,
): Promise<Session> {
  switch (definition.type) {
    case 'memory': {
      const { type: _type, ...options } = definition;
      return new MemorySession(options);
    }
    case 'openai-conversations': {
      const { type: _type, ...options } = definition;
      return new OpenAIConversationsSession(options);
    }
    case 'openai-responses-compaction': {
      const { type: _type, underlyingSession, ...options } = definition;
      const resolvedUnderlyingSession = await loadSessionDefinition(underlyingSession, context);
      return new OpenAIResponsesCompactionSession({
        ...options,
        ...(resolvedUnderlyingSession ? { underlyingSession: resolvedUnderlyingSession } : {}),
      });
    }
  }

  throw new Error(`Unsupported session type: ${(definition as { type?: string }).type}`);
}

function isSandboxDefinition(value: unknown): value is OpenAiAgentsSandboxDefinition {
  return (
    !!value &&
    typeof value === 'object' &&
    'type' in value &&
    ['unix-local', 'docker'].includes(String((value as { type?: unknown }).type))
  );
}

function createSandboxConfigFromDefinition(
  definition: OpenAiAgentsSandboxDefinition,
): SandboxRunConfig {
  const { type, clientOptions, manifest, ...runConfig } = definition;
  const client =
    type === 'docker'
      ? new DockerSandboxClient(clientOptions)
      : new UnixLocalSandboxClient(clientOptions);

  return {
    ...runConfig,
    client,
    ...(manifest ? { manifest: normalizeManifest(manifest) } : {}),
  };
}

function normalizeSandboxRunConfig(config: SandboxRunConfig): SandboxRunConfig {
  return {
    ...config,
    ...(config.manifest ? { manifest: normalizeManifest(config.manifest) } : {}),
  };
}

function normalizeManifest(manifest: unknown): Manifest | undefined {
  if (!manifest) {
    return undefined;
  }

  return manifest instanceof Manifest ? manifest : new Manifest(manifest as any);
}
