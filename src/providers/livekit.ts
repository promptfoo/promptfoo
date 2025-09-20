import type { ApiProvider, ProviderOptions, CallApiContextParams, CallApiOptionsParams } from '../types/providers';
import type { ProviderResponse } from '../types';
import logger from '../logger';
import invariant from '../util/invariant';

export interface LivekitProviderOptions extends ProviderOptions {
  config?: {
    agentPath?: string;          // Path to agent definition file
    sessionTimeout?: number;     // Session timeout in ms (default: 30000)
    roomName?: string;          // LiveKit room name
    serverUrl?: string;         // LiveKit server URL
    apiKey?: string;            // LiveKit API key
    apiSecret?: string;         // LiveKit API secret
    enableAudio?: boolean;      // Enable audio processing (default: false)
    enableVideo?: boolean;      // Enable video processing (default: false)
    enableChat?: boolean;       // Enable text chat (default: true)
    tools?: any[];              // Custom agent tools
    agentConfig?: any;          // Additional agent configuration
  };
}

interface LivekitResponse {
  text?: string;
  audio?: string;
  video?: string;
  metadata?: Record<string, any>;
  usage?: {
    total_tokens?: number;
    prompt_tokens?: number;
    completion_tokens?: number;
  };
}

export class LivekitProvider implements ApiProvider {
  private providerId: string;
  config?: LivekitProviderOptions['config'];
  private agent: any = null;
  private worker: any = null;

  constructor(options: LivekitProviderOptions) {
    this.providerId = options.id || 'livekit-provider';
    this.config = {
      sessionTimeout: 30000,
      enableAudio: false,
      enableVideo: false,
      enableChat: true,
      ...options.config,
    };
  }

  id(): string {
    return this.providerId;
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    options?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    try {
      // Initialize agent if not already done
      if (!this.agent) {
        await this.initializeAgent();
      }

      // Create session for this test
      const session = await this.createSession();

      // Send prompt and get response
      const response = await this.sendMessage(session, prompt, options?.abortSignal);

      // Cleanup session
      await this.cleanupSession(session);

      return {
        output: response.text || '',
        tokenUsage: response.usage ? {
          total: response.usage.total_tokens || 0,
          prompt: response.usage.prompt_tokens || 0,
          completion: response.usage.completion_tokens || 0,
        } : undefined,
        metadata: {
          sessionId: session?.id,
          audioUrl: response.audio,
          videoUrl: response.video,
          ...response.metadata,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`LiveKit provider error: ${errorMessage}`);
      return {
        error: errorMessage,
        output: '',
      };
    }
  }

  private async initializeAgent(): Promise<void> {
    try {
      // Validate required configuration first
      invariant(this.config?.agentPath, 'LiveKit provider requires agentPath configuration');

      // Dynamically import LiveKit Agents
      const { defineAgent } = await this.importLivekitAgents();

      // Load agent definition from file
      const agentDefinition = await this.loadAgentDefinition(this.config.agentPath);

      // Initialize the agent
      this.agent = defineAgent(agentDefinition);

      logger.info(`LiveKit agent initialized from ${this.config.agentPath}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to initialize LiveKit agent: ${errorMessage}`);
      throw new Error(`LiveKit agent initialization failed: ${errorMessage}`);
    }
  }

  private async importLivekitAgents(): Promise<any> {
    try {
      // Try to import LiveKit Agents
      // Note: This is a placeholder since @livekit/agents may not be installed
      // In a real implementation, this would dynamically import the actual package
      throw new Error('Dynamic import placeholder');
    } catch (error) {
      throw new Error(
        'LiveKit Agents JS package not found. Please install it with: npm install @livekit/agents'
      );
    }
  }

  private async loadAgentDefinition(agentPath: string): Promise<any> {
    try {
      // Import the agent definition file
      const agentModule = await import(agentPath);

      // Support both default export and named export
      const agentDefinition = agentModule.default || agentModule.agent || agentModule;

      if (!agentDefinition) {
        throw new Error(`No agent definition found in ${agentPath}`);
      }

      return agentDefinition;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to load agent definition from ${agentPath}: ${errorMessage}`);
    }
  }

  private async createSession(): Promise<any> {
    try {
      // This is a placeholder for actual session creation
      // In a real implementation, this would:
      // 1. Connect to LiveKit server
      // 2. Create a room or join existing room
      // 3. Initialize agent session
      // 4. Set up audio/video streams if needed

      const sessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      const session = {
        id: sessionId,
        createdAt: new Date(),
        config: this.config,
      };

      logger.debug(`Created LiveKit session: ${sessionId}`);
      return session;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to create LiveKit session: ${errorMessage}`);
    }
  }

  private async sendMessage(
    session: any,
    prompt: string,
    abortSignal?: AbortSignal,
  ): Promise<LivekitResponse> {
    try {
      // This is a placeholder for actual message sending
      // In a real implementation, this would:
      // 1. Send the prompt to the agent
      // 2. Handle the agent's response
      // 3. Process any audio/video outputs
      // 4. Return structured response

      // Check for abort signal
      if (abortSignal?.aborted) {
        throw new Error('Request was aborted');
      }

      // Simulate agent processing time
      await new Promise(resolve => setTimeout(resolve, 100));

      // Mock response for now
      const response: LivekitResponse = {
        text: `LiveKit agent response to: ${prompt}`,
        metadata: {
          sessionId: session.id,
          timestamp: new Date().toISOString(),
          enabledFeatures: {
            audio: this.config?.enableAudio,
            video: this.config?.enableVideo,
            chat: this.config?.enableChat,
          },
        },
      };

      logger.debug(`LiveKit agent responded to prompt in session ${session.id}`);
      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to send message to LiveKit agent: ${errorMessage}`);
    }
  }

  private async cleanupSession(session: any): Promise<void> {
    try {
      if (session) {
        // This is a placeholder for actual session cleanup
        // In a real implementation, this would:
        // 1. Close audio/video streams
        // 2. Disconnect from LiveKit room
        // 3. Clean up agent session resources

        logger.debug(`Cleaned up LiveKit session: ${session.id}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.warn(`Failed to cleanup LiveKit session: ${errorMessage}`);
    }
  }

  async cleanup(): Promise<void> {
    try {
      if (this.worker) {
        // Stop the worker if running
        await this.worker.stop();
        this.worker = null;
      }

      if (this.agent) {
        // Cleanup agent resources
        this.agent = null;
      }

      logger.debug('LiveKit provider cleaned up successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.warn(`Failed to cleanup LiveKit provider: ${errorMessage}`);
    }
  }
}

export function createLivekitProvider(
  providerPath: string,
  options: { config?: ProviderOptions; env?: any },
): LivekitProvider {
  const { config = {}, env } = options;

  // Parse provider path to extract agent name or configuration
  const pathParts = providerPath.split(':');
  let agentName = '';

  if (pathParts.length >= 2) {
    if (pathParts[1] === 'agent' && pathParts.length >= 3) {
      // Format: livekit:agent:<agent-name>
      agentName = pathParts.slice(2).join(':');
    } else {
      // Format: livekit:<agent-name>
      agentName = pathParts.slice(1).join(':');
    }
  }

  // Merge configuration with parsed path information
  const mergedConfig: LivekitProviderOptions = {
    ...config,
    config: {
      ...config.config,
      agentPath: config.config?.agentPath || agentName,
      serverUrl: config.config?.serverUrl || env?.LIVEKIT_URL,
      apiKey: config.config?.apiKey || env?.LIVEKIT_API_KEY,
      apiSecret: config.config?.apiSecret || env?.LIVEKIT_API_SECRET,
    },
  };

  return new LivekitProvider(mergedConfig);
}