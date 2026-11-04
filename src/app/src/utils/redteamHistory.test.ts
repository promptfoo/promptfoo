import { describe, expect, it } from 'vitest';
import { getRedteamHistoryMessages } from './redteamHistory';

describe('getRedteamHistoryMessages', () => {
  it('preserves alternating roles and multimodal fields', () => {
    const promptAudio = { data: 'audio', format: 'wav' };
    const outputImage = { data: 'image', format: 'png' };
    expect(
      getRedteamHistoryMessages({
        redteamHistory: [{ prompt: 'question', output: 'answer', promptAudio, outputImage }],
      }),
    ).toEqual([
      { role: 'user', content: 'question', audio: promptAudio, image: undefined },
      { role: 'assistant', content: 'answer', audio: undefined, image: outputImage },
    ]);
  });
  it('supports tree history and skips incomplete entries', () => {
    expect(
      getRedteamHistoryMessages({
        redteamTreeHistory: [
          null,
          {},
          { prompt: 'incomplete' },
          { prompt: '', output: 'empty prompt' },
          { prompt: 'question', output: 'answer' },
        ],
      }),
    ).toEqual([
      { role: 'user', content: 'question', audio: undefined, image: undefined },
      { role: 'assistant', content: 'answer', audio: undefined, image: undefined },
    ]);
  });
  it('preserves explicit empty history precedence over tree history', () => {
    expect(
      getRedteamHistoryMessages({
        redteamHistory: [],
        redteamTreeHistory: [{ prompt: 'question', output: 'answer' }],
      }),
    ).toEqual([]);
  });
  it.each([undefined, {}, { redteamHistory: 'malformed' }])(
    'ignores absent or non-array history: %j',
    (metadata) => {
      expect(getRedteamHistoryMessages(metadata)).toEqual([]);
    },
  );
});
