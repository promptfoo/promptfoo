import logger from '../logger';

import type {
  ApiProvider,
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderOptions,
  ProviderResponse,
} from '../types/index';

const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_USER_ID = 'promptfoo-user';

export interface CopilotAgentProviderConfig {
  environmentId?: string;
  schemaName?: string;
  tenantId?: string;
  clientId?: string;
  clientSecret?: string;
  timeoutMs?: number;
  userId?: string;
}

async function getCopilotStudioClient() {
  try {
    // @ts-ignore - Optional dependency, loaded at runtime
    return await import('@microsoft/agents-copilotstudio-client');
  } catch {
    throw new Error(
      'Copilot Agent provider requires "@microsoft/agents-copilotstudio-client". ' +
        'Install with: npm install @microsoft/agents-copilotstudio-client @microsoft/agents-activity',
    );
  }
}

async function getAgentsActivity() {
  try {
    // @ts-ignore - Optional dependency, loaded at runtime
    return await import('@microsoft/agents-activity');
  } catch {
    throw new Error(
      'Copilot Agent provider requires "@microsoft/agents-activity". ' +
        'Install with: npm install @microsoft/agents-copilotstudio-client @microsoft/agents-activity',
    );
  }
}

async function getAzureIdentity() {
  try {
    return await import('@azure/identity');
  } catch {
    throw new Error(
      'Copilot Agent provider requires "@azure/identity". ' +
        'Install with: npm install @azure/identity',
    );
  }
}

export class CopilotAgentProvider implements ApiProvider {
  private agentName: string;
  private providerConfig: CopilotAgentProviderConfig;

  constructor(agentName: string, options: ProviderOptions = {}) {
    this.agentName = agentName;
    this.providerConfig = (options.config || {}) as CopilotAgentProviderConfig;
  }

  id(): string {
    return `copilot-agent:${this.agentName}`;
  }

  toString(): string {
    return `[Copilot Agent Provider: ${this.agentName}]`;
  }

  async callApi(
    prompt: string,
    _context?: CallApiContextParams,
    _options?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    const environmentId =
      this.providerConfig.environmentId || process.env.COPILOT_AGENT_ENVIRONMENT_ID;
    const tenantId = this.providerConfig.tenantId || process.env.COPILOT_AGENT_TENANT_ID;
    const clientId = this.providerConfig.clientId || process.env.COPILOT_AGENT_CLIENT_ID;
    const clientSecret =
      this.providerConfig.clientSecret || process.env.COPILOT_AGENT_CLIENT_SECRET;
    const schemaName = this.providerConfig.schemaName || this.agentName;
    const timeoutMs = this.providerConfig.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const userId = this.providerConfig.userId ?? DEFAULT_USER_ID;

    if (!environmentId) {
      return {
        error:
          'Copilot Agent provider requires environmentId. ' +
          'Set it in config or via COPILOT_AGENT_ENVIRONMENT_ID environment variable.',
      };
    }
    if (!tenantId) {
      return {
        error:
          'Copilot Agent provider requires tenantId. ' +
          'Set it in config or via COPILOT_AGENT_TENANT_ID environment variable.',
      };
    }
    if (!clientId) {
      return {
        error:
          'Copilot Agent provider requires clientId. ' +
          'Set it in config or via COPILOT_AGENT_CLIENT_ID environment variable.',
      };
    }
    if (!clientSecret) {
      return {
        error:
          'Copilot Agent provider requires clientSecret. ' +
          'Set it in config or via COPILOT_AGENT_CLIENT_SECRET environment variable.',
      };
    }

    const startTime = Date.now();

    try {
      const { CopilotStudioClient } = await getCopilotStudioClient();
      const { Activity, ActivityTypes } = await getAgentsActivity();
      const { ClientSecretCredential } = await getAzureIdentity();

      const settings = {
        environmentId,
        schemaName,
      };

      // Acquire token via Azure Entra ID client credentials flow
      const credential = new ClientSecretCredential(tenantId, clientId, clientSecret);
      const scope = CopilotStudioClient.scopeFromSettings(settings);
      const tokenResponse = await credential.getToken(scope);
      const token = tokenResponse.token;

      const client = new CopilotStudioClient(settings, token);

      // Start conversation with timeout
      const abortController = new AbortController();
      const timeoutHandle = setTimeout(() => abortController.abort(), timeoutMs);

      try {
        // Establish conversation
        for await (const _activity of client.startConversationStreaming({
          signal: abortController.signal,
        })) {
          // Consume startup activities (welcome messages, etc.)
          logger.debug(`[CopilotAgent] Startup activity received`);
        }

        // Build message activity
        const messageActivity = new Activity({
          type: ActivityTypes.Message,
          text: prompt,
          from: { id: userId, name: userId },
        });

        // Send message and collect responses
        const responseTexts: string[] = [];
        for await (const activity of client.sendActivityStreaming(messageActivity, {
          signal: abortController.signal,
        })) {
          if (activity.type === ActivityTypes.Message && activity.text) {
            responseTexts.push(activity.text);
          }
        }

        clearTimeout(timeoutHandle);

        const output = responseTexts.join('\n\n');
        const latencyMs = Date.now() - startTime;

        return {
          output: output || '(no response)',
          metadata: { latencyMs },
        };
      } catch (innerError: unknown) {
        clearTimeout(timeoutHandle);
        if (innerError instanceof Error && innerError.name === 'AbortError') {
          return {
            error: `Copilot Agent request timed out after ${timeoutMs}ms`,
          };
        }
        throw innerError;
      }
    } catch (error: unknown) {
      logger.error(`[CopilotAgent] Error: ${error}`);
      return {
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
