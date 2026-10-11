import { describe, expect, it } from 'vitest';
import { PcmAudioPlayout } from '../../../src/providers/voice/audioPlayout';
import { PcmAudioQueue } from '../../../src/providers/voice/audioQueue';
import { formatVoiceResult } from '../../../src/providers/voice/result';
import { TargetPlaybackController } from '../../../src/providers/voice/targetPlaybackController';

import type { LiveTranscriptionSummary } from '../../../src/providers/openai/liveTranscriptionSession';
import type { VoiceTranscriptFragment } from '../../../src/providers/voice/types';

describe('formatVoiceResult', () => {
  it('preserves observed listener order when real session timestamps drift apart', () => {
    // The caller transcript clock was about 20 seconds behind the target.
    // These fragments came from a recorded call where the question preceded the answer.
    const transcript: VoiceTranscriptFragment[] = [
      {
        speaker: 'caller',
        source: 'output',
        delta: ' Hey,',
        startMs: 1000,
        endMs: 1200,
        receivedAtMs: 22470,
      },
      {
        speaker: 'target',
        source: 'input',
        delta: ' Hey',
        startMs: 21800,
        endMs: 22000,
        receivedAtMs: 23753.856441,
      },
      {
        speaker: 'target',
        source: 'input',
        delta: ', yeah',
        startMs: 22200,
        endMs: 22400,
        receivedAtMs: 24217.1,
      },
      {
        speaker: 'caller',
        source: 'input',
        delta: ' Sure',
        startMs: 6800,
        endMs: 7000,
        receivedAtMs: 28134.817448,
      },
    ];
    const response = formatVoiceResult({
      transcript,
      interventions: [],
      scheduledAudioInterventions: 0,
      recordings: [],
      responses: [],
      queues: [new PcmAudioQueue(48000), new PcmAudioQueue(48000)],
      deliveredAudioBytes: [960, 960],
      frameCount: 2250,
      maximumClockLagMs: 0,
      elapsedMs: 47000,
      stopReason: 'duration_limit',
    });

    expect(response.error).toBeUndefined();
    expect(response.output).toBe('User:  Hey, yeah\n---\nAssistant:  Sure');
    expect(response.metadata?.messages).toEqual([
      { role: 'user', content: ' Hey, yeah' },
      { role: 'assistant', content: ' Sure' },
    ]);
    expect(response.metadata?.voice).toMatchObject({
      gradingTranscriptOrder: 'listener_event_arrival',
      transcript,
      participants: { target: { heard: ' Hey, yeah' }, caller: { heard: ' Sure' } },
    });
  });
});

describe('voice request accounting', () => {
  function resultInput(): Parameters<typeof formatVoiceResult>[0] {
    return {
      transcript: [],
      interventions: [],
      scheduledAudioInterventions: 0,
      recordings: [],
      responses: [],
      queues: [new PcmAudioQueue(48000), new PcmAudioQueue(48000)],
      deliveredAudioBytes: [0, 0],
      frameCount: 0,
      maximumClockLagMs: 0,
      elapsedMs: 0,
      stopReason: 'error',
      error: 'Fixture ends before media starts.',
    };
  }
  function application(numRequests?: 0 | 1) {
    const playback = new TargetPlaybackController(new PcmAudioPlayout(48000));
    const recognition: LiveTranscriptionSummary | undefined =
      numRequests === undefined
        ? undefined
        : {
            model: 'gpt-live-transcribe',
            numRequests,
            requestedDelay: 'minimal',
            delayAcknowledged: false,
            status: 'failed',
            error: 'Fixture startup failure.',
            sentAudioBytes: 0,
            sentAudioMs: 0,
            uncommittedAudioMs: 0,
            usageSeconds: 0,
            usageConfirmed: false,
            estimatedCost: 0,
            costEstimated: true,
            turns: [],
            transcripts: [],
          };
    return {
      mode: 'app-barge-in' as const,
      clock: 'provider' as const,
      policy: playback.policy,
      metrics: playback.metrics,
      events: playback.events,
      recognition,
      redirects: [],
    };
  }

  it.each([undefined, 0, 1] as const)(
    'counts only attempted recognition with no participant responses: %s',
    (numRequests) => {
      const response = formatVoiceResult({
        ...resultInput(),
        targetPlayback: application(numRequests),
      });
      expect(response.tokenUsage).toMatchObject({
        numRequests: numRequests ?? 0,
        total: 0,
        prompt: 0,
        completion: 0,
      });
      expect(response.cost).toBeUndefined();
      expect(response.metadata?.voice.durationMs).toBe(0);
    },
  );

  it.each([false, true])(
    'adds recognition once alongside Live and TTS accounting (cached TTS=%s)',
    (cached) => {
      const input = resultInput();
      input.responses = [
        { cost: 0.01, tokenUsage: { prompt: 10, completion: 2, total: 12, numRequests: 1 } },
        { cost: 0.02, tokenUsage: { prompt: 20, completion: 3, total: 23, numRequests: 1 } },
      ];
      input.preparationResponses = [
        {
          cached,
          cost: 0.005,
          tokenUsage: {
            prompt: 4,
            completion: 0,
            total: 4,
            cached: cached ? 4 : 0,
            numRequests: cached ? 0 : 1,
          },
        },
      ];
      const native = formatVoiceResult(input);
      const app = formatVoiceResult({ ...input, targetPlayback: application(1) });
      expect(native.tokenUsage).toMatchObject({
        numRequests: 3,
        total: 39,
        prompt: 34,
        completion: 5,
      });
      expect(app.tokenUsage).toMatchObject({
        numRequests: 4,
        total: 39,
        prompt: 34,
        completion: 5,
      });
      if (cached) {
        expect(native.tokenUsage?.incurredTokenUsage).toMatchObject({ numRequests: 2, total: 35 });
        expect(app.tokenUsage?.incurredTokenUsage).toMatchObject({ numRequests: 3, total: 35 });
      }
      expect(native.cost).toBeCloseTo(0.035);
      expect(app.cost).toBeUndefined(); // Counting a request does not confirm ASR billing.
      expect(app.metadata?.voice.durationMs).toBe(native.metadata?.voice.durationMs);
      expect(app.metadata?.voice.targetPlayback.recognition.usageSeconds).toBe(0);
    },
  );

  it('counts a failed TTS preparation without assuming recognition started', () => {
    const response = formatVoiceResult({
      ...resultInput(),
      targetPlayback: application(),
      preparationResponses: [{ error: 'Synthesis rejected', tokenUsage: { numRequests: 1 } }],
    });
    expect(response.tokenUsage?.numRequests).toBe(1);
  });
});
