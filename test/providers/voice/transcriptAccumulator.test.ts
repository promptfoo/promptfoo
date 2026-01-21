import { beforeEach, describe, expect, it } from 'vitest';
import {
  extractStopMarker,
  formatTranscript,
  STOP_MARKER,
  TranscriptAccumulator,
} from '../../../src/providers/voice/transcriptAccumulator';

describe('TranscriptAccumulator', () => {
  let accumulator: TranscriptAccumulator;

  beforeEach(() => {
    accumulator = new TranscriptAccumulator();
  });

  describe('append', () => {
    it('should accumulate text deltas', () => {
      accumulator.append('Hello');
      accumulator.append(' ');
      accumulator.append('world');

      expect(accumulator.getCurrentBuffer()).toBe('Hello world');
    });

    it('should detect stop marker during accumulation', () => {
      expect(accumulator.hasStopMarker()).toBe(false);

      accumulator.append('Thanks! ###STOP###');

      expect(accumulator.hasStopMarker()).toBe(true);
    });
  });

  describe('complete', () => {
    it('should add turn and return transcript', () => {
      accumulator.append('Hello there');
      const text = accumulator.complete('user');

      expect(text).toBe('Hello there');
      expect(accumulator.getTurnCount()).toBe(1);
    });

    it('should trim whitespace', () => {
      accumulator.append('  Hello  ');
      const text = accumulator.complete('agent');

      expect(text).toBe('Hello');
    });

    it('should clear buffer after completion', () => {
      accumulator.append('Hello');
      accumulator.complete('user');

      expect(accumulator.getCurrentBuffer()).toBe('');
      expect(accumulator.hasBufferedContent()).toBe(false);
    });

    it('should not add empty turns', () => {
      accumulator.append('   ');
      accumulator.complete('user');

      expect(accumulator.getTurnCount()).toBe(0);
    });
  });

  describe('completeWithText', () => {
    it('should use provided text instead of buffer', () => {
      accumulator.append('partial');
      const text = accumulator.completeWithText('user', 'Full transcript');

      expect(text).toBe('Full transcript');
      expect(accumulator.getTurnCount()).toBe(1);
    });

    it('should detect stop marker in provided text', () => {
      accumulator.completeWithText('user', 'Done! ###STOP###');

      expect(accumulator.hasStopMarker()).toBe(true);
    });

    it('should clear buffer', () => {
      accumulator.append('partial');
      accumulator.completeWithText('user', 'Full');

      expect(accumulator.getCurrentBuffer()).toBe('');
    });
  });

  describe('hasStopMarker', () => {
    it('should return false initially', () => {
      expect(accumulator.hasStopMarker()).toBe(false);
    });

    it('should detect stop marker in buffer', () => {
      accumulator.append('###STOP###');
      expect(accumulator.hasStopMarker()).toBe(true);
    });

    it('should detect stop marker in completed text', () => {
      accumulator.completeWithText('user', 'Bye ###STOP###');
      expect(accumulator.hasStopMarker()).toBe(true);
    });

    it('should detect partial stop marker buildup', () => {
      accumulator.append('###');
      expect(accumulator.hasStopMarker()).toBe(false);

      accumulator.append('STOP');
      expect(accumulator.hasStopMarker()).toBe(false);

      accumulator.append('###');
      expect(accumulator.hasStopMarker()).toBe(true);
    });
  });

  describe('getFullTranscript', () => {
    it('should return empty string for no turns', () => {
      expect(accumulator.getFullTranscript()).toBe('');
    });

    it('should format single turn', () => {
      accumulator.completeWithText('user', 'Hello');
      expect(accumulator.getFullTranscript()).toBe('User: Hello');
    });

    it('should format multiple turns', () => {
      accumulator.completeWithText('user', 'Hello');
      accumulator.completeWithText('agent', 'Hi there');
      accumulator.completeWithText('user', 'Goodbye');

      const expected = 'User: Hello\n---\nAgent: Hi there\n---\nUser: Goodbye';
      expect(accumulator.getFullTranscript()).toBe(expected);
    });
  });

  describe('getTurns', () => {
    it('should return all turns', () => {
      accumulator.completeWithText('user', 'Hello');
      accumulator.completeWithText('agent', 'Hi');

      const turns = accumulator.getTurns();
      expect(turns).toHaveLength(2);
      expect(turns[0].speaker).toBe('user');
      expect(turns[0].text).toBe('Hello');
      expect(turns[1].speaker).toBe('agent');
      expect(turns[1].text).toBe('Hi');
    });

    it('should return a copy (immutable)', () => {
      accumulator.completeWithText('user', 'Hello');

      const turns1 = accumulator.getTurns();
      const turns2 = accumulator.getTurns();

      expect(turns1).not.toBe(turns2);
      expect(turns1).toEqual(turns2);
    });
  });

  describe('getLastTurn', () => {
    it('should return undefined for empty accumulator', () => {
      expect(accumulator.getLastTurn()).toBeUndefined();
    });

    it('should return last turn', () => {
      accumulator.completeWithText('user', 'First');
      accumulator.completeWithText('agent', 'Second');

      const last = accumulator.getLastTurn();
      expect(last?.text).toBe('Second');
      expect(last?.speaker).toBe('agent');
    });
  });

  describe('getTurnsBySpeaker', () => {
    it('should filter by speaker', () => {
      accumulator.completeWithText('user', 'U1');
      accumulator.completeWithText('agent', 'A1');
      accumulator.completeWithText('user', 'U2');
      accumulator.completeWithText('agent', 'A2');

      const userTurns = accumulator.getTurnsBySpeaker('user');
      const agentTurns = accumulator.getTurnsBySpeaker('agent');

      expect(userTurns).toHaveLength(2);
      expect(agentTurns).toHaveLength(2);
      expect(userTurns.map((t) => t.text)).toEqual(['U1', 'U2']);
      expect(agentTurns.map((t) => t.text)).toEqual(['A1', 'A2']);
    });
  });

  describe('reset', () => {
    it('should clear all state', () => {
      accumulator.append('partial');
      accumulator.completeWithText('user', 'Hello ###STOP###');

      accumulator.reset();

      expect(accumulator.getCurrentBuffer()).toBe('');
      expect(accumulator.getTurnCount()).toBe(0);
      expect(accumulator.hasStopMarker()).toBe(false);
    });
  });

  describe('clearBuffer', () => {
    it('should clear buffer but keep turns', () => {
      accumulator.completeWithText('user', 'Hello');
      accumulator.append('partial');

      accumulator.clearBuffer();

      expect(accumulator.getCurrentBuffer()).toBe('');
      expect(accumulator.getTurnCount()).toBe(1);
    });
  });

  describe('contains', () => {
    beforeEach(() => {
      accumulator.completeWithText('user', 'Hello World');
      accumulator.completeWithText('agent', 'Hi There');
    });

    it('should find phrase (case insensitive)', () => {
      expect(accumulator.contains('hello')).toBe(true);
      expect(accumulator.contains('WORLD')).toBe(true);
    });

    it('should find phrase (case sensitive)', () => {
      expect(accumulator.contains('Hello', true)).toBe(true);
      expect(accumulator.contains('hello', true)).toBe(false);
    });

    it('should return false for missing phrase', () => {
      expect(accumulator.contains('goodbye')).toBe(false);
    });
  });

  describe('getStats', () => {
    it('should return stats for empty accumulator', () => {
      const stats = accumulator.getStats();

      expect(stats.totalTurns).toBe(0);
      expect(stats.userTurns).toBe(0);
      expect(stats.agentTurns).toBe(0);
      expect(stats.totalWords).toBe(0);
      expect(stats.averageWordsPerTurn).toBe(0);
    });

    it('should calculate stats correctly', () => {
      accumulator.completeWithText('user', 'Hello world');
      accumulator.completeWithText('agent', 'Hi there how are you');
      accumulator.completeWithText('user', 'Fine');

      const stats = accumulator.getStats();

      expect(stats.totalTurns).toBe(3);
      expect(stats.userTurns).toBe(2);
      expect(stats.agentTurns).toBe(1);
      expect(stats.totalWords).toBe(8); // 2 + 5 + 1
      expect(stats.averageWordsPerTurn).toBeCloseTo(8 / 3, 2);
    });
  });
});

describe('extractStopMarker', () => {
  it('should extract stop marker from text', () => {
    const result = extractStopMarker('Done! ###STOP###');

    expect(result.hasStopMarker).toBe(true);
    expect(result.text).toBe('Done!');
  });

  it('should return text unchanged if no marker', () => {
    const result = extractStopMarker('Hello world');

    expect(result.hasStopMarker).toBe(false);
    expect(result.text).toBe('Hello world');
  });

  it('should handle marker at start', () => {
    const result = extractStopMarker('###STOP### Done');

    expect(result.hasStopMarker).toBe(true);
    expect(result.text).toBe('Done');
  });

  it('should handle only marker', () => {
    const result = extractStopMarker('###STOP###');

    expect(result.hasStopMarker).toBe(true);
    expect(result.text).toBe('');
  });
});

describe('formatTranscript', () => {
  it('should format transcript with default separator', () => {
    const turns = [
      { speaker: 'user' as const, text: 'Hello', timestamp: 0 },
      { speaker: 'agent' as const, text: 'Hi', timestamp: 1000 },
    ];

    const result = formatTranscript(turns);
    expect(result).toBe('User: Hello\n---\nAgent: Hi');
  });

  it('should use custom separator', () => {
    const turns = [
      { speaker: 'user' as const, text: 'Hello', timestamp: 0 },
      { speaker: 'agent' as const, text: 'Hi', timestamp: 1000 },
    ];

    const result = formatTranscript(turns, '\n\n');
    expect(result).toBe('User: Hello\n\nAgent: Hi');
  });

  it('should handle empty array', () => {
    expect(formatTranscript([])).toBe('');
  });
});

describe('STOP_MARKER constant', () => {
  it('should be the expected value', () => {
    expect(STOP_MARKER).toBe('###STOP###');
  });
});
