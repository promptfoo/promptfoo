import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Purpose from './Purpose';
import { DEFAULT_HTTP_TARGET } from '../hooks/useRedTeamConfig';

vi.mock('@app/hooks/useTelemetry', () => ({
  useTelemetry: () => ({
    recordEvent: vi.fn(),
  }),
}));

vi.mock('@app/hooks/useApiHealth', () => ({
  useApiHealth: () => ({
    status: 'unknown',
    checkHealth: vi.fn(),
    isChecking: false,
  }),
}));

vi.mock('@app/utils/api', () => ({
  callApi: vi.fn(),
}));

const mockUpdateApplicationDefinition = vi.fn();
const mockUpdateConfig = vi.fn();
const mockUseRedTeamConfig = vi.fn();

vi.mock('../hooks/useRedTeamConfig', () => ({
  useRedTeamConfig: () => mockUseRedTeamConfig(),
  DEFAULT_HTTP_TARGET: { id: 'http' },
}));

describe('Purpose Component', () => {
  const theme = createTheme();

  const renderWithTheme = (component: React.ReactElement) => {
    return render(<ThemeProvider theme={theme}>{component}</ThemeProvider>);
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseRedTeamConfig.mockReturnValue({
      config: {
        applicationDefinition: { purpose: '' },
        target: DEFAULT_HTTP_TARGET,
      },
      updateApplicationDefinition: mockUpdateApplicationDefinition,
      updateConfig: mockUpdateConfig,
    });
  });

  it('should render its content inside PageWrapper and correctly pass onNext and onBack handlers', () => {
    const onNextMock = vi.fn();
    const onBackMock = vi.fn();

    mockUseRedTeamConfig.mockReturnValue({
      config: {
        applicationDefinition: { purpose: 'A valid purpose to enable the next button' },
        target: DEFAULT_HTTP_TARGET,
      },
      updateApplicationDefinition: mockUpdateApplicationDefinition,
      updateConfig: mockUpdateConfig,
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
    mockUseRedTeamConfig.mockReturnValue({
      config: {
        applicationDefinition: { purpose: '' },
        target: DEFAULT_HTTP_TARGET,
      },
      updateApplicationDefinition: mockUpdateApplicationDefinition,
      updateConfig: mockUpdateConfig,
    });

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
});
