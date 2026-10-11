import { describe, expect, it } from 'vitest';
import { detectExplicitStop } from '../../../src/providers/voice/explicitStopDetector';

describe('English explicit-stop policy', () => {
  it.each([
    'Stop talking.',
    'please stop speaking now',
    'Stop reading',
    'wait a second',
    'Wait, a second,',
    'Please, wait, a moment.',
    'Wait a moment, I have a question',
    'Hold on!',
    'Please, pause.',
    'Pause for a moment',
    'Stop. Can we discuss shipping?',
    'Please stop! That is the wrong account.',
    'Stop!!! I need to change the appointment.',
  ])('recognizes a strong anchored command: %s', (text) => {
    expect(detectExplicitStop(text)).toBe('explicit-command');
  });

  it.each([
    'Sorry, when do you close?',
    'sorry what time is it',
    'Sorry, how much does it cost',
    'Sorry, can you repeat that',
    'Sorry, could you wait',
  ])('recognizes an interruption question prefix: %s', (text) => {
    expect(detectExplicitStop(text)).toBe('interruption-question');
  });

  it.each([
    '',
    'Mm-hmm, go on',
    'Yes, absolutely, keep going',
    'okay',
    'sorry',
    'actually',
    'Sorry, I agree',
    'Stop by the cafe',
    'stopping is fine',
    'The sign says stop talking',
    'Do not stop talking',
    "Don't stop speaking",
    'Never pause',
    '“Stop talking”',
    '"hold on"',
    "'stop talking'",
    'Please say stop talking',
    'If I say stop talking',
    'Sorry what I meant was yes',
    'Sorry, can you continue?',
    'Sorry, can you go on please?',
    'Sorry, could you keep going?',
    'Sorry, what a lovely announcement',
    'Sorry, how wonderful',
    'Sorry how I phrased that was wrong',
    'Please stop talk',
    'hold onto it',
    'Wait a secondary concern',
    'Wait, a secondary concern',
    'Wait, a',
    'Do not wait, a second customer is here.',
    '"Wait, a second"',
    'Sorry whenever you like',
    'I said sorry what time',
    'Please pause playback of the video',
    'Stop',
    'please stop',
    'Stopwatch readings are ready.',
    'Stop... by the office tomorrow.',
    'Do not stop. Keep explaining the shipment.',
    "Don't stop! Keep reading.",
    '"Stop. Can we discuss shipping?"',
    "'Please stop! That is the wrong account.'",
  ])('abstains on ambiguous text or a backchannel: %s', (text) => {
    expect(detectExplicitStop(text)).toBeUndefined();
  });

  it('waits for completion to distinguish a bare stop command from a continuation', () => {
    expect(detectExplicitStop('Stop')).toBeUndefined();
    expect(detectExplicitStop('Stop!')).toBe('explicit-command');
    expect(detectExplicitStop('Stop!', true)).toBe('explicit-command');
    expect(detectExplicitStop('Please stop.', true)).toBe('explicit-command');
    expect(detectExplicitStop('Stop by the cafe', true)).toBeUndefined();
  });
});
