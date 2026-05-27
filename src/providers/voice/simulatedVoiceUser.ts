/**
 * Simulated Voice User Provider
 *
 * A provider that simulates a voice user interacting with a realtime voice agent.
 * Uses bidirectional audio streaming to conduct voice-based conversations.
 *
 * This is the voice equivalent of the text-based SimulatedUser provider.
 */

import { cloudConfig } from '../../globalConfig/cloud';
import logger from '../../logger';
import { neverGenerateRemoteForRegularEvals } from '../../redteam/remoteGeneration';
import { fetchWithProxy } from '../../util/fetch/index';
import { getNunjucksEngine } from '../../util/templates';
import { VoiceConversationOrchestrator } from './orchestrator';
import { STOP_MARKER } from './transcriptAccumulator';

import type {
  ApiProvider,
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderOptions,
  ProviderResponse,
} from '../../types/index';
import type {
  ConversationResult,
  SimulatedVoiceUserConfig,
  TurnDetectionConfig,
  VoiceProviderConfig,
} from './types';

const DEFAULT_SAMPLE_RATE = 24000;
const DEFAULT_AUDIO_FORMAT = 'pcm16';
const DEFAULT_MAX_TURNS = 10;
const DEFAULT_TIMEOUT_MS = 120000;
const DEFAULT_LOCAL_VAD_THRESHOLD = 0.02;
const DEFAULT_INSTRUCTIONS_TEMPLATE = '{{instructions}}';

/**
 * Provider options for SimulatedVoiceUser.
 */
type SimulatedVoiceUserProviderOptions = ProviderOptions & {
  config?: SimulatedVoiceUserConfig;
};

/**
 * Simulated Voice User Provider
 *
 * Simulates a voice user interacting with a realtime voice agent
 * using bidirectional audio streaming. The simulated user is powered
 * by OpenAI Realtime API (or other voice providers) and follows
 * instructions to achieve a goal in the conversation.
 *
 * @example
 * ```yaml
 * providers:
 *   - id: simulated-voice-user
 *     config:
 *       instructions: "You are a customer calling to check your account balance."
 *       maxTurns: 5
 *       targetProvider: openai
 *       targetModel: gpt-realtime
 *       simulatedUserProvider: openai
 *       simulatedUserModel: gpt-realtime
 * ```
 */
export class SimulatedVoiceUser implements ApiProvider {
  private readonly identifier: string;
  private readonly voiceConfig: SimulatedVoiceUserConfig;

  constructor({ id, label, config }: SimulatedVoiceUserProviderOptions) {
    this.identifier = id ?? label ?? 'simulated-voice-user';
    this.voiceConfig = {
      maxTurns: DEFAULT_MAX_TURNS,
      timeoutMs: DEFAULT_TIMEOUT_MS,
      sampleRate: DEFAULT_SAMPLE_RATE,
      audioFormat: DEFAULT_AUDIO_FORMAT as 'pcm16',
      ...config,
    };
  }

  id(): string {
    return this.identifier;
  }

  toString(): string {
    return `[SimulatedVoiceUser ${this.identifier}]`;
  }

  /**
   * Build the turn detection config.
   */
  private buildTurnDetectionConfig(): TurnDetectionConfig {
    return {
      mode: this.voiceConfig.turnDetectionMode ?? 'server_vad',
      silenceThresholdMs: this.voiceConfig.silenceThresholdMs ?? 500,
      vadThreshold: this.voiceConfig.vadThreshold ?? DEFAULT_LOCAL_VAD_THRESHOLD,
      minTurnDurationMs: this.voiceConfig.minTurnDurationMs ?? 100,
      maxTurnDurationMs: this.voiceConfig.maxTurnDurationMs ?? 30000,
      prefixPaddingMs: this.voiceConfig.prefixPaddingMs ?? 300,
    };
  }

  /**
   * Build the target voice provider config.
   */
  private buildTargetConfig(instructions: string): VoiceProviderConfig {
    const provider = this.voiceConfig.targetProvider || 'openai';
    return {
      provider,
      model: this.voiceConfig.targetModel,
      apiKey: this.voiceConfig.targetApiKey,
      voice: this.voiceConfig.targetVoice ?? (provider === 'openai' ? 'alloy' : undefined),
      instructions,
      audioFormat: this.voiceConfig.audioFormat || DEFAULT_AUDIO_FORMAT,
      sampleRate: this.voiceConfig.sampleRate || DEFAULT_SAMPLE_RATE,
      // The orchestrator commits routed audio and requests each response itself.
      // Leaving VAD on here creates duplicate target responses for the same turn.
      turnDetection: undefined,
    };
  }

  /**
   * Build the simulated user voice provider config.
   */
  private buildSimulatedUserConfig(instructions: string): VoiceProviderConfig {
    // Build the simulated user instructions with the goal
    const simulatedUserInstructions = this.buildSimulatedUserInstructions(instructions);
    const provider = this.voiceConfig.simulatedUserProvider || 'openai';

    return {
      provider,
      model: this.voiceConfig.simulatedUserModel,
      apiKey: this.voiceConfig.simulatedUserApiKey,
      voice: this.voiceConfig.simulatedUserVoice ?? (provider === 'openai' ? 'echo' : undefined),
      instructions: simulatedUserInstructions,
      audioFormat: this.voiceConfig.audioFormat || DEFAULT_AUDIO_FORMAT,
      sampleRate: this.voiceConfig.sampleRate || DEFAULT_SAMPLE_RATE,
      // IMPORTANT: Disable turn detection on simulated user to prevent auto-responses.
      // We explicitly call requestResponse() after the target finishes speaking.
      // Using VAD here causes the user to start speaking while the target is still talking.
      turnDetection: undefined,
    };
  }

  /**
   * Build the simulated user instructions.
   * Includes the stop marker instruction for goal achievement.
   */
  private buildSimulatedUserInstructions(goal: string): string {
    const baseInstructions = `
You are simulating a user in a voice conversation. Your goal is:

${goal}

IMPORTANT INSTRUCTIONS:
1. Speak naturally as a human would in a phone call or voice conversation.
2. Be conversational and respond appropriately to what you hear.
3. Work towards achieving your goal through the conversation.
4. When you have achieved your goal OR the conversation has reached a natural end, say "${STOP_MARKER}" to end the conversation.
5. If you've made multiple attempts and cannot achieve your goal, say "${STOP_MARKER}" and explain why.

Remember: You are SIMULATING a user, not an AI assistant. Act as the caller/user in this interaction.
`.trim();

    return baseInstructions;
  }

  private shouldRecordConversation(): boolean {
    return this.voiceConfig.recordConversation !== false;
  }

  private shouldTargetSpeakFirst(): boolean {
    return this.voiceConfig.targetSpeaksFirst ?? this.voiceConfig.targetProvider !== 'bedrock';
  }

  private validateLocalAudioConfiguration(): string | undefined {
    const audioFormat = this.voiceConfig.audioFormat || DEFAULT_AUDIO_FORMAT;
    const targetProvider = this.voiceConfig.targetProvider || 'openai';
    const simulatedUserProvider = this.voiceConfig.simulatedUserProvider || 'openai';

    if (
      audioFormat !== 'pcm16' &&
      (targetProvider !== 'openai' || simulatedUserProvider !== 'openai')
    ) {
      return `${audioFormat} audio is supported only when both local voice endpoints use OpenAI. Use pcm16 with Google Live or Amazon Nova Sonic.`;
    }

    return undefined;
  }

  /**
   * Run the voice conversation.
   */
  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    callApiOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    // Render the instructions with context variables
    const rawInstructions = this.voiceConfig.instructions || DEFAULT_INSTRUCTIONS_TEMPLATE;
    const instructions = getNunjucksEngine().renderString(rawInstructions, context?.vars || {});

    logger.debug('[SimulatedVoiceUser] Starting voice conversation:', {
      instructionLength: instructions.length,
      maxTurns: this.voiceConfig.maxTurns,
      targetProvider: this.voiceConfig.targetProvider,
      simulatedUserProvider: this.voiceConfig.simulatedUserProvider,
    });

    const useRemote = cloudConfig.isEnabled() && !neverGenerateRemoteForRegularEvals();
    if (useRemote) {
      return this.callRemoteVoiceTau(
        prompt,
        this.buildSimulatedUserInstructions(instructions),
        callApiOptions?.abortSignal,
      );
    }

    const configurationError = this.validateLocalAudioConfiguration();
    if (configurationError) {
      return { error: configurationError };
    }

    // Build configs for both connections
    const targetConfig = this.buildTargetConfig(prompt);
    const simulatedUserConfig = this.buildSimulatedUserConfig(instructions);

    // Create and run the orchestrator
    const orchestrator = new VoiceConversationOrchestrator({
      targetConfig,
      simulatedUserConfig,
      turnDetection: this.buildTurnDetectionConfig(),
      maxTurns: this.voiceConfig.maxTurns || DEFAULT_MAX_TURNS,
      timeoutMs: this.voiceConfig.timeoutMs || DEFAULT_TIMEOUT_MS,
      targetSpeaksFirst: this.shouldTargetSpeakFirst(),
      recordFullAudio: this.shouldRecordConversation(),
    });

    // Setup event logging
    this.setupOrchestratorLogging(orchestrator);

    try {
      const result = await orchestrator.start();
      return this.formatResult(result);
    } catch (error) {
      logger.error('[SimulatedVoiceUser] Conversation failed:', { error });
      return {
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Call the remote voice-tau task on the cloud server.
   * This allows using server-side API keys for the simulated user.
   */
  private async callRemoteVoiceTau(
    targetInstructions: string,
    simulatedUserInstructions: string,
    abortSignal?: AbortSignal,
  ): Promise<ProviderResponse> {
    const apiKey = cloudConfig.getApiKey();
    const url = `${cloudConfig.getApiHost()}/api/v1/task`;

    if (!apiKey) {
      return {
        error:
          'Remote voice-tau requires Promptfoo Cloud authentication. Run `promptfoo auth login` or set PROMPTFOO_API_KEY.',
      };
    }

    logger.debug('[SimulatedVoiceUser] Using remote voice-tau task');

    try {
      const timeoutSignal = AbortSignal.timeout(this.voiceConfig.timeoutMs || DEFAULT_TIMEOUT_MS);
      const requestSignal = abortSignal
        ? AbortSignal.any([abortSignal, timeoutSignal])
        : timeoutSignal;
      const response = await fetchWithProxy(
        url,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'x-promptfoo-silent': 'true',
          },
          body: JSON.stringify({
            task: 'voice-tau',
            targetProvider: this.voiceConfig.targetProvider || 'openai',
            targetModel: this.voiceConfig.targetModel,
            targetVoice: this.voiceConfig.targetVoice,
            targetInstructions,
            simulatedUserProvider: this.voiceConfig.simulatedUserProvider || 'openai',
            simulatedUserModel: this.voiceConfig.simulatedUserModel,
            simulatedUserVoice: this.voiceConfig.simulatedUserVoice,
            simulatedUserInstructions,
            maxTurns: this.voiceConfig.maxTurns || DEFAULT_MAX_TURNS,
            timeoutMs: this.voiceConfig.timeoutMs || DEFAULT_TIMEOUT_MS,
            targetSpeaksFirst: this.shouldTargetSpeakFirst(),
            audioFormat: this.voiceConfig.audioFormat || DEFAULT_AUDIO_FORMAT,
            sampleRate: this.voiceConfig.sampleRate || DEFAULT_SAMPLE_RATE,
            recordConversation: this.shouldRecordConversation(),
            turnDetection: this.buildTurnDetectionConfig(),
          }),
        },
        requestSignal,
      );

      if (!response.ok) {
        const errorText = await response.text();
        logger.error('[SimulatedVoiceUser] Remote voice-tau failed:', {
          status: response.status,
        });
        return {
          error: `Remote voice-tau failed: ${response.status} ${errorText}`,
        };
      }

      const result = await response.json();
      return this.formatRemoteResult(result);
    } catch (error) {
      logger.error('[SimulatedVoiceUser] Remote voice-tau request failed');
      return {
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Format the remote voice-tau result as a ProviderResponse.
   */
  private formatRemoteResult(result: {
    success: boolean;
    transcript: string;
    turns: Array<{ speaker: string; text: string; timestamp?: number }>;
    turnCount: number;
    duration: number;
    stopReason: string;
    combinedAudio?: string;
    targetAudio?: string;
    simulatedUserAudio?: string;
    metadata?: Record<string, unknown>;
  }): ProviderResponse {
    // Build the output transcript
    const output = result.turns
      .map((turn) => `${turn.speaker === 'agent' ? 'Assistant' : 'User'}: ${turn.text}`)
      .join('\n---\n');

    // Use combined stereo audio (left=agent, right=user) for best playback experience
    // Falls back to target-only audio if combined not available
    const audioData = this.shouldRecordConversation()
      ? result.combinedAudio || result.targetAudio
      : undefined;

    return {
      output,
      metadata: {
        turns: result.turns,
        turnCount: result.turnCount,
        duration: result.duration,
        stopReason: result.stopReason,
        success: result.success,
        targetProvider: result.metadata?.targetProvider,
        simulatedUserProvider: result.metadata?.simulatedUserProvider,
        audioTracks: this.shouldRecordConversation()
          ? {
              combined: result.combinedAudio ? 'stereo (left=agent, right=user)' : undefined,
              targetOnly: result.targetAudio ? 'mono (agent only)' : undefined,
              userOnly: result.simulatedUserAudio ? 'mono (user only)' : undefined,
            }
          : undefined,
      },
      audio: audioData
        ? {
            data: audioData,
            format: 'wav',
          }
        : undefined,
    };
  }

  /**
   * Setup logging for orchestrator events.
   */
  private setupOrchestratorLogging(orchestrator: VoiceConversationOrchestrator): void {
    orchestrator.on('state_change', (state) => {
      logger.debug('[SimulatedVoiceUser] State change:', { state });
    });

    orchestrator.on('turn_complete', ({ speaker, text }) => {
      logger.debug('[SimulatedVoiceUser] Turn complete:', {
        speaker,
        textLength: text.length,
      });
    });

    orchestrator.on('error', (error) => {
      logger.error('[SimulatedVoiceUser] Error:', { error });
    });
  }

  /**
   * Format the conversation result as a ProviderResponse.
   */
  private formatResult(result: ConversationResult): ProviderResponse {
    // Build the output transcript
    const output = result.turns
      .map((turn) => `${turn.speaker === 'agent' ? 'Assistant' : 'User'}: ${turn.text}`)
      .join('\n---\n');

    // Use combined stereo audio (left=agent, right=user) for best playback experience
    // Falls back to target-only audio if combined not available
    const audioData = this.shouldRecordConversation()
      ? result.combinedAudio || result.targetAudio
      : undefined;

    return {
      output,
      metadata: {
        turns: result.turns,
        turnCount: result.turnCount,
        duration: result.duration,
        stopReason: result.stopReason,
        success: result.success,
        targetProvider: result.metadata?.targetProvider,
        simulatedUserProvider: result.metadata?.simulatedUserProvider,
        // Include separate track references for advanced use cases
        audioTracks: this.shouldRecordConversation()
          ? {
              combined: result.combinedAudio ? 'stereo (left=agent, right=user)' : undefined,
              targetOnly: result.targetAudio ? 'mono (agent only)' : undefined,
              userOnly: result.simulatedUserAudio ? 'mono (user only)' : undefined,
            }
          : undefined,
      },
      audio: audioData
        ? {
            data: audioData.toString('base64'),
            format: 'wav',
          }
        : undefined,
    };
  }
}
