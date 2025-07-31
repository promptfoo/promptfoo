import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Plugins from './Plugins';
import { useRecentlyUsedPlugins, useRedTeamConfig } from '../hooks/useRedTeamConfig';
import { useTelemetry } from '@app/hooks/useTelemetry';

// Mock dependencies
vi.mock('../hooks/useRedTeamConfig');
vi.mock('@app/hooks/useTelemetry');
vi.mock('./CustomIntentPluginSection', () => ({
  default: () => <div>CustomIntentSection</div>,
}));
vi.mock('./PluginConfigDialog', () => ({
  default: () => <div>PluginConfigDialog</div>,
}));
vi.mock('./PresetCard', () => ({
  default: ({ name, onClick, isSelected }: any) => (
    <div onClick={onClick} data-testid={`preset-${name}`} data-selected={isSelected}>
      {name}
    </div>
  ),
}));
vi.mock('./Targets/CustomPoliciesSection', () => ({
  CustomPoliciesSection: () => <div>CustomPoliciesSection</div>,
}));

describe('Plugins', () => {
  const mockOnNext = vi.fn();
  const mockOnBack = vi.fn();
  const mockUpdatePlugins = vi.fn();
  const mockRecordEvent = vi.fn();
  const mockAddPlugin = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(useRedTeamConfig).mockReturnValue({
      config: { plugins: [] },
      updatePlugins: mockUpdatePlugins,
      updateConfig: vi.fn(),
    } as any);

    vi.mocked(useRecentlyUsedPlugins).mockReturnValue({
      plugins: [],
      addPlugin: mockAddPlugin,
    });

    vi.mocked(useTelemetry).mockReturnValue({
      recordEvent: mockRecordEvent,
      identifyUser: vi.fn(),
      isInitialized: true,
    });
  });

  describe('Basic Rendering', () => {
    it('renders with all major UI elements', () => {
      render(
        <MemoryRouter>
          <Plugins onNext={mockOnNext} onBack={mockOnBack} />
        </MemoryRouter>,
      );

      expect(screen.getByText('Plugin Configuration')).toBeInTheDocument();
      expect(screen.getByText('Available presets')).toBeInTheDocument();
      expect(screen.getByLabelText('Filter Plugins')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /back/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /next/i })).toBeInTheDocument();
    });
  });

  describe('Navigation Button State', () => {
    it('disables next button when no plugins are selected', () => {
      render(
        <MemoryRouter>
          <Plugins onNext={mockOnNext} onBack={mockOnBack} />
        </MemoryRouter>,
      );

      const nextButton = screen.getByRole('button', { name: /next/i });
      expect(nextButton).toBeDisabled();
      expect(
        screen.getByText(
          'Select at least one plugin, add custom policies, or create custom prompts to continue.',
        ),
      ).toBeInTheDocument();
    });

    it('enables next button when only custom policies are configured', () => {
      vi.mocked(useRedTeamConfig).mockReturnValue({
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
        updateConfig: vi.fn(),
      } as any);

      render(
        <MemoryRouter>
          <Plugins onNext={mockOnNext} onBack={mockOnBack} />
        </MemoryRouter>,
      );

      const nextButton = screen.getByRole('button', { name: /next/i });
      expect(nextButton).toBeEnabled();
      expect(
        screen.queryByText(
          'Select at least one plugin, add custom policies, or create custom prompts to continue.',
        ),
      ).not.toBeInTheDocument();
    });

    it('enables next button when only custom intents are configured', () => {
      vi.mocked(useRedTeamConfig).mockReturnValue({
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
        updateConfig: vi.fn(),
      } as any);

      render(
        <MemoryRouter>
          <Plugins onNext={mockOnNext} onBack={mockOnBack} />
        </MemoryRouter>,
      );

      const nextButton = screen.getByRole('button', { name: /next/i });
      expect(nextButton).toBeEnabled();
    });

    it('does not enable next button for empty custom policies', () => {
      vi.mocked(useRedTeamConfig).mockReturnValue({
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
        updateConfig: vi.fn(),
      } as any);

      render(
        <MemoryRouter>
          <Plugins onNext={mockOnNext} onBack={mockOnBack} />
        </MemoryRouter>,
      );

      const nextButton = screen.getByRole('button', { name: /next/i });
      expect(nextButton).toBeDisabled();
      expect(
        screen.getByText(
          'Select at least one plugin, add custom policies, or create custom prompts to continue.',
        ),
      ).toBeInTheDocument();
    });

    it('does not enable next button for empty custom intents', () => {
      vi.mocked(useRedTeamConfig).mockReturnValue({
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
        updateConfig: vi.fn(),
      } as any);

      render(
        <MemoryRouter>
          <Plugins onNext={mockOnNext} onBack={mockOnBack} />
        </MemoryRouter>,
      );

      const nextButton = screen.getByRole('button', { name: /next/i });
      expect(nextButton).toBeDisabled();
    });

    it('enables next button with mix of regular plugins and custom policies', () => {
      vi.mocked(useRedTeamConfig).mockReturnValue({
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
        updateConfig: vi.fn(),
      } as any);

      render(
        <MemoryRouter>
          <Plugins onNext={mockOnNext} onBack={mockOnBack} />
        </MemoryRouter>,
      );

      const nextButton = screen.getByRole('button', { name: /next/i });
      expect(nextButton).toBeEnabled();
    });
  });

  describe('Navigation Actions', () => {
    it('calls onBack when back button is clicked', () => {
      render(
        <MemoryRouter>
          <Plugins onNext={mockOnNext} onBack={mockOnBack} />
        </MemoryRouter>,
      );

      fireEvent.click(screen.getByRole('button', { name: /back/i }));
      expect(mockOnBack).toHaveBeenCalled();
    });

    it('calls onNext when next button is clicked and plugins are configured', () => {
      vi.mocked(useRedTeamConfig).mockReturnValue({
        config: {
          plugins: [
            {
              id: 'policy',
              config: {
                policy: 'Test policy',
              },
            },
          ],
        },
        updatePlugins: mockUpdatePlugins,
        updateConfig: vi.fn(),
      } as any);

      render(
        <MemoryRouter>
          <Plugins onNext={mockOnNext} onBack={mockOnBack} />
        </MemoryRouter>,
      );

      const nextButton = screen.getByRole('button', { name: /next/i });
      fireEvent.click(nextButton);
      expect(mockOnNext).toHaveBeenCalled();
    });
  });

  describe('Page View Tracking', () => {
    it('records page view event on mount', () => {
      render(
        <MemoryRouter>
          <Plugins onNext={mockOnNext} onBack={mockOnBack} />
        </MemoryRouter>,
      );

      expect(mockRecordEvent).toHaveBeenCalledWith('webui_page_view', {
        page: 'redteam_config_plugins',
      });
    });
  });
});
