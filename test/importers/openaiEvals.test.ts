import { describe, expect, it } from 'vitest';
import { convertOpenAIEvalsJsonl } from '../../src/importers/openaiEvals/convert';

function convertRunIds(runIds: string[]) {
  return convertOpenAIEvalsJsonl(
    runIds.map((runId) => ({
      run_id: runId,
      data_source_idx: 0,
      item: { input: 'Saved output' },
      grades: {},
    })),
  );
}

describe('OpenAI Evals import identities', () => {
  it.each(['evalrun_a-1', 'runs-not-a-digest', 'hashed-readable-id'])(
    'preserves the existing ID for an ordinary run: %s',
    (runId) => {
      expect(convertRunIds([runId]).evalId).toBe(`openai-evals-${runId}`);
    },
  );

  it('keeps punctuation and Unicode run IDs distinct', () => {
    const runIds = ['evalrun/a', 'evalrun_a', 'evalrun?a', 'evalrunéa', 'evalrun中a'];
    const evalIds = runIds.map((runId) => convertRunIds([runId]).evalId);

    expect(new Set(evalIds).size).toBe(runIds.length);
    for (const [index, runId] of runIds.entries()) {
      expect(convertRunIds([runId]).evalId).toBe(evalIds[index]);
      expect(evalIds[index]).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });

  it('keeps lone surrogates distinct from each other and replacement characters', () => {
    const runIds = ['\ud800', '\ud801', '\ufffd'];
    expect(new Set(runIds.map((runId) => convertRunIds([runId]).evalId)).size).toBe(3);
  });

  it('prevents a literal run ID from colliding with a hashed run ID', () => {
    const hashedId = convertRunIds(['evalrun/a']).evalId;
    const literalRunId = hashedId.slice('openai-evals-'.length);

    expect(convertRunIds([literalRunId]).evalId).not.toBe(hashedId);
  });

  it('prevents a single run from colliding with a multi-run import', () => {
    const multiRunId = convertRunIds(['evalrun_a', 'evalrun_b']).evalId;
    const literalRunId = multiRunId.slice('openai-evals-'.length);

    expect(convertRunIds([literalRunId]).evalId).not.toBe(multiRunId);
  });

  it('preserves ordinary multi-run IDs', () => {
    expect(convertRunIds(['evalrun_a', 'evalrun_b']).evalId).toBe(
      'openai-evals-runs-481aa24666410b84a89cb367',
    );
  });

  it('keeps ambiguous newline-delimited multi-run IDs distinct', () => {
    expect(convertRunIds(['a', 'b\nc']).evalId).not.toBe(convertRunIds(['a\nb', 'c']).evalId);
  });

  it('keeps multi-run IDs containing lone surrogates distinct', () => {
    expect(convertRunIds(['a', '\ud800']).evalId).not.toBe(convertRunIds(['a', '\ud801']).evalId);
  });

  it('keeps multi-run identities stable when rows are reordered or repeated', () => {
    const originalId = convertRunIds(['evalrun_a', 'evalrun_b']).evalId;

    expect(convertRunIds(['evalrun_b', 'evalrun_a', 'evalrun_b']).evalId).toBe(originalId);
  });
});
