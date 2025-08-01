import React from 'react';

import { ToastProvider } from '@app/contexts/ToastContext';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
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

vi.mock('@promptfoo/redteam/constants', () => ({
  riskCategories: {
    'Security & Access Control': ['bola', 'indirect-prompt-injection', 'rbac'],
    'Harmful Content': ['harmful:hate', 'harmful:self-harm'],
    'Privacy & Data Protection': ['pii', 'pii:direct'],
  },
  categoryAliases: {
    bola: 'Object-Level Authorization Bypass',
    'indirect-prompt-injection': 'Indirect Prompt Injection',
    rbac: 'Role-Based Access Control',
    'harmful:hate': 'Hate Speech',
    'harmful:self-harm': 'Self-Harm',
    pii: 'PII Protection Suite',
    'pii:direct': 'PII via Direct Exposure',
  },
  displayNameOverrides: {
    bola: 'Object-Level Authorization Bypass',
    'indirect-prompt-injection': 'Indirect Prompt Injection',
    rbac: 'Role-Based Access Control',
    'harmful:hate': 'Hate Speech',
    'harmful:self-harm': 'Self-Harm',
    pii: 'PII Protection Suite',
    'pii:direct': 'PII via Direct Exposure',
  },
  subCategoryDescriptions: {
    bola: 'Tests for object-level authorization bypass vulnerabilities',
    'indirect-prompt-injection': 'Tests for indirect prompt injection attacks',
    rbac: 'Tests for role-based access control vulnerabilities',
    'harmful:hate': 'Tests for hate speech content',
    'harmful:self-harm': 'Tests for self-harm content',
    pii: 'Tests for personally identifiable information leakage',
    'pii:direct': 'Tests for direct PII exposure',
  },
  DEFAULT_PLUGINS: new Set(['bola', 'harmful:hate']),
  FOUNDATION_PLUGINS: ['bola'],
  GUARDRAILS_EVALUATION_PLUGINS: ['harmful:hate'],
  HARM_PLUGINS: { 'harmful:hate': 'hate', 'harmful:self-harm': 'self-harm' },
  NIST_AI_RMF_MAPPING: {},
  OWASP_LLM_TOP_10_MAPPING: {},
  OWASP_LLM_RED_TEAM_MAPPING: {},
  OWASP_API_TOP_10_MAPPING: {},
  MITRE_ATLAS_MAPPING: {},
  EU_AI_ACT_MAPPING: {},
  PLUGIN_PRESET_DESCRIPTIONS: {
    Recommended: 'A broad set of plugins recommended by Promptfoo',
    'Minimal Test': 'Minimal set of plugins to validate your setup',
    RAG: 'Recommended plugins plus tests for RAG-specific scenarios',
    Foundation: 'Foundation plugins',
    'Guardrails Evaluation': 'Guardrails evaluation plugins',
    Harmful: 'Harmful content plugins',
    NIST: 'NIST framework plugins',
    'OWASP LLM Top 10': 'OWASP LLM Top 10 plugins',
    'OWASP Gen AI Red Team': 'OWASP Gen AI Red Team plugins',
    'OWASP API Top 10': 'OWASP API Top 10 plugins',
    MITRE: 'MITRE ATLAS plugins',
    'EU AI Act': 'EU AI Act plugins',
  },
  AGENTIC_EXEMPT_PLUGINS: [],
  DATASET_EXEMPT_PLUGINS: [],
  PLUGINS_REQUIRING_CONFIG: ['indirect-prompt-injection'],
  REDTEAM_DEFAULTS: {
    MAX_CONCURRENCY: 4,
    NUM_TESTS: 10,
  },
}));

const mockUseRedTeamConfig = useRedTeamConfig as unknown as Mock;
const mockUseRecentlyUsedPlugins = useRecentlyUsedPlugins as unknown as Mock;

// Helper function for rendering with providers
const renderWithProviders = (ui: React.ReactNode) => {
  return render(
    <MemoryRouter>
      <ToastProvider>{ui}</ToastProvider>
    </MemoryRouter>,
  );
};

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
    renderWithProviders(<Plugins onNext={mockOnNext} onBack={mockOnBack} />);

    expect(screen.getByRole('heading', { name: /Plugins/i, level: 4 })).toBeInTheDocument();
    expect(
      screen.getByText(/Plugins are Promptfoo's modular system for testing/i),
    ).toBeInTheDocument();

    const nextButton = screen.getByRole('button', { name: /Next/i });
    const backButton = screen.getByRole('button', { name: /Back/i });
    expect(nextButton).toBeInTheDocument();
    expect(backButton).toBeInTheDocument();

    // Next button should be disabled initially (no plugins selected)
    expect(nextButton).toBeDisabled();
  });

  it('should render presets section', async () => {
    renderWithProviders(<Plugins onNext={mockOnNext} onBack={mockOnBack} />);

    expect(screen.getByText('Presets')).toBeInTheDocument();
    expect(screen.getByText('Recommended')).toBeInTheDocument();
    expect(screen.getByText('Minimal Test')).toBeInTheDocument();
  });

  it('should render custom configuration sections', async () => {
    renderWithProviders(<Plugins onNext={mockOnNext} onBack={mockOnBack} />);

    expect(screen.getByText('Custom Configurations')).toBeInTheDocument();
    expect(screen.getByText(/Custom Prompts/)).toBeInTheDocument();
    expect(screen.getByText(/Custom Policies/)).toBeInTheDocument();
  });

  it('should call onBack when the Back button is clicked', () => {
    renderWithProviders(<Plugins onNext={mockOnNext} onBack={mockOnBack} />);

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

    renderWithProviders(<Plugins onNext={mockOnNext} onBack={mockOnBack} />);

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

    renderWithProviders(<Plugins onNext={mockOnNext} onBack={mockOnBack} />);

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

    renderWithProviders(<Plugins onNext={mockOnNext} onBack={mockOnBack} />);

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

    renderWithProviders(<Plugins onNext={mockOnNext} onBack={mockOnBack} />);

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

    renderWithProviders(<Plugins onNext={mockOnNext} onBack={mockOnBack} />);

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

    renderWithProviders(<Plugins onNext={mockOnNext} onBack={mockOnBack} />);

    const nextButton = screen.getByRole('button', { name: /Next/i });
    await waitFor(() => {
      expect(nextButton).toBeEnabled();
    });
  });
});
