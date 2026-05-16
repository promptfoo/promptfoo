import type { ComponentProps } from 'react';

import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GenerateTestCasesDialog } from './GenerateTestCasesDialog';

import type { GenerationResult } from '../../api/generation';

const {
  mockGenerateDataset,
  mockGenerateTestSuite,
  mockGetGenerationCapabilities,
  mockUseGenerationJob,
  mockUseGenerationStream,
  mockStartJob,
  mockCancelJob,
  mockReset,
  mockConnectStream,
  mockDisconnectStream,
} = vi.hoisted(() => ({
  mockGenerateDataset: vi.fn(),
  mockGenerateTestSuite: vi.fn(),
  mockGetGenerationCapabilities: vi.fn(),
  mockUseGenerationJob: vi.fn(),
  mockUseGenerationStream: vi.fn(),
  mockStartJob: vi.fn(),
  mockCancelJob: vi.fn(),
  mockReset: vi.fn(),
  mockConnectStream: vi.fn(),
  mockDisconnectStream: vi.fn(),
}));

vi.mock('../../api/generation', async () => {
  const actual =
    await vi.importActual<typeof import('../../api/generation')>('../../api/generation');

  return {
    ...actual,
    generateDataset: mockGenerateDataset,
    generateTestSuite: mockGenerateTestSuite,
    getGenerationCapabilities: mockGetGenerationCapabilities,
  };
});

vi.mock('../../hooks/useGenerationJob', () => ({
  useGenerationJob: mockUseGenerationJob,
}));

vi.mock('../../hooks/useGenerationStream', () => ({
  useGenerationStream: mockUseGenerationStream,
}));

describe('GenerateTestCasesDialog', () => {
  const prompts = [{ raw: 'Return JSON', label: 'Prompt' }];
  const existingTests = [{ vars: { city: 'Paris' } }];
  const onClose = vi.fn();
  const onGenerated = vi.fn();

  let completeJob: ((result: GenerationResult) => void) | undefined;

  beforeEach(() => {
    vi.resetAllMocks();
    completeJob = undefined;
    mockGenerateDataset.mockResolvedValue({ jobId: 'dataset-1' });
    mockGenerateTestSuite.mockResolvedValue({ jobId: 'tests-1' });
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
          jobId: null,
          status: 'idle',
          progress: 0,
          total: 0,
          phase: '',
          error: null,
          reset: mockReset,
        };
      },
    );
    mockUseGenerationStream.mockReturnValue({
      connect: mockConnectStream,
      disconnect: mockDisconnectStream,
      testCases: [],
    });
  });

  function renderDialog(props: Partial<ComponentProps<typeof GenerateTestCasesDialog>> = {}) {
    return render(
      <GenerateTestCasesDialog
        open={true}
        onClose={onClose}
        onGenerated={onGenerated}
        prompts={prompts}
        existingTests={existingTests}
        {...props}
      />,
    );
  }

  it('shows the empty state and disables generation without prompts', async () => {
    renderDialog({ prompts: [] });

    expect(
      screen.getByText('Add at least one prompt before generating test cases.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Generate$/ })).toBeDisabled();
    await waitFor(() => {
      expect(mockGetGenerationCapabilities).toHaveBeenCalledTimes(1);
    });
  });

  it('falls back cleanly when capability discovery fails', async () => {
    mockGetGenerationCapabilities.mockRejectedValueOnce(new Error('offline'));
    renderDialog();

    await waitFor(() => {
      expect(mockGetGenerationCapabilities).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByText(/Generate 15 test cases with assertions/)).toBeInTheDocument();
  });

  it('starts combined generation with the detected assertion type', async () => {
    const user = userEvent.setup();
    renderDialog();

    await waitFor(() => {
      expect(mockGetGenerationCapabilities).toHaveBeenCalledTimes(1);
    });
    await user.click(screen.getByRole('button', { name: /^Generate$/ }));

    await waitFor(() => {
      expect(mockGenerateTestSuite).toHaveBeenCalledTimes(1);
    });
    expect(mockStartJob).toHaveBeenCalledWith('tests', expect.any(Function));
    expect(mockGenerateTestSuite).toHaveBeenCalledWith(prompts, existingTests, {
      dataset: {
        numPersonas: 5,
        numTestCasesPerPersona: 3,
        instructions: undefined,
        edgeCases: {
          enabled: true,
          types: ['boundary', 'format', 'empty', 'special-chars'],
        },
        diversity: { enabled: true, targetScore: 0.7 },
      },
      assertions: {
        type: 'pi',
        numAssertions: 3,
      },
    });
  });

  it('switches to dataset-only generation after customizing the form', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByLabelText('Include assertions (recommended)'));
    await user.click(screen.getByRole('button', { name: 'Customize' }));
    const personasInput = screen.getByLabelText('Personas');
    const testsPerPersonaInput = screen.getByLabelText('Tests per persona');
    await user.click(personasInput);
    await user.keyboard('{Control>}a{/Control}');
    await user.paste('2');
    await user.click(testsPerPersonaInput);
    await user.keyboard('{Control>}a{/Control}');
    await user.paste('4');
    await user.type(
      screen.getByLabelText('Custom instructions (optional)'),
      'Focus on short prompts',
    );
    await user.click(screen.getByRole('button', { name: /^Generate$/ }));

    await waitFor(() => {
      expect(mockGenerateDataset).toHaveBeenCalledTimes(1);
    });
    expect(mockStartJob).toHaveBeenCalledWith('dataset', expect.any(Function));
    expect(mockGenerateDataset).toHaveBeenCalledWith(prompts, existingTests, {
      numPersonas: 2,
      numTestCasesPerPersona: 4,
      instructions: 'Focus on short prompts',
      edgeCases: {
        enabled: true,
        types: ['boundary', 'format', 'empty', 'special-chars'],
      },
      diversity: { enabled: true, targetScore: 0.7 },
    });
  });

  it('maps completed combined generation results before closing', () => {
    renderDialog();

    act(() => {
      completeJob?.({
        dataset: {
          testCases: [{ city: 'Paris' }, { city: 'Berlin' }],
          metadata: { totalGenerated: 2, durationMs: 1, provider: 'dataset' },
        },
        assertions: {
          assertions: [{ type: 'contains', value: 'city' }],
          metadata: { totalGenerated: 1, durationMs: 1 },
        },
        metadata: { totalDurationMs: 2, provider: 'tests' },
      } as GenerationResult);
    });

    expect(onGenerated).toHaveBeenCalledWith(
      [
        { vars: { city: 'Paris' }, description: 'Generated Test Case #1' },
        { vars: { city: 'Berlin' }, description: 'Generated Test Case #2' },
      ],
      [{ type: 'contains', value: 'city' }],
    );
    expect(mockDisconnectStream).toHaveBeenCalledTimes(1);
    expect(mockReset).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders progress, connects the live stream, and cancels cleanly', async () => {
    const user = userEvent.setup();
    mockUseGenerationJob.mockImplementation(() => ({
      startJob: mockStartJob,
      cancelJob: mockCancelJob,
      jobId: 'tests-2',
      status: 'in-progress',
      progress: 2,
      total: 4,
      phase: 'Generating test cases',
      error: null,
      reset: mockReset,
    }));
    mockUseGenerationStream.mockReturnValue({
      connect: mockConnectStream,
      disconnect: mockDisconnectStream,
      testCases: [{ city: 'Paris' }],
    });
    renderDialog();

    await user.click(screen.getByRole('button', { name: /^Generate$/ }));

    await waitFor(() => {
      expect(mockConnectStream).toHaveBeenCalledWith('tests-2');
    });
    expect(screen.getByText('Generating Test Cases...')).toBeInTheDocument();
    expect(screen.getByText(/Live Preview/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(mockCancelJob).toHaveBeenCalledTimes(1);
    expect(mockDisconnectStream).toHaveBeenCalledTimes(1);
  });
});
