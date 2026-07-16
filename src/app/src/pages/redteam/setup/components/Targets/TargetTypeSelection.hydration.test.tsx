import { TooltipProvider } from '@app/components/ui/tooltip';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useRedTeamConfig } from '../../hooks/useRedTeamConfig';
import { useRedTeamTargetConfigValidation } from '../../hooks/useRedTeamTargetConfigValidation';
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
      useRedTeamTargetConfigValidation.setState(useRedTeamTargetConfigValidation.getInitialState());
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
      });
      useRedTeamTargetConfigValidation
        .getState()
        .replaceTargetConfigValidation(
          'Invalid JSON configuration',
          '{"sandbox_mode":"read-only",}',
        );
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
    expect(useRedTeamTargetConfigValidation.getState().targetConfigError).toBe(
      'Invalid JSON configuration',
    );
    expect(useRedTeamTargetConfigValidation.getState().targetConfigDraft).toBe(
      '{"sandbox_mode":"read-only",}',
    );
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
    expect(useRedTeamTargetConfigValidation.getState().targetConfigError).toBeNull();
    expect(useRedTeamTargetConfigValidation.getState().targetConfigDraft).toBeNull();
  });

  it('keeps an explicit target replacement blocked when the persisted target is overwritten before its clear', async () => {
    const user = userEvent.setup();
    const onNext = vi.fn();
    useRedTeamTargetConfigValidation
      .getState()
      .replaceTargetConfigValidation('Invalid JSON configuration', '{"sandbox_mode":"read-only",}');
    const staleTarget = {
      id: 'openinterpreter',
      label: 'Unsafe target',
      config: { sandbox_mode: 'danger-full-access' },
    };
    const originalSetItem = Storage.prototype.setItem;
    let targetWrites = 0;
    let raced = false;
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
      this: Storage,
      key: string,
      value: string,
    ) {
      const result = originalSetItem.call(this, key, value);
      if (this === window.localStorage && key === 'redTeamConfig' && ++targetWrites >= 2) {
        raced = true;
        const overwrittenConfig = JSON.parse(value);
        overwrittenConfig.state.config.target = staleTarget;
        originalSetItem.call(this, key, JSON.stringify(overwrittenConfig));
      }
      return result;
    });
    try {
      render(
        <TooltipProvider>
          <TargetTypeSelection onNext={onNext} />
        </TooltipProvider>,
      );

      await user.click(screen.getByRole('button', { name: 'Replace target' }));
    } finally {
      setItem.mockRestore();
    }

    expect(raced).toBe(true);
    expect(
      JSON.parse(window.localStorage.getItem('redTeamConfig')!).state.config.target.config,
    ).toEqual({ sandbox_mode: 'danger-full-access' });
    expect(useRedTeamTargetConfigValidation.getState().targetConfigError).toBe(
      'Invalid JSON configuration',
    );
    expect(useRedTeamTargetConfigValidation.getState().targetConfigDraft).toBe(
      '{"sandbox_mode":"read-only",}',
    );
    expect(window.localStorage.getItem('redTeamTargetConfigValidation')).toMatch(
      /^invalid-json:[a-z0-9-]+$/,
    );
    const nextButton = screen.getByRole('button', { name: 'Next' });
    expect(nextButton).toBeDisabled();
    await user.click(nextButton);
    expect(onNext).not.toHaveBeenCalled();
  });

  it('does not restore an unsafe target after a full config is loaded while mounted', async () => {
    const user = userEvent.setup();

    render(
      <TooltipProvider>
        <TargetTypeSelection onNext={vi.fn()} />
      </TooltipProvider>,
    );

    act(() => {
      useRedTeamConfig.getState().setFullConfig({
        ...useRedTeamConfig.getState().config,
        target: {
          id: 'http',
          label: 'Imported target',
          config: { url: 'https://example.test', body: '{{prompt}}' },
        },
      });
    });

    const targetName = screen.getByRole('textbox', { name: /Target Name/i });
    expect(targetName).toHaveValue('Imported target');

    await user.clear(targetName);
    await user.type(targetName, 'Renamed import');

    expect(useRedTeamConfig.getState().config.target).toEqual({
      id: 'http',
      label: 'Renamed import',
      config: { url: 'https://example.test', body: '{{prompt}}' },
    });
    expect(useRedTeamTargetConfigValidation.getState().targetConfigError).toBeNull();
    expect(useRedTeamTargetConfigValidation.getState().targetConfigDraft).toBeNull();
  });

  it('preserves the config of a label-less imported target when its name is entered', async () => {
    const user = userEvent.setup();

    render(
      <TooltipProvider>
        <TargetTypeSelection onNext={vi.fn()} />
      </TooltipProvider>,
    );

    act(() => {
      useRedTeamConfig.getState().setFullConfig({
        ...useRedTeamConfig.getState().config,
        target: {
          id: 'openinterpreter',
          config: { sandbox_mode: 'read-only', approval_policy: 'on-request' },
        },
      });
    });

    const targetName = screen.getByRole('textbox', { name: /Target Name/i });
    expect(targetName).toHaveValue('');

    await user.type(targetName, 'Imported coding target');

    expect(useRedTeamConfig.getState().config.target).toEqual({
      id: 'openinterpreter',
      label: 'Imported coding target',
      config: { sandbox_mode: 'read-only', approval_policy: 'on-request' },
    });
    expect(useRedTeamTargetConfigValidation.getState().targetConfigError).toBeNull();
    expect(useRedTeamTargetConfigValidation.getState().targetConfigDraft).toBeNull();
  });

  it('keeps the provider editor available when the type step mounts after a label-less import', async () => {
    const user = userEvent.setup();

    act(() => {
      useRedTeamConfig.getState().setFullConfig({
        ...useRedTeamConfig.getState().config,
        target: {
          id: 'openinterpreter',
          config: { sandbox_mode: 'read-only', approval_policy: 'on-request' },
        },
      });
    });

    expect(useRedTeamTargetConfigValidation.getState().targetConfigError).toBeNull();
    expect(useRedTeamTargetConfigValidation.getState().targetConfigDraft).toBeNull();

    render(
      <TooltipProvider>
        <TargetTypeSelection onNext={vi.fn()} />
      </TooltipProvider>,
    );

    expect(useRedTeamConfig.getState().providerType).toBe('openinterpreter');
    const targetName = screen.getByRole('textbox', { name: /Target Name/i });
    expect(targetName).toHaveValue('');

    await user.type(targetName, 'Imported coding target');

    expect(useRedTeamConfig.getState().config.target).toEqual({
      id: 'openinterpreter',
      label: 'Imported coding target',
      config: { sandbox_mode: 'read-only', approval_policy: 'on-request' },
    });
    expect(useRedTeamTargetConfigValidation.getState().targetConfigError).toBeNull();
    expect(useRedTeamTargetConfigValidation.getState().targetConfigDraft).toBeNull();
    expect(screen.getByRole('button', { name: /^Next$/i })).toBeEnabled();
  });

  it('preserves a configured label-less HTTP target after the validation store is recreated', async () => {
    const user = userEvent.setup();

    act(() => {
      useRedTeamConfig.setState({
        config: {
          ...useRedTeamConfig.getState().config,
          target: {
            id: 'http',
            config: { url: 'https://example.test', body: '{{prompt}}' },
          },
        },
        providerType: 'http',
      });
      useRedTeamTargetConfigValidation.setState({
        targetConfigError: null,
        targetConfigDraft: null,
        targetConfigRevision: 0,
      });
    });

    render(
      <TooltipProvider>
        <TargetTypeSelection onNext={vi.fn()} />
      </TooltipProvider>,
    );

    expect(useRedTeamConfig.getState().providerType).toBe('http');
    const targetName = screen.getByRole('textbox', { name: /Target Name/i });
    expect(targetName).toHaveValue('');

    await user.type(targetName, 'Imported HTTP target');

    expect(useRedTeamConfig.getState().config.target).toEqual({
      id: 'http',
      label: 'Imported HTTP target',
      config: { url: 'https://example.test', body: '{{prompt}}' },
    });
    expect(screen.getByRole('button', { name: /^Next$/i })).toBeEnabled();
  });

  it('preserves a label-less raw HTTP request target after the validation store is recreated', async () => {
    const user = userEvent.setup();
    const request = 'POST /chat HTTP/1.1\nHost: example.test\n\n{{prompt}}';

    act(() => {
      useRedTeamConfig.setState({
        config: {
          ...useRedTeamConfig.getState().config,
          target: { id: 'http', config: { request } },
        },
        providerType: 'http',
      });
      useRedTeamTargetConfigValidation.setState({
        targetConfigError: null,
        targetConfigDraft: null,
        targetConfigRevision: 0,
      });
    });

    render(
      <TooltipProvider>
        <TargetTypeSelection onNext={vi.fn()} />
      </TooltipProvider>,
    );

    expect(useRedTeamConfig.getState().providerType).toBe('http');
    const targetName = screen.getByRole('textbox', { name: /Target Name/i });
    expect(targetName).toHaveValue('');

    await user.type(targetName, 'Imported raw HTTP target');

    expect(useRedTeamConfig.getState().config.target).toEqual({
      id: 'http',
      label: 'Imported raw HTTP target',
      config: { request },
    });
    expect(screen.getByRole('button', { name: /^Next$/i })).toBeEnabled();
  });
});
