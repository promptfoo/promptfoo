import { describe, expect, it } from 'vitest';
import { PcmAudioQueue } from '../../../src/providers/voice/audioQueue';
import { formatVoiceResult } from '../../../src/providers/voice/result';

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
