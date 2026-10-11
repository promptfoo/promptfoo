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
    expect(detectExplicitStop(text, true)).toBe('explicit-command');
  });

  it.each([
    'Sorry, when do you close?',
    'sorry what time is it',
    'Sorry, how much does it cost',
    'Sorry, can you repeat that',
    'Sorry, could you wait',
  ])('recognizes an interruption question prefix: %s', (text) => {
    expect(detectExplicitStop(text, true)).toBe('interruption-question');
  });

  it('waits for a question-prefix word boundary without delaying observed whitespace', () => {
    expect(detectExplicitStop('Sorry, could you wait')).toBeUndefined();
    expect(detectExplicitStop('Sorry, could you wait ')).toBe('interruption-question');
    expect(detectExplicitStop('Sorry, could you wait', true)).toBe('interruption-question');
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

  it.each([
    'Please pause playback of the video',
    'hold onto it',
    'Wait a secondary concern',
    'Wait, a secondary concern',
    'Stop... by the office tomorrow.',
  ])('never promotes an unfinished prefix of a known non-interruption: %s', (text) => {
    for (let length = 1; length <= text.length; length++) {
      expect(detectExplicitStop(text.slice(0, length))).toBeUndefined();
    }
    expect(detectExplicitStop(text, true)).toBeUndefined();
  });

  it.each(['Pause', 'Please pause', 'Hold on', 'Wait a second', 'Please stop talking', 'Stop.'])(
    'waits for an observed boundary or completion: %s',
    (text) => {
      expect(detectExplicitStop(text)).toBeUndefined();
      expect(detectExplicitStop(text, true)).toBe('explicit-command');
    },
  );

  it.each([
    'Wait a second ',
    'Wait a second,',
    'Hold on!',
    'Please pause. ',
    'Pause!',
    'Pause?',
    'Pause,',
    'Stop. I’m changing the booking',
    "Stop. I'm changing the booking",
    'Please pause. Don’t discard the booking',
  ])('accepts observed delimiters and ordinary contractions: %s', (text) => {
    expect(detectExplicitStop(text)).toBe('explicit-command');
  });

  it.each(['“Stop. I’m changing the booking”', '‘Please pause.’', "'Stop talking.'"])(
    'keeps quoted commands distinct from contractions: %s',
    (text) => {
      expect(detectExplicitStop(text)).toBeUndefined();
      expect(detectExplicitStop(text, true)).toBeUndefined();
    },
  );

  it('waits for completion to distinguish a bare stop command from a continuation', () => {
    expect(detectExplicitStop('Stop')).toBeUndefined();
    expect(detectExplicitStop('Stop!')).toBe('explicit-command');
    expect(detectExplicitStop('Stop!', true)).toBe('explicit-command');
    expect(detectExplicitStop('Please stop.', true)).toBe('explicit-command');
    expect(detectExplicitStop('Stop by the cafe', true)).toBeUndefined();
  });
});
