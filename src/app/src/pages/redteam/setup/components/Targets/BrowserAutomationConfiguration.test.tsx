import { renderWithProviders } from '@app/utils/testutils';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import BrowserAutomationConfiguration from './BrowserAutomationConfiguration';

import type { ProviderOptions } from '../../types';

const providerWithSteps = (steps: ProviderOptions['config']['steps']): ProviderOptions => ({
  id: 'browser',
  config: { steps },
});

describe('BrowserAutomationConfiguration', () => {
  it('describes browser execution and output settings at their controls', () => {
    renderWithProviders(
      <BrowserAutomationConfiguration
        selectedTarget={providerWithSteps([])}
        updateCustomTarget={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('Headless Mode')).toHaveAccessibleDescription(
      /Use a hidden browser for evaluation runs/i,
    );
    expect(screen.getByLabelText('Timeout (ms)')).toHaveAccessibleDescription(
      /Maximum time to wait for browser operations/i,
    );
    expect(screen.getByLabelText('Response Transform')).toHaveAccessibleDescription(
      /JavaScript expression to parse the extracted data/i,
    );
  });

  it('associates navigation validation with the URL that needs correction', () => {
    renderWithProviders(
      <BrowserAutomationConfiguration
        selectedTarget={providerWithSteps([
          { action: 'navigate', args: { url: 'https://example.com' } },
        ])}
        updateCustomTarget={vi.fn()}
        fieldErrors={{
          stepErrors: {
            0: { url: 'Step 1: replace example.com with your application URL.' },
          },
        }}
      />,
    );

    const url = screen.getByLabelText('URL');
    expect(url).toHaveAttribute('aria-invalid', 'true');
    expect(url).toHaveAccessibleDescription(
      'Step 1: replace example.com with your application URL.',
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Step 1: replace example.com with your application URL.',
    );
  });

  it('directs an empty step-list error to the action that fixes it', () => {
    renderWithProviders(
      <BrowserAutomationConfiguration
        selectedTarget={providerWithSteps([])}
        updateCustomTarget={vi.fn()}
        fieldErrors={{ steps: 'Add at least one browser step before saving this provider.' }}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Add at least one browser step before saving this provider.',
    );
    expect(screen.getByRole('button', { name: 'Add Step' })).toHaveAccessibleDescription(
      'Add at least one browser step before saving this provider.',
    );
  });

  it('starts added steps as editable navigation steps rather than invalid blank actions', async () => {
    const user = userEvent.setup();
    const updateCustomTarget = vi.fn();

    renderWithProviders(
      <BrowserAutomationConfiguration
        selectedTarget={providerWithSteps([])}
        updateCustomTarget={updateCustomTarget}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Add Step' }));

    expect(updateCustomTarget).toHaveBeenCalledWith('steps', [
      { action: 'navigate', args: { url: '' } },
    ]);
  });

  it('exposes the runtime-supported screenshot action fields', () => {
    renderWithProviders(
      <BrowserAutomationConfiguration
        selectedTarget={providerWithSteps([{ action: 'screenshot', args: { path: '' } }])}
        updateCustomTarget={vi.fn()}
        fieldErrors={{
          stepErrors: { 0: { path: 'Step 1: enter a screenshot file path.' } },
        }}
      />,
    );

    expect(screen.getByLabelText('Screenshot File Path')).toHaveAccessibleDescription(
      'Step 1: enter a screenshot file path.',
    );
  });
});
