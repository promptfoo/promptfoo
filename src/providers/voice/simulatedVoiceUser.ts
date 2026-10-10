import { getNunjucksEngine } from '../../util/templates';
import { OpenAiLiveProvider } from '../openai/live';
import { LIVE_FRAME_MS } from '../openai/liveSession';
import { providerRegistry } from '../providerRegistry';
import { PcmAudioQueue } from './audioQueue';
import { formatVoiceResult } from './result';

import type { EnvOverrides } from '../../contracts/env';
import type { ProviderResponse } from '../../contracts/providers';
import type {
  ApiProvider,
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderOptions,
} from '../../types/providers';
import type { LiveSession } from '../openai/liveSession';
import type {
  SimulatedVoiceUserConfig,
  VoiceIntervention,
  VoiceParticipantOptions,
  VoiceSpeaker,
  VoiceTranscriptFragment,
} from './types';

const SAMPLE_RATE = 24000;
const BYTES_PER_SECOND = SAMPLE_RATE * 2;
const FRAME_BYTES = (BYTES_PER_SECOND * LIVE_FRAME_MS) / 1000;
const DEFAULT_MODEL = 'gpt-live-1';
const SPEAKERS: VoiceSpeaker[] = ['target', 'caller'];

function positiveInteger(value: number, name: string, maximum: number, minimum = 1): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer from ${minimum} to ${maximum}.`);
  }
  return value;
}

/**
 * Run two GPT-Live participants on one continuous audio clock. Both connections listen while
 * speaking; transcript events describe evidence, never control when the other speaker may talk.
 */
export class SimulatedVoiceUser implements ApiProvider {
  readonly config: SimulatedVoiceUserConfig;
  readonly label?: string;
  private readonly env?: EnvOverrides;
  private readonly active = new Set<AbortController>();

  constructor(options: ProviderOptions & { config?: SimulatedVoiceUserConfig } = {}) {
    this.config = options.config ?? {};
    this.label = options.label;
    this.env = options.env;
  }

  id(): string {
    return 'promptfoo:simulated-voice-user';
  }

  cleanup(): void {
    for (const controller of this.active) {
      controller.abort(new Error('Simulated voice provider shut down.'));
    }
  }

  async shutdown(): Promise<void> {
    this.cleanup();
    providerRegistry.unregister(this);
  }

  private participant(
    config: VoiceParticipantOptions | undefined,
    instructions: string,
    voice: string,
    durationMs: number,
  ): OpenAiLiveProvider {
    const format = config?.audio?.format;
    if (format && (format.type !== 'audio/pcm' || format.rate !== SAMPLE_RATE)) {
      throw new Error('Simulated voice participants require PCM16 audio at 24000 Hz.');
    }
    return new OpenAiLiveProvider(config?.model ?? DEFAULT_MODEL, {
      env: this.env,
      config: {
        ...config,
        instructions,
        audio: {
          format: { type: 'audio/pcm', rate: SAMPLE_RATE },
          output: config?.audio?.output ?? { voice },
        },
        responseWindowMs: durationMs,
      },
    });
  }

  private validateConfiguration() {
    const durationMs = positiveInteger(this.config.durationMs ?? 60000, 'durationMs', 300000, 1000);
    const timeoutMs = positiveInteger(this.config.timeoutMs ?? 120000, 'timeoutMs', 600000);
    if (timeoutMs <= durationMs) {
      throw new Error('timeoutMs must exceed durationMs to allow startup and finalization.');
    }
    const bufferMs = positiveInteger(
      this.config.maxBufferedAudioMs ?? 3000,
      'maxBufferedAudioMs',
      10000,
      20,
    );
    for (const name of [
      'audioFormat',
      'sampleRate',
      'maxTurns',
      'turnDetectionMode',
      'targetProvider',
      'simulatedUserProvider',
      'targetModel',
      'targetVoice',
      'simulatedUserModel',
      'simulatedUserVoice',
      'targetApiKey',
      'simulatedUserApiKey',
    ]) {
      if (name in this.config) {
        throw new Error(
          `Legacy voice option ${name} is not supported by GPT-Live. Configure target/caller Live options and durationMs instead.`,
        );
      }
    }
    if (
      (this.config.recordConversation !== undefined &&
        typeof this.config.recordConversation !== 'boolean') ||
      (this.config.targetSpeaksFirst !== undefined &&
        typeof this.config.targetSpeaksFirst !== 'boolean')
    ) {
      throw new Error('recordConversation and targetSpeaksFirst must be booleans.');
    }
    const interventions = this.config.callerInterventions ?? [];
    if (!Array.isArray(interventions) || interventions.length > 10) {
      throw new Error('callerInterventions must be an array with at most 10 entries.');
    }
    for (const intervention of interventions) {
      if (
        !intervention ||
        !Number.isSafeInteger(intervention.atMs) ||
        intervention.atMs < 0 ||
        intervention.atMs >= durationMs ||
        typeof intervention.instructions !== 'string' ||
        !intervention.instructions.trim() ||
        Buffer.byteLength(intervention.instructions) > 2000
      ) {
        throw new Error(
          'Caller interventions require atMs within the capture window and nonempty instructions of at most 2000 UTF-8 bytes.',
        );
      }
    }
    return { durationMs, timeoutMs, bufferMs, interventions };
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    options?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    options?.abortSignal?.throwIfAborted();
    const controller = new AbortController();
    const abort = () => controller.abort(options?.abortSignal?.reason);
    options?.abortSignal?.addEventListener('abort', abort, { once: true });
    this.active.add(controller);
    providerRegistry.register(this);
    let deadline: ReturnType<typeof setTimeout> | undefined;
    let mediaTimer: ReturnType<typeof setTimeout> | undefined;
    let stopReason = 'duration_limit';
    let error: string | undefined;
    let timedOut = false;
    let targetRefused = false;
    let stopped = false;
    let endMedia: (() => void) | undefined;
    const startedAt = performance.now();
    let mediaStartedAt = startedAt;
    const transcript: VoiceTranscriptFragment[] = [];
    const interventionsSent: VoiceIntervention[] = [];
    const recordings: Buffer[] = [];
    const responses: Array<ProviderResponse | undefined> = [];
    const sessions: LiveSession[] = [];
    const runs: Promise<void>[] = [];
    const queues: PcmAudioQueue[] = [];
    const deliveredAudioBytes = [0, 0];
    let frameCount = 0;
    let maximumClockLagMs = 0;
    const stop = () => {
      stopped = true;
      if (mediaTimer) {
        clearTimeout(mediaTimer);
      }
      endMedia?.();
    };
    const fail = (cause: unknown, fallback: string) => {
      if (!controller.signal.aborted) {
        error ??= cause instanceof Error ? cause.message : fallback;
      }
      stopReason = timedOut ? 'timeout' : 'error';
      stop();
    };
    controller.signal.addEventListener('abort', stop, { once: true });
    try {
      const { durationMs, timeoutMs, bufferMs, interventions } = this.validateConfiguration();
      deadline = setTimeout(() => {
        timedOut = true;
        controller.abort(new Error('Simulated voice conversation exceeded timeoutMs.'));
      }, timeoutMs);
      const render = (value: string) =>
        getNunjucksEngine().renderString(value, context?.vars ?? {});
      const callerInstructions = render(this.config.instructions ?? '{{instructions}}');
      const scheduled = interventions
        .map((intervention) => ({
          ...intervention,
          instructions: render(intervention.instructions),
        }))
        .sort((left, right) => left.atMs - right.atMs);
      if (
        scheduled.some(
          (intervention) =>
            !intervention.instructions.trim() ||
            Buffer.byteLength(intervention.instructions) > 2000,
        )
      ) {
        throw new Error(
          'Rendered caller intervention instructions must contain 1–2000 UTF-8 bytes.',
        );
      }
      let nextIntervention = 0;
      const targetInstructions =
        this.config.targetInstructions === undefined
          ? prompt
          : render(this.config.targetInstructions);
      if (!callerInstructions.trim() || !targetInstructions.trim()) {
        throw new Error(
          'Simulated voice conversations require target instructions and a caller persona/goal.',
        );
      }
      const providers = [
        this.participant(this.config.target, targetInstructions, 'marin', durationMs),
        this.participant(
          this.config.caller,
          `You are the caller, not the assistant. Stay in your assigned persona and pursue this goal in a natural spoken conversation:\n\n${callerInstructions}`,
          'cedar',
          durationMs,
        ),
      ];
      let rejectSetup!: (reason: unknown) => void;
      const setupInterrupted = new Promise<never>((_resolve, reject) => {
        rejectSetup = reject;
      });
      const onInterrupted = () => rejectSetup(controller.signal.reason);
      controller.signal.addEventListener('abort', onInterrupted, { once: true });
      void setupInterrupted.catch(() => {});
      const readiness: Promise<void>[] = [];
      const rejects: Array<(reason: Error) => void> = [];
      for (const [index, provider] of providers.entries()) {
        const queue = new PcmAudioQueue((BYTES_PER_SECOND * bufferMs) / 1000);
        queues.push(queue);
        let ready!: () => void;
        readiness.push(
          new Promise<void>((resolve, reject) => {
            ready = resolve;
            rejects.push(reject);
          }),
        );
        // A startup failure can reject readiness before the second session has been prepared.
        void readiness[index].catch(() => {});
        sessions.push(
          await Promise.race([
            provider.createSession('', undefined, controller.signal, {
              onReady: ready,
              onClosing: ({ error: failure, isRefusal }) => {
                if (!controller.signal.aborted) {
                  error ??= failure;
                }
                const expectedTargetRefusal = index === 0 && isRefusal && !failure;
                if (expectedTargetRefusal) {
                  targetRefused = true;
                } else {
                  rejectSetup(
                    new Error(
                      failure ?? 'Voice participant ended before both sessions were ready.',
                    ),
                  );
                }
                if (!stopped) {
                  stopReason = failure ? 'error' : isRefusal ? 'safety' : 'remote_hangup';
                  stop();
                }
              },
              onAudio: (audio) => {
                if (!stopped) {
                  queue.append(audio);
                }
              },
              onTranscript: (fragment) => {
                if (stopped) {
                  return;
                }
                transcript.push({
                  speaker: SPEAKERS[index],
                  source: fragment.role === 'assistant' ? 'output' : 'input',
                  delta: fragment.delta,
                  startMs: fragment.start_ms,
                  endMs: fragment.end_ms,
                  receivedAtMs: performance.now() - startedAt,
                });
              },
            }),
            setupInterrupted,
          ]),
        );
      }
      controller.signal.removeEventListener('abort', onInterrupted);
      controller.signal.throwIfAborted();
      for (const [index, session] of sessions.entries()) {
        runs.push(
          session
            .run()
            .then((response) => {
              responses[index] = response;
              if (!controller.signal.aborted) {
                error ??= response.error;
              }
              rejects[index](
                new Error(
                  response.error ?? 'Voice participant ended before both sessions were ready.',
                ),
              );
              if (!stopped) {
                stopReason = response.error
                  ? 'error'
                  : response.isRefusal
                    ? 'safety'
                    : 'remote_hangup';
                stop();
              }
            })
            .catch((cause: unknown) => {
              const message = cause instanceof Error ? cause.message : 'Voice participant failed.';
              responses[index] = { error: message };
              rejects[index](new Error(message));
              stopReason = 'error';
              stop();
            }),
        );
      }
      await Promise.race([
        Promise.all(readiness),
        setupInterrupted,
        Promise.race(runs).then(() => {
          // A valid early target refusal can precede the caller's session.started. Let its
          // bounded startup settle so it can close normally and report final usage.
          if (targetRefused && !error) {
            return Promise.all(readiness);
          }
          throw new Error(error ?? 'Voice participant ended before both sessions were ready.');
        }),
      ]);
      mediaStartedAt = performance.now();
      if (!stopped) {
        const opening = this.config.targetSpeaksFirst ? 0 : 1;
        sessions[opening].requestSpeech(
          this.config.targetSpeaksFirst
            ? 'Greet the caller briefly now, then listen.'
            : 'Begin the call now, speaking as the caller and following your assigned persona and goal. Then listen.',
        );
        await new Promise<void>((resolve) => {
          endMedia = resolve;
          const sendScheduled = (elapsed: number) => {
            while (
              nextIntervention < scheduled.length &&
              scheduled[nextIntervention].atMs <= elapsed
            ) {
              const intervention = scheduled[nextIntervention++];
              const eventId = sessions[1].requestSpeech(intervention.instructions);
              interventionsSent.push({
                scheduledAtMs: intervention.atMs,
                sentAtMs: elapsed,
                instructions: intervention.instructions,
                eventId,
              });
            }
          };
          const sendFrame = () => {
            const frames = queues.map((queue) => queue.read(FRAME_BYTES));
            const forwarded: Buffer[] = [Buffer.alloc(FRAME_BYTES), Buffer.alloc(FRAME_BYTES)];
            let accepted = false;
            try {
              sessions[0].appendAudio(frames[1].frame);
              deliveredAudioBytes[1] += frames[1].audioBytes;
              forwarded[1] = frames[1].frame;
              accepted = true;
              sessions[1].appendAudio(frames[0].frame);
              deliveredAudioBytes[0] += frames[0].audioBytes;
              forwarded[0] = frames[0].frame;
            } finally {
              // A second-side failure still leaves real audio accepted by the first peer.
              if (accepted) {
                if (this.config.recordConversation !== false) {
                  const stereo = Buffer.alloc(FRAME_BYTES * 2);
                  for (let byte = 0; byte < FRAME_BYTES; byte += 2) {
                    forwarded[0].copy(stereo, byte * 2, byte, byte + 2);
                    forwarded[1].copy(stereo, byte * 2 + 2, byte, byte + 2);
                  }
                  recordings.push(stereo);
                }
                frameCount++;
              }
            }
          };
          const tick = () => {
            if (stopped) {
              return resolve();
            }
            try {
              const elapsed = performance.now() - mediaStartedAt;
              const lag = elapsed - frameCount * LIVE_FRAME_MS;
              maximumClockLagMs = Math.max(maximumClockLagMs, lag);
              if (lag > 250) {
                throw new Error('Voice media clock fell more than 250 ms behind.');
              }
              if (elapsed >= durationMs) {
                stop();
                return;
              }
              sendScheduled(elapsed);
              if (elapsed >= frameCount * LIVE_FRAME_MS) {
                sendFrame();
              }
              mediaTimer = setTimeout(
                tick,
                Math.max(
                  0,
                  mediaStartedAt +
                    Math.min(
                      frameCount * LIVE_FRAME_MS,
                      scheduled[nextIntervention]?.atMs ?? Infinity,
                      durationMs,
                    ) -
                    performance.now(),
                ),
              );
            } catch (cause) {
              fail(cause, 'Voice audio bridge failed.');
            }
          };
          tick();
        });
      }
    } catch (cause) {
      fail(cause, 'Simulated voice conversation failed.');
    } finally {
      stop();
      // Prepared sessions have no resources until run() is called.
      for (const [index, session] of sessions.slice(0, runs.length).entries()) {
        session.close({ cancelPendingSpeech: targetRefused && index === 1 });
      }
      await Promise.allSettled(runs);
      if (deadline) {
        clearTimeout(deadline);
      }
      controller.signal.removeEventListener('abort', stop);
      options?.abortSignal?.removeEventListener('abort', abort);
      this.active.delete(controller);
      if (!this.active.size) {
        providerRegistry.unregister(this);
      }
    }
    options?.abortSignal?.throwIfAborted();
    if (controller.signal.aborted) {
      error ??= timedOut
        ? 'Simulated voice conversation exceeded timeoutMs.'
        : 'Simulated voice conversation was stopped.';
      stopReason = timedOut ? 'timeout' : 'error';
    }
    return formatVoiceResult({
      transcript,
      interventions: interventionsSent,
      recordings,
      responses,
      queues,
      deliveredAudioBytes,
      frameCount,
      maximumClockLagMs,
      elapsedMs: performance.now() - startedAt,
      error,
      stopReason,
    });
  }
}
