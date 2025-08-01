import { useApiHealth } from '@app/hooks/useApiHealth';
import { useTelemetry } from '@app/hooks/useTelemetry';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Mock, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_HTTP_TARGET, useRedTeamConfig } from '../hooks/useRedTeamConfig';
import Purpose from './Purpose';

vi.mock('../hooks/useRedTeamConfig');
vi.mock('@app/hooks/useTelemetry');
vi.mock('@app/hooks/useApiHealth');

const mockedUseRedTeamConfig = useRedTeamConfig as unknown as Mock;
const mockedUseTelemetry = useTelemetry as unknown as Mock;
const mockedUseApiHealth = useApiHealth as unknown as Mock;

describe('Purpose', () => {
  const onNext = vi.fn();
  const onBack = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    mockedUseRedTeamConfig.mockReturnValue({
      config: {
        applicationDefinition: {
          purpose: '',
        },
        target: DEFAULT_HTTP_TARGET,
      },
      updateApplicationDefinition: vi.fn(),
      updateConfig: vi.fn(),
    });

    mockedUseTelemetry.mockReturnValue({
      recordEvent: vi.fn(),
    });

    mockedUseApiHealth.mockReturnValue({
      status: 'unknown',
      checkHealth: vi.fn(),
    });
  });

  it('should render all main sections, navigation buttons, and have a full-width container without a max-width', () => {
    render(
      <MemoryRouter>
        <Purpose onNext={onNext} onBack={onBack} />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole('heading', { name: /Application Details/i, level: 4 }),
    ).toBeInTheDocument();
    expect(screen.getByText(/What is the main purpose of your application/i)).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /Core Application Details/i, level: 6 }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Back/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Next/i })).toBeInTheDocument();

    const toggleButtonGroup = screen.getByRole('group', { name: /test mode/i });
    const mainContainer = toggleButtonGroup.parentElement?.parentElement;

    expect(mainContainer).toBeInTheDocument();
    expect(mainContainer).toHaveStyle('width: 100%');
    expect(mainContainer?.style.maxWidth).toBeFalsy();
  });
});
