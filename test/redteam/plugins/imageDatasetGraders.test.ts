import { describe, expect, it } from 'vitest';
import { materializeImageOutputsForGrading } from '../../../src/matchers/rubric';
import { UnsafeBenchGrader } from '../../../src/redteam/plugins/unsafebench';
import { VLGuardGrader } from '../../../src/redteam/plugins/vlguard';
import { VLSUGrader } from '../../../src/redteam/plugins/vlsu';
import { createMockProvider } from '../../factories/provider';

const image = 'data:image/png;base64,aW1hZ2U=';
const other = 'data:image/png;base64,b3RoZXI=';
const provider = () =>
  createMockProvider({ response: { output: { pass: false, score: 0, reason: 'Fixture' } } });

describe('image safety controls', () => {
  it.each([new VLGuardGrader(), new VLSUGrader()])(
    'grades a safe $id refusal with only the selected input',
    async (grader) => {
      const judge = provider();
      const result = await grader.getResult(
        image + '<sunset>',
        'I cannot help with that.',
        {
          metadata: {
            purpose: 'Describe a sunset',
            safe: false,
            vlguardSafe: false,
            vlguardImageVar: 'selected',
            combinedGrade: 'unsafe',
            vlsuCategory: 'C4',
            vlsuCategoryName: 'Control',
            vlsuSeverityPattern: 'safe_safe_safe',
            imageGrade: 'safe',
            textGrade: 'safe',
            categoryGuidance: 'Unsafe-only guidance',
          },
          options: { provider: judge },
          vars: {
            selected: image,
            image: grader instanceof VLGuardGrader ? other : image,
            extra: other,
          },
        },
        undefined,
        { vlguardSafe: true, combinedGrade: 'safe' },
      );
      expect(result.grade.pass).toBe(false);
      expect(result.rubric).toContain('[image]&lt;sunset&gt;');
      expect(result.rubric).toMatch(/<purpose>\s*Describe a sunset\s*<\/purpose>/);
      expect(result.rubric).toContain('justified refusal of an out-of-scope request');
      expect(result.rubric).not.toContain('Unsafe-only guidance');
      expect(result.rubric).not.toContain(image);
      const request = judge.callApi.mock.calls[0][0];
      expect(request).toContain(image);
      expect(request).not.toContain(other);
      expect(request).toContain('untrusted input supplied to the target');
    },
  );

  it('requires an explicit grading provider and the selected local image', async () => {
    const grader = new VLGuardGrader();
    await expect(
      grader.getResult(
        'request',
        'response',
        { metadata: { safe: true, purpose: 'fixture' }, vars: { image } },
        undefined,
        undefined,
      ),
    ).rejects.toThrow('Configure a multimodal grading provider');
    await expect(
      grader.getResult(
        'request',
        'response',
        { metadata: { safe: true, purpose: 'fixture' }, vars: { other: image } },
        undefined,
        undefined,
      ),
    ).rejects.toThrow('selected local image');
  });

  it('uses category guidance for unsafe responses without attaching unrelated input', async () => {
    const result = await new VLGuardGrader().getResult(
      'request',
      'I cannot help with that.',
      {
        metadata: { category: 'Privacy', safe: true, purpose: 'fixture' },
      },
      undefined,
      { safe: false },
    );
    expect(result.grade.pass).toBe(true);
    expect(result.rubric).toContain('Protect personal information');
    expect(new UnsafeBenchGrader().renderRubric({ category: 'Unknown' })).toContain(
      'Prioritize safety',
    );
  });

  it('ignores empty descriptors in the combined media count', () => {
    expect(
      materializeImageOutputsForGrading([...Array(32).fill({}), { data: image }]).imageOutputs,
    ).toHaveLength(1);
  });
});
