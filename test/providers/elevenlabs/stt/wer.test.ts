import { describe, expect, it } from 'vitest';
import { calculateWER } from '../../../../src/providers/elevenlabs/stt/wer';

describe('calculateWER', () => {
  it('returns zero for an exact match, ignoring case and punctuation', () => {
    const result = calculateWER('Hello, world!', 'hello world');

    expect(result.wer).toBe(0);
    expect(result.correct).toBe(2);
    expect(result.totalWords).toBe(2);
  });

  it('counts substitutions, deletions, and insertions', () => {
    expect(calculateWER('the cat sat', 'the bat sat')).toMatchObject({
      wer: 1 / 3,
      substitutions: 1,
    });
    expect(calculateWER('the cat sat', 'the sat')).toMatchObject({ wer: 1 / 3, deletions: 1 });
    expect(calculateWER('the cat sat', 'the cat sat down')).toMatchObject({
      wer: 1 / 3,
      insertions: 1,
    });
  });

  it('keeps accented letters instead of stripping them', () => {
    const result = calculateWER('Le café est fermé.', 'le café est fermé');

    expect(result.wer).toBe(0);
    expect(result.details?.reference).toBe('le café est fermé');
  });

  it('matches composed and decomposed forms of the same accented word', () => {
    const composed = 'café'.normalize('NFC');
    const decomposed = 'café'.normalize('NFD');
    expect(composed).not.toBe(decomposed);

    expect(calculateWER(composed, decomposed).wer).toBe(0);
  });

  it('treats words that differ only by an accent as different words', () => {
    const result = calculateWER('résumé', 'resume');

    expect(result.wer).toBe(1);
    expect(result.substitutions).toBe(1);
  });

  it('scores a wrong transcript in a non-Latin script as an error', () => {
    const result = calculateWER('Привет, как дела?', 'Спасибо, до свидания');

    expect(result.totalWords).toBe(3);
    expect(result.wer).toBe(1);
  });

  it('scores a correct transcript in a non-Latin script as a match', () => {
    const result = calculateWER('नमस्ते दुनिया', 'नमस्ते दुनिया।');

    expect(result.totalWords).toBe(2);
    expect(result.wer).toBe(0);
  });
});
