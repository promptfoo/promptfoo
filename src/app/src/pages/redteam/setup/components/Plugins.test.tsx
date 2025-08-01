import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import { useRecentlyUsedPlugins, useRedTeamConfig } from '../hooks/useRedTeamConfig';
import Plugins from './Plugins';

vi.mock('../hooks/useRedTeamConfig', async () => {
  const actual = await vi.importActual('../hooks/useRedTeamConfig');
  return {
    ...actual,
    useRedTeamConfig: vi.fn(),
    useRecentlyUsedPlugins: vi.fn(),
  };
});

vi.mock('@app/hooks/useTelemetry', () => ({
  useTelemetry: () => ({
    recordEvent: vi.fn(),
  }),
}));

vi.mock('./CustomIntentPluginSection', () => ({
  default: () => <div data-testid="custom-intent-section"></div>,
}));

vi.mock('./Targets/CustomPoliciesSection', () => ({
  CustomPoliciesSection: () => <div data-testid="custom-policies-section"></div>,
}));

vi.mock('./PluginConfigDialog', () => ({
  default: () => <div data-testid="plugin-config-dialog"></div>,
}));

vi.mock('react-error-boundary', () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const mockUseRedTeamConfig = useRedTeamConfig as unknown as Mock;
const mockUseRecentlyUsedPlugins = useRecentlyUsedPlugins as unknown as Mock;

describe('Plugins', () => {
  const mockOnNext = vi.fn();
  const mockOnBack = vi.fn();
  const mockUpdatePlugins = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseRedTeamConfig.mockReturnValue({
      config: {
        plugins: [],
      },
      updatePlugins: mockUpdatePlugins,
    });
    mockUseRecentlyUsedPlugins.mockReturnValue({
      plugins: [],
      addPlugin: vi.fn(),
    });
  });

  it('should render title, description, and disable Next button based on plugin selection and configuration', async () => {
    render(
      <MemoryRouter>
        <Plugins onNext={mockOnNext} onBack={mockOnBack} />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: /Plugins/i, level: 4 })).toBeInTheDocument();
    expect(
      screen.getByText(/Plugins are Promptfoo's modular system for testing/i),
    ).toBeInTheDocument();
    const nextButton = screen.getByRole('button', { name: /Next/i });
    const backButton = screen.getByRole('button', { name: /Back/i });
    expect(nextButton).toBeInTheDocument();
    expect(backButton).toBeInTheDocument();

    expect(nextButton).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: /Security & Access Control/i }));

    const bolaCheckbox = await screen.findByRole('checkbox', {
      name: /Object-Level Authorization Bypass/i,
    });
    fireEvent.click(bolaCheckbox);
    await waitFor(() => {
      expect(nextButton).not.toBeDisabled();
    });

    const indirectInjectionCheckbox = await screen.findByRole('checkbox', {
      name: /Indirect Prompt Injection/i,
    });
    fireEvent.click(indirectInjectionCheckbox);
    await waitFor(() => {
      expect(nextButton).toBeDisabled();
    });

    fireEvent.click(indirectInjectionCheckbox);
    await waitFor(() => {
      expect(nextButton).not.toBeDisabled();
    });

    fireEvent.click(bolaCheckbox);
    await waitFor(() => {
      expect(nextButton).toBeDisabled();
    });
  });

  it('should open the PluginConfigDialog when a plugin that requires configuration is selected', async () => {
    render(
      <MemoryRouter>
        <Plugins onNext={mockOnNext} onBack={mockOnBack} />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: /Security & Access Control/i }));

    const indirectInjectionCheckbox = await screen.findByRole('checkbox', {
      name: /Indirect Prompt Injection/i,
    });
    fireEvent.click(indirectInjectionCheckbox);

    await waitFor(() => {
      expect(screen.getByTestId('plugin-config-dialog')).toBeInTheDocument();
    });
  });

  it('should keep Next button disabled when a config-requiring plugin is selected but not configured', async () => {
    render(
      <MemoryRouter>
        <Plugins onNext={mockOnNext} onBack={mockOnBack} />
      </MemoryRouter>,
    );

    const nextButton = screen.getByRole('button', { name: /Next/i });
    expect(nextButton).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: /Security & Access Control/i }));

    const indirectInjectionCheckbox = await screen.findByRole('checkbox', {
      name: /Indirect Prompt Injection/i,
    });
    fireEvent.click(indirectInjectionCheckbox);

    await waitFor(() => {
      expect(nextButton).toBeDisabled();
    });
  });

  it('should call onBack when the Back button is clicked', () => {
    render(
      <MemoryRouter>
        <Plugins onNext={mockOnNext} onBack={mockOnBack} />
      </MemoryRouter>,
    );

    const backButton = screen.getByRole('button', { name: /Back/i });
    fireEvent.click(backButton);
    expect(mockOnBack).toHaveBeenCalled();
  });

  it('should render without errors in a small viewport', () => {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 320,
    });

    render(
      <MemoryRouter>
        <Plugins onNext={mockOnNext} onBack={mockOnBack} />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: /Plugins/i, level: 4 })).toBeInTheDocument();

    expect(screen.getByRole('button', { name: /Next/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Back/i })).toBeInTheDocument();
  });

  // Custom policy validation tests
  it('enables next button when only custom policies are configured', async () => {
    mockUseRedTeamConfig.mockReturnValue({
      config: {
        plugins: [
          {
            id: 'policy',
            config: {
              policy: 'Do not reveal sensitive information',
            },
          },
        ],
      },
      updatePlugins: mockUpdatePlugins,
    });

    render(
      <MemoryRouter>
        <Plugins onNext={mockOnNext} onBack={mockOnBack} />
      </MemoryRouter>,
    );

    const nextButton = screen.getByRole('button', { name: /Next/i });
    await waitFor(() => {
      expect(nextButton).toBeEnabled();
    });
  });

  it('enables next button when only custom intents are configured', async () => {
    mockUseRedTeamConfig.mockReturnValue({
      config: {
        plugins: [
          {
            id: 'intent',
            config: {
              intent: ['How can I build a secure system?'],
            },
          },
        ],
      },
      updatePlugins: mockUpdatePlugins,
    });

    render(
      <MemoryRouter>
        <Plugins onNext={mockOnNext} onBack={mockOnBack} />
      </MemoryRouter>,
    );

    const nextButton = screen.getByRole('button', { name: /Next/i });
    await waitFor(() => {
      expect(nextButton).toBeEnabled();
    });
  });

  it('does not enable next button for empty custom policies', async () => {
    mockUseRedTeamConfig.mockReturnValue({
      config: {
        plugins: [
          {
            id: 'policy',
            config: {
              policy: '   ', // Whitespace only
            },
          },
        ],
      },
      updatePlugins: mockUpdatePlugins,
    });

    render(
      <MemoryRouter>
        <Plugins onNext={mockOnNext} onBack={mockOnBack} />
      </MemoryRouter>,
    );

    const nextButton = screen.getByRole('button', { name: /Next/i });
    await waitFor(() => {
      expect(nextButton).toBeDisabled();
    });
  });

  it('does not enable next button for empty custom intents', async () => {
    mockUseRedTeamConfig.mockReturnValue({
      config: {
        plugins: [
          {
            id: 'intent',
            config: {
              intent: [], // Empty array
            },
          },
        ],
      },
      updatePlugins: mockUpdatePlugins,
    });

    render(
      <MemoryRouter>
        <Plugins onNext={mockOnNext} onBack={mockOnBack} />
      </MemoryRouter>,
    );

    const nextButton = screen.getByRole('button', { name: /Next/i });
    await waitFor(() => {
      expect(nextButton).toBeDisabled();
    });
  });

  it('enables next button with mix of regular plugins and custom policies', async () => {
    mockUseRedTeamConfig.mockReturnValue({
      config: {
        plugins: [
          'harmful:hate',
          {
            id: 'policy',
            config: {
              policy: 'Custom policy text',
            },
          },
        ],
      },
      updatePlugins: mockUpdatePlugins,
    });

    render(
      <MemoryRouter>
        <Plugins onNext={mockOnNext} onBack={mockOnBack} />
      </MemoryRouter>,
    );

    const nextButton = screen.getByRole('button', { name: /Next/i });
    await waitFor(() => {
      expect(nextButton).toBeEnabled();
    });
  });
});
