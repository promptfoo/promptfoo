import { renderWithProviders } from '@app/utils/testutils';
import { fireEvent, screen } from '@testing-library/react';
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

    const url = screen.getByLabelText(/URL/);
    expect(url).toBeRequired();
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

  it('exposes the runtime-supported screenshot action fields', async () => {
    const user = userEvent.setup();
    const updateCustomTarget = vi.fn();
    renderWithProviders(
      <BrowserAutomationConfiguration
        selectedTarget={providerWithSteps([{ action: 'screenshot', args: { path: '' } }])}
        updateCustomTarget={updateCustomTarget}
        fieldErrors={{
          stepErrors: { 0: { path: 'Step 1: enter a screenshot file path.' } },
        }}
      />,
    );

    expect(screen.getByLabelText(/Screenshot File Path/)).toHaveAccessibleDescription(
      'Step 1: enter a screenshot file path.',
    );
    expect(screen.getByLabelText(/Screenshot File Path/)).toBeRequired();
    expect(screen.getByLabelText('Capture Full Page')).toHaveAccessibleDescription(
      /include scrollable content below the visible viewport/i,
    );

    await user.click(screen.getByLabelText('Capture Full Page'));
    await user.click(screen.getByRole('option', { name: 'Yes (Entire Page)' }));

    expect(updateCustomTarget).toHaveBeenCalledWith('steps', [
      { action: 'screenshot', args: { path: '', fullPage: true } },
    ]);
  });

  it('discloses and saves advanced extraction scripts within extract steps', () => {
    const updateCustomTarget = vi.fn();
    renderWithProviders(
      <BrowserAutomationConfiguration
        selectedTarget={providerWithSteps([
          {
            action: 'extract',
            args: { selector: '.result', script: 'return document.title;' },
            name: 'result',
          },
        ])}
        updateCustomTarget={updateCustomTarget}
      />,
    );

    const script = screen.getByLabelText('JavaScript Extraction Script (advanced)');
    expect(screen.getByLabelText('CSS Selector (optional with script)')).not.toBeRequired();
    expect(screen.getByLabelText(/Variable Name/)).toBeRequired();
    expect(script).toHaveValue('return document.title;');
    expect(script).toHaveAccessibleDescription(
      /Runs in the target page context and takes priority over the CSS selector/i,
    );

    fireEvent.change(script, { target: { value: 'return document.body.innerText;' } });

    expect(updateCustomTarget).toHaveBeenCalledWith('steps', [
      {
        action: 'extract',
        args: { selector: '.result', script: 'return document.body.innerText;' },
        name: 'result',
      },
    ]);
  });

  it('marks fields required by typed and wait-for-children steps', () => {
    renderWithProviders(
      <BrowserAutomationConfiguration
        selectedTarget={providerWithSteps([
          { action: 'type', args: { selector: '', text: '' } },
          { action: 'waitForNewChildren', args: { parentSelector: '' } },
        ])}
        updateCustomTarget={vi.fn()}
      />,
    );

    expect(screen.getByLabelText(/^Selector/)).toBeRequired();
    expect(screen.getByLabelText(/Text/)).toBeRequired();
    expect(screen.getByLabelText(/Parent Selector/)).toBeRequired();
  });

  it('requires an explicit wait duration instead of showing an unsaved default', () => {
    renderWithProviders(
      <BrowserAutomationConfiguration
        selectedTarget={providerWithSteps([{ action: 'wait', args: {} }])}
        updateCustomTarget={vi.fn()}
        fieldErrors={{
          stepErrors: { 0: { ms: 'Step 1: enter a wait duration of 0 milliseconds or greater.' } },
        }}
      />,
    );

    const waitTime = screen.getByLabelText(/Wait Time/);
    expect(waitTime).toBeRequired();
    expect(waitTime).toHaveValue(null);
    expect(waitTime).toHaveAccessibleDescription(
      /Step 1: enter a wait duration of 0 milliseconds or greater.*Enter 1000 for one second/i,
    );
  });
});
