import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';

import StrategyStats from './StrategyStats';
import type { EvaluateResult, GradingResult } from '@promptfoo/types';
import { displayNameOverrides } from '@promptfoo/redteam/constants';

vi.mock('@mui/material/styles', async () => {
  const actual = await vi.importActual('@mui/material/styles');
  return {
    ...actual,
    useTheme: () => ({
      palette: {
        mode: 'light',
        error: {
          main: '#f44336',
          light: '#e57373',
          dark: '#d32f2f',
        },
        action: {
          hover: 'rgba(0, 0, 0, 0.04)',
        },
        background: {
          paper: '#ffffff',
        },
        text: {
          primary: '#000000',
          secondary: 'rgba(0, 0, 0, 0.54)',
        },
        divider: 'rgba(0, 0, 0, 0.12)',
        grey: {
          50: '#fafafa',
          100: '#f5f5f5',
        },
        common: {
          black: '#000000',
        },
      },
      shape: {
        borderRadius: 4,
      },
      shadows: Array(25).fill('none'),
      spacing: (factor: number) => `${factor * 8}px`,
    }),
  };
});

interface TestWithMetadata {
  prompt: string;
  output: string;
  gradingResult?: GradingResult;
  result?: EvaluateResult;
  metadata?: {
    strategyId?: string;
    [key: string]: any;
  };
}

describe('StrategyStats', () => {
  let strategyStats: Record<string, { pass: number; total: number }>;
  let failuresByPlugin: Record<string, TestWithMetadata[]>;
  let passesByPlugin: Record<string, TestWithMetadata[]>;

  beforeEach(() => {
    strategyStats = {
      'prompt-injection': { pass: 2, total: 10 },
      jailbreak: { pass: 5, total: 8 },
    };

    failuresByPlugin = {
      'plugin-A': [
        {
          prompt: 'fail prompt 1',
          output: 'fail output 1',
          metadata: { strategyId: 'prompt-injection' },
          result: { metadata: { pluginId: 'plugin-A' } } as unknown as EvaluateResult,
        },
        {
          prompt: 'fail prompt 2',
          output: 'fail output 2',
          metadata: { strategyId: 'jailbreak' },
          result: { metadata: { pluginId: 'plugin-A' } } as unknown as EvaluateResult,
        },
      ],
      'plugin-B': [
        {
          prompt: 'fail prompt 3',
          output: 'fail output 3',
          metadata: { strategyId: 'prompt-injection' },
          result: { metadata: { pluginId: 'plugin-B' } } as unknown as EvaluateResult,
        },
        {
          prompt: 'fail prompt 4',
          output: 'fail output 4',
          metadata: { strategyId: 'jailbreak' },
          result: { metadata: { pluginId: 'plugin-B' } } as unknown as EvaluateResult,
        },
        {
          prompt: 'fail prompt 5',
          output: 'fail output 5',
          metadata: { strategyId: 'jailbreak' },
          result: { metadata: { pluginId: 'plugin-B' } } as unknown as EvaluateResult,
        },
        {
          prompt: 'fail prompt 6',
          output: 'fail output 6',
          metadata: { strategyId: 'jailbreak' },
          result: { metadata: { pluginId: 'plugin-B' } } as unknown as EvaluateResult,
        },
        {
          prompt: 'fail prompt 7',
          output: 'fail output 7',
          metadata: { strategyId: 'jailbreak' },
          result: { metadata: { pluginId: 'plugin-B' } } as unknown as EvaluateResult,
        },
      ],
    };

    passesByPlugin = {
      'plugin-A': [
        ...Array(4).fill({
          prompt: 'pass prompt',
          output: 'pass output',
          metadata: { strategyId: 'prompt-injection' },
          result: { metadata: { pluginId: 'plugin-A' } } as unknown as EvaluateResult,
        }),
        ...Array(3).fill({
          prompt: 'pass prompt',
          output: 'pass output',
          metadata: { strategyId: 'jailbreak' },
          result: { metadata: { pluginId: 'plugin-A' } } as unknown as EvaluateResult,
        }),
      ],
      'plugin-B': [
        ...Array(4).fill({
          prompt: 'pass prompt',
          output: 'pass output',
          metadata: { strategyId: 'prompt-injection' },
          result: { metadata: { pluginId: 'plugin-B' } } as unknown as EvaluateResult,
        }),
      ],
    };
  });

  const openStrategyDrawer = async (strategyId: string) => {
    const button = screen.getByLabelText(`View details for ${strategyId} attack method`);
    fireEvent.click(button);
    return await screen.findByLabelText('Strategy details');
  };

  describe('Happy Path', () => {
    it('should render a grid of strategies with correct statistics and open the drawer on selection', async () => {
      render(
        <StrategyStats
          strategyStats={strategyStats}
          failuresByPlugin={failuresByPlugin}
          passesByPlugin={passesByPlugin}
        />,
      );

      expect(screen.getByText('Attack Methods')).toBeInTheDocument();

      const promptInjectionCard = screen.getByText('Direct Prompt Injection');
      expect(promptInjectionCard).toBeInTheDocument();
      expect(screen.getByText('2 / 10 attacks succeeded')).toBeInTheDocument();
      expect(screen.getByText(/20\.0\s*%/)).toBeInTheDocument();

      const jailbreakCard = screen.getByText('Single-shot Optimization');
      expect(jailbreakCard).toBeInTheDocument();
      expect(screen.getByText('5 / 8 attacks succeeded')).toBeInTheDocument();
      expect(screen.getByText(/62\.5\s*%/)).toBeInTheDocument();

      expect(screen.queryByLabelText('Strategy details')).not.toBeInTheDocument();

      const drawer = await openStrategyDrawer('prompt-injection');
      expect(drawer).toBeInTheDocument();

      expect(
        await screen.findByRole('heading', { name: 'Direct Prompt Injection' }),
      ).toBeInTheDocument();

      expect(screen.getByText('Total Attempts')).toBeInTheDocument();
      const totalAttemptsValue = screen.getByText('10');
      expect(totalAttemptsValue).toBeInTheDocument();
    });

    it('should display the correct total attempts, flagged attempts, and success rate for the selected strategy in the drawer', async () => {
      render(
        <StrategyStats
          strategyStats={strategyStats}
          failuresByPlugin={failuresByPlugin}
          passesByPlugin={passesByPlugin}
        />,
      );

      const drawer = await openStrategyDrawer('prompt-injection');
      expect(drawer).toBeInTheDocument();

      expect(screen.getByText('10')).toBeInTheDocument();
      expect(screen.getByText('8')).toBeInTheDocument();
      expect(screen.getByText('80.0%')).toBeInTheDocument();
    });

    it('should display a table of plugin performance for the selected strategy in the drawer', async () => {
      render(
        <StrategyStats
          strategyStats={strategyStats}
          failuresByPlugin={failuresByPlugin}
          passesByPlugin={passesByPlugin}
        />,
      );

      const drawer = await openStrategyDrawer('prompt-injection');
      expect(drawer).toBeInTheDocument();

      const table = await screen.findByRole('table');
      expect(table).toBeInTheDocument();

      expect(screen.getByText('Plugin')).toBeInTheDocument();
      expect(screen.getByText('Attack Success Rate')).toBeInTheDocument();
      expect(screen.getByText('# Flagged Attempts')).toBeInTheDocument();
      expect(screen.getByText('# Attempts')).toBeInTheDocument();

      const pluginAStats = {
        plugin: 'plugin-A',
        passes: 1,
        total: 5,
        failRate: (1 / 5) * 100,
      };
      const pluginBStats = {
        plugin: 'plugin-B',
        passes: 1,
        total: 5,
        failRate: (1 / 5) * 100,
      };

      const rows = screen.getAllByRole('row');
      const pluginARow = Array.from(rows).find((row) =>
        row.textContent?.includes(
          displayNameOverrides[pluginAStats.plugin as keyof typeof displayNameOverrides] ||
            pluginAStats.plugin,
        ),
      );
      expect(pluginARow).toBeInTheDocument();
      expect(pluginARow).toHaveTextContent(pluginAStats.failRate.toFixed(1) + '%');
      expect(pluginARow).toHaveTextContent((pluginAStats.total - pluginAStats.passes).toString());
      expect(pluginARow).toHaveTextContent(pluginAStats.total.toString());

      const pluginBRow = Array.from(rows).find((row) =>
        row.textContent?.includes(
          displayNameOverrides[pluginBStats.plugin as keyof typeof displayNameOverrides] ||
            pluginBStats.plugin,
        ),
      );
      expect(pluginBRow).toBeInTheDocument();
      expect(pluginBRow).toHaveTextContent(pluginBStats.failRate.toFixed(1) + '%');
      expect(pluginBRow).toHaveTextContent((pluginBStats.total - pluginBStats.passes).toString());
      expect(pluginBRow).toHaveTextContent(pluginBStats.total.toString());
    });

    it('should handle keyboard navigation with Enter or Space key', async () => {
      render(
        <StrategyStats
          strategyStats={strategyStats}
          failuresByPlugin={failuresByPlugin}
          passesByPlugin={passesByPlugin}
        />,
      );

      const promptInjectionButton = screen.getByLabelText(
        'View details for prompt-injection attack method',
      );
      promptInjectionButton.focus();

      fireEvent.keyPress(promptInjectionButton, { key: 'Enter', code: 'Enter', charCode: 13 });

      const drawer = await screen.findByLabelText('Strategy details');
      expect(drawer).toBeInTheDocument();
    });

    it('should render the Failed Attempts tab content when tabValue is 1', async () => {
      render(
        <StrategyStats
          strategyStats={strategyStats}
          failuresByPlugin={failuresByPlugin}
          passesByPlugin={passesByPlugin}
        />,
      );

      const drawer = await openStrategyDrawer('prompt-injection');
      expect(drawer).toBeInTheDocument();

      const failedAttemptsTab = await screen.findByText(/Failed Attempts/);
      fireEvent.click(failedAttemptsTab);

      const passPrompts = await screen.findAllByText('pass prompt');
      expect(passPrompts.length).toBeGreaterThan(0);
    });
  });

  it('should render without error when strategyStats contains entries with total=0', () => {
    const strategyStatsWithZeroTotal = {
      'prompt-injection': { pass: 0, total: 0 },
    };

    render(
      <StrategyStats
        strategyStats={strategyStatsWithZeroTotal}
        failuresByPlugin={failuresByPlugin}
        passesByPlugin={passesByPlugin}
      />,
    );

    expect(screen.getByText('Attack Methods')).toBeInTheDocument();
    expect(screen.getByText('Direct Prompt Injection')).toBeInTheDocument();
    expect(screen.getByText('0 / 0 attacks succeeded')).toBeInTheDocument();
  });

  it('should display raw JSON when prompt is valid JSON but does not match expected structure', async () => {
    const unexpectedJsonPrompt = '{"key": "value"}';
    const failuresByPluginWithUnexpectedJson: Record<string, TestWithMetadata[]> = {
      'plugin-C': [
        {
          prompt: unexpectedJsonPrompt,
          output: 'fail output',
          metadata: { strategyId: 'prompt-injection' },
          result: { metadata: { pluginId: 'plugin-C' } } as unknown as EvaluateResult,
        },
      ],
    };

    render(
      <StrategyStats
        strategyStats={strategyStats}
        failuresByPlugin={failuresByPluginWithUnexpectedJson}
        passesByPlugin={passesByPlugin}
      />,
    );

    const drawer = await openStrategyDrawer('prompt-injection');
    expect(drawer).toBeInTheDocument();

    const promptElement = screen.getByText(unexpectedJsonPrompt);
    expect(promptElement).toBeInTheDocument();
  });

  it('should handle output that is an array of non-function items', async () => {
    const arrayOutput = ['item1', 'item2', 'item3'];
    const failuresByPluginWithArrayOutput: Record<string, TestWithMetadata[]> = {
      'plugin-C': [
        {
          prompt: 'fail prompt with array output',
          output: JSON.stringify(arrayOutput),
          metadata: { strategyId: 'prompt-injection' },
          result: { metadata: { pluginId: 'plugin-C' } } as unknown as EvaluateResult,
        },
      ],
    };

    render(
      <StrategyStats
        strategyStats={strategyStats}
        failuresByPlugin={failuresByPluginWithArrayOutput}
        passesByPlugin={passesByPlugin}
      />,
    );

    const promptInjectionButton = screen.getByLabelText(
      'View details for prompt-injection attack method',
    );
    fireEvent.click(promptInjectionButton);

    const drawer = await screen.findByLabelText('Strategy details');
    expect(drawer).toBeInTheDocument();

    const expectedOutput = JSON.stringify(arrayOutput);
    expect(screen.getByText(expectedOutput)).toBeInTheDocument();
  });

  it('should handle empty strategyStats by rendering an empty grid', () => {
    render(
      <StrategyStats
        strategyStats={{}}
        failuresByPlugin={failuresByPlugin}
        passesByPlugin={passesByPlugin}
      />,
    );

    expect(screen.getByText('Attack Methods')).toBeInTheDocument();

    expect(screen.queryByRole('button', { name: /View details for/ })).not.toBeInTheDocument();
  });

  it('should handle a strategy with statistics but no examples in failuresByPlugin or passesByPlugin', async () => {
    const strategyStatsWithNoExamples = {
      'no-examples': { pass: 3, total: 7 },
    };

    render(
      <StrategyStats
        strategyStats={strategyStatsWithNoExamples}
        failuresByPlugin={{}}
        passesByPlugin={{}}
      />,
    );

    const noExamplesButton = screen.getByLabelText('View details for no-examples attack method');
    fireEvent.click(noExamplesButton);

    const drawer = await screen.findByLabelText('Strategy details');
    expect(drawer).toBeInTheDocument();

    expect(await screen.findByRole('heading', { name: 'no-examples' })).toBeInTheDocument();
  });

  it('should correctly display strategy names with special characters and long names', () => {
    const longStrategyName =
      'strategy-with-a-very-very-very-very-very-very-very-very-very-very-long-name';
    const specialCharsStrategyName = 'strategy-with-!@#$%^&*()_+<>?"\'\\/';
    const htmlStrategyName = 'strategy-with-<div>html</div>';

    const strategyStatsWithSpecialChars = {
      [longStrategyName]: { pass: 1, total: 2 },
      [specialCharsStrategyName]: { pass: 2, total: 3 },
      [htmlStrategyName]: { pass: 3, total: 4 },
    };

    const failuresByPluginWithSpecialChars: Record<string, TestWithMetadata[]> = {
      'plugin-A': [
        {
          prompt: 'fail prompt 1',
          output: 'fail output 1',
          metadata: { strategyId: longStrategyName },
          result: { metadata: { pluginId: 'plugin-A' } } as unknown as EvaluateResult,
        },
        {
          prompt: 'fail prompt 2',
          output: 'fail output 2',
          metadata: { strategyId: specialCharsStrategyName },
          result: { metadata: { pluginId: 'plugin-A' } } as unknown as EvaluateResult,
        },
        {
          prompt: 'fail prompt 3',
          output: 'fail output 3',
          metadata: { strategyId: htmlStrategyName },
          result: { metadata: { pluginId: 'plugin-A' } } as unknown as EvaluateResult,
        },
      ],
    };

    const passesByPluginWithSpecialChars: Record<string, TestWithMetadata[]> = {
      'plugin-A': [
        {
          prompt: 'pass prompt 1',
          output: 'pass output 1',
          metadata: { strategyId: longStrategyName },
          result: { metadata: { pluginId: 'plugin-A' } } as unknown as EvaluateResult,
        },
        {
          prompt: 'pass prompt 2',
          output: 'pass output 2',
          metadata: { strategyId: specialCharsStrategyName },
          result: { metadata: { pluginId: 'plugin-A' } } as unknown as EvaluateResult,
        },
        {
          prompt: 'pass prompt 3',
          output: 'pass output 3',
          metadata: { strategyId: htmlStrategyName },
          result: { metadata: { pluginId: 'plugin-A' } } as unknown as EvaluateResult,
        },
      ],
    };

    render(
      <StrategyStats
        strategyStats={strategyStatsWithSpecialChars}
        failuresByPlugin={failuresByPluginWithSpecialChars}
        passesByPlugin={passesByPluginWithSpecialChars}
      />,
    );

    expect(screen.getByText(longStrategyName)).toBeInTheDocument();
    expect(screen.getByText(specialCharsStrategyName)).toBeInTheDocument();
    expect(screen.getByText(htmlStrategyName)).toBeInTheDocument();
  });

  it('should handle null selectedStrategy in DrawerContent', async () => {
    render(
      <StrategyStats
        strategyStats={strategyStats}
        failuresByPlugin={failuresByPlugin}
        passesByPlugin={passesByPlugin}
      />,
    );

    const promptInjectionButton = screen.getByLabelText(
      'View details for prompt-injection attack method',
    );
    fireEvent.click(promptInjectionButton);

    const drawer = await screen.findByLabelText('Strategy details');
    expect(drawer).toBeInTheDocument();

    const backdrop = document.querySelector('.MuiBackdrop-root');
    if (backdrop) {
      fireEvent.click(backdrop);
    }

    expect(screen.queryByRole('heading', { name: 'Direct Prompt Injection' })).toBeNull();
  });

  describe('getPromptDisplayString', () => {
    it('should correctly parse and display JSON array prompts with lastPrompt.content', async () => {
      const testPrompt = JSON.stringify([
        { role: 'user', content: 'initial prompt' },
        { role: 'assistant', content: 'some response' },
        { role: 'user', content: 'another prompt' },
        { content: 'expected content' },
      ]);

      const testFailuresByPlugin: Record<string, TestWithMetadata[]> = {
        'plugin-C': [
          {
            prompt: testPrompt,
            output: 'fail output',
            metadata: { strategyId: 'prompt-injection' },
            result: { metadata: { pluginId: 'plugin-C' } } as unknown as EvaluateResult,
          },
        ],
      };

      render(
        <StrategyStats
          strategyStats={strategyStats}
          failuresByPlugin={testFailuresByPlugin}
          passesByPlugin={passesByPlugin}
        />,
      );

      const drawer = await openStrategyDrawer('prompt-injection');
      expect(drawer).toBeInTheDocument();

      expect(screen.getByText('expected content')).toBeInTheDocument();
    });
  });
});
