import { accumulateResponseTokenUsage, createEmptyTokenUsage } from '../../util/tokenUsageUtils';
import { convertPcm16ToWav } from '../openai/audio';
import { LIVE_FRAME_MS } from '../openai/liveSession';

import type { ProviderResponse } from '../../contracts/providers';
import type { PcmAudioPlayout } from './audioPlayout';
import type { PcmAudioQueue } from './audioQueue';
import type { VoiceIntervention, VoiceSpeaker, VoiceTranscriptFragment } from './types';

const SAMPLE_RATE = 24000;
const BYTES_PER_SECOND = SAMPLE_RATE * 2;
const SPEAKERS: VoiceSpeaker[] = ['target', 'caller'];

interface VoiceResultInput {
  transcript: VoiceTranscriptFragment[];
  interventions: VoiceIntervention[];
  scheduledAudioInterventions: number;
  recordings: Buffer[];
  responses: Array<ProviderResponse | undefined>;
  preparationResponses?: ProviderResponse[];
  queues: Array<PcmAudioQueue & { metrics?: PcmAudioPlayout['metrics'] }>;
  deliveredAudioBytes: number[];
  frameCount: number;
  maximumClockLagMs: number;
  elapsedMs: number;
  error?: string;
  stopReason: string;
}

/** Preserve partial evidence and separate observed duration from final, billable usage. */
export function formatVoiceResult({
  transcript,
  interventions,
  scheduledAudioInterventions,
  recordings,
  responses,
  preparationResponses = [],
  queues,
  deliveredAudioBytes,
  frameCount,
  maximumClockLagMs,
  elapsedMs,
  error,
  stopReason,
}: VoiceResultInput): ProviderResponse {
  const tokenUsage = createEmptyTokenUsage();
  for (const response of [...responses, ...preparationResponses]) {
    if (response) {
      accumulateResponseTokenUsage(tokenUsage, response);
    }
  }
  error ??= responses.find((response) => response?.error)?.error;
  if (
    !error &&
    !responses[0]?.isRefusal &&
    // A late timer or early hangup may stop the call before a clip gets a dispatch record.
    interventions.filter((entry) => entry.mode === 'audio' && entry.completedAtMs !== undefined)
      .length < scheduledAudioInterventions
  ) {
    error = 'Scheduled caller speech ended before the complete clip was delivered.';
  }
  if (responses[1]?.isRefusal) {
    error ??=
      'The simulated caller encountered a safety intervention; target behavior could not be fully tested.';
  }
  if (!error && !responses[0]?.isRefusal && deliveredAudioBytes.some((bytes) => bytes === 0)) {
    error = 'Both voice participants must deliver audio; the conversation was incomplete.';
  }
  if (
    !error &&
    !responses[0]?.isRefusal &&
    !SPEAKERS.every((speaker) =>
      transcript.some(
        (fragment) =>
          fragment.speaker === speaker && fragment.source === 'input' && fragment.delta.trim(),
      ),
    )
  ) {
    error =
      'Both voice participants must return a listener transcript; conversation evidence was incomplete.';
  }
  if (error && stopReason !== 'timeout') {
    stopReason = 'error';
  }
  // Generated speech can lead playback. Grade the listener's recognition, so queued or
  // discarded output cannot satisfy assertions before the other participant hears it.
  // Callbacks append on one local clock (receivedAtMs), preserving arrival order even
  // when timestamps tie. Model start/end estimates can drift across sessions, so they
  // cannot order speakers. Recognition arrival is not precise acoustic turn timing.
  const heard = transcript.filter((fragment) => fragment.source === 'input');
  const messages: Array<{ role: 'assistant' | 'user'; content: string }> = [];
  for (const fragment of heard) {
    const role = fragment.speaker === 'caller' ? 'assistant' : 'user';
    const last = messages[messages.length - 1];
    if (last?.role === role) {
      last.content += fragment.delta;
    } else {
      messages.push({ role, content: fragment.delta });
    }
  }
  const output = messages
    .map((message) => `${message.role === 'assistant' ? 'Assistant' : 'User'}: ${message.content}`)
    .join('\n---\n');
  const participants = Object.fromEntries(
    SPEAKERS.map((speaker, index) => {
      const response = responses[index];
      const metadata = response?.metadata;
      const finalUsageConfirmed = metadata?.finalUsageConfirmed === true;
      return [
        speaker,
        {
          spokenSource: 'generated_output',
          spoken: transcript
            .filter((f) => f.speaker === speaker && f.source === 'output')
            .map((f) => f.delta)
            .join(''),
          heard: transcript
            .filter((f) => f.speaker === speaker && f.source === 'input')
            .map((f) => f.delta)
            .join(''),
          sessionId: response?.sessionId,
          finalUsageConfirmed,
          voiceSeconds: finalUsageConfirmed ? metadata?.voiceSeconds : undefined,
          observedVoiceSeconds: metadata?.voiceSeconds,
          voiceCost: finalUsageConfirmed ? metadata?.voiceCost : undefined,
          backendCost: finalUsageConfirmed ? metadata?.backendCost : undefined,
          closeReason: metadata?.closeReason,
          cancelledSpeechRequests: metadata?.cancelledSpeechRequests,
          error: response?.error,
          isRefusal: response?.isRefusal,
          guardrails: response?.guardrails,
          deliveredAudioBytes: deliveredAudioBytes[index] ?? 0,
          queuedAudioBytes: queues[index]?.bytes ?? 0,
          maximumQueueMs: ((queues[index]?.peakBytes ?? 0) / BYTES_PER_SECOND) * 1000,
          playout: queues[index]?.metrics,
          delegations: metadata?.delegations,
          backendResponses: metadata?.backendResponses,
        },
      ];
    }),
  );
  const allCostsKnown =
    SPEAKERS.every((_speaker, index) => typeof responses[index]?.cost === 'number') &&
    preparationResponses.every((response) => typeof response.cost === 'number');
  const cost = allCostsKnown
    ? [...responses, ...preparationResponses].reduce((sum, response) => sum + response!.cost!, 0)
    : undefined;
  const pcm = Buffer.concat(recordings);
  return {
    output,
    ...(error ? { error } : {}),
    cached: false,
    tokenUsage,
    ...(cost !== undefined && Number.isFinite(cost) ? { cost } : {}),
    ...(responses[0]?.isRefusal ? { isRefusal: true, guardrails: responses[0].guardrails } : {}),
    ...(responses[0]?.conversationEnded
      ? { conversationEnded: true, conversationEndReason: responses[0].conversationEndReason }
      : {}),
    ...(pcm.length
      ? {
          audio: {
            data: convertPcm16ToWav(pcm, SAMPLE_RATE, 2).toString('base64'),
            format: 'wav',
            sampleRate: SAMPLE_RATE,
            channels: 2,
            duration: (frameCount * LIVE_FRAME_MS) / 1000,
            transcript: output,
          },
        }
      : {}),
    metadata: {
      messages,
      voice: {
        version: 1,
        stopReason,
        durationMs: frameCount * LIVE_FRAME_MS,
        elapsedMs,
        audioChannels: ['target', 'caller'],
        gradingTranscriptSource: 'listener_input',
        gradingTranscriptOrder: 'listener_event_arrival',
        interventions,
        ...(preparationResponses.length
          ? {
              interventionPreparation: {
                requests: preparationResponses.length,
                costKnown: preparationResponses.every(
                  (response) => typeof response.cost === 'number',
                ),
                knownCost: preparationResponses.reduce(
                  (sum, response) => sum + (response.cost ?? 0),
                  0,
                ),
                responses: preparationResponses.map((response) => ({
                  cached: response.cached ?? false,
                  cost: response.cost,
                  latencyMs: response.latencyMs,
                  error: response.error,
                })),
              },
            }
          : {}),
        transcript,
        participants,
        maximumClockLagMs,
      },
    },
  };
}
