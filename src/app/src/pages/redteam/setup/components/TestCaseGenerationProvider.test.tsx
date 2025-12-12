/**
 * Unit tests for the TestCaseGenerationProvider component. To run:
 *
 * ```sh
 * npm run test:app -- src/pages/redteam/setup/components/TestCaseGenerationProvider.test.tsx
 * ```
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { within } from '@testing-library/dom';
import { callApi } from '@app/utils/api';
import { TestCaseGenerationProvider, useTestCaseGeneration } from './TestCaseGenerationProvider';
import { ToastProvider } from '@app/contexts/ToastContext';
import { Plugin, Strategy } from '@promptfoo/redteam/constants';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ===================================================================
// Mocks
// ===================================================================

const MOCK_CONFIG = {
  target: {
    id: '',
    config: {},
  },
  applicationDefinition: {
    purpose: 'Test purpose',
  },
  description: 'Test description',
  prompts: ['Test prompt'],
  plugins: [],
  strategies: [],
  entities: [],
};

vi.mock('@app/utils/api', () => ({
  callApi: vi.fn(),
}));

const callApiMock = vi.mocked(callApi);

const createJsonResponse = <T,>(data: T): Response =>
  new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

callApiMock.mockImplementation((path, options) => {
  if (path === '/redteam/generate-test') {
    let prompt = 'Generated test prompt';

    if (options?.body) {
      const body = JSON.parse(options.body as string);
      const strategyId = body.strategy?.id;

      if (body.turn !== undefined && body.turn > 0) {
        prompt = `Generated test prompt (turn ${body.turn})`;
      }

      if (strategyId === 'image') {
        prompt = 'fake-image-base64';
      } else if (strategyId === 'video') {
        prompt = 'fake-video-base64';
      } else if (strategyId === 'audio') {
        prompt = 'fake-audio-base64';
      }
    }

    return Promise.resolve(
      createJsonResponse({
        prompt,
        context: 'Test context',
        metadata: {},
      }),
    );
  }

  if (path === '/providers/test') {
    const body = options?.body ? JSON.parse(options.body as string) : {};
    const prompt = body.prompt || '';

    let output = 'Simulated target output';
    if (prompt.includes('turn 1')) {
      output = 'Simulated target output (turn 1)';
    }

    return Promise.resolve(
      createJsonResponse({
        providerResponse: {
          output,
          error: null,
        },
      }),
    );
  }

  throw new Error(`Unhandled callApi path: ${path}`);
});

// ===================================================================
// Helpers
// ===================================================================

/**
 * Test consumer that allows for introspection of the context state and kicking off test case generation.
 */
const TestConsumer = ({
  testPlugin,
  testStrategy,
  isPluginStatic = false,
  isStrategyStatic = false,
}: {
  testPlugin: Plugin;
  testStrategy: Strategy;
  isPluginStatic?: boolean;
  isStrategyStatic?: boolean;
}) => {
  const { isGenerating, plugin, strategy, generateTestCase } = useTestCaseGeneration();

  async function handleGenerateTestCase() {
    await generateTestCase(
      { id: testPlugin, config: {}, isStatic: isPluginStatic },
      { id: testStrategy, config: {}, isStatic: isStrategyStatic },
    );
  }

  return (
    <div>
      <div data-testid="isGenerating">{String(isGenerating)}</div>
      <div data-testid="plugin">{String(plugin)}</div>
      <div data-testid="strategy">{String(strategy)}</div>
      <button onClick={handleGenerateTestCase} data-testid="test-case-generation-btn" />
    </div>
  );
};

// ===================================================================
// Tests
// ===================================================================

describe('TestCaseGenerationProvider', () => {
  beforeEach(() => {
    callApiMock.mockClear();
  });

  it('should render', () => {
    render(
      <ToastProvider>
        <TestCaseGenerationProvider redTeamConfig={MOCK_CONFIG}>
          <TestConsumer testPlugin="harmful:hate" testStrategy="basic" />
        </TestCaseGenerationProvider>
      </ToastProvider>,
    );

    // Validate the default state
    expect(screen.getByTestId('isGenerating')).toHaveTextContent('false');
    expect(screen.getByTestId('plugin')).toHaveTextContent('null');
    expect(screen.getByTestId('strategy')).toHaveTextContent('null');
  });

  describe('Test case generation', () => {
    it('should generate a test case', async () => {
      const testPlugin = 'harmful:hate';
      const testStrategy = 'basic';

      render(
        <ToastProvider>
          <TestCaseGenerationProvider redTeamConfig={MOCK_CONFIG}>
            <TestConsumer testPlugin={testPlugin} testStrategy={testStrategy} />
          </TestCaseGenerationProvider>
        </ToastProvider>,
      );

      // Kick off the test case generation
      const generateTestCaseButton = screen.getByTestId('test-case-generation-btn');
      fireEvent.click(generateTestCaseButton);

      // Validate the context state updates immediately
      expect(screen.getByTestId('isGenerating')).toHaveTextContent('true');
      expect(screen.getByTestId('plugin')).toHaveTextContent(testPlugin);
      expect(screen.getByTestId('strategy')).toHaveTextContent(testStrategy);

      // TestCaseDialog should be open
      const testCaseDialogComponent = screen.getByTestId('test-case-dialog');
      expect(testCaseDialogComponent).toBeInTheDocument();

      // The basic strategy's display name should be rendered in the dialog
      const strategyChipComponent = within(testCaseDialogComponent).getByTestId('strategy-chip');
      expect(strategyChipComponent).toBeInTheDocument();
      expect(strategyChipComponent).toHaveTextContent('Strategy: Baseline Testing');

      // The hate speech plugin's display name should be rendered in the dialog
      const pluginChipComponent = within(testCaseDialogComponent).getByTestId('plugin-chip');
      expect(pluginChipComponent).toBeInTheDocument();
      expect(pluginChipComponent).toHaveTextContent('Plugin: Hate Speech');

      await waitFor(() => {
        expect(
          within(testCaseDialogComponent).getByText(/Learn more about Hate Speech/i),
        ).toBeInTheDocument();
      });

      // Wait for the API call to be made with correct parameters
      await waitFor(() => expect(callApi).toHaveBeenCalledTimes(1));

      // After generation completes, isGenerating should be false
      await waitFor(() => {
        expect(screen.getByTestId('isGenerating')).toHaveTextContent('false');
      });

      // The generated test case should be displayed in the dialog
      const generatedPromptComponent =
        within(testCaseDialogComponent).getByTestId('chat-message-0');
      expect(generatedPromptComponent).toBeInTheDocument();
      expect(generatedPromptComponent).toHaveTextContent('Generated test prompt');

      // Test case execution should not be fired because the target id will evaluate false
      const targetResponseComponent =
        within(testCaseDialogComponent).queryByTestId('chat-message-1');
      expect(targetResponseComponent).not.toBeInTheDocument();
    });

    it('should hide plugin documentation link when plugin is static', async () => {
      render(
        <ToastProvider>
          <TestCaseGenerationProvider redTeamConfig={MOCK_CONFIG}>
            <TestConsumer testPlugin="harmful:hate" testStrategy="basic" isPluginStatic />
          </TestCaseGenerationProvider>
        </ToastProvider>,
      );

      fireEvent.click(screen.getByTestId('test-case-generation-btn'));

      const testCaseDialogComponent = await screen.findByTestId('test-case-dialog');

      await waitFor(() => {
        expect(
          within(testCaseDialogComponent).queryByText(/Learn more about Hate Speech/i),
        ).not.toBeInTheDocument();
      });
    });

    it('should generate images (strategy: image)', async () => {
      const testPlugin = 'harmful:hate';
      const testStrategy = 'image';

      render(
        <ToastProvider>
          <TestCaseGenerationProvider redTeamConfig={MOCK_CONFIG}>
            <TestConsumer testPlugin={testPlugin} testStrategy={testStrategy as any} />
          </TestCaseGenerationProvider>
        </ToastProvider>,
      );

      // Kick off the test case generation
      const generateTestCaseButton = screen.getByTestId('test-case-generation-btn');
      fireEvent.click(generateTestCaseButton);

      // TestCaseDialog should be open
      const testCaseDialogComponent = screen.getByTestId('test-case-dialog');
      expect(testCaseDialogComponent).toBeInTheDocument();

      // Wait for the API call to be made
      await waitFor(() => expect(callApi).toHaveBeenCalledTimes(1));

      // After generation completes, isGenerating should be false
      await waitFor(() => {
        expect(screen.getByTestId('isGenerating')).toHaveTextContent('false');
      });

      // The generated image should be displayed in the dialog
      const imageComponent = within(testCaseDialogComponent).getByTestId('image');
      expect(imageComponent).toBeInTheDocument();
      expect(imageComponent).toHaveStyle({
        backgroundImage: 'url(data:image/png;base64,fake-image-base64)',
      });
    });

    it('should generate videos (strategy: video)', async () => {
      const testPlugin = 'harmful:hate';
      const testStrategy = 'video';

      render(
        <ToastProvider>
          <TestCaseGenerationProvider redTeamConfig={MOCK_CONFIG}>
            <TestConsumer testPlugin={testPlugin} testStrategy={testStrategy as any} />
          </TestCaseGenerationProvider>
        </ToastProvider>,
      );

      // Kick off the test case generation
      const generateTestCaseButton = screen.getByTestId('test-case-generation-btn');
      fireEvent.click(generateTestCaseButton);

      // TestCaseDialog should be open
      const testCaseDialogComponent = screen.getByTestId('test-case-dialog');
      expect(testCaseDialogComponent).toBeInTheDocument();

      // Wait for the API call to be made
      await waitFor(() => expect(callApi).toHaveBeenCalledTimes(1));

      // After generation completes, isGenerating should be false
      await waitFor(() => {
        expect(screen.getByTestId('isGenerating')).toHaveTextContent('false');
      });

      // The generated video components should be rendered in the dialog
      const videoComponent = within(testCaseDialogComponent).getByTestId('video');
      expect(videoComponent).toBeInTheDocument();
    });

    it('should generate audio (strategy: audio)', async () => {
      const testPlugin = 'harmful:hate';
      const testStrategy = 'audio';

      render(
        <ToastProvider>
          <TestCaseGenerationProvider redTeamConfig={MOCK_CONFIG}>
            <TestConsumer testPlugin={testPlugin} testStrategy={testStrategy as any} />
          </TestCaseGenerationProvider>
        </ToastProvider>,
      );

      // Kick off the test case generation
      const generateTestCaseButton = screen.getByTestId('test-case-generation-btn');
      fireEvent.click(generateTestCaseButton);

      // TestCaseDialog should be open
      const testCaseDialogComponent = screen.getByTestId('test-case-dialog');
      expect(testCaseDialogComponent).toBeInTheDocument();

      // Wait for the API call to be made
      await waitFor(() => expect(callApi).toHaveBeenCalledTimes(1));

      // After generation completes, isGenerating should be false
      await waitFor(() => {
        expect(screen.getByTestId('isGenerating')).toHaveTextContent('false');
      });

      // The generated audio should be displayed in the dialog
      const audioComponent = within(testCaseDialogComponent).getByTestId('audio');
      expect(audioComponent).toBeInTheDocument();
    });
  });

  describe('Test case execution', () => {
    it('should execute a test case against a target', async () => {
      const testPlugin = 'harmful:hate';
      const testStrategy = 'basic';

      render(
        <ToastProvider>
          <TestCaseGenerationProvider
            redTeamConfig={{
              ...MOCK_CONFIG,
              target: {
                id: 'http',
                config: { url: 'http://localhost:7979', method: 'POST' },
              },
            }}
          >
            <TestConsumer testPlugin={testPlugin} testStrategy={testStrategy} />
          </TestCaseGenerationProvider>
        </ToastProvider>,
      );

      // Kick off the test case generation
      const generateTestCaseButton = screen.getByTestId('test-case-generation-btn');
      fireEvent.click(generateTestCaseButton);

      // TestCaseDialog should be open
      const testCaseDialogComponent = screen.getByTestId('test-case-dialog');
      expect(testCaseDialogComponent).toBeInTheDocument();

      // Wait for both API calls to be made
      await waitFor(() => {
        expect(callApi).toHaveBeenCalledTimes(2);
      });

      // After generation completes, isGenerating should be false
      await waitFor(() => {
        expect(screen.getByTestId('isGenerating')).toHaveTextContent('false');
      });

      // The generated test case should be displayed in the dialog
      const generatedPromptComponent =
        within(testCaseDialogComponent).getByTestId('chat-message-0');
      expect(generatedPromptComponent).toBeInTheDocument();
      expect(generatedPromptComponent).toHaveTextContent('Generated test prompt');

      // The provider response should be displayed in the dialog
      const targetResponseComponent = within(testCaseDialogComponent).getByTestId('chat-message-1');
      expect(targetResponseComponent).toBeInTheDocument();

      // Wait for the target response to be displayed
      await waitFor(() => {
        expect(targetResponseComponent).toHaveTextContent('Simulated target output');
      });
    });

    it('should execute multi-turn test cases', async () => {
      const testPlugin = 'harmful:hate';
      const testStrategy = 'goat'; // 'goat' is a multi-turn strategy

      render(
        <ToastProvider>
          <TestCaseGenerationProvider
            redTeamConfig={{
              ...MOCK_CONFIG,
              target: {
                id: 'http',
                config: { url: 'http://localhost:7979', method: 'POST' },
              },
            }}
          >
            <TestConsumer testPlugin={testPlugin} testStrategy={testStrategy} />
          </TestCaseGenerationProvider>
        </ToastProvider>,
      );

      // Kick off the test case generation
      const generateTestCaseButton = screen.getByTestId('test-case-generation-btn');
      fireEvent.click(generateTestCaseButton);

      // TestCaseDialog should be open
      const testCaseDialogComponent = screen.getByTestId('test-case-dialog');
      expect(testCaseDialogComponent).toBeInTheDocument();

      // Verify Turn 0 Generation
      await waitFor(() => {
        const generatedPrompt0 = within(testCaseDialogComponent).getByTestId('chat-message-0');
        expect(generatedPrompt0).toHaveTextContent('Generated test prompt');
      });

      // Verify Turn 0 Execution
      await waitFor(() => {
        const targetResponse0 = within(testCaseDialogComponent).getByTestId('chat-message-1');
        expect(targetResponse0).toHaveTextContent('Simulated target output');
      });

      // Verify Turn 1 Generation
      await waitFor(() => {
        const generatedPrompt1 = within(testCaseDialogComponent).getByTestId('chat-message-2');
        expect(generatedPrompt1).toHaveTextContent('Generated test prompt (turn 1)');
      });

      // Verify Turn 1 Execution
      await waitFor(() => {
        const targetResponse1 = within(testCaseDialogComponent).getByTestId('chat-message-3');
        expect(targetResponse1).toHaveTextContent('Simulated target output (turn 1)');
      });

      // Ensure calls were made
      // 2 generations + 2 executions = 4+ calls
      // Note: DEFAULT_MULTI_TURN_MAX_TURNS is typically 5, but our test stops naturally or if we mock limits.
      // Since we didn't mock maxTurns specifically in the provider (it uses constant),
      // we rely on the mock API behavior. However, without a stop condition or maxTurns limit in the test setup,
      // it might go on. But the loop logic relies on state updates.
      // Check at least 4 calls occurred (2 turns minimum).
      // React Compiler may cause additional renders/calls due to different batching.
      expect(callApi.mock.calls.length).toBeGreaterThanOrEqual(4);
    });
  });
});
