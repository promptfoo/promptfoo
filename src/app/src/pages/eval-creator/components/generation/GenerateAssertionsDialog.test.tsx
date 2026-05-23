import type { ComponentProps } from 'react';

import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GenerateAssertionsDialog } from './GenerateAssertionsDialog';

import type { GenerationResult } from '../../api/generation';

const {
  mockGenerateAssertions,
  mockGetGenerationCapabilities,
  mockUseGenerationJob,
  mockStartJob,
  mockCancelJob,
  mockReset,
} = vi.hoisted(() => ({
  mockGenerateAssertions: vi.fn(),
  mockGetGenerationCapabilities: vi.fn(),
  mockUseGenerationJob: vi.fn(),
  mockStartJob: vi.fn(),
  mockCancelJob: vi.fn(),
  mockReset: vi.fn(),
}));

vi.mock('../../api/generation', async () => {
  const actual =
    await vi.importActual<typeof import('../../api/generation')>('../../api/generation');

  return {
    ...actual,
    generateAssertions: mockGenerateAssertions,
    getGenerationCapabilities: mockGetGenerationCapabilities,
  };
});

vi.mock('../../hooks/useGenerationJob', () => ({
  useGenerationJob: mockUseGenerationJob,
}));

describe('GenerateAssertionsDialog', () => {
  const prompts = [{ raw: 'Return JSON', label: 'Prompt' }];
  const existingTests = [{ vars: { city: 'Paris' } }];
  const onClose = vi.fn();
  const onGenerated = vi.fn();

  let completeJob: ((result: GenerationResult) => void) | undefined;

  beforeEach(() => {
    vi.resetAllMocks();
    completeJob = undefined;
    mockGenerateAssertions.mockResolvedValue({ jobId: 'assertions-1' });
    mockGetGenerationCapabilities.mockResolvedValue({
      hasPiAccess: true,
      defaultAssertionType: 'pi',
    });
    mockStartJob.mockImplementation(
      async (
        _type: 'dataset' | 'assertions' | 'tests',
        startJobFn: () => Promise<{ jobId: string }>,
      ) => {
        const { jobId } = await startJobFn();
        return jobId;
      },
    );
    mockUseGenerationJob.mockImplementation(
      (options: { onComplete?: (result: GenerationResult) => void }) => {
        completeJob = options.onComplete;
        return {
          startJob: mockStartJob,
          cancelJob: mockCancelJob,
          status: 'idle',
          progress: 0,
          total: 0,
          phase: '',
          error: null,
          reset: mockReset,
        };
      },
    );
  });

  function renderDialog(props: Partial<ComponentProps<typeof GenerateAssertionsDialog>> = {}) {
    return render(
      <GenerateAssertionsDialog
        open={true}
        onClose={onClose}
        onGenerated={onGenerated}
        prompts={prompts}
        existingTests={existingTests}
        {...props}
      />,
    );
  }

  it('disables generation until a prompt exists', () => {
    renderDialog({ prompts: [] });

    expect(
      screen.getByText('Add at least one prompt before generating assertions.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Generate Now/ })).toBeDisabled();
  });

  it('builds assertion generation options from the advanced controls', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole('button', { name: /Advanced options/ }));
    await user.click(screen.getByLabelText('Include negative tests'));
    await user.type(
      screen.getByLabelText('Focus areas (optional)'),
      'Cover refusal and tool misuse',
    );
    await user.click(screen.getByRole('button', { name: /Generate Now/ }));

    await waitFor(() => {
      expect(mockGenerateAssertions).toHaveBeenCalledTimes(1);
    });
    expect(mockStartJob).toHaveBeenCalledWith('assertions', expect.any(Function));
    expect(mockGenerateAssertions).toHaveBeenCalledWith(prompts, existingTests, {
      numAssertions: 5,
      type: 'pi',
      instructions: 'Cover refusal and tool misuse',
      coverage: {
        enabled: true,
        extractRequirements: true,
      },
      negativeTests: {
        enabled: true,
        types: ['should-not-contain', 'should-not-hallucinate'],
      },
    });
  });

  it('defaults to llm-rubric when Pi is unavailable', async () => {
    const user = userEvent.setup();
    mockGetGenerationCapabilities.mockResolvedValueOnce({
      hasPiAccess: false,
      defaultAssertionType: 'llm-rubric',
    });
    renderDialog();

    await waitFor(() => {
      expect(screen.getByText('Detailed rubric-based evaluation')).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: /Generate Now/ }));

    await waitFor(() => {
      expect(mockGenerateAssertions).toHaveBeenCalledWith(
        prompts,
        existingTests,
        expect.objectContaining({ type: 'llm-rubric' }),
      );
    });
  });

  it('updates select-driven options, disables coverage, and closes from the footer', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole('combobox', { name: 'Number of assertions' }));
    const assertionCountOptions = await waitFor(() => screen.getAllByRole('option'));
    await user.click(
      assertionCountOptions.find((option) => option.textContent === '7 assertions')!,
    );

    await user.click(screen.getByRole('combobox', { name: 'Assertion type' }));
    const assertionTypeOptions = await waitFor(() => screen.getAllByRole('option'));
    await user.click(assertionTypeOptions.find((option) => option.textContent === 'G-Eval')!);

    await user.click(screen.getByRole('button', { name: /Advanced options/ }));
    await user.click(screen.getByLabelText('Enable coverage analysis'));
    await user.click(screen.getByRole('button', { name: /Generate Now/ }));

    await waitFor(() => {
      expect(mockGenerateAssertions).toHaveBeenCalledTimes(1);
    });
    expect(mockGenerateAssertions).toHaveBeenCalledWith(prompts, existingTests, {
      numAssertions: 7,
      type: 'g-eval',
      instructions: undefined,
      coverage: undefined,
      negativeTests: undefined,
    });
  });

  it('merges generated assertions with negative tests before closing', () => {
    renderDialog();

    act(() => {
      completeJob?.({
        assertions: [{ type: 'contains', value: 'json' }],
        negativeTests: [{ type: 'not-contains', value: 'pii' }],
      } as GenerationResult);
    });

    expect(onGenerated).toHaveBeenCalledWith([
      { type: 'contains', value: 'json' },
      { type: 'not-contains', value: 'pii' },
    ]);
    expect(mockReset).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders progress state and allows cancellation while a job is visible', async () => {
    const user = userEvent.setup();
    mockUseGenerationJob.mockImplementation(() => ({
      startJob: mockStartJob,
      cancelJob: mockCancelJob,
      status: 'error',
      progress: 1,
      total: 2,
      phase: 'Generating assertions',
      error: 'generation failed',
      reset: mockReset,
    }));
    renderDialog();

    await user.click(screen.getByRole('button', { name: /Generate Now/ }));

    expect(screen.getByText('Generating Assertions...')).toBeInTheDocument();
    expect(screen.getByText('generation failed')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(mockCancelJob).toHaveBeenCalledTimes(1);
  });
});
