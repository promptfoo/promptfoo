import { describe, expect, it } from 'vitest';
import { convertOpenAIEvalsJsonl } from '../../src/importers/openaiEvals/convert';
import { parseImportFile } from '../../src/importers/parse';

import type { OpenAIEvalsJsonlRow } from '../../src/importers/openaiEvals/types';

describe('OpenAI Evals grader names', () => {
  describe.each(['constructor', 'toString', '__proto__', 'Quality'])('%s', (graderName) => {
    it.each([1, 2])('preserves numeric metrics across %i row(s)', (rowCount) => {
      const rows: OpenAIEvalsJsonlRow[] = [0.25, 0.75].slice(0, rowCount).map((grade, index) => ({
        run_id: 'grader-name-regression',
        data_source_idx: index,
        item: { input: `input ${index}` },
        grades: { [graderName]: grade },
        passes: { [graderName]: true },
      }));
      const originalRows = structuredClone(rows);
      const originalPrototype = Object.entries(Object.getOwnPropertyDescriptors(Object.prototype));
      const converted = convertOpenAIEvalsJsonl(rows);
      const parsed = parseImportFile(rows.map((row) => JSON.stringify(row)).join('\n'));
      if (parsed.source !== 'openai-evals-jsonl') {
        throw new Error('Expected an OpenAI Evals import');
      }

      const expectedScores = { [graderName]: rowCount === 1 ? 0.25 : 1 };
      const expectedCounts = { [graderName]: rowCount };
      for (const imported of [converted, parsed.evalData]) {
        expect(imported.results.prompts).toHaveLength(1);
        const metrics = imported.results.prompts[0].metrics;
        expect(metrics?.namedScores).toEqual(expectedScores);
        expect(metrics?.namedScoresCount).toEqual(expectedCounts);
        expect(Object.hasOwn(metrics!.namedScores, graderName)).toBe(true);
        expect(Object.hasOwn(metrics!.namedScoresCount, graderName)).toBe(true);
        const serializedMetrics = JSON.parse(JSON.stringify(metrics));
        expect(serializedMetrics.namedScores).toStrictEqual(expectedScores);
        expect(serializedMetrics.namedScoresCount).toStrictEqual(expectedCounts);
        expect(imported.results.results.map((result) => result.namedScores)).toEqual(
          originalRows.map((row) => row.grades),
        );
      }
      expect(rows).toStrictEqual(originalRows);
      expect(Object.entries(Object.getOwnPropertyDescriptors(Object.prototype))).toStrictEqual(
        originalPrototype,
      );
    });
  });
});
