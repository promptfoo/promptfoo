/**
 * Voice Conversation Orchestrator
 *
 * Manages bidirectional audio streaming between a target voice agent
 * and a simulated user. Handles turn detection, transcript accumulation,
 * and conversation lifecycle.
 */

import { EventEmitter } from 'events';
import logger from '../../logger';
import type { BaseVoiceConnection } from './connections/base';
import { OpenAIRealtimeConnection } from './connections/openaiRealtime';
import { GoogleLiveConnection } from './connections/googleLive';
import { TurnDetector } from './turnDetection';
import { TranscriptAccumulator } from './transcriptAccumulator';
import { AudioBuffer } from './audioBuffer';
import type {
  AudioChunk,
  OrchestratorConfig,
  ConversationResult,
  ConversationState,
  VoiceTurn,
  VoiceProviderConfig,
} from './types';

const DEFAULT_MAX_TURNS = 10;
const DEFAULT_TIMEOUT_MS = 120000; // 2 minutes
const DEFAULT_SAMPLE_RATE = 24000;

/**
 * Creates a voice connection based on provider type.
 */
function createConnection(
  providerType: 'openai' | 'google',
  config: VoiceProviderConfig,
): BaseVoiceConnection {
  switch (providerType) {
    case 'openai':
      return new OpenAIRealtimeConnection(config);
    case 'google':
      return new GoogleLiveConnection(config);
    default:
      throw new Error(`Unknown voice provider type: ${providerType}`);
  }
}

/**
 * Voice Conversation Orchestrator
 *
 * Bridges audio between a target voice agent and a simulated user,
 * managing the full conversation lifecycle including:
 * - Connection establishment
 * - Audio routing
 * - Turn detection
 * - Transcript accumulation
 * - Stop condition detection
 */
export class VoiceConversationOrchestrator extends EventEmitter {
  private config: OrchestratorConfig;
  private targetConnection: BaseVoiceConnection | null = null;
  private simulatedUserConnection: BaseVoiceConnection | null = null;
  private turnDetector: TurnDetector;
  private transcript: TranscriptAccumulator;
  private targetAudioBuffer: AudioBuffer;
  private simulatedUserAudioBuffer: AudioBuffer;
  private state: ConversationState = 'idle';
  private turnCount = 0;
  private startTime = 0;
  private conversationTimeout: ReturnType<typeof setTimeout> | null = null;
  private isTargetSpeaking = false;
  private isSimulatedUserSpeaking = false;

  constructor(config: OrchestratorConfig) {
    super();
    this.config = {
      maxTurns: DEFAULT_MAX_TURNS,
      timeoutMs: DEFAULT_TIMEOUT_MS,
      ...config,
    };

    this.turnDetector = new TurnDetector(this.config.turnDetection);
    this.transcript = new TranscriptAccumulator();
    this.targetAudioBuffer = new AudioBuffer(
      this.config.targetConfig.audioFormat,
      this.config.targetConfig.sampleRate || DEFAULT_SAMPLE_RATE,
    );
    this.simulatedUserAudioBuffer = new AudioBuffer(
      this.config.simulatedUserConfig.audioFormat,
      this.config.simulatedUserConfig.sampleRate || DEFAULT_SAMPLE_RATE,
    );
  }

  /**
   * Get the current conversation state.
   */
  getState(): ConversationState {
    return this.state;
  }

  /**
   * Get the current turn count.
   */
  getTurnCount(): number {
    return this.turnCount;
  }

  /**
   * Get the transcript accumulator.
   */
  getTranscript(): TranscriptAccumulator {
    return this.transcript;
  }

  /**
   * Start the voice conversation.
   * Connects to both endpoints and begins audio routing.
   */
  async start(): Promise<ConversationResult> {
    if (this.state !== 'idle') {
      throw new Error(`Cannot start conversation: already in state ${this.state}`);
    }

    this.state = 'connecting';
    this.startTime = Date.now();
    this.emit('state_change', this.state);

    try {
      // Create connections
      this.targetConnection = createConnection(
        this.config.targetConfig.provider as 'openai' | 'google',
        this.config.targetConfig,
      );
      this.simulatedUserConnection = createConnection(
        this.config.simulatedUserConfig.provider as 'openai' | 'google',
        this.config.simulatedUserConfig,
      );

      // Setup event handlers before connecting
      this.setupTargetHandlers();
      this.setupSimulatedUserHandlers();
      this.setupTurnDetectorHandlers();

      // Connect to both endpoints
      logger.debug('[Orchestrator] Connecting to target...');
      await this.targetConnection.connect();

      logger.debug('[Orchestrator] Connecting to simulated user...');
      await this.simulatedUserConnection.connect();

      // Configure sessions
      logger.debug('[Orchestrator] Configuring target session...');
      await this.targetConnection.configureSession();

      logger.debug('[Orchestrator] Configuring simulated user session...');
      await this.simulatedUserConnection.configureSession();

      // Start conversation timeout
      this.setConversationTimeout();

      // Transition to active state
      this.state = 'active';
      this.emit('state_change', this.state);

      logger.debug('[Orchestrator] Conversation started');

      // The conversation loop is event-driven
      // Wait for completion via events
      return new Promise((resolve) => {
        const onComplete = (result: ConversationResult) => {
          this.removeListener('conversation_complete', onComplete);
          resolve(result);
        };
        this.on('conversation_complete', onComplete);

        // Initiate the conversation by requesting first response from target
        // (assumes target speaks first, like a greeting)
        if (this.config.targetSpeaksFirst !== false) {
          this.targetConnection?.requestResponse();
        }
      });
    } catch (error) {
      this.state = 'error';
      this.emit('state_change', this.state);
      await this.cleanup();
      throw error;
    }
  }

  /**
   * Stop the conversation gracefully.
   */
  async stop(reason: 'goal_achieved' | 'max_turns' | 'timeout' | 'user_hangup' = 'user_hangup'): Promise<void> {
    if (this.state === 'idle' || this.state === 'completed') {
      return;
    }

    logger.debug('[Orchestrator] Stopping conversation:', { reason });
    await this.completeConversation(reason);
  }

  /**
   * Setup event handlers for the target connection.
   */
  private setupTargetHandlers(): void {
    if (!this.targetConnection) {
      return;
    }

    // Audio from target → forward to simulated user
    this.targetConnection.on('audio_delta', (chunk: AudioChunk) => {
      this.targetAudioBuffer.append(chunk);

      // Forward audio to simulated user
      if (this.simulatedUserConnection?.isReady()) {
        this.simulatedUserConnection.sendAudio(chunk);
      }

      this.emit('target_audio', chunk);
    });

    // Target finished speaking
    this.targetConnection.on('audio_done', () => {
      logger.debug('[Orchestrator] Target audio done');
      this.isTargetSpeaking = false;

      // Commit audio to simulated user
      if (this.simulatedUserConnection?.isReady()) {
        this.simulatedUserConnection.commitAudio();
        this.simulatedUserConnection.requestResponse();
      }
    });

    // Transcript from target
    this.targetConnection.on('transcript_delta', (delta: string) => {
      this.transcript.append(delta);
      this.emit('target_transcript_delta', delta);
    });

    this.targetConnection.on('transcript_done', (text: string) => {
      const turn = this.transcript.completeWithText('agent', text);
      this.turnCount++;
      this.emit('turn_complete', { speaker: 'agent', text: turn });

      // Check for stop marker
      if (this.transcript.hasStopMarker()) {
        logger.debug('[Orchestrator] Stop marker detected in target speech');
        this.completeConversation('goal_achieved');
      }

      // Check turn limit
      if (this.turnCount >= (this.config.maxTurns || DEFAULT_MAX_TURNS)) {
        logger.debug('[Orchestrator] Max turns reached');
        this.completeConversation('max_turns');
      }
    });

    // VAD events
    this.targetConnection.on('speech_started', () => {
      this.isTargetSpeaking = true;
      this.turnDetector.onSpeechStart();
      this.emit('target_speech_started');
    });

    this.targetConnection.on('speech_stopped', () => {
      this.isTargetSpeaking = false;
      this.turnDetector.onSpeechEnd();
      this.emit('target_speech_stopped');
    });

    // Error handling
    this.targetConnection.on('error', (error: Error) => {
      logger.error('[Orchestrator] Target connection error:', { error });
      this.emit('error', error);
      this.completeConversation('error');
    });

    this.targetConnection.on('close', () => {
      logger.debug('[Orchestrator] Target connection closed');
      if (this.state === 'active') {
        this.completeConversation('error');
      }
    });
  }

  /**
   * Setup event handlers for the simulated user connection.
   */
  private setupSimulatedUserHandlers(): void {
    if (!this.simulatedUserConnection) {
      return;
    }

    // Audio from simulated user → forward to target
    this.simulatedUserConnection.on('audio_delta', (chunk: AudioChunk) => {
      this.simulatedUserAudioBuffer.append(chunk);

      // Forward audio to target
      if (this.targetConnection?.isReady()) {
        this.targetConnection.sendAudio(chunk);
      }

      this.emit('simulated_user_audio', chunk);
    });

    // Simulated user finished speaking
    this.simulatedUserConnection.on('audio_done', () => {
      logger.debug('[Orchestrator] Simulated user audio done');
      this.isSimulatedUserSpeaking = false;

      // Commit audio to target and request response
      if (this.targetConnection?.isReady()) {
        this.targetConnection.commitAudio();
        this.targetConnection.requestResponse();
      }
    });

    // Transcript from simulated user
    this.simulatedUserConnection.on('transcript_delta', (delta: string) => {
      this.emit('simulated_user_transcript_delta', delta);
    });

    this.simulatedUserConnection.on('transcript_done', (text: string) => {
      const turn = this.transcript.completeWithText('user', text);
      this.turnCount++;
      this.emit('turn_complete', { speaker: 'user', text: turn });

      // Check for stop marker
      if (this.transcript.hasStopMarker()) {
        logger.debug('[Orchestrator] Stop marker detected in simulated user speech');
        this.completeConversation('goal_achieved');
      }

      // Check turn limit
      if (this.turnCount >= (this.config.maxTurns || DEFAULT_MAX_TURNS)) {
        logger.debug('[Orchestrator] Max turns reached');
        this.completeConversation('max_turns');
      }
    });

    // VAD events
    this.simulatedUserConnection.on('speech_started', () => {
      this.isSimulatedUserSpeaking = true;
      this.emit('simulated_user_speech_started');
    });

    this.simulatedUserConnection.on('speech_stopped', () => {
      this.isSimulatedUserSpeaking = false;
      this.emit('simulated_user_speech_stopped');
    });

    // Error handling
    this.simulatedUserConnection.on('error', (error: Error) => {
      logger.error('[Orchestrator] Simulated user connection error:', { error });
      this.emit('error', error);
      this.completeConversation('error');
    });

    this.simulatedUserConnection.on('close', () => {
      logger.debug('[Orchestrator] Simulated user connection closed');
      if (this.state === 'active') {
        this.completeConversation('error');
      }
    });
  }

  /**
   * Setup event handlers for turn detection.
   */
  private setupTurnDetectorHandlers(): void {
    this.turnDetector.on('turn_start', () => {
      this.emit('turn_start');
    });

    this.turnDetector.on('turn_end', () => {
      this.emit('turn_end');
    });

    this.turnDetector.on('turn_timeout', () => {
      logger.warn('[Orchestrator] Turn timeout detected');
      // Force end the current turn
      if (this.isTargetSpeaking && this.targetConnection) {
        this.targetConnection.cancelResponse();
      }
    });
  }

  /**
   * Set the conversation timeout.
   */
  private setConversationTimeout(): void {
    if (this.conversationTimeout) {
      clearTimeout(this.conversationTimeout);
    }

    this.conversationTimeout = setTimeout(() => {
      logger.warn('[Orchestrator] Conversation timeout reached');
      this.completeConversation('timeout');
    }, this.config.timeoutMs || DEFAULT_TIMEOUT_MS);
  }

  /**
   * Complete the conversation and generate result.
   */
  private async completeConversation(
    reason: 'goal_achieved' | 'max_turns' | 'timeout' | 'error' | 'user_hangup',
  ): Promise<void> {
    if (this.state === 'completed' || this.state === 'idle') {
      return;
    }

    this.state = 'completed';
    this.emit('state_change', this.state);

    if (this.conversationTimeout) {
      clearTimeout(this.conversationTimeout);
      this.conversationTimeout = null;
    }

    const endTime = Date.now();
    // Convert TranscriptTurn[] to VoiceTurn[]
    const turns: VoiceTurn[] = this.transcript.getTurns().map((turn) => ({
      speaker: turn.speaker,
      text: turn.text,
      timestamp: turn.timestamp,
    }));

    const result: ConversationResult = {
      success: reason === 'goal_achieved',
      stopReason: reason,
      transcript: this.transcript.getFullTranscript(),
      turns,
      turnCount: this.turnCount,
      duration: endTime - this.startTime,
      targetAudio: this.targetAudioBuffer.toWav(),
      simulatedUserAudio: this.simulatedUserAudioBuffer.toWav(),
      metadata: {
        targetProvider: this.config.targetConfig.provider,
        simulatedUserProvider: this.config.simulatedUserConfig.provider,
        maxTurns: this.config.maxTurns || DEFAULT_MAX_TURNS,
        timeoutMs: this.config.timeoutMs || DEFAULT_TIMEOUT_MS,
      },
    };

    logger.debug('[Orchestrator] Conversation completed:', {
      reason,
      turnCount: this.turnCount,
      duration: result.duration,
    });

    await this.cleanup();
    this.emit('conversation_complete', result);
  }

  /**
   * Cleanup resources.
   */
  private async cleanup(): Promise<void> {
    logger.debug('[Orchestrator] Cleaning up...');

    if (this.conversationTimeout) {
      clearTimeout(this.conversationTimeout);
      this.conversationTimeout = null;
    }

    this.turnDetector.reset();

    if (this.targetConnection) {
      await this.targetConnection.disconnect();
      this.targetConnection = null;
    }

    if (this.simulatedUserConnection) {
      await this.simulatedUserConnection.disconnect();
      this.simulatedUserConnection = null;
    }

    this.state = 'idle';
  }
}

/**
 * Create and run a voice conversation.
 * Convenience function for one-shot conversations.
 */
export async function runVoiceConversation(config: OrchestratorConfig): Promise<ConversationResult> {
  const orchestrator = new VoiceConversationOrchestrator(config);
  return orchestrator.start();
}
