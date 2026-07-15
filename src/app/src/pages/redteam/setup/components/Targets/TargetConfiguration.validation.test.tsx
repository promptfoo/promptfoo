import { useState } from 'react';

import { TooltipProvider } from '@app/components/ui/tooltip';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TargetConfiguration from './TargetConfiguration';

const state = vi.hoisted(() => ({
  target: {
    id: 'openinterpreter',
    label: 'Coding target',
    config: { sandbox_mode: 'danger-full-access' },
  },
  targetConfigError: null as string | null,
}));
const updateConfig = vi.hoisted(() =>
  vi.fn((section: string, value: typeof state.target) => {
    if (section === 'target') {
      state.target = value;
    }
  }),
);
const setTargetConfigError = vi.hoisted(() =>
  vi.fn((error: string | null) => {
    state.targetConfigError = error;
  }),
);
const onNext = vi.fn();

vi.mock('../../hooks/useRedTeamConfig', () => ({
  DEFAULT_HTTP_TARGET: { id: 'http', config: { url: '' } },
  useRedTeamConfig: () => ({
    config: { target: state.target, extensions: [], prompts: [] },
    providerType: 'openinterpreter',
    targetConfigError: state.targetConfigError,
    setTargetConfigError,
    updateConfig,
  }),
}));
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

function Harness() {
  const [showConfig, setShowConfig] = useState(true);
  return (
    <TooltipProvider>
      <button type="button" onClick={() => setShowConfig(false)}>
        Review tab
      </button>
      {showConfig ? (
        <TargetConfiguration onNext={onNext} onBack={vi.fn()} />
      ) : (
        <output data-testid="review-state">
          {JSON.stringify({ config: state.target.config, error: state.targetConfigError })}
        </output>
      )}
    </TooltipProvider>
  );
}

describe('TargetConfiguration custom configuration validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.target = {
      id: 'openinterpreter',
      label: 'Coding target',
      config: { sandbox_mode: 'danger-full-access' },
    };
    state.targetConfigError = null;
  });

  it.each([
    ['malformed JSON', '{"sandbox_mode":"read-only",}', 'Invalid JSON configuration'],
    ['non-object JSON', '[]', 'Configuration must be a JSON object'],
  ])('keeps %s blocked after navigating directly to Review', (_case, value, error) => {
    render(<Harness />);

    fireEvent.change(screen.getByTestId('code-editor'), { target: { value } });

    expect(screen.getAllByText(error).length).toBeGreaterThan(0);
    expect(setTargetConfigError).toHaveBeenLastCalledWith(error);
    const footerNext = within(screen.getByTestId('page-navigation')).getByRole('button', {
      name: /Next/i,
    });
    expect(footerNext).toBeDisabled();
    fireEvent.click(footerNext);
    expect(onNext).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Review tab' }));
    expect(screen.getByTestId('review-state')).toHaveTextContent(error);
    expect(screen.getByTestId('review-state')).toHaveTextContent('danger-full-access');
  });

  it('clears the durable validation error after the configuration is corrected', () => {
    render(<Harness />);

    fireEvent.change(screen.getByTestId('code-editor'), {
      target: { value: '{"sandbox_mode":"read-only",}' },
    });
    expect(setTargetConfigError).toHaveBeenLastCalledWith('Invalid JSON configuration');

    fireEvent.change(screen.getByTestId('code-editor'), {
      target: { value: '{"sandbox_mode":"read-only"}' },
    });

    expect(setTargetConfigError).toHaveBeenLastCalledWith(null);
    const footerNext = within(screen.getByTestId('page-navigation')).getByRole('button', {
      name: /Next/i,
    });
    expect(footerNext).toBeEnabled();
    fireEvent.click(footerNext);
    expect(onNext).toHaveBeenCalledTimes(1);
    expect(state.target.config).toEqual({ sandbox_mode: 'read-only' });
  });
});
