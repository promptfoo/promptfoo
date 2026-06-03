import type { ComponentProps } from 'react';

import { TooltipProvider } from '@app/components/ui/tooltip';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import TestSection from './TestSection';

const defaultProps: ComponentProps<typeof TestSection> = {
  selectedTarget: {
    id: 'http',
    config: {
      url: 'https://api.example.com/chat',
      method: 'POST',
    },
  },
  isTestRunning: false,
  testResult: null,
  handleTestTarget: vi.fn(),
  disabled: false,
  detailsExpanded: false,
  onDetailsExpandedChange: vi.fn(),
};

const renderSection = (props: Partial<ComponentProps<typeof TestSection>> = {}) => {
  return render(
    <TooltipProvider>
      <TestSection {...defaultProps} {...props} />
    </TooltipProvider>,
  );
};

describe('TestSection', () => {
  it('shows a failed provider test result even when no configuration suggestions are returned', () => {
    renderSection({
      testResult: {
        success: false,
        message: 'The endpoint returned 401 Unauthorized.',
      },
    });

    const resultAlert = screen.getByRole('alert');
    expect(resultAlert).toHaveTextContent('Test Failed');
    expect(resultAlert).toHaveTextContent('The endpoint returned 401 Unauthorized.');
  });

  it('uses a warning icon when a successful request still needs configuration changes', () => {
    renderSection({
      testResult: {
        success: true,
        changes_needed: true,
        message: 'Update the response parser before continuing.',
      },
    });

    const resultAlert = screen.getByRole('alert');
    expect(resultAlert).toHaveTextContent('Configuration Changes Needed');
    expect(resultAlert.querySelector('.lucide-circle-alert')).toBeInTheDocument();
    expect(resultAlert.querySelector('.lucide-circle-check')).not.toBeInTheDocument();
  });

  it('announces an in-progress provider test and describes the busy button', () => {
    renderSection({ isTestRunning: true });

    const status = screen.getByRole('status');
    const button = screen.getByRole('button', { name: 'Testing...' });
    expect(status).toHaveTextContent('Sending a test request to this endpoint.');
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-describedby', status.id);
  });

  it('associates the missing configuration message with its disabled test button', () => {
    renderSection({
      selectedTarget: { id: 'http', config: {} },
      disabled: true,
    });

    expect(screen.getByRole('button', { name: 'Test Target' })).toHaveAccessibleDescription(
      'Please configure the target URL or request before testing.',
    );
  });
});
