import { TooltipProvider } from '@app/components/ui/tooltip';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import InstallationGuide from './InstallationGuide';

describe('InstallationGuide', () => {
  it('stacks the warning content on narrow screens', () => {
    render(
      <TooltipProvider>
        <InstallationGuide onRetryCheck={vi.fn()} isChecking={false} />
      </TooltipProvider>,
    );

    expect(screen.getByRole('alert')).toHaveClass(
      'flex-col',
      'items-start',
      'sm:flex-row',
      'sm:items-center',
    );
  });

  it('links to the current package requirements and installation instructions', () => {
    render(
      <TooltipProvider>
        <InstallationGuide onRetryCheck={vi.fn()} isChecking={false} />
      </TooltipProvider>,
    );

    expect(screen.getByRole('link', { name: 'Python requirements on PyPI' })).toHaveAttribute(
      'href',
      'https://pypi.org/project/modelaudit/',
    );
    expect(screen.getByRole('link', { name: 'installation guide' })).toHaveAttribute(
      'href',
      'https://www.promptfoo.dev/docs/model-audit/#installation',
    );
  });
});
