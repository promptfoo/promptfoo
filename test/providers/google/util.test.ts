import type { Part } from '../../../src/providers/google/types';
import {
  getCandidate,
  formatCandidateContents,
  mergeParts,
} from '../../../src/providers/google/util';

jest.mock('google-auth-library');

jest.mock('glob', () => ({
  globSync: jest.fn().mockReturnValue([]),
}));

jest.mock('fs', () => ({
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
  statSync: jest.fn(),
}));

describe('util', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (global as any).cachedAuth = undefined;
  });

  describe('getCandidate', () => {
    it('should extract single candidate', () => {
      const data = {
        candidates: [
          {
            content: {
              parts: [{ text: 'test' }],
            },
            safetyRatings: [],
          },
        ],
      };
      const result = getCandidate(data);
      expect(result).toEqual(data.candidates[0]);
    });

    it('should throw error when no candidates', () => {
      const data = { candidates: [] };
      expect(() => getCandidate(data)).toThrow('Expected one candidate in API response.');
    });

    it('should throw error when multiple candidates', () => {
      const data = {
        candidates: [
          { content: { parts: [{ text: 'test1' }] }, safetyRatings: [] },
          { content: { parts: [{ text: 'test2' }] }, safetyRatings: [] },
        ],
      };
      expect(() => getCandidate(data)).toThrow('Expected one candidate in API response.');
    });
  });

  describe('formatCandidateContents', () => {
    it('should format text-only content', () => {
      const candidate = {
        content: {
          parts: [{ text: 'part1' }, { text: 'part2' }],
        },
        safetyRatings: [],
      };
      const result = formatCandidateContents(candidate);
      expect(result).toBe('part1part2');
    });

    it('should return parts array for mixed content', () => {
      const candidate = {
        content: {
          parts: [
            { text: 'text part' },
            { inline_data: { mime_type: 'image/jpeg', data: 'base64data' } },
          ],
        },
        safetyRatings: [],
      };
      const result = formatCandidateContents(candidate);
      expect(result).toEqual(candidate.content.parts);
    });

    it('should throw error when no content', () => {
      const candidate = { safetyRatings: [] } as any;
      expect(() => formatCandidateContents(candidate)).toThrow(/No output found in response/);
    });
  });

  describe('mergeParts', () => {
    it('should merge two strings', () => {
      const result = mergeParts('part1', 'part2');
      expect(result).toBe('part1part2');
    });

    it('should merge string with Part array', () => {
      const parts: Part[] = [{ text: 'part2' }];
      const result = mergeParts('part1', parts);
      expect(result).toEqual([{ text: 'part1' }, { text: 'part2' }]);
    });

    it('should merge two Part arrays', () => {
      const parts1: Part[] = [{ text: 'part1' }];
      const parts2: Part[] = [{ text: 'part2' }];
      const result = mergeParts(parts1, parts2);
      expect(result).toEqual([{ text: 'part1' }, { text: 'part2' }]);
    });

    it('should handle undefined first part', () => {
      const parts: Part[] = [{ text: 'part2' }];
      const result = mergeParts(undefined, parts);
      expect(result).toEqual(parts);
    });
  });
});
