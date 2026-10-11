import { mockBrowserProperty } from '@app/tests/browserMocks';
import { restoreTestTimers, useTestTimers } from '@app/tests/timers';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CustomIntentPluginSection from './CustomIntentPluginSection';

// Mock the CSV parser
vi.mock('csv-parse/browser/esm/sync', () => ({
  parse: vi.fn(),
}));

// Mock the useRedTeamConfig hook
const mockUpdatePlugins = vi.fn();
const mockUseRedTeamConfig = vi.fn();

vi.mock('../hooks/useRedTeamConfig', () => ({
  useRedTeamConfig: () => mockUseRedTeamConfig(),
}));

// Mock file reading
const mockReadAsText = vi.fn();

describe('CustomIntentPluginSection', () => {
  afterEach(() => {
    restoreTestTimers();
    vi.restoreAllMocks();
  });

  const defaultConfig = {
    plugins: [],
    updatePlugins: mockUpdatePlugins,
  };

  const configWithIntents = {
    plugins: [
      {
        id: 'intent',
        config: {
          intent: ['Intent 1', 'Intent 2', 'Intent 3'],
        },
      },
    ],
    updatePlugins: mockUpdatePlugins,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockBrowserProperty(global.File.prototype, 'text', mockReadAsText);
    mockUseRedTeamConfig.mockReturnValue({
      config: defaultConfig,
      updatePlugins: mockUpdatePlugins,
    });
  });

  describe('Initial Rendering', () => {
    it('renders with default empty intent', () => {
      render(<CustomIntentPluginSection />);

      // Check for drag & drop zone
      expect(screen.getByText('Drop files here or click to upload')).toBeInTheDocument();
      expect(screen.getByText('Supports .csv and .json files')).toBeInTheDocument();

      // Check for action buttons
      expect(screen.getByText('Add Intent')).toBeInTheDocument();
      expect(screen.getByText('Upload File')).toBeInTheDocument();
      expect(screen.getByText('Clear All')).toBeInTheDocument();

      // Check for at least one text field (the empty intent)
      expect(screen.getByRole('textbox')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Remove intent 1' })).toBeDisabled();
    });

    it('renders with existing intents', () => {
      mockUseRedTeamConfig.mockReturnValue({
        config: configWithIntents,
        updatePlugins: mockUpdatePlugins,
      });

      render(<CustomIntentPluginSection />);

      const textFields = screen.getAllByRole('textbox');
      expect(textFields).toHaveLength(3);
    });

    it('disables Clear All button when only empty intent exists', () => {
      render(<CustomIntentPluginSection />);

      const clearAllButton = screen.getByText('Clear All');
      expect(clearAllButton).toBeDisabled();
    });
  });

  describe('Intent Management', () => {
    it('adds new intent when add button is clicked', async () => {
      const user = userEvent.setup();
      render(<CustomIntentPluginSection />);

      // First fill the empty field to enable the Add button
      const textField = screen.getByRole('textbox');
      await user.click(textField);
      await user.keyboard('{Control>}a{/Control}');
      await user.paste('Test intent');

      // Wait for the Add button to be enabled
      await waitFor(() => {
        const addButton = screen.getByText('Add Intent');
        expect(addButton).not.toBeDisabled();
      });

      const addButton = screen.getByText('Add Intent');
      await user.click(addButton);

      // Should have 2 text fields now (with longer timeout for state update)
      await waitFor(
        () => {
          const textFields = screen.getAllByRole('textbox');
          expect(textFields).toHaveLength(2);
        },
        { timeout: 3000 },
      );
    });

    it('updates intent text when typing', async () => {
      const user = userEvent.setup();
      render(<CustomIntentPluginSection />);

      const textField = screen.getByRole('textbox');
      await user.click(textField);
      await user.keyboard('{Control>}a{/Control}');
      await user.paste('New intent text');

      expect(textField).toHaveValue('New intent text');
    });

    it('removes intent when delete button is clicked', async () => {
      const user = userEvent.setup();
      mockUseRedTeamConfig.mockReturnValue({
        config: configWithIntents,
        updatePlugins: mockUpdatePlugins,
      });

      render(<CustomIntentPluginSection />);

      const deleteButtons = screen.getAllByRole('button', { name: /^Remove intent \d+$/ });
      expect(deleteButtons).toHaveLength(3);
      expect(screen.getByRole('button', { name: 'Remove intent 1' })).toBeInTheDocument();

      await user.click(deleteButtons[0]);

      await waitFor(() => {
        const textFields = screen.getAllByRole('textbox');
        expect(textFields).toHaveLength(2);
        expect(textFields[0]).toHaveValue('Intent 2');
        expect(textFields[1]).toHaveValue('Intent 3');
      });
    });

    it('disables Add button when empty intents exist', () => {
      render(<CustomIntentPluginSection />);

      const addButton = screen.getByText('Add Intent');
      expect(addButton).toBeDisabled();
    });
  });

  describe('Clear All Functionality', () => {
    it('shows confirmation dialog when Clear All is clicked', async () => {
      const user = userEvent.setup();
      mockUseRedTeamConfig.mockReturnValue({
        config: configWithIntents,
        updatePlugins: mockUpdatePlugins,
      });

      render(<CustomIntentPluginSection />);

      const clearAllButton = screen.getByText('Clear All');
      await user.click(clearAllButton);

      expect(screen.getByText('Clear All Intents')).toBeInTheDocument();
      expect(
        screen.getByText(
          'Are you sure you want to clear all intents? This action cannot be undone.',
        ),
      ).toBeInTheDocument();
    });

    it('clears saved intents when confirmed and preserves other plugins', async () => {
      const timers = useTestTimers();
      const user = userEvent.setup({ advanceTimers: timers.advanceBy });
      mockUseRedTeamConfig.mockReturnValue({
        config: { plugins: [...configWithIntents.plugins, 'harmful:hate'] },
        updatePlugins: mockUpdatePlugins,
      });
      render(<CustomIntentPluginSection />);
      for (const getButton of [
        () => screen.getByText('Clear All'),
        () => screen.getByRole('button', { name: 'Clear All' }),
      ]) {
        await act(async () => {
          const click = user.click(getButton());
          await timers.advanceByAsync(0);
          await click;
        });
      }
      expect(screen.queryByText('Clear All Intents')).not.toBeInTheDocument();
      expect(screen.getAllByRole('textbox')).toHaveLength(1);
      expect(screen.getByRole('textbox')).toHaveValue('');
      await act(async () => {
        await timers.advanceByAsync(1000);
      });
      expect(mockUpdatePlugins).toHaveBeenCalledExactlyOnceWith(['harmful:hate']);
    });

    it('preserves all intents without updating plugins when canceled', async () => {
      const user = userEvent.setup();
      mockUseRedTeamConfig.mockReturnValue({
        config: configWithIntents,
        updatePlugins: mockUpdatePlugins,
      });
      render(<CustomIntentPluginSection />);
      await user.click(screen.getByText('Clear All'));
      await user.click(screen.getByText('Cancel'));
      expect(screen.queryByText('Clear All Intents')).not.toBeInTheDocument();
      expect(
        screen.getAllByRole('textbox').map((input) => (input as HTMLInputElement).value),
      ).toEqual(['Intent 1', 'Intent 2', 'Intent 3']);
      expect(mockUpdatePlugins).not.toHaveBeenCalled();
    });
  });

  describe('File Upload', () => {
    it('shows upload drop zone', () => {
      render(<CustomIntentPluginSection />);

      expect(screen.getByText('Drop files here or click to upload')).toBeInTheDocument();
      expect(screen.getByText('Supports .csv and .json files')).toBeInTheDocument();
      expect(screen.getByText('Upload File')).toBeInTheDocument();
    });

    it('has file input with correct attributes', () => {
      render(<CustomIntentPluginSection />);

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      expect(fileInput).toBeInTheDocument();
      expect(fileInput).toHaveAttribute('accept', '.csv,.json');
      expect(fileInput).toHaveAttribute('hidden');
    });
  });

  describe('Drag and Drop', () => {
    it('shows drop zone with correct styling', () => {
      render(<CustomIntentPluginSection />);

      const dropZone = screen.getByText('Drop files here or click to upload').closest('div')!;
      // Check for Tailwind classes instead of MUI classes
      expect(dropZone).toHaveClass('border-dashed');
      // Lucide cloud upload icon should be present
      const cloudIcon = document.querySelector('svg.lucide-cloud-upload');
      expect(cloudIcon).toBeInTheDocument();
    });
  });

  describe('Multi-step Intent Display', () => {
    it('displays array intents as read-only with arrow separators', () => {
      const configWithArrayIntents = {
        plugins: [
          {
            id: 'intent',
            config: {
              intent: ['Single intent', ['step1', 'step2', 'step3']],
            },
          },
        ],
        updatePlugins: mockUpdatePlugins,
      };

      mockUseRedTeamConfig.mockReturnValue({
        config: configWithArrayIntents,
        updatePlugins: mockUpdatePlugins,
      });

      render(<CustomIntentPluginSection />);

      const textFields = screen.getAllByRole('textbox');
      expect(textFields[0]).toHaveValue('Single intent');
      expect(textFields[0]).not.toBeDisabled();

      expect(textFields[1]).toHaveValue('step1 → step2 → step3');
      expect(textFields[1]).toBeDisabled();
      expect(screen.getByText('Multi-step intent (read-only)')).toBeInTheDocument();
    });
  });

  describe('Pagination', () => {
    it('shows pagination when there are many intents', () => {
      const manyIntents = Array.from({ length: 25 }, (_, i) => `Intent ${i + 1}`);
      const configWithManyIntents = {
        plugins: [
          {
            id: 'intent',
            config: {
              intent: manyIntents,
            },
          },
        ],
        updatePlugins: mockUpdatePlugins,
      };

      mockUseRedTeamConfig.mockReturnValue({
        config: configWithManyIntents,
        updatePlugins: mockUpdatePlugins,
      });

      render(<CustomIntentPluginSection />);

      // Should show pagination controls (Previous/Next buttons and page text)
      expect(screen.getByText(/Page 1 of/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Previous' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Next' })).toBeInTheDocument();

      // Should show only 10 items per page
      const textFields = screen.getAllByRole('textbox');
      expect(textFields).toHaveLength(10);
    });
  });

  describe('Error Handling', () => {
    it('shows file format information in the upload zone', () => {
      render(<CustomIntentPluginSection />);

      // File format info is now displayed directly in the drop zone
      expect(screen.getByText('Supports .csv and .json files')).toBeInTheDocument();
      expect(screen.getByText('CSV')).toBeInTheDocument();
      expect(screen.getByText('JSON')).toBeInTheDocument();
    });
  });

  describe('Plugin Configuration Updates', () => {
    it('calls updatePlugins when intents are modified', async () => {
      const user = userEvent.setup();
      const setTimeoutSpy = vi.spyOn(global, 'setTimeout');
      render(<CustomIntentPluginSection />);

      try {
        const textField = screen.getByRole('textbox');
        await user.click(textField);
        await user.keyboard('{Control>}a{/Control}');
        await user.paste('New intent');

        const runLatestTimerCallback = async (delay: number) => {
          let callback: unknown;
          for (let index = setTimeoutSpy.mock.calls.length - 1; index >= 0; index--) {
            const [timerCallback, timerDelay] = setTimeoutSpy.mock.calls[index];
            if (timerDelay === delay) {
              callback = timerCallback;
              break;
            }
          }

          if (typeof callback === 'function') {
            await act(async () => {
              callback();
            });
          }
        };

        await runLatestTimerCallback(50);
        await runLatestTimerCallback(1000);

        await waitFor(() => {
          expect(mockUpdatePlugins).toHaveBeenCalledTimes(1);
        });
      } finally {
        setTimeoutSpy.mockRestore();
      }
    });
  });
});
