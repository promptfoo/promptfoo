import { TooltipProvider } from '@app/components/ui/tooltip';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import EstimatedDurationDisplay from './EstimatedDurationDisplay';
import EstimatedProbesDisplay from './EstimatedProbesDisplay';

import type { Config } from '../types';

afterEach(cleanup);

describe('workload previews with plugin overrides', () => {
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
    expect(screen.getByText('1,000')).toBeInTheDocument();
    expect(screen.getByText('~6m')).toBeInTheDocument();

    rerender(previews({ ...config, plugins: [{ id: 'bola', numTests: 2 }] }));
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('~10s')).toBeInTheDocument();
    expect(screen.queryByText('1,000')).not.toBeInTheDocument();
  });
});
