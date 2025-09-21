import path from 'path';
import fs from 'fs/promises';
import type { ApiProvider, ProviderOptions, CallApiContextParams, CallApiOptionsParams } from '../../types/providers';
import type { ProviderResponse } from '../../types';
import logger from '../../logger';
import { getEnvString, getEnvBool, getEnvInt } from '../../envars';
import { importModule } from '../../esm';
import type { LiveKitConfig, LiveKitAgent, AgentResponse } from './types';
import { parseMultiModalInput, generateSessionId, createTimeout } from './utils';

export class LiveKitProvider implements ApiProvider {
  config: LiveKitConfig; // Make public to match ApiProvider interface
  private agentPath: string;
  private agent?: LiveKitAgent;
  private activeSessions = new Map<string, any>();

  constructor(
    agentPath: string,
    options: ProviderOptions & { config?: LiveKitConfig } = {}
  ) {
    this.agentPath = agentPath;
    this.config = this.mergeConfig(options.config || {});

    // Override id if provided
    if (options.id) {
      this.id = () => options.id!;
    }
  }

  id(): string {
    return `livekit:agent:${this.agentPath}`;
  }

  toString(): string {
    return `[LiveKit Provider ${this.agentPath}]`;
  }

  private mergeConfig(providedConfig: Partial<LiveKitConfig>): LiveKitConfig {
    return {
      url: getEnvString('LIVEKIT_URL') || providedConfig.url || 'ws://localhost:7880',
      apiKey: getEnvString('LIVEKIT_API_KEY') || providedConfig.apiKey,
      apiSecret: getEnvString('LIVEKIT_API_SECRET') || providedConfig.apiSecret,
      roomName: getEnvString('LIVEKIT_ROOM_NAME') || providedConfig.roomName || 'promptfoo-test',
      participantName: getEnvString('LIVEKIT_PARTICIPANT_NAME') || providedConfig.participantName || 'promptfoo',
      sessionTimeout: getEnvInt('LIVEKIT_SESSION_TIMEOUT') || providedConfig.sessionTimeout || 30000,
      enableAudio: getEnvBool('LIVEKIT_ENABLE_AUDIO') ?? providedConfig.enableAudio ?? true,
      enableVideo: getEnvBool('LIVEKIT_ENABLE_VIDEO') ?? providedConfig.enableVideo ?? false,
      enableChat: getEnvBool('LIVEKIT_ENABLE_CHAT') ?? providedConfig.enableChat ?? true,
    };
  }

  private async loadAgent(): Promise<LiveKitAgent> {
    if (this.agent) {
      return this.agent;
    }

    try {
      // Resolve the agent path
      const resolvedPath = path.resolve(this.agentPath);

      // Check if file exists
      await fs.access(resolvedPath);

      // Import the agent module
      const agentModule = await importModule(resolvedPath);

      // Get the agent (could be default export or module.exports)
      this.agent = agentModule.default || agentModule;

      if (!this.agent || typeof this.agent.entry !== 'function') {
        throw new Error('Agent must export an object with an entry function');
      }

      // Initialize agent if it has a prewarm function
      if (this.agent.prewarm) {
        const proc = {
          userData: {},
          pid: process.pid,
          startTime: Date.now(),
        };
        await this.agent.prewarm(proc);
        logger.debug('Agent prewarmed successfully');
      }

      logger.info(`LiveKit agent loaded: ${this.agentPath}`);
      return this.agent;

    } catch (error) {
      const message = `Failed to load LiveKit agent from ${this.agentPath}: ${error}`;
      logger.error(message);
      throw new Error(message);
    }
  }

  private async createSession(): Promise<{ sessionId: string; ctx: any }> {
    const agent = await this.loadAgent();
    const sessionId = generateSessionId();

    // Create session context
    const ctx = {
      sessionId,
      userData: {},
      parent: agent,
      config: this.config,
    };

    // Initialize session
    await agent.entry(ctx);

    // Store active session
    this.activeSessions.set(sessionId, ctx);

    // Set up session timeout
    setTimeout(() => {
      this.cleanupSession(sessionId);
    }, this.config.sessionTimeout!);

    logger.debug(`Created LiveKit session: ${sessionId}`);
    return { sessionId, ctx };
  }

  private cleanupSession(sessionId: string): void {
    if (this.activeSessions.has(sessionId)) {
      this.activeSessions.delete(sessionId);
      logger.debug(`Cleaned up session: ${sessionId}`);
    }
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    options?: CallApiOptionsParams
  ): Promise<ProviderResponse> {
    const startTime = Date.now();

    try {
      // Parse multi-modal input
      const parsedInput = parseMultiModalInput(prompt);
      const inputModalities = this.getInputModalities(parsedInput);

      // Create session
      const { sessionId, ctx } = await this.createSession();

      try {
        // Send message to agent
        if (!ctx.sendMessage || typeof ctx.sendMessage !== 'function') {
          throw new Error('Agent did not set up sendMessage function properly');
        }

        // Create timeout for the request
        const timeoutMs = this.config.sessionTimeout || 30000;
        const responsePromise = ctx.sendMessage(prompt);
        const timeoutPromise = createTimeout(timeoutMs);

        // Race between response and timeout
        const agentResponse: AgentResponse = await Promise.race([
          responsePromise,
          timeoutPromise
        ]);

        // Process response
        const response: ProviderResponse = {
          output: agentResponse.response || 'No response from agent',
          metadata: {
            sessionId,
            timestamp: new Date().toISOString(),
            inputModalities,
            responseModalities: this.getResponseModalities(agentResponse),
            processingTime: Date.now() - startTime,
            ...(agentResponse.metadata || {}),
          },
        };

        // Add tool calls if present
        if (agentResponse.metadata?.toolCalls) {
          response.metadata!.toolCalls = agentResponse.metadata.toolCalls;
        }

        return response;

      } finally {
        // Always cleanup session
        this.cleanupSession(sessionId);
      }

    } catch (error) {
      logger.error(`LiveKit provider error: ${error instanceof Error ? error.message : String(error)}`);

      return {
        error: `LiveKit provider error: ${error instanceof Error ? error.message : String(error)}`,
        metadata: {
          timestamp: new Date().toISOString(),
          processingTime: Date.now() - startTime,
          error: true,
        },
      };
    }
  }


  private getInputModalities(input: any): string[] {
    const modalities = ['text'];
    if (input.audioUrl) modalities.push('audio');
    if (input.videoUrl) modalities.push('video');
    return modalities;
  }

  private getResponseModalities(response: AgentResponse): string[] {
    const modalities = ['text'];
    // Add logic to detect audio/video responses if agent provides them
    return modalities;
  }
}