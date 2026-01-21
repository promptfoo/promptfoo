import { renderWithProviders } from '@app/utils/testutils';
import { fireEvent, screen } from '@testing-library/react';
import { useNavigate } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import RiskCategoryDrawer from './RiskCategoryDrawer';
import type { AtomicTestCase, EvaluateResult, ResultFailureReason } from '@promptfoo/types';

// Mock dependencies
vi.mock('react-router-dom', () => ({
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
    strategyStats: {},
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useNavigate).mockReturnValue(mockNavigate);

    // Mock window.open
    global.window.open = vi.fn();
  });

  it('should navigate to eval page when clicking View All Logs button', () => {
    renderWithProviders(<RiskCategoryDrawer {...defaultProps} />);

    const viewAllLogsButton = screen.getByText('View All Logs');

    // Test normal click - should use navigate
    fireEvent.click(viewAllLogsButton);

    const expectedUrl =
      '/eval/test-eval-123?filter=%5B%7B%22type%22%3A%22plugin%22%2C%22operator%22%3A%22equals%22%2C%22value%22%3A%22bola%22%7D%5D';
    expect(mockNavigate).toHaveBeenCalledWith(expectedUrl);
    expect(window.open).not.toHaveBeenCalled();
  });

  it('should open in new tab when ctrl/cmd clicking View All Logs button', () => {
    renderWithProviders(<RiskCategoryDrawer {...defaultProps} />);

    const viewAllLogsButton = screen.getByText('View All Logs');

    // Test Ctrl+click - should open new tab
    fireEvent.click(viewAllLogsButton, { ctrlKey: true });

    const expectedUrl =
      '/eval/test-eval-123?filter=%5B%7B%22type%22%3A%22plugin%22%2C%22operator%22%3A%22equals%22%2C%22value%22%3A%22bola%22%7D%5D';
    expect(window.open).toHaveBeenCalledWith(expectedUrl, '_blank');
    expect(mockNavigate).not.toHaveBeenCalled();

    // Reset mocks
    vi.clearAllMocks();

    // Test Cmd+click (Mac) - should also open new tab
    fireEvent.click(viewAllLogsButton, { metaKey: true });

    expect(window.open).toHaveBeenCalledWith(expectedUrl, '_blank');
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('should close drawer when close button is clicked', () => {
    const onCloseMock = vi.fn();
    const props = { ...defaultProps, onClose: onCloseMock };

    renderWithProviders(<RiskCategoryDrawer {...props} />);

    const closeButton = screen.getByRole('button', { name: 'Close' });
    fireEvent.click(closeButton);

    expect(onCloseMock).toHaveBeenCalled();
  });

  it('should display correct pass/fail statistics', () => {
    renderWithProviders(<RiskCategoryDrawer {...defaultProps} />);

    expect(screen.getByText('8')).toBeInTheDocument(); // numPassed
    expect(screen.getByText('10')).toBeInTheDocument(); // total (8 + 2)
    expect(screen.getByText('80%')).toBeInTheDocument(); // pass rate
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
      strategyStats: {},
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
