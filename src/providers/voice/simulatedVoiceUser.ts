/**
 * Simulated Voice User Provider
 *
 * A provider that simulates a voice user interacting with a realtime voice agent.
 * Uses bidirectional audio streaming to conduct voice-based conversations.
 *
 * This is the voice equivalent of the text-based SimulatedUser provider.
 */

import logger from '../../logger';
import { getEnvString } from '../../envars';
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
  SimulatedVoiceUserConfig,
  VoiceProviderConfig,
  TurnDetectionConfig,
  ConversationResult,
} from './types';

const DEFAULT_SAMPLE_RATE = 24000;
const DEFAULT_AUDIO_FORMAT = 'pcm16';
const DEFAULT_MAX_TURNS = 10;
const DEFAULT_TIMEOUT_MS = 120000;

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
 *       targetModel: gpt-4o-realtime-preview
 *       simulatedUserProvider: openai
 *       simulatedUserModel: gpt-4o-realtime-preview
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
      mode: this.voiceConfig.turnDetectionMode || 'server_vad',
      silenceThresholdMs: this.voiceConfig.silenceThresholdMs || 500,
      vadThreshold: this.voiceConfig.vadThreshold || 0.5,
      minTurnDurationMs: this.voiceConfig.minTurnDurationMs || 100,
      maxTurnDurationMs: this.voiceConfig.maxTurnDurationMs || 30000,
      prefixPaddingMs: this.voiceConfig.prefixPaddingMs || 300,
    };
  }

  /**
   * Build the target voice provider config.
   */
  private buildTargetConfig(instructions: string): VoiceProviderConfig {
    return {
      provider: this.voiceConfig.targetProvider || 'openai',
      model: this.voiceConfig.targetModel,
      apiKey: this.voiceConfig.targetApiKey || getEnvString('OPENAI_API_KEY'),
      voice: this.voiceConfig.targetVoice || 'alloy',
      instructions,
      audioFormat: this.voiceConfig.audioFormat || DEFAULT_AUDIO_FORMAT,
      sampleRate: this.voiceConfig.sampleRate || DEFAULT_SAMPLE_RATE,
      turnDetection: this.buildTurnDetectionConfig(),
    };
  }

  /**
   * Build the simulated user voice provider config.
   */
  private buildSimulatedUserConfig(instructions: string): VoiceProviderConfig {
    // Build the simulated user instructions with the goal
    const simulatedUserInstructions = this.buildSimulatedUserInstructions(instructions);

    return {
      provider: this.voiceConfig.simulatedUserProvider || 'openai',
      model: this.voiceConfig.simulatedUserModel,
      apiKey: this.voiceConfig.simulatedUserApiKey || getEnvString('OPENAI_API_KEY'),
      voice: this.voiceConfig.simulatedUserVoice || 'echo',
      instructions: simulatedUserInstructions,
      audioFormat: this.voiceConfig.audioFormat || DEFAULT_AUDIO_FORMAT,
      sampleRate: this.voiceConfig.sampleRate || DEFAULT_SAMPLE_RATE,
      turnDetection: this.buildTurnDetectionConfig(),
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

  /**
   * Run the voice conversation.
   */
  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    _callApiOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    // Render the instructions with context variables
    const rawInstructions = this.voiceConfig.instructions || prompt;
    const instructions = getNunjucksEngine().renderString(rawInstructions, context?.vars || {});

    logger.debug('[SimulatedVoiceUser] Starting voice conversation:', {
      instructions: instructions.substring(0, 100),
      maxTurns: this.voiceConfig.maxTurns,
      targetProvider: this.voiceConfig.targetProvider,
      simulatedUserProvider: this.voiceConfig.simulatedUserProvider,
    });

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
      targetSpeaksFirst: this.voiceConfig.targetSpeaksFirst,
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
   * Setup logging for orchestrator events.
   */
  private setupOrchestratorLogging(orchestrator: VoiceConversationOrchestrator): void {
    orchestrator.on('state_change', (state) => {
      logger.debug('[SimulatedVoiceUser] State change:', { state });
    });

    orchestrator.on('turn_complete', ({ speaker, text }) => {
      logger.debug('[SimulatedVoiceUser] Turn complete:', {
        speaker,
        text: text.substring(0, 100),
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
      },
      audio: result.targetAudio
        ? {
            data: result.targetAudio.toString('base64'),
            format: 'wav',
          }
        : undefined,
    };
  }
}
