import path from 'path';
import fs from 'fs/promises';
import { AccessToken } from 'livekit-server-sdk';
import { Room, RoomEvent, DataPacketKind } from '@livekit/rtc-node';
import type { ApiProvider, ProviderOptions, CallApiContextParams, CallApiOptionsParams } from '../../types/providers';
import type { ProviderResponse } from '../../types';
import logger from '../../logger';
import { getEnvString, getEnvBool, getEnvInt } from '../../envars';
import { importModule } from '../../esm';
import type { LiveKitConfig, LiveKitAgent, AgentResponse, JobProcess, AgentContext } from './types';
import { parseMultiModalInput, generateSessionId, createTimeout } from './utils';

export class LiveKitProvider implements ApiProvider {
  config: LiveKitConfig;
  private agentPath: string;
  private agent?: LiveKitAgent;
  private activeRooms = new Map<string, Room>();

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
    const apiKey = getEnvString('LIVEKIT_API_KEY') || providedConfig.apiKey;
    const apiSecret = getEnvString('LIVEKIT_API_SECRET') || providedConfig.apiSecret;

    if (!apiKey || !apiSecret) {
      throw new Error('LiveKit API key and secret are required. Set LIVEKIT_API_KEY and LIVEKIT_API_SECRET environment variables.');
    }

    return {
      url: getEnvString('LIVEKIT_URL') || providedConfig.url || 'ws://localhost:7880',
      apiKey,
      apiSecret,
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

      logger.info(`LiveKit agent loaded: ${this.agentPath}`);
      return this.agent;

    } catch (error) {
      const message = `Failed to load LiveKit agent from ${this.agentPath}: ${error}`;
      logger.error(message);
      throw new Error(message);
    }
  }

  private async generateAccessToken(identity: string, roomName: string): Promise<string> {
    const at = new AccessToken(this.config.apiKey, this.config.apiSecret, {
      identity,
      name: this.config.participantName,
      ttl: (this.config.sessionTimeout || 30000) / 1000, // Convert to seconds
    });

    at.addGrant({
      room: roomName,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });

    return await at.toJwt();
  }

  private async createRoom(roomName: string, participantIdentity: string): Promise<Room> {
    // Generate access token for this session
    const token = await this.generateAccessToken(participantIdentity, roomName);

    // Create real LiveKit room instance
    const room = new Room();

    // Connect to the actual LiveKit server
    await room.connect(this.config.url!, token, {
      autoSubscribe: true,
      dynacast: true,
    });

    logger.debug(`Connected to LiveKit room: ${roomName} as ${participantIdentity}`);
    return room;
  }

  private async setupAgentWorker(room: Room, roomName?: string): Promise<{ agent: LiveKitAgent; context: AgentContext }> {
    const agent = await this.loadAgent();

    // Create JobProcess-like object for agent initialization
    const proc: JobProcess = {
      userData: {},
      pid: process.pid,
      startTime: Date.now(),
    };

    // Initialize agent if it has a prewarm function (similar to LiveKit Agents framework)
    if (agent.prewarm) {
      await agent.prewarm(proc);
      logger.debug('Agent prewarmed successfully');
    }

    // Create agent context that mimics LiveKit Agents JobContext
    const context: AgentContext = {
      room,
      sessionId: generateSessionId(),
      userData: proc.userData,
      config: this.config,
      proc,
      // Add agent-specific properties
      workerId: `promptfoo-worker-${Date.now()}`,
      job: {
        id: generateSessionId(),
        type: 'ROOM',
        room: {
          name: room.name || roomName || 'unknown',
          sid: generateSessionId(), // Generate a unique room session ID
        },
      },
    };

    // Initialize the agent entry point
    await agent.entry(context);

    return { agent, context };
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    options?: CallApiOptionsParams
  ): Promise<ProviderResponse> {
    const startTime = Date.now();
    const sessionId = generateSessionId();
    const roomName = `${this.config.roomName}-${sessionId}`;
    const participantIdentity = `${this.config.participantName}-${Date.now()}`;

    let room: Room | undefined;

    try {
      // Parse input and setup session
      const parsedInput = parseMultiModalInput(prompt);
      const inputModalities = this.getInputModalities(parsedInput);

      // Setup LiveKit connection and agent
      room = await this.setupRoomConnection(roomName, participantIdentity, sessionId);
      const agentContext = await this.setupAgentWorker(room, roomName);

      // Wait for room connection to be established
      await this.waitForRoomConnection(room);

      // Communicate with agent and get response
      const agentResponse = await this.communicateWithAgent(
        room,
        agentContext.context,
        prompt,
        sessionId
      );

      // Build and return the final response
      return this.buildProviderResponse(
        agentResponse,
        sessionId,
        roomName,
        participantIdentity,
        inputModalities,
        startTime
      );

    } catch (error) {
      return this.buildErrorResponse(error, sessionId, roomName, startTime);
    } finally {
      await this.cleanupRoom(room, sessionId, roomName);
    }
  }

  private async setupRoomConnection(roomName: string, participantIdentity: string, sessionId: string): Promise<Room> {
    const room = await this.createRoom(roomName, participantIdentity);
    this.activeRooms.set(sessionId, room);
    return room;
  }

  private async waitForRoomConnection(room: Room): Promise<void> {
    // For real LiveKit rooms, we use events to wait for connection
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Room connection timeout'));
      }, 10000);

      room.once(RoomEvent.Connected, () => {
        clearTimeout(timeout);
        resolve();
      });

      room.once(RoomEvent.Disconnected, (reason) => {
        clearTimeout(timeout);
        reject(new Error(`Room disconnected: ${reason}`));
      });

      // If already connected, resolve immediately
      if (room.isConnected) {
        clearTimeout(timeout);
        resolve();
      }
    });
  }

  private async communicateWithAgent(
    room: Room,
    agentContext: AgentContext,
    prompt: string,
    sessionId: string
  ): Promise<AgentResponse> {
    /**
     * LiveKit Agent Communication Patterns:
     *
     * The LiveKit provider supports two communication patterns with agents:
     *
     * 1. Direct sendMessage Function (Preferred):
     *    - The agent's entry() function attaches a sendMessage handler to the context
     *    - This provides synchronous, direct communication ideal for testing
     *    - Example: ctx.sendMessage = async (input) => { return { response: "Hello" }; }
     *    - Benefits: Simpler testing, immediate responses, easier debugging
     *
     * 2. LiveKit Data Channel (Fallback):
     *    - Uses WebRTC data channels for bidirectional communication
     *    - Agent listens for 'dataReceived' events and publishes responses
     *    - More realistic simulation of production LiveKit agent behavior
     *    - Benefits: Tests real data channel flow, network simulation capabilities
     */

    // Check if agent provides direct sendMessage function (preferred method)
    if (agentContext.sendMessage && typeof agentContext.sendMessage === 'function') {
      return await agentContext.sendMessage(prompt);
    }

    // Fallback to data channel communication
    return await this.communicateViaDataChannel(room, prompt, sessionId);
  }

  private async communicateViaDataChannel(
    room: Room,
    prompt: string,
    sessionId: string
  ): Promise<AgentResponse> {
    let responseReceived = false;

    // Setup response listener
    const responsePromise = new Promise<AgentResponse>((resolve, reject) => {
      const timeout = this.config.sessionTimeout || 30000;
      const responseTimeout = setTimeout(() => {
        if (!responseReceived) {
          reject(new Error(`Agent response timeout after ${timeout}ms`));
        }
      }, timeout);

      // Listen for data received events from actual LiveKit room
      room.on(RoomEvent.DataReceived, (payload: Uint8Array, participant?: any, kind?: DataPacketKind, topic?: string) => {
        if (!responseReceived) {
          try {
            const data = JSON.parse(new TextDecoder().decode(payload));
            if (data.type === 'agent_response') {
              responseReceived = true;
              clearTimeout(responseTimeout);
              resolve(data.response as AgentResponse);
            }
          } catch (error) {
            logger.warn(`Failed to parse agent response data: ${error}`);
          }
        }
      });
    });

    // Send prompt to agent
    const messageData = {
      type: 'prompt',
      content: prompt,
      timestamp: new Date().toISOString(),
      sessionId,
    };

    await room.localParticipant?.publishData(
      new TextEncoder().encode(JSON.stringify(messageData)),
      { reliable: true }
    );

    // Wait for response with timeout
    return await Promise.race([
      responsePromise,
      createTimeout(this.config.sessionTimeout || 30000)
    ]);
  }

  private buildProviderResponse(
    agentResponse: AgentResponse,
    sessionId: string,
    roomName: string,
    participantIdentity: string,
    inputModalities: string[],
    startTime: number
  ): ProviderResponse {
    const response: ProviderResponse = {
      output: agentResponse.response || 'No response from agent',
      metadata: {
        sessionId,
        roomName,
        participantIdentity,
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
  }

  private buildErrorResponse(
    error: unknown,
    sessionId: string,
    roomName: string | undefined,
    startTime: number
  ): ProviderResponse {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`LiveKit provider error: ${errorMessage}`);

    return {
      error: `LiveKit provider error: ${errorMessage}`,
      metadata: {
        sessionId,
        roomName: roomName || 'unknown',
        timestamp: new Date().toISOString(),
        processingTime: Date.now() - startTime,
        error: true,
      },
    };
  }

  private async cleanupRoom(room: Room | undefined, sessionId: string, roomName: string): Promise<void> {
    if (room) {
      try {
        await room.disconnect();
        this.activeRooms.delete(sessionId);
        logger.debug(`Disconnected from room: ${roomName}`);
      } catch (error) {
        logger.warn(`Error disconnecting from room: ${error}`);
      }
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

    // Check if agent explicitly provided response modalities
    if (response.metadata?.responseModalities) {
      return response.metadata.responseModalities;
    }

    // Detect modalities based on response content
    if (response.audioUrl || response.audioData) {
      modalities.push('audio');
    }

    if (response.videoUrl || response.videoData) {
      modalities.push('video');
    }

    // Check for audio/video content in the response string (URL patterns)
    if (response.response) {
      if (/audio:|\.(?:mp3|wav|m4a|ogg|flac|aac)(?:\?|$)/i.test(response.response)) {
        if (!modalities.includes('audio')) modalities.push('audio');
      }
      if (/video:|\.(?:mp4|avi|mov|wmv|flv|webm|mkv)(?:\?|$)/i.test(response.response)) {
        if (!modalities.includes('video')) modalities.push('video');
      }
    }

    return modalities;
  }

  async cleanup(): Promise<void> {
    // Disconnect all active rooms
    const disconnectPromises = Array.from(this.activeRooms.values()).map(async (room) => {
      try {
        await room.disconnect();
      } catch (error) {
        logger.warn(`Error during room cleanup: ${error}`);
      }
    });

    await Promise.all(disconnectPromises);
    this.activeRooms.clear();
    logger.debug('LiveKit provider cleanup completed');
  }
}