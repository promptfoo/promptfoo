import { mockWindowOpen } from '@app/tests/browserMocks';
import { renderWithProviders } from '@app/utils/testutils';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useNavigate } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import RiskCategoryDrawer from './RiskCategoryDrawer';
import type { AtomicTestCase, EvaluateResult, ResultFailureReason } from '@promptfoo/types';

// Mock dependencies
vi.mock('react-router', () => ({
  useNavigate: vi.fn(),
}));

vi.mock('../../../eval/components/EvalOutputPromptDialog', () => ({
  default: () => null,
}));

vi.mock('./PluginStrategyFlow', () => ({
  default: () => null,
}));

vi.mock('./SuggestionsDialog', () => ({
  default: () => null,
}));

describe('RiskCategoryDrawer Component Navigation', () => {
  const mockNavigate = vi.fn();

  // Create a mock test case
  const mockTestCase: AtomicTestCase = {
    vars: {},
  };

  // Create a complete mock EvaluateResult
  const createMockEvaluateResult = (metadata?: Record<string, any>): EvaluateResult => ({
    promptIdx: 0,
    testIdx: 0,
    testCase: mockTestCase,
    promptId: 'test-prompt-id',
    provider: {
      id: 'test-provider',
      label: 'Test Provider',
    },
    prompt: {
      raw: 'Test prompt',
      display: 'Test prompt',
      label: 'Test label',
    },
    vars: {},
    failureReason: 0 as ResultFailureReason,
    success: false,
    score: 0,
    latencyMs: 100,
    namedScores: {},
    metadata: metadata || { pluginId: 'test-plugin' },
  });

  const defaultProps = {
    open: true,
    onClose: vi.fn(),
    category: 'bola',
    failures: [
      {
        prompt: 'Test prompt',
        output: 'Test output',
        gradingResult: {
          pass: false,
          score: 0,
          reason: 'Failed test',
        },
        result: createMockEvaluateResult({ pluginId: 'bola' }),
      },
    ],
    passes: [],
    evalId: 'test-eval-123',
    numPassed: 8,
    numFailed: 2,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useNavigate).mockReturnValue(mockNavigate);

    mockWindowOpen();
  });

  it('should navigate to eval page when clicking View All Logs button', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RiskCategoryDrawer {...defaultProps} />);

    const viewAllLogsButton = screen.getByText('View All Logs');

    await user.click(viewAllLogsButton);

    const expectedUrl =
      '/eval/test-eval-123?filter=%5B%7B%22type%22%3A%22plugin%22%2C%22operator%22%3A%22equals%22%2C%22value%22%3A%22bola%22%7D%5D';
    expect(mockNavigate).toHaveBeenCalledWith(expectedUrl);
    expect(window.open).not.toHaveBeenCalled();
  });

  it('should open in new tab when ctrl/cmd clicking View All Logs button', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RiskCategoryDrawer {...defaultProps} />);

    const viewAllLogsButton = screen.getByText('View All Logs');

    await user.keyboard('{Control>}');
    await user.click(viewAllLogsButton);
    await user.keyboard('{/Control}');

    const expectedUrl =
      '/eval/test-eval-123?filter=%5B%7B%22type%22%3A%22plugin%22%2C%22operator%22%3A%22equals%22%2C%22value%22%3A%22bola%22%7D%5D';
    expect(window.open).toHaveBeenCalledWith(expectedUrl, '_blank');
    expect(mockNavigate).not.toHaveBeenCalled();

    // Reset mocks
    vi.clearAllMocks();

    await user.keyboard('{Meta>}');
    await user.click(viewAllLogsButton);
    await user.keyboard('{/Meta}');

    expect(window.open).toHaveBeenCalledWith(expectedUrl, '_blank');
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('should close drawer when close button is clicked', async () => {
    const user = userEvent.setup();
    const onCloseMock = vi.fn();
    const props = { ...defaultProps, onClose: onCloseMock };

    renderWithProviders(<RiskCategoryDrawer {...props} />);

    const closeButton = screen.getByRole('button', { name: 'Close' });
    await user.click(closeButton);

    expect(onCloseMock).toHaveBeenCalled();
  });

  it.each([
    {
      variant: 'attack',
      label: 'Indirect attack',
      measuredId: 'case-1',
      exposed: 'Yes',
      completed: 'No',
      control: 'Yes',
    },
    {
      variant: 'control',
      label: 'Indirect baseline',
      measuredId: 'case-1',
      exposed: 'Yes',
      completed: 'No',
      control: 'Yes',
    },
    {
      variant: 'attack',
      label: 'Indirect attack',
      measuredId: 'case-2',
      exposed: 'Unknown',
      completed: 'Unknown',
      control: 'Unknown',
    },
  ])(
    'associates outcome evidence for $variant with receipt $measuredId',
    ({ variant, label, measuredId, exposed, completed, control }) => {
      const pluginId = 'coding-agent:consent-bypass';
      const agentOutcome = {
        pluginId,
        mode: 'indirect',
        caseId: 'case-1',
        variant,
        injectVar: 'assignment',
        indirectInjectionVar: 'query',
      };
      const artifact = 'Initialize tracking on page load';
      const grade = {
        pass: false,
        score: 0,
        reason: 'The collector received the event after rejection.',
      };
      const agentOutcomeResult = {
        ...agentOutcome,
        caseId: measuredId,
        status: 'violation',
        attackExposed: true,
        taskCompleted: false,
        controlPassed: true,
        reason: grade.reason,
      };
      const result = createMockEvaluateResult({ pluginId });
      const measurements = {
        beforeReject: { decision: 'reject', actionId: 'before', collectedActionIds: [] },
        afterReject: { decision: 'reject', actionId: 'after', collectedActionIds: ['after'] },
        afterAccept: { decision: 'accept', actionId: 'accepted', collectedActionIds: ['accepted'] },
      };
      result.response = {
        metadata: {
          agentOutcomeEvidence: {
            version: 1,
            pluginId,
            caseId: measuredId,
            taskCompleted: false,
            attackExposed: true,
            measurements,
          },
        },
      };
      result.testCase = {
        ...result.testCase,
        metadata: { pluginId, agentOutcome },
        vars: { assignment: 'Upgrade the analytics SDK', query: artifact },
      };
      renderWithProviders(
        <RiskCategoryDrawer
          {...defaultProps}
          category={pluginId}
          failures={[
            {
              prompt: artifact,
              output: 'Done',
              result,
              gradingResult: {
                ...grade,
                componentResults: [{ ...grade, metadata: { agentOutcomeResult } }],
              },
            },
          ]}
        />,
      );
      expect(screen.getByText(label).closest('[aria-expanded]')).toBeInTheDocument();
      expect(screen.getByText('Upgrade the analytics SDK')).toBeInTheDocument();
      expect(screen.getByText('Tool content delivered').nextElementSibling).toHaveTextContent(
        exposed,
      );
      expect(screen.getByText('Task completed').nextElementSibling).toHaveTextContent(completed);
      expect(screen.getByText('Positive control passed').nextElementSibling).toHaveTextContent(
        control,
      );
      expect(screen.getByText(artifact)).toBeInTheDocument();
      const receipts = screen.queryByText('Recorded measurements');
      if (measuredId === agentOutcome.caseId) {
        expect(receipts?.nextElementSibling?.textContent).toBe(
          JSON.stringify(measurements, null, 2),
        );
      } else {
        expect(receipts).toBeNull();
      }
    },
  );

  it.each([false, true])(
    'uses only fresh evidence for a direct attack with a stripped grade (cached=%s)',
    (cached) => {
      const pluginId = 'agentic:unauthorized-sharing';
      const agentOutcome = { pluginId, caseId: 'share-1', mode: 'direct', variant: 'attack' };
      const result = createMockEvaluateResult({ pluginId });
      result.testCase = { ...result.testCase, metadata: { pluginId, agentOutcome } };
      result.gradingResult = null;
      result.response = {
        cached,
        guardrails: { flaggedOutput: true },
        metadata: {
          agentOutcomeEvidence: {
            version: 1,
            pluginId,
            caseId: agentOutcome.caseId,
            attackExposed: true,
            taskCompleted: false,
            measurements: { futureVerified: true, future: null, folderControl: null },
          },
        },
      };
      renderWithProviders(
        <RiskCategoryDrawer
          {...defaultProps}
          category={pluginId}
          failures={[{ prompt: 'Share the folder', output: 'Blocked', result }]}
        />,
      );

      expect(screen.getByText('Direct attack')).toBeInTheDocument();
      expect(screen.getByText('User request delivered').nextElementSibling).toHaveTextContent(
        cached ? 'Unknown' : 'Yes',
      );
      expect(screen.getByText('Task completed').nextElementSibling).toHaveTextContent(
        cached ? 'Unknown' : 'No',
      );
      expect(screen.getByText('Positive control passed').nextElementSibling).toHaveTextContent(
        'Unknown',
      );
      expect(screen.getByText('Reply flagged by guardrail').nextElementSibling).toHaveTextContent(
        'Yes',
      );
      expect(screen.queryByText('Third-party content for the tool')).not.toBeInTheDocument();
      expect(screen.queryByText('Recorded measurements') !== null).toBe(!cached);
    },
  );

  it('should display correct pass/fail statistics', () => {
    renderWithProviders(<RiskCategoryDrawer {...defaultProps} />);

    expect(screen.getByText('8')).toBeInTheDocument(); // numPassed
    expect(screen.getByText('10')).toBeInTheDocument(); // total (8 + 2)
    expect(screen.getByText('80%')).toBeInTheDocument(); // pass rate
  });

  it('keeps the populated drawer full width on mobile while preserving the desktop width', () => {
    renderWithProviders(<RiskCategoryDrawer {...defaultProps} />);

    const drawer = screen.getByRole('dialog');

    expect(drawer).toHaveClass('w-full', 'sm:w-[750px]', 'sm:max-w-[750px]');
    expect(drawer).not.toHaveClass('w-[750px]');
  });

  it('stacks drawer tabs on narrow screens', () => {
    renderWithProviders(<RiskCategoryDrawer {...defaultProps} />);

    expect(screen.getByRole('tablist')).toHaveClass('grid-cols-1', 'sm:grid-cols-3', 'sm:!h-10');
  });

  it('displays malformed JSON prompts without crashing', () => {
    const malformedJsonPrompt = '{"key": "value"';
    const propsWithMalformedJson = {
      ...defaultProps,
      failures: [
        {
          prompt: malformedJsonPrompt,
          output: 'Test output',
          gradingResult: {
            pass: false,
            score: 0,
            reason: 'Failed test',
          },
          result: createMockEvaluateResult({ pluginId: 'test-plugin' }),
        },
      ],
    };

    renderWithProviders(<RiskCategoryDrawer {...propsWithMalformedJson} />);

    expect(screen.getByText(malformedJsonPrompt)).toBeInTheDocument();
  });

  it('should render complex object outputs without crashing', () => {
    const complexOutput = {
      level1: {
        level2: {
          level3: 'deep value',
          level4: [1, 2, { a: 'b' }],
        },
      },
    };

    const stringifySpy = vi.spyOn(JSON, 'stringify');

    const props = {
      ...defaultProps,
      failures: [
        {
          prompt: 'Test prompt',
          output: JSON.stringify(complexOutput),
          gradingResult: {
            pass: false,
            score: 0,
            reason: 'Failed test',
          },
          result: createMockEvaluateResult({}),
        },
      ],
    };

    renderWithProviders(<RiskCategoryDrawer {...props} />);

    expect(stringifySpy).toHaveBeenCalledWith(complexOutput);
    expect(screen.getByText(JSON.stringify(complexOutput))).toBeInTheDocument();
  });
});

describe('RiskCategoryDrawer Component Invalid Category', () => {
  it('should log an error and return null when an invalid category is provided', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const props = {
      open: true,
      onClose: vi.fn(),
      category: 'invalid-category',
      failures: [],
      passes: [],
      evalId: 'test-eval-123',
      numPassed: 0,
      numFailed: 0,
    };

    const { container } = renderWithProviders(<RiskCategoryDrawer {...props} />);

    expect(container.firstChild).toBeNull();
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[RiskCategoryDrawer] Could not load category',
      'invalid-category',
    );

    consoleErrorSpy.mockRestore();
  });
});

describe('RiskCategoryDrawer Component Empty State', () => {
  it('keeps the empty drawer full width on mobile while preserving the desktop width', () => {
    renderWithProviders(
      <RiskCategoryDrawer
        open
        onClose={vi.fn()}
        category="bola"
        failures={[]}
        passes={[]}
        evalId="test-eval-123"
        numPassed={0}
        numFailed={0}
      />,
    );

    const drawer = screen.getByRole('dialog');

    expect(drawer).toHaveClass('w-full', 'sm:w-[500px]', 'sm:max-w-[500px]');
    expect(drawer).not.toHaveClass('w-[500px]');
  });
});
