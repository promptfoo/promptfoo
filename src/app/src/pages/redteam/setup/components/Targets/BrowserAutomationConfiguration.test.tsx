import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import BrowserAutomationConfiguration from './BrowserAutomationConfiguration';

import type { ProviderOptions } from '../../types';

const renderConfiguration = (config: ProviderOptions['config']) => {
  const updateCustomTarget = vi.fn();
  render(
    <BrowserAutomationConfiguration
      selectedTarget={{ id: 'browser', config }}
      updateCustomTarget={updateCustomTarget}
    />,
  );
  return updateCustomTarget;
};

describe('BrowserAutomationConfiguration', () => {
  it('unsets cleared numeric fields instead of saving 0', async () => {
    const user = userEvent.setup();
    const steps: NonNullable<ProviderOptions['config']['steps']> = [
      { action: 'wait', args: { ms: 500 } },
      {
        action: 'waitForNewChildren',
        args: { parentSelector: '#results', delay: 500, timeout: 5000 },
      },
    ];
    const updateCustomTarget = renderConfiguration({ timeoutMs: 5000, steps });
    const [targetTimeout, stepTimeout] = screen.getAllByLabelText('Timeout (ms)');

    await user.clear(targetTimeout);
    expect(updateCustomTarget).toHaveBeenLastCalledWith('timeoutMs', undefined);

    await user.clear(screen.getByLabelText('Wait Time (ms)'));
    expect(updateCustomTarget).toHaveBeenLastCalledWith('steps', [
      { action: 'wait', args: { ms: undefined } },
      steps[1],
    ]);

    await user.clear(screen.getByLabelText('Initial Delay (ms)'));
    expect(updateCustomTarget).toHaveBeenLastCalledWith('steps', [
      steps[0],
      { ...steps[1], args: { ...steps[1].args, delay: undefined } },
    ]);

    await user.clear(stepTimeout);
    expect(updateCustomTarget).toHaveBeenLastCalledWith('steps', [
      steps[0],
      { ...steps[1], args: { ...steps[1].args, timeout: undefined } },
    ]);
  });

  it('shows the default wait duration when unset', () => {
    renderConfiguration({ steps: [{ action: 'wait', args: {} }] });

    const waitTime = screen.getByLabelText('Wait Time (ms)');
    expect(waitTime).toHaveValue(null);
    expect(waitTime).toHaveAttribute('placeholder', '1000');
  });

  it('shows saved zero values instead of the defaults', () => {
    renderConfiguration({
      timeoutMs: 0,
      steps: [
        { action: 'wait', args: { ms: 0 } },
        {
          action: 'waitForNewChildren',
          args: { parentSelector: '#results', delay: 0, timeout: 0 },
        },
      ],
    });

    const inputs = screen.getAllByRole('spinbutton');
    expect(inputs).toHaveLength(4);
    for (const input of inputs) {
      expect(input).toHaveValue(0);
    }
  });

  it.each([
    [undefined, '30000'],
    [0, '0'],
    [1500, '1500'],
  ])('shows the inherited step timeout for target timeout %s', (timeoutMs, placeholder) => {
    renderConfiguration({
      timeoutMs,
      steps: [{ action: 'waitForNewChildren', args: { parentSelector: '#results' } }],
    });

    const [, stepTimeout] = screen.getAllByLabelText('Timeout (ms)');
    expect(stepTimeout).toHaveValue(null);
    expect(stepTimeout).toHaveAttribute('placeholder', placeholder);
  });
});
