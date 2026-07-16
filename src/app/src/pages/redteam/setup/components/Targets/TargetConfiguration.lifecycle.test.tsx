import { TooltipProvider } from '@app/components/ui/tooltip';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useRedTeamConfig } from '../../hooks/useRedTeamConfig';
import { useRedTeamTargetConfigValidation } from '../../hooks/useRedTeamTargetConfigValidation';
import TargetConfiguration from './TargetConfiguration';

vi.mock('@app/hooks/useTelemetry', () => ({ useTelemetry: () => ({ recordEvent: vi.fn() }) }));
vi.mock('../Prompts', () => ({ default: () => null }));
vi.mock('./CommonConfigurationOptions', () => ({ default: () => null }));
vi.mock('react-simple-code-editor', () => ({
  default: ({ value, onValueChange }: any) => (
    <textarea
      data-testid="code-editor"
      value={value}
      onChange={(event) => onValueChange(event.target.value)}
    />
  ),
}));

function TargetConfigurationHarness({ onNext = vi.fn() }: { onNext?: () => void }) {
  const { targetConfigRevision } = useRedTeamTargetConfigValidation();
  return (
    <TooltipProvider>
      <TargetConfiguration key={targetConfigRevision} onNext={onNext} onBack={vi.fn()} />
    </TooltipProvider>
  );
}

const replaceText = async (
  user: ReturnType<typeof userEvent.setup>,
  element: HTMLElement,
  value: string,
) => {
  await user.click(element);
  await user.keyboard('{Control>}a{/Control}');
  await user.paste(value);
};

describe('TargetConfiguration lifecycle validation', () => {
  beforeEach(() => {
    act(() => {
      useRedTeamConfig.setState(useRedTeamConfig.getInitialState());
      useRedTeamTargetConfigValidation.setState(useRedTeamTargetConfigValidation.getInitialState());
      useRedTeamTargetConfigValidation.getState().clearTargetConfigValidation();
      useRedTeamConfig.setState({
        config: {
          ...useRedTeamConfig.getState().config,
          target: {
            id: 'openinterpreter',
            label: 'Coding target',
            config: { sandbox_mode: 'danger-full-access' },
          },
        },
        providerType: 'openinterpreter',
      });
    });
  });

  it('uses an imported target after malformed JSON instead of restoring the previous target', async () => {
    const user = userEvent.setup();
    const onNext = vi.fn();
    render(<TargetConfigurationHarness onNext={onNext} />);

    await replaceText(user, screen.getByTestId('code-editor'), '{"sandbox_mode":"read-only",}');
    expect(useRedTeamTargetConfigValidation.getState().targetConfigError).toBe(
      'Invalid JSON configuration',
    );

    act(() => {
      useRedTeamConfig.getState().setFullConfig({
        ...useRedTeamConfig.getState().config,
        target: {
          id: 'openinterpreter',
          label: 'Imported target',
          config: { sandbox_mode: 'read-only' },
        },
      });
    });

    expect(useRedTeamTargetConfigValidation.getState().targetConfigError).toBeNull();
    expect(screen.getByRole('button', { name: /Next/i })).toBeEnabled();
    expect(screen.getByTestId('code-editor')).toHaveValue(
      JSON.stringify({ sandbox_mode: 'read-only' }, null, 2),
    );

    await replaceText(user, screen.getByLabelText(/Target ID/i), 'openinterpreter:local');

    expect(useRedTeamConfig.getState().config.target).toEqual({
      id: 'openinterpreter:local',
      label: 'Imported target',
      config: { sandbox_mode: 'read-only' },
    });
    expect(useRedTeamTargetConfigValidation.getState().targetConfigError).toBeNull();
    await user.click(screen.getByRole('button', { name: /Next/i }));
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('keeps Next disabled when the target editor remounts with malformed JSON', async () => {
    const user = userEvent.setup();
    const first = render(<TargetConfigurationHarness />);

    await replaceText(user, screen.getByTestId('code-editor'), '{"sandbox_mode":"read-only",}');
    expect(screen.getByRole('button', { name: /Next/i })).toBeDisabled();
    first.unmount();

    render(<TargetConfigurationHarness />);

    expect(useRedTeamTargetConfigValidation.getState().targetConfigError).toBe(
      'Invalid JSON configuration',
    );
    expect(screen.getByRole('button', { name: /Next/i })).toBeDisabled();
  });

  it('refreshes the raw editor when a same-type target is imported without an existing error', () => {
    render(<TargetConfigurationHarness />);

    act(() => {
      useRedTeamConfig.getState().setFullConfig({
        ...useRedTeamConfig.getState().config,
        target: {
          id: 'openinterpreter',
          label: 'Imported target',
          config: { sandbox_mode: 'read-only' },
        },
      });
    });

    expect(screen.getByTestId('code-editor')).toHaveValue(
      JSON.stringify({ sandbox_mode: 'read-only' }, null, 2),
    );
    expect(useRedTeamConfig.getState().config.target.config).toEqual({
      sandbox_mode: 'read-only',
    });
  });

  it('keeps a restored unsafe config blocked through whitespace and Format until it is changed', async () => {
    const user = userEvent.setup();
    useRedTeamTargetConfigValidation.getState().setTargetConfigError('Invalid JSON configuration');
    expect(useRedTeamTargetConfigValidation.getState().targetConfigDraft).toBeNull();
    render(<TargetConfigurationHarness />);

    const editor = screen.getByTestId('code-editor');
    const unchanged = JSON.stringify({ sandbox_mode: 'danger-full-access' }, null, 2);
    expect(editor).toHaveValue(unchanged);
    expect(screen.getByRole('button', { name: /Next/i })).toBeDisabled();

    await replaceText(user, editor, `${unchanged}\n `);
    await replaceText(user, editor, ` ${unchanged}\n`);
    await user.click(screen.getByRole('button', { name: /Format/i }));

    expect(useRedTeamTargetConfigValidation.getState().targetConfigError).toBe(
      'Invalid JSON configuration',
    );
    expect(useRedTeamConfig.getState().config.target.config).toEqual({
      sandbox_mode: 'danger-full-access',
    });
    expect(screen.getByRole('button', { name: /Next/i })).toBeDisabled();

    await replaceText(user, editor, '{"sandbox_mode":"read-only"}');

    expect(useRedTeamTargetConfigValidation.getState().targetConfigError).toBeNull();
    expect(useRedTeamConfig.getState().config.target.config).toEqual({
      sandbox_mode: 'read-only',
    });
    expect(screen.getByRole('button', { name: /Next/i })).toBeEnabled();
  });

  it('clears a malformed draft when undo restores the last valid target configuration', async () => {
    const user = userEvent.setup();
    render(<TargetConfigurationHarness />);
    const editor = screen.getByTestId('code-editor');
    const original = JSON.stringify({ sandbox_mode: 'danger-full-access' }, null, 2);

    await replaceText(user, editor, '{"sandbox_mode":"read-only",}');
    expect(useRedTeamTargetConfigValidation.getState().targetConfigError).toBe(
      'Invalid JSON configuration',
    );
    expect(screen.getByRole('button', { name: /Next/i })).toBeDisabled();

    await replaceText(user, editor, original);

    expect(useRedTeamTargetConfigValidation.getState().targetConfigError).toBeNull();
    expect(useRedTeamTargetConfigValidation.getState().targetConfigDraft).toBeNull();
    expect(screen.getByRole('button', { name: /Next/i })).toBeEnabled();
  });
});
