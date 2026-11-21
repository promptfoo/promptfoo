import { ToastProvider } from '@app/contexts/ToastContext';
import { mockObjectUrl } from '@app/tests/browserMocks';
import { renderWithProviders } from '@app/utils/testutils';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { load } from 'js-yaml';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DownloadDialog } from './DownloadMenu';
import { useTableStore } from './store';

type EvaluateTable = NonNullable<ReturnType<typeof useTableStore.getState>['table']>;

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
  ])('preserves $name in the downloaded YAML', async ({ output, success, promptIdx = 0 }) => {
    const prompt = {
      id: 'prompt-id',
      raw: 'Test prompt',
      label: 'Test prompt',
      provider: 'echo',
    };
    const prompts = promptIdx === 0 ? [prompt] : [{ ...prompt, id: 'unused-first-prompt' }, prompt];
    const testCase = { vars: { input: 'question' } };
    const outputs: EvaluateTable['body'][number]['outputs'] = [];
    outputs[promptIdx] = {
      id: 'test-output',
      text: output,
      prompt: prompt.raw,
      provider: 'echo',
      testCase,
      pass: success,
      failureReason: success ? 0 : 1,
      score: Number(success),
      cost: 0,
      latencyMs: 0,
      namedScores: {},
      gradingResult: {
        pass: success,
        score: Number(success),
        reason: 'Separate grading reason',
      },
    };
    const table: EvaluateTable = {
      head: { prompts, vars: ['input'] },
      body: [{ test: testCase, testIdx: 0, vars: ['question'], outputs }],
    };
    vi.mocked(useTableStore).mockReturnValue({ table, config: {}, evalId: 'human-eval' });

    renderWithProviders(
      <ToastProvider>
        <DownloadDialog open={true} onClose={vi.fn()} />
      </ToastProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Human Eval YAML' }));

    expect(URL.createObjectURL).toHaveBeenCalledOnce();
    const blob = vi.mocked(URL.createObjectURL).mock.calls[0][0];
    if (!(blob instanceof Blob)) {
      throw new Error('Expected the download to contain a Blob');
    }
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
  });
});
