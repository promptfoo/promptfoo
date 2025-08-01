import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { MemoryRouter } from 'react-router-dom';
import { Mock, beforeEach, describe, expect, it, vi } from 'vitest';
import { useApiHealth } from '@app/hooks/useApiHealth';
import { useTelemetry } from '@app/hooks/useTelemetry';
import { DEFAULT_HTTP_TARGET, useRedTeamConfig } from '../hooks/useRedTeamConfig';
import Purpose from './Purpose';

vi.mock('../hooks/useRedTeamConfig');
vi.mock('@app/hooks/useTelemetry');
vi.mock('@app/hooks/useApiHealth');
vi.mock('@app/utils/api', () => ({
  callApi: vi.fn(),
}));

const mockedUseRedTeamConfig = useRedTeamConfig as unknown as Mock;
const mockedUseTelemetry = useTelemetry as unknown as Mock;
const mockedUseApiHealth = useApiHealth as unknown as Mock;

describe('Purpose Component', () => {
  const theme = createTheme();
  const onNext = vi.fn();
  const onBack = vi.fn();

  const renderWithTheme = (component: React.ReactElement) => {
    return render(
      <ThemeProvider theme={theme}>
        <MemoryRouter>{component}</MemoryRouter>
      </ThemeProvider>,
    );
  };

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
      isChecking: false,
    });
  });

  it('should render its content inside PageWrapper and correctly pass onNext and onBack handlers', () => {
    const onNextMock = vi.fn();
    const onBackMock = vi.fn();

    mockedUseRedTeamConfig.mockReturnValue({
      config: {
        applicationDefinition: { purpose: 'A valid purpose to enable the next button' },
        target: DEFAULT_HTTP_TARGET,
      },
      updateApplicationDefinition: vi.fn(),
      updateConfig: vi.fn(),
    });

    renderWithTheme(<Purpose onNext={onNextMock} onBack={onBackMock} />);

    expect(
      screen.getByRole('heading', { name: /Application Details/i, level: 4 }),
    ).toBeInTheDocument();

    expect(screen.getByText(/What is the main purpose of your application?/i)).toBeInTheDocument();

    const backButton = screen.getByRole('button', { name: /Back/i });
    expect(backButton).toBeInTheDocument();
    fireEvent.click(backButton);
    expect(onBackMock).toHaveBeenCalledTimes(1);

    const nextButton = screen.getByRole('button', { name: /Next/i });
    expect(nextButton).toBeInTheDocument();
    expect(nextButton).not.toBeDisabled();
    fireEvent.click(nextButton);
    expect(onNextMock).toHaveBeenCalledTimes(1);
  });

  it('should disable the Next button in PageWrapper when testMode is application and the main purpose field is empty', () => {
    renderWithTheme(<Purpose onNext={vi.fn()} onBack={vi.fn()} />);

    const nextButton = screen.getByRole('button', { name: /Next/i });
    expect(nextButton).toBeInTheDocument();
    expect(nextButton).toBeDisabled();
  });

  it("should display an informational Alert and enable the Next button when testMode is set to 'model'", () => {
    const onNextMock = vi.fn();
    const onBackMock = vi.fn();

    renderWithTheme(<Purpose onNext={onNextMock} onBack={onBackMock} />);

    const modelButton = screen.getByRole('button', { name: /test model/i });
    fireEvent.click(modelButton);

    const alertElement = screen.getByText(
      /When testing a model directly, you don't need to provide application details./i,
    );
    expect(alertElement).toBeInTheDocument();

    const nextButton = screen.getByRole('button', { name: /Next/i });
    expect(nextButton).toBeInTheDocument();
    expect(nextButton).not.toBeDisabled();

    fireEvent.click(nextButton);
    expect(onNextMock).toHaveBeenCalledTimes(1);
  });

  it('should trigger the onBack callback when the back button is clicked', () => {
    const onBackMock = vi.fn();
    const onNextMock = vi.fn();

    renderWithTheme(<Purpose onNext={onNextMock} onBack={onBackMock} />);

    const backButton = screen.getByRole('button', { name: /Back/i });
    fireEvent.click(backButton);

    expect(onBackMock).toHaveBeenCalledTimes(1);
  });

  it('should allow accordion sections to expand and collapse', () => {
    renderWithTheme(<Purpose onNext={vi.fn()} onBack={vi.fn()} />);

    const accordionSummary = screen.getByRole('button', { name: /Core Application Details/i });

    expect(accordionSummary).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(accordionSummary);
    expect(accordionSummary).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(accordionSummary);
    expect(accordionSummary).toHaveAttribute('aria-expanded', 'true');
  });

  it('should render all main sections, navigation buttons, and have a full-width container without a max-width', () => {
    renderWithTheme(<Purpose onNext={onNext} onBack={onBack} />);

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
