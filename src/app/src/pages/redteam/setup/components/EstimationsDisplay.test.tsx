import { TooltipProvider } from '@app/components/ui/tooltip';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import EstimationsDisplay from './EstimationsDisplay';

import type { Config } from '../types';

const config: Config = {
  description: 'Test config',
  prompts: ['{{prompt}}'],
  target: {
    id: 'http',
    config: {},
  },
  plugins: [],
  strategies: ['basic'],
  purpose: '',
  entities: [],
  numTests: 1,
  applicationDefinition: {},
};

describe('EstimationsDisplay', () => {
  it('stacks estimate cards on narrow screens before switching back to a row', () => {
    render(
      <TooltipProvider>
        <EstimationsDisplay config={config} />
      </TooltipProvider>,
    );

    expect(screen.getByText('Estimated Duration:').parentElement?.parentElement).toHaveClass(
      'flex-col',
      'sm:flex-row',
    );
  });
});
