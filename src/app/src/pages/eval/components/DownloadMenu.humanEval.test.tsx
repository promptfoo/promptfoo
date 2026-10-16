import { ToastProvider } from '@app/contexts/ToastContext';
import { mockObjectUrl } from '@app/tests/browserMocks';
import { renderWithProviders } from '@app/utils/testutils';
import { convertResultsToTable } from '@promptfoo/presentation/evalResults';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { load } from 'js-yaml';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DownloadDialog } from './DownloadMenu';
import { useTableStore } from './store';

vi.mock('./store', () => ({ useTableStore: vi.fn() }));

describe('Human Eval YAML output', () => {
  beforeEach(() => {
    vi.mocked(useTableStore).mockReset();
    mockObjectUrl();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it.each<{ name: string; output: string; success: boolean; promptIdx?: number }>([
    { name: 'inline dashes', output: 'before---after', success: true },
    { name: 'one Markdown separator', output: '# First\n---\nSecond', success: true },
    {
      name: 'multiple Markdown separators',
      output: '# First\n---\nSecond\n---\nThird',
      success: false,
    },
    { name: 'ordinary text', output: 'A complete answer.', success: true },
    { name: 'empty text', output: '', success: true },
    { name: 'missing first output', output: 'Second column', success: true, promptIdx: 1 },
  ])(
    'preserves $name through table conversion and download',
    async ({ output, success, promptIdx = 0 }) => {
      const prompt = {
        id: 'prompt-id',
        raw: 'Test prompt',
        label: 'Test prompt',
        provider: 'echo',
      };
      const prompts =
        promptIdx === 0 ? [prompt] : [{ ...prompt, id: 'unused-first-prompt' }, prompt];
      const table = convertResultsToTable({
        version: 4,
        createdAt: '2026-01-01T00:00:00.000Z',
        author: null,
        config: {},
        prompts,
        results: {
          version: 3,
          timestamp: '2026-01-01T00:00:00.000Z',
          prompts,
          stats: {
            successes: Number(success),
            failures: Number(!success),
            errors: 0,
            tokenUsage: {},
          },
          results: [
            {
              promptIdx,
              testIdx: 0,
              promptId: prompt.id,
              prompt,
              provider: { id: 'echo' },
              testCase: {
                vars: { input: 'question' },
                assert: [{ type: 'equals', value: success ? output : 'Expected answer' }],
              },
              vars: { input: 'question' },
              response: { output },
              success,
              failureReason: success ? 0 : 1,
              score: Number(success),
              latencyMs: 0,
              namedScores: {},
              gradingResult: {
                pass: success,
                score: Number(success),
                reason: 'Separate grading reason',
              },
            },
          ],
        },
      });
      expect(table.body[0].outputs[promptIdx]?.text).toBe(output);
      vi.mocked(useTableStore).mockReturnValue({ table, config: {}, evalId: 'human-eval' });

      renderWithProviders(
        <ToastProvider>
          <DownloadDialog open={true} onClose={vi.fn()} />
        </ToastProvider>,
      );
      await userEvent.click(screen.getByRole('button', { name: 'Human Eval YAML' }));

      expect(URL.createObjectURL).toHaveBeenCalledOnce();
      const blob = vi.mocked(URL.createObjectURL).mock.calls[0][0] as Blob;
      expect(blob).toBeInstanceOf(Blob);
      const yamlText = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsText(blob);
      });
      expect(load(yamlText)).toEqual([
        {
          vars: { input: 'question', output: promptIdx === 0 ? output : '' },
          assert: [
            {
              type: 'javascript',
              value: `${promptIdx === 0 && success ? '' : '!'}JSON.parse(output).pass`,
            },
          ],
        },
      ]);
      expect(vi.mocked(HTMLAnchorElement.prototype.click).mock.contexts[0]).toHaveAttribute(
        'download',
        'human-eval-human-eval-cases.yaml',
      );
    },
  );
});
