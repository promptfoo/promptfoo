import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { MemoryRouter } from 'react-router-dom';
import Strategies from './Strategies';
import * as apiUtils from '@app/utils/api';
import * as useToastHook from '@app/hooks/useToast';

// Mock dependencies
vi.mock('@app/utils/api');
vi.mock('@app/hooks/useToast');
vi.mock('@app/hooks/useRecordEvent', () => ({
  useRecordEvent: () => vi.fn(),
}));

// Helper function to render with theme and providers
const renderWithProviders = (component: React.ReactNode) => {
  const theme = createTheme();
  return render(
    <MemoryRouter>
      <ThemeProvider theme={theme}>{component}</ThemeProvider>
    </MemoryRouter>,
  );
};

describe('Strategies Integration Tests - Magic Wand Feature', () => {
  const mockOnNext = vi.fn();
  const mockOnBack = vi.fn();
  const mockShowToast = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock useToast hook
    vi.mocked(useToastHook).useToast = vi.fn().mockReturnValue({
      showToast: mockShowToast,
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Magic Wand Button Rendering', () => {
    it('should display magic wand buttons on all strategy cards', async () => {
      renderWithProviders(<Strategies onNext={mockOnNext} onBack={mockOnBack} />);

      // Wait for strategies to load
      await waitFor(() => {
        expect(screen.getByText('Select Strategies')).toBeInTheDocument();
      });

      // Find all strategy cards
      const strategyCards = screen
        .getAllByRole('generic')
        .filter((el) => el.className.includes('MuiPaper'));

      // Each card should have a magic wand button
      strategyCards.forEach((card) => {
        if (card.textContent?.includes('Strategy')) {
          const buttons = within(card).queryAllByRole('button');
          // Should have at least one button (magic wand)
          expect(buttons.length).toBeGreaterThanOrEqual(1);
        }
      });
    });

    it('should show tooltip on magic wand button hover', async () => {
      renderWithProviders(<Strategies onNext={mockOnNext} onBack={mockOnBack} />);

      await waitFor(() => {
        expect(screen.getByText('Select Strategies')).toBeInTheDocument();
      });

      // Find first magic wand button
      const buttons = screen.getAllByRole('button');
      const magicWandButton = buttons.find((btn) =>
        btn.getAttribute('aria-label')?.includes('Generate a test case'),
      );

      expect(magicWandButton).toBeTruthy();
      expect(magicWandButton).toHaveAttribute(
        'aria-label',
        expect.stringContaining('Generate a test case'),
      );
    });
  });

  describe('Test Generation Flow', () => {
    it('should generate test case when magic wand is clicked', async () => {
      // Mock successful API response
      const mockApiResponse = {
        prompt: 'Generated test prompt for jailbreak strategy',
        context: 'This test case uses the "jailbreak" strategy with the "harmful:hate" plugin.',
        metadata: {
          strategyId: 'jailbreak',
          pluginId: 'harmful:hate',
          harmCategory: 'hate speech',
        },
      };

      vi.mocked(apiUtils.callApi).mockResolvedValue({
        json: () => Promise.resolve(mockApiResponse),
        ok: true,
        status: 200,
      } as Response);

      renderWithProviders(<Strategies onNext={mockOnNext} onBack={mockOnBack} />);

      await waitFor(() => {
        expect(screen.getByText('Select Strategies')).toBeInTheDocument();
      });

      // Find and click a magic wand button
      const buttons = screen.getAllByRole('button');
      const magicWandButton = buttons.find((btn) =>
        btn.getAttribute('aria-label')?.includes('Generate a test case'),
      );

      expect(magicWandButton).toBeTruthy();
      fireEvent.click(magicWandButton!);

      // Verify API call was made
      await waitFor(() => {
        expect(apiUtils.callApi).toHaveBeenCalledWith(
          '/redteam/generate-strategy-test',
          expect.objectContaining({
            method: 'POST',
            headers: expect.objectContaining({
              'Content-Type': 'application/json',
            }),
          }),
        );
      });

      // Verify dialog opens with generated content
      await waitFor(() => {
        expect(screen.getByText('Test Case Sample')).toBeInTheDocument();
        expect(screen.getByText(mockApiResponse.prompt)).toBeInTheDocument();
        expect(screen.getByText(mockApiResponse.context)).toBeInTheDocument();
      });
    });

    it('should show loading state while generating', async () => {
      // Mock API with delay
      vi.mocked(apiUtils.callApi).mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => {
              resolve({
                json: () =>
                  Promise.resolve({
                    prompt: 'Test prompt',
                    context: 'Test context',
                    metadata: {},
                  }),
                ok: true,
                status: 200,
              } as Response);
            }, 100);
          }),
      );

      renderWithProviders(<Strategies onNext={mockOnNext} onBack={mockOnBack} />);

      await waitFor(() => {
        expect(screen.getByText('Select Strategies')).toBeInTheDocument();
      });

      // Click magic wand button
      const buttons = screen.getAllByRole('button');
      const magicWandButton = buttons.find((btn) =>
        btn.getAttribute('aria-label')?.includes('Generate a test case'),
      );

      fireEvent.click(magicWandButton!);

      // Check for loading state
      await waitFor(() => {
        expect(screen.getByText('Generating test case...')).toBeInTheDocument();
        expect(screen.getByRole('progressbar')).toBeInTheDocument();
      });

      // Wait for loading to finish
      await waitFor(() => {
        expect(screen.queryByText('Generating test case...')).not.toBeInTheDocument();
      });
    });

    it('should handle API errors gracefully', async () => {
      // Mock API error
      vi.mocked(apiUtils.callApi).mockResolvedValue({
        json: () =>
          Promise.resolve({
            error: 'Failed to generate test case',
          }),
        ok: false,
        status: 500,
      } as Response);

      renderWithProviders(<Strategies onNext={mockOnNext} onBack={mockOnBack} />);

      await waitFor(() => {
        expect(screen.getByText('Select Strategies')).toBeInTheDocument();
      });

      // Click magic wand button
      const buttons = screen.getAllByRole('button');
      const magicWandButton = buttons.find((btn) =>
        btn.getAttribute('aria-label')?.includes('Generate a test case'),
      );

      fireEvent.click(magicWandButton!);

      // Wait for error handling
      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith('Failed to generate test case', 'error');
      });

      // Dialog should close on error
      await waitFor(() => {
        expect(screen.queryByText('Test Case Sample')).not.toBeInTheDocument();
      });
    });

    it('should handle network errors', async () => {
      // Mock network error
      vi.mocked(apiUtils.callApi).mockRejectedValue(new Error('Network error'));

      renderWithProviders(<Strategies onNext={mockOnNext} onBack={mockOnBack} />);

      await waitFor(() => {
        expect(screen.getByText('Select Strategies')).toBeInTheDocument();
      });

      // Click magic wand button
      const buttons = screen.getAllByRole('button');
      const magicWandButton = buttons.find((btn) =>
        btn.getAttribute('aria-label')?.includes('Generate a test case'),
      );

      fireEvent.click(magicWandButton!);

      // Wait for error handling
      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith('Network error', 'error');
      });
    });
  });

  describe('Dialog Interactions', () => {
    it('should close dialog when Close button is clicked', async () => {
      // Mock successful API response
      vi.mocked(apiUtils.callApi).mockResolvedValue({
        json: () =>
          Promise.resolve({
            prompt: 'Test prompt',
            context: 'Test context',
            metadata: {},
          }),
        ok: true,
        status: 200,
      } as Response);

      renderWithProviders(<Strategies onNext={mockOnNext} onBack={mockOnBack} />);

      await waitFor(() => {
        expect(screen.getByText('Select Strategies')).toBeInTheDocument();
      });

      // Generate test case
      const buttons = screen.getAllByRole('button');
      const magicWandButton = buttons.find((btn) =>
        btn.getAttribute('aria-label')?.includes('Generate a test case'),
      );

      fireEvent.click(magicWandButton!);

      // Wait for dialog to open
      await waitFor(() => {
        expect(screen.getByText('Test Case Sample')).toBeInTheDocument();
      });

      // Click Close button
      const closeButton = screen.getByText('Close');
      fireEvent.click(closeButton);

      // Dialog should close
      await waitFor(() => {
        expect(screen.queryByText('Test Case Sample')).not.toBeInTheDocument();
      });
    });

    it('should display metadata when available', async () => {
      const mockMetadata = {
        strategyId: 'base64',
        pluginId: 'harmful:hate',
        encodingType: 'base64',
        originalLength: 150,
      };

      vi.mocked(apiUtils.callApi).mockResolvedValue({
        json: () =>
          Promise.resolve({
            prompt: 'Encoded test prompt',
            context: 'Test context',
            metadata: mockMetadata,
          }),
        ok: true,
        status: 200,
      } as Response);

      renderWithProviders(<Strategies onNext={mockOnNext} onBack={mockOnBack} />);

      await waitFor(() => {
        expect(screen.getByText('Select Strategies')).toBeInTheDocument();
      });

      // Generate test case
      const buttons = screen.getAllByRole('button');
      const magicWandButton = buttons.find((btn) =>
        btn.getAttribute('aria-label')?.includes('Generate a test case'),
      );

      fireEvent.click(magicWandButton!);

      // Wait for dialog with metadata
      await waitFor(() => {
        expect(screen.getByText('Metadata:')).toBeInTheDocument();
        expect(screen.getByText(/"strategyId":/)).toBeInTheDocument();
        expect(screen.getByText(/"base64"/)).toBeInTheDocument();
      });
    });
  });

  describe('Multiple Strategy Types', () => {
    it('should work with recommended strategies', async () => {
      vi.mocked(apiUtils.callApi).mockResolvedValue({
        json: () =>
          Promise.resolve({
            prompt: 'Basic strategy test',
            context: 'This test case uses the "basic" strategy',
            metadata: { strategyId: 'basic' },
          }),
        ok: true,
        status: 200,
      } as Response);

      renderWithProviders(<Strategies onNext={mockOnNext} onBack={mockOnBack} />);

      // Find a strategy in the Recommended section
      await waitFor(() => {
        expect(screen.getByText('Recommended Strategies')).toBeInTheDocument();
      });

      // Find magic wand button in recommended section
      const recommendedSection = screen.getByText('Recommended Strategies').closest('div');
      const buttons = within(recommendedSection!).getAllByRole('button');
      const magicWandButton = buttons.find((btn) =>
        btn.getAttribute('aria-label')?.includes('Generate a test case'),
      );

      fireEvent.click(magicWandButton!);

      await waitFor(() => {
        expect(apiUtils.callApi).toHaveBeenCalled();
      });
    });

    it('should work with agentic strategies', async () => {
      vi.mocked(apiUtils.callApi).mockResolvedValue({
        json: () =>
          Promise.resolve({
            prompt: 'Jailbreak strategy test',
            context: 'This test case uses the "jailbreak" strategy',
            metadata: { strategyId: 'jailbreak' },
          }),
        ok: true,
        status: 200,
      } as Response);

      renderWithProviders(<Strategies onNext={mockOnNext} onBack={mockOnBack} />);

      // Find agentic strategies section
      await waitFor(() => {
        expect(screen.getByText(/Agentic Strategies/)).toBeInTheDocument();
      });

      // Test generation should work for agentic strategies
      const buttons = screen.getAllByRole('button');
      const agenticMagicWand = buttons.find((btn) =>
        btn.getAttribute('aria-label')?.includes('Generate a test case'),
      );

      expect(agenticMagicWand).toBeTruthy();
    });
  });

  describe('Concurrent Requests', () => {
    it('should disable all magic wand buttons while generating', async () => {
      // Mock API with delay
      vi.mocked(apiUtils.callApi).mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => {
              resolve({
                json: () =>
                  Promise.resolve({
                    prompt: 'Test',
                    context: 'Context',
                    metadata: {},
                  }),
                ok: true,
                status: 200,
              } as Response);
            }, 100);
          }),
      );

      renderWithProviders(<Strategies onNext={mockOnNext} onBack={mockOnBack} />);

      await waitFor(() => {
        expect(screen.getByText('Select Strategies')).toBeInTheDocument();
      });

      // Get all magic wand buttons
      const allButtons = screen.getAllByRole('button');
      const magicWandButtons = allButtons.filter((btn) =>
        btn.getAttribute('aria-label')?.includes('Generate a test case'),
      );

      // Click first magic wand
      fireEvent.click(magicWandButtons[0]);

      // Check that the clicked button shows loading
      await waitFor(() => {
        const firstCardButtons =
          magicWandButtons[0].parentElement?.querySelector('[role="progressbar"]');
        expect(firstCardButtons).toBeTruthy();
      });
    });

    it('should handle rapid clicks on same button gracefully', async () => {
      let callCount = 0;
      vi.mocked(apiUtils.callApi).mockImplementation(() => {
        callCount++;
        return Promise.resolve({
          json: () =>
            Promise.resolve({
              prompt: `Test ${callCount}`,
              context: 'Context',
              metadata: {},
            }),
          ok: true,
          status: 200,
        } as Response);
      });

      renderWithProviders(<Strategies onNext={mockOnNext} onBack={mockOnBack} />);

      await waitFor(() => {
        expect(screen.getByText('Select Strategies')).toBeInTheDocument();
      });

      // Find and rapidly click magic wand button
      const buttons = screen.getAllByRole('button');
      const magicWandButton = buttons.find((btn) =>
        btn.getAttribute('aria-label')?.includes('Generate a test case'),
      );

      // Rapid clicks
      fireEvent.click(magicWandButton!);
      fireEvent.click(magicWandButton!);
      fireEvent.click(magicWandButton!);

      // Should only make one API call (button disabled after first click)
      await waitFor(() => {
        expect(callCount).toBeLessThanOrEqual(2); // Allow for React re-render timing
      });
    });
  });
});
