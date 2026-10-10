import { TooltipProvider } from '@app/components/ui/tooltip';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import EstimatedDurationDisplay from './EstimatedDurationDisplay';
import EstimatedProbesDisplay from './EstimatedProbesDisplay';

import type { Config } from '../types';

afterEach(cleanup);

describe('workload previews with plugin overrides', () => {
  it('uses the runtime fallback when an imported plugin count is zero', () => {
    const config: Config = {
      description: 'Imported zero override',
      prompts: ['{{prompt}}'],
      target: { id: 'echo', config: {} },
      applicationDefinition: {},
      entities: [],
      numTests: 5,
      maxConcurrency: 1,
      plugins: [{ id: 'bola', numTests: 0 }],
      strategies: ['basic'],
    };
    render(
      <TooltipProvider>
        <EstimatedProbesDisplay config={config} />
        <EstimatedDurationDisplay config={config} />
      </TooltipProvider>,
    );
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('~23s')).toBeInTheDocument();
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  it('ignores the test override when displaying configured intents', () => {
    const config: Config = {
      description: 'Imported intent override',
      prompts: ['{{prompt}}'],
      target: { id: 'echo', config: {} },
      applicationDefinition: {},
      entities: [],
      numTests: 2,
      maxConcurrency: 1,
      plugins: [
        { id: 'intent', numTests: 100, config: { intent: ['first intent', 'second intent'] } },
      ],
      strategies: ['basic'],
    };
    render(
      <TooltipProvider>
        <EstimatedProbesDisplay config={config} />
        <EstimatedDurationDisplay config={config} />
      </TooltipProvider>,
    );
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('~9s')).toBeInTheDocument();
    expect(screen.queryByText('200')).not.toBeInTheDocument();
  });

  it('renders and updates both estimates using the real calculation', () => {
    const config: Config = {
      description: 'Imported plugin override',
      prompts: ['{{prompt}}'],
      target: { id: 'echo', config: {} },
      applicationDefinition: {},
      entities: [],
      numTests: 5,
      maxConcurrency: 10,
      plugins: [{ id: 'bola', numTests: 500 }],
      strategies: ['basic'],
    };
    const previews = (value: Config) => (
      <TooltipProvider>
        <EstimatedProbesDisplay config={value} />
        <EstimatedDurationDisplay config={value} />
      </TooltipProvider>
    );
    const { rerender } = render(previews(config));
    expect(screen.getByText('500')).toBeInTheDocument();
    expect(screen.getByText('~3m')).toBeInTheDocument();

    rerender(previews({ ...config, plugins: [{ id: 'bola', numTests: 2 }] }));
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('~9s')).toBeInTheDocument();
    expect(screen.queryByText('500')).not.toBeInTheDocument();
  });
});
