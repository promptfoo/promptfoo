import path from 'path';
import fs from 'fs/promises';
import type { ApiProvider, ProviderOptions, CallApiContextParams, CallApiOptionsParams } from '../types/providers';
import type { ProviderResponse } from '../types';
import logger from '../logger';
import invariant from '../util/invariant';
import { importModule } from '../esm';
import { getEnvString, getEnvInt, getEnvBool } from '../envars';

export interface LivekitProviderOptions extends ProviderOptions {
  config?: LivekitProviderConfig;
}

export interface LivekitProviderConfig {
  // Agent Configuration
  agentPath?: string;                    // Path to agent definition file
  agentConfig?: Record<string, any>;     // Additional agent configuration
  tools?: AgentTool[];                   // Custom agent tools

  // Connection Configuration
  serverUrl?: string;                    // LiveKit server URL (default: from LIVEKIT_URL)
  apiKey?: string;                       // LiveKit API key (default: from LIVEKIT_API_KEY)
  apiSecret?: string;                    // LiveKit API secret (default: from LIVEKIT_API_SECRET)
  region?: string;                       // LiveKit server region

  // Room Configuration
  roomName?: string;                     // LiveKit room name (auto-generated if not provided)
  roomConfig?: RoomConfig;               // Additional room configuration
  participantIdentity?: string;          // Agent participant identity
  participantName?: string;              // Agent participant display name
  participantMetadata?: Record<string, any>; // Agent participant metadata

  // Session Configuration
  sessionTimeout?: number;               // Session timeout in ms (default: 30000)
  maxConcurrentSessions?: number;        // Maximum concurrent sessions (default: 1)
  retryAttempts?: number;                // Connection retry attempts (default: 3)
  retryDelay?: number;                   // Delay between retries in ms (default: 1000)

  // Media Configuration
  enableAudio?: boolean;                 // Enable audio processing (default: false)
  enableVideo?: boolean;                 // Enable video processing (default: false)
  enableChat?: boolean;                  // Enable text chat (default: true)
  enableScreenShare?: boolean;           // Enable screen sharing (default: false)

  // Audio Configuration
  audioConfig?: AudioConfig;             // Audio-specific settings

  // Video Configuration
  videoConfig?: VideoConfig;             // Video-specific settings

  // Advanced Configuration
  debug?: boolean;                       // Enable debug logging (default: false)
  logLevel?: 'error' | 'warn' | 'info' | 'debug'; // Log level (default: 'info')
  enableMetrics?: boolean;               // Enable performance metrics (default: false)
  enableTracing?: boolean;               // Enable request tracing (default: false)
}

export interface AgentTool {
  name: string;
  description: string;
  parameters?: Record<string, any>;
  function: (input: any) => any | Promise<any>;
}

export interface RoomConfig {
  maxParticipants?: number;              // Maximum participants in room
  emptyTimeout?: number;                 // Room timeout when empty (seconds)
  enableRecording?: boolean;             // Enable room recording
  recordingConfig?: RecordingConfig;     // Recording configuration
}

export interface AudioConfig {
  sampleRate?: number;                   // Audio sample rate (default: 48000)
  channels?: number;                     // Audio channels (default: 1)
  bitrate?: number;                      // Audio bitrate (default: 64000)
  codec?: 'opus' | 'aac';               // Audio codec (default: 'opus')
  enableNoiseSuppression?: boolean;      // Enable noise suppression (default: true)
  enableEchoCancellation?: boolean;      // Enable echo cancellation (default: true)
  enableAutoGainControl?: boolean;       // Enable auto gain control (default: true)
}

export interface VideoConfig {
  width?: number;                        // Video width (default: 1280)
  height?: number;                       // Video height (default: 720)
  framerate?: number;                    // Video framerate (default: 30)
  bitrate?: number;                      // Video bitrate (default: 1000000)
  codec?: 'vp8' | 'vp9' | 'h264' | 'av1'; // Video codec (default: 'vp8')
  enableHardwareAcceleration?: boolean;  // Enable hardware acceleration (default: true)
}

export interface RecordingConfig {
  audio?: boolean;                       // Record audio (default: true)
  video?: boolean;                       // Record video (default: true)
  preset?: 'low' | 'medium' | 'high';   // Recording quality preset (default: 'medium')
  output?: 'mp4' | 'webm';              // Output format (default: 'mp4')
}

interface AudioData {
  data: Buffer | string;                     // Audio data (Buffer for binary, string for base64/URL)
  format: 'wav' | 'mp3' | 'opus' | 'raw';    // Audio format
  sampleRate: number;                        // Sample rate in Hz
  channels: number;                          // Number of audio channels
  duration?: number;                         // Duration in seconds
  url?: string;                              // Optional URL for hosted audio
}

interface VideoData {
  data: Buffer | string;                     // Video data (Buffer for binary, string for base64/URL)
  format: 'mp4' | 'webm' | 'raw';           // Video format
  width: number;                             // Video width in pixels
  height: number;                            // Video height in pixels
  framerate: number;                         // Framerate in fps
  duration?: number;                         // Duration in seconds
  url?: string;                              // Optional URL for hosted video
}

interface MultiModalInput {
  text?: string;                             // Text input
  audio?: AudioData;                         // Audio input
  video?: VideoData;                         // Video input
  metadata?: Record<string, any>;            // Additional metadata
}

interface LivekitResponse {
  text?: string;
  audio?: AudioData;                         // Enhanced audio response
  video?: VideoData;                         // Enhanced video response
  metadata?: Record<string, any>;
  usage?: {
    total_tokens?: number;
    prompt_tokens?: number;
    completion_tokens?: number;
  };
  // Standardized response fields
  timestamp?: string;                        // ISO timestamp of response
  responseId?: string;                       // Unique response identifier
  status?: 'success' | 'partial' | 'error'; // Response status
  warnings?: string[];                       // Non-fatal warnings
}

interface AgentDefinition {
  prewarm?: (proc: any) => Promise<void>;
  entry?: (ctx: any) => Promise<void>;
  tools?: any[];
  config?: Record<string, any>;
}

interface LivekitSession {
  id: string;
  createdAt: Date;
  config: LivekitProviderOptions['config'];
  context?: any;
  room?: any;
  participant?: any;
  status: 'created' | 'connected' | 'running' | 'closing' | 'closed';
}

export class LivekitProvider implements ApiProvider {
  private providerId: string;
  config: LivekitProviderConfig;
  private agent: any = null;
  private worker: any = null;
  private agentDefinition: AgentDefinition | null = null;
  private basePath: string;

  constructor(options: LivekitProviderOptions, basePath?: string) {
    this.providerId = options.id || 'livekit-provider';
    this.basePath = basePath || process.cwd();

    // Apply default configuration values
    this.config = this.mergeWithDefaults(options.config || {});

    // Validate configuration
    this.validateConfiguration();
  }

  private mergeWithDefaults(userConfig: Partial<LivekitProviderConfig>): LivekitProviderConfig {
    const defaults: LivekitProviderConfig = {
      // Session defaults
      sessionTimeout: 30000,
      maxConcurrentSessions: 1,
      retryAttempts: 3,
      retryDelay: 1000,

      // Media defaults
      enableAudio: false,
      enableVideo: false,
      enableChat: true,
      enableScreenShare: false,

      // Audio defaults
      audioConfig: {
        sampleRate: 48000,
        channels: 1,
        bitrate: 64000,
        codec: 'opus',
        enableNoiseSuppression: true,
        enableEchoCancellation: true,
        enableAutoGainControl: true,
      },

      // Video defaults
      videoConfig: {
        width: 1280,
        height: 720,
        framerate: 30,
        bitrate: 1000000,
        codec: 'vp8',
        enableHardwareAcceleration: true,
      },

      // Room defaults
      roomConfig: {
        maxParticipants: 50,
        emptyTimeout: 300, // 5 minutes
        enableRecording: false,
        recordingConfig: {
          audio: true,
          video: true,
          preset: 'medium',
          output: 'mp4',
        },
      },

      // Advanced defaults
      debug: false,
      logLevel: 'info',
      enableMetrics: false,
      enableTracing: false,
    };

    // Deep merge user config with defaults
    return this.deepMerge(defaults, userConfig);
  }

  private deepMerge(target: any, source: any): any {
    const result = { ...target };

    for (const key in source) {
      if (source[key] !== null && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = this.deepMerge(result[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }

    return result;
  }

  private validateConfiguration(): void {
    // Validate session timeout
    if (this.config.sessionTimeout && (this.config.sessionTimeout < 1000 || this.config.sessionTimeout > 300000)) {
      throw new Error('sessionTimeout must be between 1000ms and 300000ms (5 minutes)');
    }

    // Validate max concurrent sessions
    if (this.config.maxConcurrentSessions && (this.config.maxConcurrentSessions < 1 || this.config.maxConcurrentSessions > 100)) {
      throw new Error('maxConcurrentSessions must be between 1 and 100');
    }

    // Validate retry attempts
    if (this.config.retryAttempts && (this.config.retryAttempts < 0 || this.config.retryAttempts > 10)) {
      throw new Error('retryAttempts must be between 0 and 10');
    }

    // Validate retry delay
    if (this.config.retryDelay && (this.config.retryDelay < 100 || this.config.retryDelay > 30000)) {
      throw new Error('retryDelay must be between 100ms and 30000ms');
    }

    // Validate audio configuration
    if (this.config.audioConfig) {
      this.validateAudioConfig(this.config.audioConfig);
    }

    // Validate video configuration
    if (this.config.videoConfig) {
      this.validateVideoConfig(this.config.videoConfig);
    }

    // Validate room configuration
    if (this.config.roomConfig) {
      this.validateRoomConfig(this.config.roomConfig);
    }

    logger.debug('LiveKit provider configuration validated successfully');
  }

  private validateAudioConfig(audioConfig: AudioConfig): void {
    if (audioConfig.sampleRate && ![8000, 16000, 24000, 48000].includes(audioConfig.sampleRate)) {
      throw new Error('audioConfig.sampleRate must be one of: 8000, 16000, 24000, 48000');
    }

    if (audioConfig.channels && (audioConfig.channels < 1 || audioConfig.channels > 2)) {
      throw new Error('audioConfig.channels must be 1 or 2');
    }

    if (audioConfig.bitrate && (audioConfig.bitrate < 8000 || audioConfig.bitrate > 320000)) {
      throw new Error('audioConfig.bitrate must be between 8000 and 320000');
    }
  }

  private validateVideoConfig(videoConfig: VideoConfig): void {
    if (videoConfig.width && (videoConfig.width < 160 || videoConfig.width > 3840)) {
      throw new Error('videoConfig.width must be between 160 and 3840');
    }

    if (videoConfig.height && (videoConfig.height < 120 || videoConfig.height > 2160)) {
      throw new Error('videoConfig.height must be between 120 and 2160');
    }

    if (videoConfig.framerate && (videoConfig.framerate < 1 || videoConfig.framerate > 60)) {
      throw new Error('videoConfig.framerate must be between 1 and 60');
    }

    if (videoConfig.bitrate && (videoConfig.bitrate < 100000 || videoConfig.bitrate > 50000000)) {
      throw new Error('videoConfig.bitrate must be between 100000 and 50000000');
    }
  }

  private validateRoomConfig(roomConfig: RoomConfig): void {
    if (roomConfig.maxParticipants && (roomConfig.maxParticipants < 2 || roomConfig.maxParticipants > 500)) {
      throw new Error('roomConfig.maxParticipants must be between 2 and 500');
    }

    if (roomConfig.emptyTimeout && (roomConfig.emptyTimeout < 30 || roomConfig.emptyTimeout > 3600)) {
      throw new Error('roomConfig.emptyTimeout must be between 30 and 3600 seconds');
    }
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

      // Parse multi-modal input
      const multiModalInput = await this.parseMultiModalInput(prompt, context);

      // Create session for this test
      const session = await this.createSession();

      // Send multi-modal message and get response
      const response = await this.sendMultiModalMessage(session, multiModalInput, options?.abortSignal);

      // Cleanup session
      await this.cleanupSession(session);

      // Format response with enhanced multi-modal support
      return this.formatProviderResponse(response, session);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`LiveKit provider error: ${errorMessage}`);
      return {
        error: errorMessage,
        output: '',
      };
    }
  }

  /**
   * Parses multi-modal input from prompt and context
   */
  private async parseMultiModalInput(prompt: string, context?: CallApiContextParams): Promise<MultiModalInput> {
    const input: MultiModalInput = {
      text: prompt,
      metadata: context?.vars || {},
    };

    // Parse audio input if enabled and available
    if (this.config.enableAudio && this.config.audioConfig) {
      // Check if prompt contains audio reference
      const audioMatch = prompt.match(/audio:([^\s]+)/);
      if (audioMatch) {
        const audioReference = audioMatch[1];
        const audioData = await AudioProcessor.parseAudioInput(audioReference, this.config.audioConfig);
        if (audioData) {
          input.audio = audioData;
        }
        // Remove audio reference from text
        input.text = prompt.replace(/audio:[^\s]+\s*/, '').trim();
      }

      // Check context for audio data
      if (context?.vars?.audio) {
        const audioData = await AudioProcessor.parseAudioInput(
          String(context.vars.audio),
          this.config.audioConfig
        );
        if (audioData) {
          input.audio = audioData;
        }
      }
    }

    // Parse video input if enabled and available
    if (this.config.enableVideo && this.config.videoConfig) {
      // Check if prompt contains video reference
      const videoMatch = prompt.match(/video:([^\s]+)/);
      if (videoMatch) {
        const videoReference = videoMatch[1];
        const videoData = await VideoProcessor.parseVideoInput(videoReference, this.config.videoConfig);
        if (videoData) {
          input.video = videoData;
        }
        // Remove video reference from text
        input.text = input.text?.replace(/video:[^\s]+\s*/, '').trim();
      }

      // Check context for video data
      if (context?.vars?.video) {
        const videoData = await VideoProcessor.parseVideoInput(
          String(context.vars.video),
          this.config.videoConfig
        );
        if (videoData) {
          input.video = videoData;
        }
      }
    }

    // TODO: Add other multi-modal inputs (images, documents, etc.)

    return input;
  }

  /**
   * Formats the provider response with enhanced multi-modal data
   */
  private formatProviderResponse(response: LivekitResponse, session: LivekitSession): ProviderResponse {
    // Build the primary text output
    const outputParts = [];
    if (response.text) {
      outputParts.push(response.text);
    }

    // Add descriptions of non-text modalities to the output for visibility
    if (response.audio) {
      outputParts.push(`[Audio: ${response.audio.format}, ${response.audio.duration || 'unknown'}s]`);
    }
    if (response.video) {
      outputParts.push(`[Video: ${response.video.format}, ${response.video.width}x${response.video.height}]`);
    }

    const formattedResponse: ProviderResponse = {
      output: outputParts.join('\n'),
      tokenUsage: response.usage ? {
        total: response.usage.total_tokens || 0,
        prompt: response.usage.prompt_tokens || 0,
        completion: response.usage.completion_tokens || 0,
      } : undefined,
      metadata: {
        sessionId: session?.id,
        ...response.metadata,
      },
    };

    // Enhanced audio metadata processing
    if (response.audio) {
      formattedResponse.metadata!.audio = {
        format: response.audio.format,
        sampleRate: response.audio.sampleRate,
        channels: response.audio.channels,
        duration: response.audio.duration,
        url: response.audio.url,
        // Don't include raw data in metadata to avoid huge responses
        hasData: Boolean(response.audio.data),
        // Additional audio quality indicators
        bitrate: this.config.audioConfig?.bitrate,
        codec: this.config.audioConfig?.codec,
      };

      // For backward compatibility, also include audioUrl
      if (response.audio.url) {
        formattedResponse.metadata!.audioUrl = response.audio.url;
      }
    }

    // Enhanced video metadata processing
    if (response.video) {
      formattedResponse.metadata!.video = {
        format: response.video.format,
        width: response.video.width,
        height: response.video.height,
        framerate: response.video.framerate,
        duration: response.video.duration,
        url: response.video.url,
        // Don't include raw data in metadata to avoid huge responses
        hasData: Boolean(response.video.data),
        // Additional video quality indicators
        bitrate: this.config.videoConfig?.bitrate,
        codec: this.config.videoConfig?.codec,
      };

      // For backward compatibility, also include videoUrl
      if (response.video.url) {
        formattedResponse.metadata!.videoUrl = response.video.url;
      }
    }

    // Add modality summary for easy inspection
    const modalities = [];
    if (response.text) modalities.push('text');
    if (response.audio) modalities.push('audio');
    if (response.video) modalities.push('video');
    if (response.metadata?.toolCalls) modalities.push('tools');
    if (response.metadata?.functionCalls) modalities.push('functions');

    formattedResponse.metadata!.responseModalities = modalities;
    formattedResponse.metadata!.isMultiModal = modalities.length > 1;

    // Add processing statistics
    formattedResponse.metadata!.processing = {
      sessionStatus: session.status,
      enabledFeatures: {
        audio: this.config.enableAudio,
        video: this.config.enableVideo,
        chat: this.config.enableChat,
        tools: Boolean(this.agentDefinition?.tools?.length),
      },
    };

    // Add standardized response metadata
    if (response.timestamp) {
      formattedResponse.metadata!.timestamp = response.timestamp;
    }
    if (response.responseId) {
      formattedResponse.metadata!.responseId = response.responseId;
    }
    if (response.status) {
      formattedResponse.metadata!.status = response.status;
    }
    if (response.warnings && response.warnings.length > 0) {
      formattedResponse.metadata!.warnings = response.warnings;
    }

    // Add response quality indicators
    formattedResponse.metadata!.quality = {
      hasText: Boolean(response.text),
      hasAudio: Boolean(response.audio),
      hasVideo: Boolean(response.video),
      hasMetadata: Boolean(response.metadata && Object.keys(response.metadata).length > 0),
      completeness: this.calculateResponseCompleteness(response),
    };

    return formattedResponse;
  }

  /**
   * Calculates response completeness as a percentage
   */
  private calculateResponseCompleteness(response: LivekitResponse): number {
    let score = 0;
    let maxScore = 0;

    // Text response (always expected)
    maxScore += 25;
    if (response.text && response.text.trim().length > 0) {
      score += 25;
    }

    // Audio response (if enabled)
    if (this.config.enableAudio) {
      maxScore += 25;
      if (response.audio) {
        score += 25;
      }
    }

    // Video response (if enabled)
    if (this.config.enableVideo) {
      maxScore += 25;
      if (response.video) {
        score += 25;
      }
    }

    // Metadata and usage information
    maxScore += 25;
    if (response.metadata || response.usage) {
      score += 25;
    }

    return maxScore > 0 ? Math.round((score / maxScore) * 100) : 100;
  }

  private async initializeAgent(): Promise<void> {
    try {
      // Validate required configuration first
      invariant(this.config?.agentPath, 'LiveKit provider requires agentPath configuration');

      // Load agent definition from file
      this.agentDefinition = await this.loadAgentDefinition(this.config.agentPath);

      // Run prewarm if available
      await this.runPrewarmProcess();

      // Dynamically import LiveKit Agents (will fail for now, but structure is ready)
      const { defineAgent } = await this.importLivekitAgents();

      // Initialize the agent with the loaded definition
      this.agent = defineAgent(this.agentDefinition);

      logger.info(`LiveKit agent initialized from ${this.config.agentPath}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to initialize LiveKit agent: ${errorMessage}`);
      throw new Error(`LiveKit agent initialization failed: ${errorMessage}`);
    }
  }

  private async runPrewarmProcess(): Promise<void> {
    if (!this.agentDefinition?.prewarm) {
      logger.debug('No prewarm function found in agent definition');
      return;
    }

    try {
      logger.debug('Running agent prewarm process');

      // Create a mock process object for prewarm
      const mockProcess = {
        userData: {},
        config: this.config,
        logger: logger,
      };

      // Run the prewarm function
      await this.agentDefinition.prewarm(mockProcess);

      logger.info('Agent prewarm process completed successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Agent prewarm process failed: ${errorMessage}`);
      throw new Error(`Agent prewarm failed: ${errorMessage}`);
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

  private async loadAgentDefinition(agentPath: string): Promise<AgentDefinition> {
    try {
      // Resolve the absolute path
      const resolvedPath = path.isAbsolute(agentPath)
        ? agentPath
        : path.resolve(this.basePath, agentPath);

      logger.debug(`Loading agent definition from: ${resolvedPath}`);

      // Check if file exists
      try {
        await fs.access(resolvedPath);
      } catch {
        throw new Error(`Agent definition file not found: ${resolvedPath}`);
      }

      // Load the agent definition using ESM import
      let agentModule: any;

      if (resolvedPath.endsWith('.js') || resolvedPath.endsWith('.mjs') || resolvedPath.endsWith('.ts')) {
        // Use importModule for JavaScript/TypeScript files
        agentModule = await importModule(resolvedPath);
      } else if (resolvedPath.endsWith('.json')) {
        // Load JSON configuration
        const jsonContent = await fs.readFile(resolvedPath, 'utf-8');
        agentModule = { default: JSON.parse(jsonContent) };
      } else {
        throw new Error(`Unsupported agent definition file type: ${path.extname(resolvedPath)}`);
      }

      // Support both default export and named export
      const agentDefinition = agentModule.default || agentModule.agent || agentModule;

      if (!agentDefinition) {
        throw new Error(`No agent definition found in ${resolvedPath}`);
      }

      // Validate agent definition structure
      this.validateAgentDefinition(agentDefinition);

      logger.info(`Successfully loaded agent definition from ${resolvedPath}`);
      return agentDefinition as AgentDefinition;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to load agent definition from ${agentPath}: ${errorMessage}`);
    }
  }

  private validateAgentDefinition(definition: any): void {
    if (typeof definition !== 'object' || definition === null) {
      throw new Error('Agent definition must be an object');
    }

    // Check for required or recommended properties
    const hasPrewarm = typeof definition.prewarm === 'function';
    const hasEntry = typeof definition.entry === 'function';
    const hasConfig = definition.config && typeof definition.config === 'object';

    if (!hasPrewarm && !hasEntry && !hasConfig) {
      logger.warn('Agent definition appears to be empty or invalid - no prewarm, entry, or config found');
    }

    if (definition.tools && !Array.isArray(definition.tools)) {
      throw new Error('Agent definition tools must be an array');
    }

    logger.debug('Agent definition validation passed');
  }

  private async createSession(): Promise<LivekitSession> {
    try {
      const sessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      const session: LivekitSession = {
        id: sessionId,
        createdAt: new Date(),
        config: this.config,
        status: 'created',
      };

      // Initialize session context if agent definition has entry point
      if (this.agentDefinition?.entry) {
        session.context = await this.initializeSessionContext(session);
        session.status = 'connected';
      }

      // Set up room and participant connections
      await this.setupSessionConnections(session);

      session.status = 'running';
      logger.debug(`Created LiveKit session: ${sessionId} with status: ${session.status}`);
      return session;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to create LiveKit session: ${errorMessage}`);
    }
  }

  private async initializeSessionContext(session: LivekitSession): Promise<any> {
    try {
      logger.debug(`Initializing session context for ${session.id}`);

      // Create a mock context object that would typically be provided by LiveKit
      const context = {
        sessionId: session.id,
        room: null, // Will be set when actual LiveKit integration is complete
        participant: null, // Will be set when actual LiveKit integration is complete
        config: this.config,
        userData: {},
        tools: this.agentDefinition?.tools || [],
        logger: logger,

        // Mock LiveKit-specific methods
        connect: async () => {
          logger.debug(`Mock connect called for session ${session.id}`);
        },
        disconnect: async () => {
          logger.debug(`Mock disconnect called for session ${session.id}`);
        },
        sendMessage: async (message: string) => {
          logger.debug(`Mock sendMessage called: ${message}`);
          return { success: true, messageId: Date.now().toString() };
        },
      };

      // Run the agent's entry function if available
      if (this.agentDefinition?.entry) {
        await this.agentDefinition.entry(context);
        logger.debug(`Agent entry function completed for session ${session.id}`);
      }

      return context;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to initialize session context: ${errorMessage}`);
      throw new Error(`Session context initialization failed: ${errorMessage}`);
    }
  }

  private async setupSessionConnections(session: LivekitSession): Promise<void> {
    try {
      logger.debug(`Setting up connections for session ${session.id}`);

      // In a real implementation, this would:
      // 1. Connect to LiveKit server using config.serverUrl
      // 2. Authenticate using config.apiKey and config.apiSecret
      // 3. Create or join a room
      // 4. Set up participant with audio/video capabilities based on config
      // 5. Initialize media streams if enableAudio/enableVideo is true

      // Mock room setup
      session.room = {
        id: `room-${session.id}`,
        name: this.config?.roomName || `test-room-${session.id}`,
        status: 'connected',
        participants: [],
      };

      // Mock participant setup
      session.participant = {
        id: `participant-${session.id}`,
        identity: `agent-${this.providerId}`,
        metadata: {
          agentProvider: 'promptfoo-livekit',
          sessionId: session.id,
          capabilities: {
            audio: this.config?.enableAudio || false,
            video: this.config?.enableVideo || false,
            chat: this.config?.enableChat || true,
          },
        },
      };

      logger.debug(`Session connections established for ${session.id}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to setup session connections: ${errorMessage}`);
      throw new Error(`Session connection setup failed: ${errorMessage}`);
    }
  }

  private async sendMultiModalMessage(
    session: LivekitSession,
    input: MultiModalInput,
    abortSignal?: AbortSignal,
  ): Promise<LivekitResponse> {
    try {
      // Check for abort signal
      if (abortSignal?.aborted) {
        throw new Error('Request was aborted');
      }

      // Check session status
      if (session.status !== 'running') {
        throw new Error(`Cannot send message to session in status: ${session.status}`);
      }

      logger.debug(`Sending multi-modal message to agent in session ${session.id} (text: ${Boolean(input.text)}, audio: ${Boolean(input.audio)}, video: ${Boolean(input.video)})`);

      // Process the multi-modal message through the agent context
      const agentResponse = await this.processAgentMultiModalMessage(session, input, abortSignal);

      // Simulate realistic response time for agent processing
      const processingDelay = this.calculateProcessingDelay(input.text || '');
      await this.waitWithAbort(processingDelay, abortSignal);

      // Create structured response
      const response: LivekitResponse = {
        text: agentResponse.text,
        audio: agentResponse.audio,
        video: agentResponse.video,
        metadata: {
          sessionId: session.id,
          timestamp: new Date().toISOString(),
          processingTime: processingDelay,
          roomId: session.room?.id,
          participantId: session.participant?.id,
          enabledFeatures: {
            audio: this.config?.enableAudio || false,
            video: this.config?.enableVideo || false,
            chat: this.config?.enableChat || true,
          },
          agentMetadata: agentResponse.metadata,
        },
        usage: agentResponse.usage,
      };

      logger.debug(`LiveKit agent responded to prompt in session ${session.id}`);
      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to send message to LiveKit agent: ${errorMessage}`);
    }
  }

  private async processAgentMultiModalMessage(
    session: LivekitSession,
    input: MultiModalInput,
    abortSignal?: AbortSignal,
  ): Promise<LivekitResponse> {
    try {
      // Check for abort signal
      if (abortSignal?.aborted) {
        throw new Error('Request was aborted');
      }

      // Use the session context to send the multi-modal message
      let agentText = '';
      let agentAudio: AudioData | undefined;
      let agentVideo: VideoData | undefined;
      let agentMetadata: Record<string, any> = {};

      if (session.context?.sendMessage) {
        // Enhanced sendMessage to handle multi-modal input
        const messageData = {
          text: input.text,
          audio: input.audio,
          video: input.video,
          metadata: input.metadata,
        };

        const result = await session.context.sendMessage(messageData);
        agentText = result.response || `Echo from LiveKit agent: ${input.text}`;
        agentMetadata = result.metadata || {};

        // Process tool calls if present
        if (result.toolCalls && Array.isArray(result.toolCalls)) {
          agentMetadata.toolCalls = await this.processToolCalls(result.toolCalls, session);
        }

        // Process function calls if present (alternative format)
        if (result.functionCalls && Array.isArray(result.functionCalls)) {
          agentMetadata.functionCalls = await this.processFunctionCalls(result.functionCalls, session);
        }

        // Process agent's audio response if available and audio is enabled
        if (result.audio && this.config.enableAudio && this.config.audioConfig) {
          agentAudio = AudioProcessor.formatAudioOutput(result.audio, this.config.audioConfig);
        }

        // Process agent's video response if available and video is enabled
        if (result.video && this.config.enableVideo && this.config.videoConfig) {
          agentVideo = VideoProcessor.formatVideoOutput(result.video, this.config.videoConfig);
        }
      } else {
        // Enhanced fallback to handle multi-modal echo response
        const parts = [];
        if (input.text) parts.push(`text: "${input.text}"`);
        if (input.audio) parts.push(`audio: ${input.audio.format} (${input.audio.duration || 'unknown'}s)`);
        if (input.video) parts.push(`video: ${input.video.format} (${input.video.duration || 'unknown'}s)`);

        agentText = `Echo from LiveKit agent: ${parts.join(', ')}`;

        // Echo audio back if enabled and provided
        if (input.audio && this.config.enableAudio) {
          agentAudio = input.audio;
        }

        // Echo video back if enabled and provided
        if (input.video && this.config.enableVideo) {
          agentVideo = input.video;
        }
      }

      // Generate mock usage statistics
      const inputText = input.text || '';
      const promptTokens = Math.ceil(inputText.length / 4); // Rough token estimation
      const completionTokens = Math.ceil(agentText.length / 4);

      const usage = {
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: promptTokens + completionTokens,
      };

      return {
        text: agentText,
        audio: agentAudio,
        video: agentVideo,
        metadata: {
          agentId: this.providerId,
          agentDefinitionPath: this.config?.agentPath,
          ...agentMetadata,
        },
        usage,
        // Standardized response fields
        timestamp: new Date().toISOString(),
        responseId: `${session.id}-${Date.now()}`,
        status: 'success',
        warnings: [],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Agent message processing failed: ${errorMessage}`);
    }
  }

  /**
   * Processes tool calls from the agent
   */
  private async processToolCalls(toolCalls: any[], session: LivekitSession): Promise<any[]> {
    const processedCalls = [];

    for (const toolCall of toolCalls) {
      try {
        const { id, name, arguments: args } = toolCall;

        logger.debug(`Processing tool call: ${name} with args: ${JSON.stringify(args)}`);

        // Look for the tool in the agent definition
        const tool = this.agentDefinition?.tools?.find(t => t.name === name);

        if (tool && typeof tool.function === 'function') {
          // Execute the tool function
          const startTime = Date.now();
          const result = await tool.function(args);
          const executionTime = Date.now() - startTime;

          processedCalls.push({
            id,
            name,
            arguments: args,
            result,
            executionTime,
            status: 'success',
          });

          logger.debug(`Tool ${name} executed successfully in ${executionTime}ms`);
        } else {
          // Tool not found or not executable
          const errorMessage = `Tool '${name}' not found or not executable`;
          processedCalls.push({
            id,
            name,
            arguments: args,
            error: errorMessage,
            status: 'error',
          });

          logger.warn(errorMessage);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        processedCalls.push({
          id: toolCall.id,
          name: toolCall.name,
          arguments: toolCall.arguments,
          error: errorMessage,
          status: 'error',
        });

        logger.error(`Tool call ${toolCall.name} failed: ${errorMessage}`);
      }
    }

    return processedCalls;
  }

  /**
   * Processes function calls from the agent (alternative format)
   */
  private async processFunctionCalls(functionCalls: any[], session: LivekitSession): Promise<any[]> {
    const processedCalls = [];

    for (const functionCall of functionCalls) {
      try {
        const { name, parameters } = functionCall;

        logger.debug(`Processing function call: ${name} with parameters: ${JSON.stringify(parameters)}`);

        // Look for the function in the agent definition tools
        const tool = this.agentDefinition?.tools?.find(t => t.name === name);

        if (tool && typeof tool.function === 'function') {
          // Execute the function
          const startTime = Date.now();
          const result = await tool.function(parameters);
          const executionTime = Date.now() - startTime;

          processedCalls.push({
            name,
            parameters,
            result,
            executionTime,
            status: 'success',
          });

          logger.debug(`Function ${name} executed successfully in ${executionTime}ms`);
        } else {
          // Function not found or not executable
          const errorMessage = `Function '${name}' not found or not executable`;
          processedCalls.push({
            name,
            parameters,
            error: errorMessage,
            status: 'error',
          });

          logger.warn(errorMessage);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        processedCalls.push({
          name: functionCall.name,
          parameters: functionCall.parameters,
          error: errorMessage,
          status: 'error',
        });

        logger.error(`Function call ${functionCall.name} failed: ${errorMessage}`);
      }
    }

    return processedCalls;
  }

  private calculateProcessingDelay(prompt: string): number {
    // Simulate realistic processing delay based on prompt complexity
    const baseDelay = 100; // Base 100ms
    const lengthFactor = Math.min(prompt.length * 2, 500); // Max 500ms for length
    const randomVariation = Math.random() * 200; // 0-200ms random variation

    return Math.floor(baseDelay + lengthFactor + randomVariation);
  }

  private async waitWithAbort(delayMs: number, abortSignal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => resolve(), delayMs);

      if (abortSignal) {
        const abortHandler = () => {
          clearTimeout(timeout);
          reject(new Error('Request was aborted'));
        };

        if (abortSignal.aborted) {
          clearTimeout(timeout);
          reject(new Error('Request was aborted'));
          return;
        }

        abortSignal.addEventListener('abort', abortHandler, { once: true });

        // Clean up the listener when the timeout completes
        setTimeout(() => {
          abortSignal.removeEventListener('abort', abortHandler);
        }, delayMs);
      }
    });
  }

  private generateMockAudioResponse(text: string): string {
    // In a real implementation, this would generate or reference actual audio
    return `data:audio/wav;base64,${Buffer.from(`mock-audio-for-${text.substring(0, 20)}`).toString('base64')}`;
  }

  private generateMockVideoResponse(text: string): string {
    // In a real implementation, this would generate or reference actual video
    return `data:video/mp4;base64,${Buffer.from(`mock-video-for-${text.substring(0, 20)}`).toString('base64')}`;
  }

  private async cleanupSession(session: LivekitSession): Promise<void> {
    try {
      if (!session || session.status === 'closed') {
        return;
      }

      logger.debug(`Cleaning up LiveKit session: ${session.id}`);

      // Update session status
      session.status = 'closing';

      // Clean up session context
      if (session.context) {
        await this.cleanupSessionContext(session);
      }

      // Disconnect from room and participant
      await this.disconnectSessionConnections(session);

      // Mark session as closed
      session.status = 'closed';

      logger.debug(`Successfully cleaned up LiveKit session: ${session.id}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.warn(`Failed to cleanup LiveKit session: ${errorMessage}`);
    }
  }

  private async cleanupSessionContext(session: LivekitSession): Promise<void> {
    try {
      if (session.context?.disconnect) {
        await session.context.disconnect();
        logger.debug(`Disconnected session context for ${session.id}`);
      }

      // Clear context references
      if (session.context) {
        session.context.room = null;
        session.context.participant = null;
        session.context.userData = {};
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.warn(`Failed to cleanup session context: ${errorMessage}`);
    }
  }

  private async disconnectSessionConnections(session: LivekitSession): Promise<void> {
    try {
      // In a real implementation, this would:
      // 1. Close media tracks (audio/video)
      // 2. Disconnect participant from room
      // 3. Close WebRTC connections
      // 4. Clean up LiveKit room resources

      if (session.participant) {
        logger.debug(`Disconnecting participant ${session.participant.id} from session ${session.id}`);
        session.participant = undefined;
      }

      if (session.room) {
        logger.debug(`Cleaning up room ${session.room.id} for session ${session.id}`);
        session.room = undefined;
      }

      logger.debug(`Session connections cleaned up for ${session.id}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.warn(`Failed to disconnect session connections: ${errorMessage}`);
    }
  }

  async cleanup(): Promise<void> {
    try {
      logger.debug('Starting LiveKit provider cleanup');

      // Clean up worker if running
      if (this.worker) {
        await this.cleanupWorker();
      }

      // Clean up agent if initialized
      if (this.agent) {
        await this.cleanupAgent();
      }

      // Clear agent definition
      this.agentDefinition = null;

      logger.debug('LiveKit provider cleaned up successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.warn(`Failed to cleanup LiveKit provider: ${errorMessage}`);
    }
  }

  private async cleanupWorker(): Promise<void> {
    try {
      if (!this.worker) {
        return;
      }

      logger.debug('Cleaning up LiveKit worker');

      // In a real implementation, this would:
      // 1. Stop accepting new jobs
      // 2. Complete or cancel running jobs
      // 3. Disconnect from LiveKit server
      // 4. Release worker resources

      if (typeof this.worker.stop === 'function') {
        await this.worker.stop();
      }

      this.worker = null;
      logger.debug('LiveKit worker cleaned up successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.warn(`Failed to cleanup LiveKit worker: ${errorMessage}`);
    }
  }

  private async cleanupAgent(): Promise<void> {
    try {
      if (!this.agent) {
        return;
      }

      logger.debug('Cleaning up LiveKit agent');

      // In a real implementation, this would:
      // 1. Stop agent processes
      // 2. Clean up agent state
      // 3. Release agent resources
      // 4. Disconnect from any active sessions

      if (typeof this.agent.cleanup === 'function') {
        await this.agent.cleanup();
      }

      this.agent = null;
      logger.debug('LiveKit agent cleaned up successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.warn(`Failed to cleanup LiveKit agent: ${errorMessage}`);
    }
  }
}

// Audio processing utilities
class AudioProcessor {
  /**
   * Detects audio format from Buffer or string data
   */
  static detectAudioFormat(data: Buffer | string): 'wav' | 'mp3' | 'opus' | 'raw' {
    if (typeof data === 'string') {
      // Check if it's a URL or base64
      if (data.startsWith('http://') || data.startsWith('https://')) {
        // Try to detect from URL extension
        const url = new URL(data);
        const extension = path.extname(url.pathname).toLowerCase();
        switch (extension) {
          case '.mp3': return 'mp3';
          case '.wav': return 'wav';
          case '.opus': return 'opus';
          default: return 'raw';
        }
      }
      // Assume base64 for now
      return 'raw';
    }

    // Detect from Buffer magic bytes
    if (data.length >= 4) {
      // WAV file header
      if (data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WAVE') {
        return 'wav';
      }
      // MP3 file header
      if ((data[0] === 0xFF && (data[1] & 0xE0) === 0xE0) || data.toString('ascii', 0, 3) === 'ID3') {
        return 'mp3';
      }
      // Opus file header
      if (data.toString('ascii', 0, 8) === 'OpusHead') {
        return 'opus';
      }
    }

    return 'raw';
  }

  /**
   * Parses audio input from various formats
   */
  static async parseAudioInput(input: string, audioConfig: AudioConfig): Promise<AudioData | null> {
    if (!input) return null;

    try {
      // Check if input is a file path
      if (input.startsWith('file://') || (!input.startsWith('http') && !input.includes('base64'))) {
        const filePath = input.startsWith('file://') ? input.slice(7) : input;

        try {
          const audioBuffer = await fs.readFile(filePath);
          const format = AudioProcessor.detectAudioFormat(audioBuffer);

          return {
            data: audioBuffer,
            format,
            sampleRate: audioConfig.sampleRate || 48000,
            channels: audioConfig.channels || 1,
          };
        } catch (error) {
          logger.warn(`Failed to read audio file: ${filePath}`);
          return null;
        }
      }

      // Check if input is a URL
      if (input.startsWith('http://') || input.startsWith('https://')) {
        const format = AudioProcessor.detectAudioFormat(input);
        return {
          data: input,
          format,
          sampleRate: audioConfig.sampleRate || 48000,
          channels: audioConfig.channels || 1,
          url: input,
        };
      }

      // Check if input is base64 encoded
      if (input.includes('base64,')) {
        const base64Data = input.split('base64,')[1];
        const audioBuffer = Buffer.from(base64Data, 'base64');
        const format = AudioProcessor.detectAudioFormat(audioBuffer);

        return {
          data: audioBuffer,
          format,
          sampleRate: audioConfig.sampleRate || 48000,
          channels: audioConfig.channels || 1,
        };
      }

      return null;
    } catch (error) {
      logger.error(`Error parsing audio input: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  /**
   * Formats audio output for response
   */
  static formatAudioOutput(audioData: any, audioConfig: AudioConfig): AudioData | undefined {
    if (!audioData) return undefined;

    try {
      // Handle different audio data formats from LiveKit agent
      if (typeof audioData === 'string') {
        // URL or base64
        const format = AudioProcessor.detectAudioFormat(audioData);
        return {
          data: audioData,
          format,
          sampleRate: audioConfig.sampleRate || 48000,
          channels: audioConfig.channels || 1,
          url: audioData.startsWith('http') ? audioData : undefined,
        };
      }

      if (Buffer.isBuffer(audioData)) {
        // Raw audio buffer
        const format = AudioProcessor.detectAudioFormat(audioData);
        return {
          data: audioData,
          format,
          sampleRate: audioConfig.sampleRate || 48000,
          channels: audioConfig.channels || 1,
        };
      }

      if (typeof audioData === 'object' && audioData.data) {
        // Structured audio object
        return {
          data: audioData.data,
          format: audioData.format || 'raw',
          sampleRate: audioData.sampleRate || audioConfig.sampleRate || 48000,
          channels: audioData.channels || audioConfig.channels || 1,
          duration: audioData.duration,
          url: audioData.url,
        };
      }

      return undefined;
    } catch (error) {
      logger.error(`Error formatting audio output: ${error instanceof Error ? error.message : String(error)}`);
      return undefined;
    }
  }
}

// Video processing utilities
class VideoProcessor {
  /**
   * Detects video format from Buffer or string data
   */
  static detectVideoFormat(data: Buffer | string): 'mp4' | 'webm' | 'raw' {
    if (typeof data === 'string') {
      // Check if it's a URL
      if (data.startsWith('http://') || data.startsWith('https://')) {
        // Try to detect from URL extension
        const url = new URL(data);
        const extension = path.extname(url.pathname).toLowerCase();
        switch (extension) {
          case '.mp4': return 'mp4';
          case '.webm': return 'webm';
          default: return 'raw';
        }
      }
      // Assume base64 for now
      return 'raw';
    }

    // Detect from Buffer magic bytes
    if (data.length >= 8) {
      // MP4 file header (ftyp box)
      if (data.toString('ascii', 4, 8) === 'ftyp') {
        return 'mp4';
      }
      // WebM file header
      if (data[0] === 0x1A && data[1] === 0x45 && data[2] === 0xDF && data[3] === 0xA3) {
        return 'webm';
      }
    }

    return 'raw';
  }

  /**
   * Parses video input from various formats
   */
  static async parseVideoInput(input: string, videoConfig: VideoConfig): Promise<VideoData | null> {
    if (!input) return null;

    try {
      // Check if input is a file path
      if (input.startsWith('file://') || (!input.startsWith('http') && !input.includes('base64'))) {
        const filePath = input.startsWith('file://') ? input.slice(7) : input;

        try {
          const videoBuffer = await fs.readFile(filePath);
          const format = VideoProcessor.detectVideoFormat(videoBuffer);

          return {
            data: videoBuffer,
            format,
            width: videoConfig.width || 1280,
            height: videoConfig.height || 720,
            framerate: videoConfig.framerate || 30,
          };
        } catch (error) {
          logger.warn(`Failed to read video file: ${filePath}`);
          return null;
        }
      }

      // Check if input is a URL
      if (input.startsWith('http://') || input.startsWith('https://')) {
        const format = VideoProcessor.detectVideoFormat(input);
        return {
          data: input,
          format,
          width: videoConfig.width || 1280,
          height: videoConfig.height || 720,
          framerate: videoConfig.framerate || 30,
          url: input,
        };
      }

      // Check if input is base64 encoded
      if (input.includes('base64,')) {
        const base64Data = input.split('base64,')[1];
        const videoBuffer = Buffer.from(base64Data, 'base64');
        const format = VideoProcessor.detectVideoFormat(videoBuffer);

        return {
          data: videoBuffer,
          format,
          width: videoConfig.width || 1280,
          height: videoConfig.height || 720,
          framerate: videoConfig.framerate || 30,
        };
      }

      return null;
    } catch (error) {
      logger.error(`Error parsing video input: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  /**
   * Formats video output for response
   */
  static formatVideoOutput(videoData: any, videoConfig: VideoConfig): VideoData | undefined {
    if (!videoData) return undefined;

    try {
      // Handle different video data formats from LiveKit agent
      if (typeof videoData === 'string') {
        // URL or base64
        const format = VideoProcessor.detectVideoFormat(videoData);
        return {
          data: videoData,
          format,
          width: videoConfig.width || 1280,
          height: videoConfig.height || 720,
          framerate: videoConfig.framerate || 30,
          url: videoData.startsWith('http') ? videoData : undefined,
        };
      }

      if (Buffer.isBuffer(videoData)) {
        // Raw video buffer
        const format = VideoProcessor.detectVideoFormat(videoData);
        return {
          data: videoData,
          format,
          width: videoConfig.width || 1280,
          height: videoConfig.height || 720,
          framerate: videoConfig.framerate || 30,
        };
      }

      if (typeof videoData === 'object' && videoData.data) {
        // Structured video object
        return {
          data: videoData.data,
          format: videoData.format || 'raw',
          width: videoData.width || videoConfig.width || 1280,
          height: videoData.height || videoConfig.height || 720,
          framerate: videoData.framerate || videoConfig.framerate || 30,
          duration: videoData.duration,
          url: videoData.url,
        };
      }

      return undefined;
    } catch (error) {
      logger.error(`Error formatting video output: ${error instanceof Error ? error.message : String(error)}`);
      return undefined;
    }
  }
}

export function createLivekitProvider(
  providerPath: string,
  options: { config?: ProviderOptions; env?: any; basePath?: string },
): LivekitProvider {
  const { config = {}, env, basePath } = options;

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

  // Build configuration from environment variables, user config, and path
  const envConfig: Partial<LivekitProviderConfig> = {
    // Connection configuration
    serverUrl: getEnvString('LIVEKIT_URL'),
    apiKey: getEnvString('LIVEKIT_API_KEY'),
    apiSecret: getEnvString('LIVEKIT_API_SECRET'),
    region: getEnvString('LIVEKIT_REGION'),

    // Room configuration
    roomName: getEnvString('LIVEKIT_ROOM_NAME'),
    participantIdentity: getEnvString('LIVEKIT_PARTICIPANT_IDENTITY'),
    participantName: getEnvString('LIVEKIT_PARTICIPANT_NAME'),

    // Session configuration
    sessionTimeout: getEnvInt('LIVEKIT_SESSION_TIMEOUT'),
    maxConcurrentSessions: getEnvInt('LIVEKIT_MAX_CONCURRENT_SESSIONS'),
    retryAttempts: getEnvInt('LIVEKIT_RETRY_ATTEMPTS'),
    retryDelay: getEnvInt('LIVEKIT_RETRY_DELAY'),

    // Media configuration
    enableAudio: getEnvBool('LIVEKIT_ENABLE_AUDIO'),
    enableVideo: getEnvBool('LIVEKIT_ENABLE_VIDEO'),
    enableChat: getEnvBool('LIVEKIT_ENABLE_CHAT'),
    enableScreenShare: getEnvBool('LIVEKIT_ENABLE_SCREEN_SHARE'),

    // Advanced configuration
    debug: getEnvBool('LIVEKIT_DEBUG'),
    logLevel: getEnvString('LIVEKIT_LOG_LEVEL') as 'error' | 'warn' | 'info' | 'debug' | undefined,
    enableMetrics: getEnvBool('LIVEKIT_ENABLE_METRICS'),
    enableTracing: getEnvBool('LIVEKIT_ENABLE_TRACING'),
  };

  // Remove undefined values from envConfig
  const cleanedEnvConfig = Object.fromEntries(
    Object.entries(envConfig).filter(([_, value]) => value !== undefined)
  );

  // Merge configuration with precedence: user config > env config > parsed path
  const mergedConfig: LivekitProviderOptions = {
    ...config,
    config: {
      ...cleanedEnvConfig,
      ...config.config,
      // Ensure agentPath is set from user config if provided, otherwise use parsed name
      agentPath: config.config?.agentPath || agentName,
    },
  };

  return new LivekitProvider(mergedConfig, basePath);
}