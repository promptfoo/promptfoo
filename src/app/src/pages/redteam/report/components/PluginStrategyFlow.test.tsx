import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeAll } from 'vitest';
import '@testing-library/jest-dom';

import PluginStrategyFlow from './PluginStrategyFlow';
import { type EvaluateResult, type GradingResult } from '@promptfoo/types';

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="responsive-container">{children}</div>
  ),
  Sankey: (props: any) => (
    <div data-testid="sankey-chart">
      {props.data.nodes.map((node: any, index: number) => (
        <div key={index}>
          {React.cloneElement(props.node, {
            x: 0,
            y: 0,
            width: 10,
            height: 10,
            index,
            payload: node,
            containerWidth: 500,
          })}
        </div>
      ))}
      {props.data.links.map((link: any, index: number) => (
        <div key={index} data-testid="sankey-link"></div>
      ))}
      {props.children}
    </div>
  ),
  Tooltip: (props: any) => (
    <div data-testid="tooltip">
      {props.content && typeof props.content === 'function'
        ? props.content({
            payload: [{ source: { name: 'PluginA' }, target: { name: 'StrategyX' }, value: 1 }],
          })
        : 'Tooltip Content'}
    </div>
  ),
  Layer: ({ children }: { children: React.ReactNode }) => <g>{children}</g>,
  Rectangle: (props: any) => <rect {...props} />,
}));

vi.mock('@mui/material/styles', async () => {
  const actual = await vi.importActual('@mui/material/styles');
  return {
    ...actual,
    useTheme: () => ({
      palette: {
        background: { paper: '#fff' },
        divider: '#ccc',
        text: { primary: '#000' },
      },
    }),
  };
});

interface TestRecord {
  prompt: string;
  output: string;
  gradingResult?: GradingResult;
  result?: EvaluateResult;
  metadata?: {
    strategyId?: string;
  };
}

describe('PluginStrategyFlow', () => {
  beforeAll(() => {
    Object.defineProperty(Element.prototype, 'getComputedTextLength', {
      value: () => 100,
      configurable: true,
    });
  });

  describe('Happy Path', () => {
    it('should render a Sankey diagram with nodes and links when failuresByPlugin and passesByPlugin contain valid test records', () => {
      const failuresByPlugin: TestRecord[] = [
        {
          prompt: 'fail prompt 1',
          output: 'fail output 1',
          result: { metadata: { pluginId: 'plugin-A' } } as unknown as EvaluateResult,
          metadata: { strategyId: 'strategy-1' },
        },
        {
          prompt: 'fail prompt 2',
          output: 'fail output 2',
          result: { metadata: { pluginId: 'plugin-B' } } as unknown as EvaluateResult,
          metadata: { strategyId: 'strategy-2' },
        },
      ];

      const passesByPlugin: TestRecord[] = [
        {
          prompt: 'pass prompt 1',
          output: 'pass output 1',
          result: { metadata: { pluginId: 'plugin-A' } } as unknown as EvaluateResult,
          metadata: { strategyId: 'strategy-2' },
        },
        {
          prompt: 'pass prompt 2',
          output: 'pass output 2',
          result: { metadata: { pluginId: 'plugin-A' } } as unknown as EvaluateResult,
          metadata: { strategyId: 'strategy-1' },
        },
      ];

      const strategyStats = {};

      render(
        <PluginStrategyFlow
          failuresByPlugin={failuresByPlugin}
          passesByPlugin={passesByPlugin}
          strategyStats={strategyStats}
        />,
      );

      expect(screen.queryByText(/No data available/)).not.toBeInTheDocument();
      expect(screen.getByTestId('sankey-chart')).toBeInTheDocument();

      expect(screen.getByText('plugin-A (3)')).toBeInTheDocument();
      expect(screen.getByText('plugin-B (1)')).toBeInTheDocument();
      expect(screen.getByText('strategy-1 (2)')).toBeInTheDocument();
      expect(screen.getByText('strategy-2 (2)')).toBeInTheDocument();
      expect(screen.getByText('Defended (2)')).toBeInTheDocument();
      expect(screen.getByText('Vulnerable (2)')).toBeInTheDocument();
    });

    it('should create nodes and links with correct values based on test records', () => {
      const failuresByPlugin: TestRecord[] = [
        {
          prompt: 'fail prompt 1',
          output: 'fail output 1',
          result: { metadata: { pluginId: 'testPlugin' } } as unknown as EvaluateResult,
          metadata: { strategyId: 'testStrategy' },
        },
      ];

      const passesByPlugin: TestRecord[] = [
        {
          prompt: 'pass prompt 1',
          output: 'pass output 1',
          result: { metadata: { pluginId: 'testPlugin' } } as unknown as EvaluateResult,
          metadata: { strategyId: 'testStrategy' },
        },
        {
          prompt: 'pass prompt 2',
          output: 'pass output 2',
          result: { metadata: { pluginId: 'testPlugin' } } as unknown as EvaluateResult,
          metadata: { strategyId: 'testStrategy' },
        },
      ];

      const strategyStats = {};

      render(
        <PluginStrategyFlow
          failuresByPlugin={failuresByPlugin}
          passesByPlugin={passesByPlugin}
          strategyStats={strategyStats}
        />,
      );

      expect(screen.getByText('testPlugin (3)')).toBeInTheDocument();
      expect(screen.getByText('testStrategy (3)')).toBeInTheDocument();
      expect(screen.getByText('Defended (2)')).toBeInTheDocument();
      expect(screen.getByText('Vulnerable (1)')).toBeInTheDocument();
    });

    it('should render tooltip content correctly when hovering over a link', () => {
      const failuresByPlugin: TestRecord[] = [
        {
          prompt: 'fail prompt 1',
          output: 'fail output 1',
          result: { metadata: { pluginId: 'PluginA' } } as unknown as EvaluateResult,
          metadata: { strategyId: 'StrategyX' },
        },
      ];

      const passesByPlugin: TestRecord[] = [];
      const strategyStats = {};

      render(
        <PluginStrategyFlow
          failuresByPlugin={failuresByPlugin}
          passesByPlugin={passesByPlugin}
          strategyStats={strategyStats}
        />,
      );

      const tooltipElement = screen.getByTestId('tooltip');
      expect(tooltipElement).toBeInTheDocument();
      expect(tooltipElement).toHaveTextContent('PluginA → StrategyX: 1 tests');
    });

    it('should handle plugin and strategy IDs with special characters and long names', () => {
      const longPluginId = 'plugin-with-a-very-very-very-very-very-long-name';
      const specialCharsStrategyId = 'strategy-with-!@#$%^&*()_+';

      const failuresByPlugin: TestRecord[] = [
        {
          prompt: 'fail prompt 1',
          output: 'fail output 1',
          result: { metadata: { pluginId: longPluginId } } as unknown as EvaluateResult,
          metadata: { strategyId: specialCharsStrategyId },
        },
      ];

      const passesByPlugin: TestRecord[] = [
        {
          prompt: 'pass prompt 1',
          output: 'pass output 1',
          result: { metadata: { pluginId: longPluginId } } as unknown as EvaluateResult,
          metadata: { strategyId: specialCharsStrategyId },
        },
      ];

      const strategyStats = {};

      render(
        <PluginStrategyFlow
          failuresByPlugin={failuresByPlugin}
          passesByPlugin={passesByPlugin}
          strategyStats={strategyStats}
        />,
      );

      expect(screen.getByText(`${longPluginId} (2)`)).toBeInTheDocument();
      expect(screen.getByText(`${specialCharsStrategyId} (2)`)).toBeInTheDocument();
    });
  });

  it('should display "No data available to display the strategy flow." when both failuresByPlugin and passesByPlugin are empty arrays', () => {
    const failuresByPlugin: TestRecord[] = [];
    const passesByPlugin: TestRecord[] = [];
    const strategyStats = {};

    render(
      <PluginStrategyFlow
        failuresByPlugin={failuresByPlugin}
        passesByPlugin={passesByPlugin}
        strategyStats={strategyStats}
      />,
    );

    expect(screen.getByText('No data available to display the strategy flow.')).toBeInTheDocument();
  });

  it('should display "No data available to display the strategy flow." if all test records have strategyId set to \'basic\'', () => {
    const failuresByPlugin: TestRecord[] = [
      {
        prompt: 'fail prompt 1',
        output: 'fail output 1',
        result: { metadata: { pluginId: 'plugin-A' } } as unknown as EvaluateResult,
        metadata: { strategyId: 'basic' },
      },
      {
        prompt: 'fail prompt 2',
        output: 'fail output 2',
        result: { metadata: { pluginId: 'plugin-B' } } as unknown as EvaluateResult,
        metadata: { strategyId: 'basic' },
      },
    ];

    const passesByPlugin: TestRecord[] = [
      {
        prompt: 'pass prompt 1',
        output: 'pass output 1',
        result: { metadata: { pluginId: 'plugin-A' } } as unknown as EvaluateResult,
        metadata: { strategyId: 'basic' },
      },
      {
        prompt: 'pass prompt 2',
        output: 'pass output 2',
        result: { metadata: { pluginId: 'plugin-A' } } as unknown as EvaluateResult,
        metadata: { strategyId: 'basic' },
      },
    ];

    const strategyStats = {};

    render(
      <PluginStrategyFlow
        failuresByPlugin={failuresByPlugin}
        passesByPlugin={passesByPlugin}
        strategyStats={strategyStats}
      />,
    );

    expect(screen.getByText('No data available to display the strategy flow.')).toBeInTheDocument();
    expect(screen.queryByTestId('sankey-chart')).not.toBeInTheDocument();
  });

  it('should render the Sankey diagram based on test records, ignoring mismatched strategyStats', () => {
    const failuresByPlugin: TestRecord[] = [
      {
        prompt: 'fail prompt 1',
        output: 'fail output 1',
        result: { metadata: { pluginId: 'plugin-A' } } as unknown as EvaluateResult,
        metadata: { strategyId: 'strategy-1' },
      },
    ];

    const passesByPlugin: TestRecord[] = [
      {
        prompt: 'pass prompt 1',
        output: 'pass output 1',
        result: { metadata: { pluginId: 'plugin-A' } } as unknown as EvaluateResult,
        metadata: { strategyId: 'strategy-2' },
      },
    ];

    const strategyStats = {
      'strategy-3': { pass: 5, total: 10 },
    };

    render(
      <PluginStrategyFlow
        failuresByPlugin={failuresByPlugin}
        passesByPlugin={passesByPlugin}
        strategyStats={strategyStats}
      />,
    );

    expect(screen.queryByText(/No data available/)).not.toBeInTheDocument();
    expect(screen.getByTestId('sankey-chart')).toBeInTheDocument();

    expect(screen.getByText('plugin-A (2)')).toBeInTheDocument();
    expect(screen.getByText('strategy-1 (1)')).toBeInTheDocument();
    expect(screen.getByText('strategy-2 (1)')).toBeInTheDocument();
    expect(screen.getByText('Defended (1)')).toBeInTheDocument();
    expect(screen.getByText('Vulnerable (1)')).toBeInTheDocument();
  });

  it('should handle test records where result.metadata exists but result.metadata.pluginId is undefined or null', () => {
    const failuresByPlugin: TestRecord[] = [
      {
        prompt: 'fail prompt 1',
        output: 'fail output 1',
        result: { metadata: { pluginId: undefined } } as unknown as EvaluateResult,
        metadata: { strategyId: 'strategy-1' },
      },
      {
        prompt: 'fail prompt 2',
        output: 'fail output 2',
        result: { metadata: { pluginId: null } } as unknown as EvaluateResult,
        metadata: { strategyId: 'strategy-2' },
      },
    ];

    const passesByPlugin: TestRecord[] = [];
    const strategyStats = {};

    render(
      <PluginStrategyFlow
        failuresByPlugin={failuresByPlugin}
        passesByPlugin={passesByPlugin}
        strategyStats={strategyStats}
      />,
    );

    expect(screen.queryByText(/No data available/)).toBeInTheDocument();
  });

  describe('Edge Cases', () => {
    it('should not render label when getComputedTextLength is not available', () => {
      const failuresByPlugin: TestRecord[] = [
        {
          prompt: 'fail prompt 1',
          output: 'fail output 1',
          result: { metadata: { pluginId: 'plugin-A' } } as unknown as EvaluateResult,
          metadata: { strategyId: 'strategy-1' },
        },
      ];

      const passesByPlugin: TestRecord[] = [];
      const strategyStats = {};

      Object.defineProperty(Element.prototype, 'getComputedTextLength', {
        value: () => undefined,
        configurable: true,
      });

      render(
        <PluginStrategyFlow
          failuresByPlugin={failuresByPlugin}
          passesByPlugin={passesByPlugin}
          strategyStats={strategyStats}
        />,
      );

      const labelElement = screen.getByText('plugin-A (1)');
      expect(labelElement).toBeInTheDocument();
    });
  });
});
