import { TooltipProvider } from '@app/components/ui/tooltip';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useRedTeamConfig } from '../../hooks/useRedTeamConfig';
import TargetTypeSelection from './TargetTypeSelection';

import type { ProviderOptions } from '../../types';

vi.mock('@app/hooks/useTelemetry', () => ({
  useTelemetry: () => ({ recordEvent: vi.fn() }),
}));

vi.mock('../LoadExampleButton', () => ({
  default: () => <button type="button">Load Example</button>,
}));

vi.mock('./ProviderTypeSelector', () => ({
  default: ({
    setProvider,
  }: {
    setProvider: (provider: ProviderOptions, providerType: string) => void;
  }) => (
    <button
      type="button"
      onClick={() => setProvider({ id: 'openai:gpt-4.1', config: {} }, 'openai')}
    >
      Replace target
    </button>
  ),
}));

describe('TargetTypeSelection hydration', () => {
  beforeEach(() => {
    act(() => {
      useRedTeamConfig.setState(useRedTeamConfig.getInitialState());
      useRedTeamConfig.setState({
        config: {
          ...useRedTeamConfig.getState().config,
          target: {
            id: 'openinterpreter',
            label: 'Unsafe target',
            config: { sandbox_mode: 'danger-full-access' },
          },
        },
        providerType: undefined,
        targetConfigError: 'Invalid JSON configuration',
      });
    });
  });

  it('preserves the target error when inferring the provider type for a hydrated target', () => {
    render(
      <TooltipProvider>
        <TargetTypeSelection onNext={vi.fn()} />
      </TooltipProvider>,
    );

    expect(useRedTeamConfig.getState().providerType).toBe('openinterpreter');
    expect(useRedTeamConfig.getState().config.target).toEqual({
      id: 'openinterpreter',
      label: 'Unsafe target',
      config: { sandbox_mode: 'danger-full-access' },
    });
    expect(useRedTeamConfig.getState().targetConfigError).toBe('Invalid JSON configuration');
  });

  it('clears the target error only when the user explicitly replaces the target', async () => {
    const user = userEvent.setup();

    render(
      <TooltipProvider>
        <TargetTypeSelection onNext={vi.fn()} />
      </TooltipProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Replace target' }));

    expect(useRedTeamConfig.getState().providerType).toBe('openai');
    expect(useRedTeamConfig.getState().config.target).toEqual({
      id: 'openai:gpt-4.1',
      label: 'Unsafe target',
      config: {},
    });
    expect(useRedTeamConfig.getState().targetConfigError).toBeNull();
  });
});
