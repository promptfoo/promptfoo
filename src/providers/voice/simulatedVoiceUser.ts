import cliState from '../../cliState';
import logger from '../../logger';
import { getNunjucksEngine } from '../../util/templates';
import { providerRegistry } from '../providerRegistry';
import { VoiceConversationOrchestrator } from './orchestrator';
import { STOP_MARKER } from './transcriptAccumulator';

import type { ProviderResponse } from '../../contracts/providers';
import type { EnvOverrides } from '../../types/env';
import type {
  ApiProvider,
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderOptions,
} from '../../types/providers';
import type {
  ConversationResult,
  SimulatedVoiceUserConfig,
  TurnDetectionConfig,
  VoiceProviderConfig,
} from './types';

const DEFAULT_SAMPLE_RATE = 24000;
const G711_SAMPLE_RATE = 8000;
const DEFAULT_AUDIO_FORMAT = 'pcm16';
const DEFAULT_MAX_TURNS = 10;
const DEFAULT_TIMEOUT_MS = 120000;
const DEFAULT_LOCAL_VAD_THRESHOLD = 0.02;
const DEFAULT_INSTRUCTIONS_TEMPLATE = '{{instructions}}';

type SimulatedVoiceUserProviderOptions = ProviderOptions & {
  config?: SimulatedVoiceUserConfig;
};

export class SimulatedVoiceUser implements ApiProvider {
  private readonly identifier: string;
  private readonly voiceConfig: SimulatedVoiceUserConfig;
  private readonly env?: EnvOverrides;
  private readonly conversations = new Set<VoiceConversationOrchestrator>();

  constructor({ id, label, config, env }: SimulatedVoiceUserProviderOptions) {
    this.identifier = id ?? label ?? 'simulated-voice-user';
    this.env = env;
    this.voiceConfig = {
      maxTurns: DEFAULT_MAX_TURNS,
      timeoutMs: DEFAULT_TIMEOUT_MS,
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

  private getAudioSampleRate(): number {
    const audioFormat = this.voiceConfig.audioFormat || DEFAULT_AUDIO_FORMAT;
    return audioFormat === 'pcm16'
      ? this.voiceConfig.sampleRate || DEFAULT_SAMPLE_RATE
      : G711_SAMPLE_RATE;
  }

  private buildTargetConfig(instructions: string): VoiceProviderConfig {
    const provider = this.voiceConfig.targetProvider || 'openai';
    return {
      provider,
      model: this.voiceConfig.targetModel,
      apiKey: this.voiceConfig.targetApiKey,
      voice: this.voiceConfig.targetVoice ?? 'alloy',
      instructions,
      audioFormat: this.voiceConfig.audioFormat || DEFAULT_AUDIO_FORMAT,
      sampleRate: this.getAudioSampleRate(),
      // The orchestrator commits routed audio and requests each response itself.
      // Leaving VAD on here creates duplicate target responses for the same turn.
      turnDetection: undefined,
    };
  }

  private buildSimulatedUserConfig(instructions: string): VoiceProviderConfig {
    const simulatedUserInstructions = this.buildSimulatedUserInstructions(instructions);
    const provider = this.voiceConfig.simulatedUserProvider || 'openai';

    return {
      provider,
      model: this.voiceConfig.simulatedUserModel,
      apiKey: this.voiceConfig.simulatedUserApiKey,
      voice: this.voiceConfig.simulatedUserVoice ?? 'echo',
      instructions: simulatedUserInstructions,
      audioFormat: this.voiceConfig.audioFormat || DEFAULT_AUDIO_FORMAT,
      sampleRate: this.getAudioSampleRate(),
      // Wait for the target to finish before requesting the caller's response.
      turnDetection: undefined,
    };
  }

  private buildSimulatedUserInstructions(goal: string): string {
    return `You are the caller in a voice conversation. Your goal is:

${goal}

Speak naturally and respond to the agent. Say "${STOP_MARKER}" when your goal is achieved, the conversation ends, or you decide to give up.`;
  }

  private shouldRecordConversation(): boolean {
    return this.voiceConfig.recordConversation !== false;
  }

  private shouldTargetSpeakFirst(): boolean {
    return this.voiceConfig.targetSpeaksFirst ?? true;
  }

  private validateLocalAudioConfiguration(): string | undefined {
    if (
      (this.voiceConfig.targetProvider ?? 'openai') !== 'openai' ||
      (this.voiceConfig.simulatedUserProvider ?? 'openai') !== 'openai'
    ) {
      return 'Simulated voice conversations support OpenAI Realtime endpoints only.';
    }
    return undefined;
  }

  async shutdown(): Promise<void> {
    await Promise.all(
      [...this.conversations].map((conversation) => conversation.stop('user_hangup')),
    );
  }

  callApi(
    prompt: string,
    context?: CallApiContextParams,
    options?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    const run = () => this.runConversation(prompt, context, options);
    return this.env ? cliState.withEnv({ ...cliState.env, ...this.env }, run) : run();
  }

  private async runConversation(
    prompt: string,
    context?: CallApiContextParams,
    callApiOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    const rawInstructions = this.voiceConfig.instructions || DEFAULT_INSTRUCTIONS_TEMPLATE;
    const instructions = getNunjucksEngine().renderString(rawInstructions, context?.vars || {});

    logger.debug('[SimulatedVoiceUser] Starting voice conversation:', {
      instructionLength: instructions.length,
      maxTurns: this.voiceConfig.maxTurns,
      targetProvider: this.voiceConfig.targetProvider,
      simulatedUserProvider: this.voiceConfig.simulatedUserProvider,
    });

    const configurationError = this.validateLocalAudioConfiguration();
    if (configurationError) {
      return { error: configurationError };
    }

    const targetConfig = this.buildTargetConfig(prompt);
    const simulatedUserConfig = this.buildSimulatedUserConfig(instructions);

    const orchestrator = new VoiceConversationOrchestrator({
      targetConfig,
      simulatedUserConfig,
      turnDetection: this.buildTurnDetectionConfig(),
      maxTurns: this.voiceConfig.maxTurns || DEFAULT_MAX_TURNS,
      timeoutMs: this.voiceConfig.timeoutMs || DEFAULT_TIMEOUT_MS,
      targetSpeaksFirst: this.shouldTargetSpeakFirst(),
      recordFullAudio: this.shouldRecordConversation(),
    });

    this.setupOrchestratorLogging(orchestrator);

    const abortSignal = callApiOptions?.abortSignal;
    if (abortSignal?.aborted) {
      return { error: 'Voice conversation aborted' };
    }

    this.conversations.add(orchestrator);
    providerRegistry.register(this);
    let abortHandler: (() => void) | undefined;
    try {
      const conversation = orchestrator.start();
      const result = abortSignal
        ? await Promise.race([
            conversation,
            new Promise<ConversationResult>((_, reject) => {
              abortHandler = () => {
                void orchestrator.stop('user_hangup');
                reject(new Error('Voice conversation aborted'));
              };
              abortSignal.addEventListener('abort', abortHandler, { once: true });
              if (abortSignal.aborted) {
                abortHandler();
              }
            }),
          ])
        : await conversation;
      return result.stopReason === 'user_hangup'
        ? { error: 'Voice conversation aborted', tokenUsage: result.tokenUsage }
        : this.formatResult(result);
    } catch (error) {
      logger.error('[SimulatedVoiceUser] Conversation failed:', { error });
      return {
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      this.conversations.delete(orchestrator);
      if (this.conversations.size === 0) {
        providerRegistry.unregister(this);
      }
      if (abortHandler) {
        abortSignal?.removeEventListener('abort', abortHandler);
      }
    }
  }

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

  private formatResult(result: ConversationResult): ProviderResponse {
    const output = result.turns
      .map((turn) => `${turn.speaker === 'agent' ? 'Assistant' : 'User'}: ${turn.text}`)
      .join('\n---\n');

    const audioData = this.shouldRecordConversation()
      ? result.combinedAudio || result.targetAudio
      : undefined;

    return {
      output,
      tokenUsage: result.tokenUsage,
      ...(result.stopReason === 'error'
        ? { error: result.error || 'Voice conversation failed before completion' }
        : {}),
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
            data: audioData.toString('base64'),
            format: 'wav',
          }
        : undefined,
    };
  }
}
