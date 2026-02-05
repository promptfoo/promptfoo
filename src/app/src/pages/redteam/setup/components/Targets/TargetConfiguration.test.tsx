import React from 'react';

import { TooltipProvider } from '@app/components/ui/tooltip';
import { renderWithProviders } from '@app/utils/testutils';
import { fireEvent, queryByRole, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TargetConfiguration from './TargetConfiguration';

import type { ProviderConfigEditorProps } from './ProviderConfigEditor';

vi.mock('@app/hooks/useTelemetry', () => ({
  useTelemetry: () => ({
    recordEvent: vi.fn(),
  }),
}));

const mockUpdateConfig = vi.fn();
const mockUseRedTeamConfig = vi.fn();
vi.mock('../../hooks/useRedTeamConfig', () => ({
  useRedTeamConfig: () => mockUseRedTeamConfig(),
  DEFAULT_HTTP_TARGET: { id: 'http', label: 'Default HTTP Target', config: {} },
}));

const mockValidate = vi.fn();
vi.mock('./ProviderConfigEditor', () => ({
  default: (props: ProviderConfigEditorProps) => {
    // biome-ignore lint/correctness/useExhaustiveDependencies: only need onValidationRequest, not entire props
    React.useEffect(() => {
      props.onValidationRequest?.(mockValidate);
    }, [props.onValidationRequest]);

    // Render different content based on provider type to test that the right configuration is shown
    return (
      <div data-testid="mock-provider-config-editor">
        {props.providerType === 'http' && <div data-testid="http-config">HTTP Configuration</div>}
        {props.providerType === 'websocket' && (
          <div data-testid="websocket-config">WebSocket Configuration</div>
        )}
        {props.providerType === 'openai' && (
          <div data-testid="openai-config">OpenAI Configuration</div>
        )}
        {props.providerType === 'custom' && (
          <div data-testid="custom-config">Custom Configuration</div>
        )}
        <button onClick={() => props.setError && props.setError('Test error')}>
          Trigger Error
        </button>
      </div>
    );
  },
}));

vi.mock('../LoadExampleButton', () => ({
  default: () => <div data-testid="mock-load-example-button" />,
}));

vi.mock('../Prompts', () => ({
  default: () => <div data-testid="mock-prompts" />,
}));

const _AllProviders = ({ children }: { children: React.ReactNode }) => (
  <TooltipProvider>{children}</TooltipProvider>
);

describe('TargetConfiguration', () => {
  let onNextMock: () => void;
  let onBackMock: () => void;

  beforeEach(() => {
    vi.clearAllMocks();
    onNextMock = vi.fn();
    onBackMock = vi.fn();

    mockUseRedTeamConfig.mockReturnValue({
      config: {
        target: { id: 'test-provider', label: 'Test Provider', config: {} },
        extensions: [],
        prompts: [],
      },
      updateConfig: mockUpdateConfig,
      providerType: 'http',
      updatePlugins: vi.fn(),
      setFullConfig: vi.fn(),
      resetConfig: vi.fn(),
    });
  });

  describe('Navigation', () => {
    it("should call onNext when 'Next' is clicked, provider is valid, and there are no validation errors", () => {
      mockValidate.mockReturnValue(true);

      renderWithProviders(<TargetConfiguration onNext={onNextMock} onBack={onBackMock} />);

      const nextButton = screen.getByRole('button', { name: /Next/i });

      expect(nextButton).not.toBeDisabled();

      fireEvent.click(nextButton);

      expect(mockValidate).toHaveBeenCalledTimes(1);
      expect(onNextMock).toHaveBeenCalledTimes(1);
      expect(onBackMock).not.toHaveBeenCalled();
    });

    it("should not call onNext when 'Next' is clicked and provider is invalid", () => {
      mockValidate.mockReturnValue(false);

      mockUseRedTeamConfig.mockReturnValue({
        config: {
          target: { id: '', label: '', config: {} }, // Invalid target without label
          extensions: [],
          prompts: [],
        },
        updateConfig: mockUpdateConfig,
        providerType: 'http',
      });

      renderWithProviders(<TargetConfiguration onNext={onNextMock} onBack={onBackMock} />);

      const nextButton = screen.getByRole('button', { name: /Next/i });
      expect(nextButton).toBeDisabled();
    });

    it("should call onBack when 'Back' is clicked", () => {
      renderWithProviders(<TargetConfiguration onNext={onNextMock} onBack={onBackMock} />);

      const backButton = screen.getByRole('button', { name: /Back/i });
      fireEvent.click(backButton);

      expect(onBackMock).toHaveBeenCalledTimes(1);
      expect(onNextMock).not.toHaveBeenCalled();
    });
  });

  describe('Provider Type Rendering', () => {
    it('should render HTTP configuration when providerType is "http"', () => {
      mockUseRedTeamConfig.mockReturnValue({
        config: {
          target: { id: 'http', label: 'HTTP Target', config: { url: 'https://api.example.com' } },
          extensions: [],
          prompts: [],
        },
        updateConfig: mockUpdateConfig,
        providerType: 'http',
      });

      renderWithProviders(<TargetConfiguration onNext={onNextMock} onBack={onBackMock} />);

      expect(screen.getByTestId('http-config')).toBeInTheDocument();
      expect(screen.getByText('HTTP Configuration')).toBeInTheDocument();
    });

    it('should render WebSocket configuration when providerType is "websocket"', () => {
      mockUseRedTeamConfig.mockReturnValue({
        config: {
          target: {
            id: 'websocket',
            label: 'WebSocket Target',
            config: { url: 'wss://api.example.com' },
          },
          extensions: [],
          prompts: [],
        },
        updateConfig: mockUpdateConfig,
        providerType: 'websocket',
      });

      renderWithProviders(<TargetConfiguration onNext={onNextMock} onBack={onBackMock} />);

      expect(screen.getByTestId('websocket-config')).toBeInTheDocument();
      expect(screen.getByText('WebSocket Configuration')).toBeInTheDocument();
    });

    it('should render OpenAI configuration when providerType is "openai"', () => {
      mockUseRedTeamConfig.mockReturnValue({
        config: {
          target: { id: 'openai:gpt-4', label: 'OpenAI GPT-4', config: {} },
          extensions: [],
          prompts: [],
        },
        updateConfig: mockUpdateConfig,
        providerType: 'openai',
      });

      renderWithProviders(<TargetConfiguration onNext={onNextMock} onBack={onBackMock} />);

      expect(screen.getByTestId('openai-config')).toBeInTheDocument();
      expect(screen.getByText('OpenAI Configuration')).toBeInTheDocument();
    });

    it('should render Custom configuration when providerType is "custom"', () => {
      mockUseRedTeamConfig.mockReturnValue({
        config: {
          target: { id: 'custom-provider', label: 'Custom Provider', config: {} },
          extensions: [],
          prompts: [],
        },
        updateConfig: mockUpdateConfig,
        providerType: 'custom',
      });

      renderWithProviders(<TargetConfiguration onNext={onNextMock} onBack={onBackMock} />);

      expect(screen.getByTestId('custom-config')).toBeInTheDocument();
      expect(screen.getByText('Custom Configuration')).toBeInTheDocument();
    });
  });

  describe('Error Handling', () => {
    it('should display error message when provider configuration has errors', () => {
      mockUseRedTeamConfig.mockReturnValue({
        config: {
          target: { id: 'test-provider', label: 'Test Provider', config: {} },
          extensions: [],
          prompts: [],
        },
        updateConfig: mockUpdateConfig,
        providerType: 'http',
      });

      renderWithProviders(<TargetConfiguration onNext={onNextMock} onBack={onBackMock} />);

      // Trigger error from the provider config editor
      const errorButton = screen.getByText('Trigger Error');
      fireEvent.click(errorButton);

      // Check that error is displayed
      expect(screen.getByText('Test error')).toBeInTheDocument();
    });

    it('should disable Next button when there are validation errors', () => {
      mockValidate.mockReturnValue(false);

      renderWithProviders(<TargetConfiguration onNext={onNextMock} onBack={onBackMock} />);

      // Trigger error from the provider config editor
      const errorButton = screen.getByText('Trigger Error');
      fireEvent.click(errorButton);

      const nextButton = screen.getByRole('button', { name: /Next/i });
      expect(nextButton).toBeDisabled();
    });
  });

  describe('Documentation Links', () => {
    it('should display documentation link for HTTP provider', () => {
      mockUseRedTeamConfig.mockReturnValue({
        config: {
          target: { id: 'http', label: 'HTTP Target', config: {} },
          extensions: [],
          prompts: [],
        },
        updateConfig: mockUpdateConfig,
        providerType: 'http',
      });

      renderWithProviders(<TargetConfiguration onNext={onNextMock} onBack={onBackMock} />);

      const docLink = screen.getByRole('link', { name: /View the documentation/i });
      expect(docLink).toHaveAttribute('href', 'https://www.promptfoo.dev/docs/providers/http');
    });

    it('should display documentation link for OpenAI provider', () => {
      mockUseRedTeamConfig.mockReturnValue({
        config: {
          target: { id: 'openai:gpt-4', label: 'OpenAI GPT-4', config: {} },
          extensions: [],
          prompts: [],
        },
        updateConfig: mockUpdateConfig,
        providerType: 'openai',
      });

      renderWithProviders(<TargetConfiguration onNext={onNextMock} onBack={onBackMock} />);

      const docLink = screen.getByRole('link', { name: /View the documentation/i });
      expect(docLink).toHaveAttribute('href', 'https://www.promptfoo.dev/docs/providers/openai');
    });
  });

  it('should not display the documentation alert when providerType is undefined', () => {
    mockUseRedTeamConfig.mockReturnValue({
      config: {
        target: { id: 'test-provider', label: 'Test Provider', config: {} },
        extensions: [],
        prompts: [],
      },
      updateConfig: mockUpdateConfig,
      providerType: undefined,
    });

    const { container } = renderWithProviders(
      <TargetConfiguration onNext={onNextMock} onBack={onBackMock} />,
    );

    const alert = queryByRole(container, 'alert');
    expect(alert).toBeNull();
  });

  it('should render correctly when providerType is "go"', () => {
    mockUseRedTeamConfig.mockReturnValue({
      config: {
        target: { id: 'test-provider', label: 'Test Provider', config: {} },
        extensions: [],
        prompts: [],
      },
      updateConfig: mockUpdateConfig,
      providerType: 'go',
    });

    renderWithProviders(<TargetConfiguration onNext={onNextMock} onBack={onBackMock} />);

    expect(screen.getByText(/Configure Target:/i)).toBeInTheDocument();
  });
});
