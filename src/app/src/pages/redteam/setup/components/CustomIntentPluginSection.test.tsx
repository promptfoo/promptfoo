import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
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
Object.defineProperty(global.File.prototype, 'text', {
  value: mockReadAsText,
  writable: true,
});

describe('CustomIntentPluginSection', () => {
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
    mockUseRedTeamConfig.mockReturnValue({
      config: defaultConfig,
      updatePlugins: mockUpdatePlugins,
    });
  });

  describe('Initial Rendering', () => {
    it('renders with default empty intent', () => {
      render(<CustomIntentPluginSection />);

      expect(
        screen.getByText(/These prompts are passed directly to your target/),
      ).toBeInTheDocument();
      expect(screen.getByText('Add prompt')).toBeInTheDocument();
      expect(screen.getByText('Upload File')).toBeInTheDocument();
      expect(screen.getByText('Clear All')).toBeInTheDocument();
      expect(screen.getByText('Drop files here or click to upload')).toBeInTheDocument();
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
    it('adds new intent when Add prompt button is clicked', async () => {
      render(<CustomIntentPluginSection />);

      // First fill the empty field to enable the Add button
      const textField = screen.getByRole('textbox');
      fireEvent.change(textField, { target: { value: 'Test intent' } });

      // Wait for the Add button to be enabled
      await waitFor(() => {
        const addButton = screen.getByText('Add prompt');
        expect(addButton).not.toBeDisabled();
      });

      const addButton = screen.getByText('Add prompt');
      fireEvent.click(addButton);

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
      render(<CustomIntentPluginSection />);

      const textField = screen.getByRole('textbox');
      fireEvent.change(textField, { target: { value: 'New intent text' } });

      expect(textField).toHaveValue('New intent text');
    });

    it('removes intent when delete button is clicked', async () => {
      mockUseRedTeamConfig.mockReturnValue({
        config: configWithIntents,
        updatePlugins: mockUpdatePlugins,
      });

      render(<CustomIntentPluginSection />);

      const deleteButtons = screen.getAllByTestId('DeleteIcon');
      expect(deleteButtons).toHaveLength(3);

      fireEvent.click(deleteButtons[0]);

      // Should have 2 text fields after deletion
      await waitFor(() => {
        const textFields = screen.getAllByRole('textbox');
        expect(textFields).toHaveLength(2);
      });
    });

    it('disables Add prompt button when empty intents exist', () => {
      render(<CustomIntentPluginSection />);

      const addButton = screen.getByText('Add prompt');
      expect(addButton).toBeDisabled();
    });
  });

  describe('Clear All Functionality', () => {
    it('shows confirmation dialog when Clear All is clicked', () => {
      mockUseRedTeamConfig.mockReturnValue({
        config: configWithIntents,
        updatePlugins: mockUpdatePlugins,
      });

      render(<CustomIntentPluginSection />);

      const clearAllButton = screen.getByText('Clear All');
      fireEvent.click(clearAllButton);

      expect(screen.getByText('Clear All Intents')).toBeInTheDocument();
      expect(
        screen.getByText(
          'Are you sure you want to clear all intents? This action cannot be undone.',
        ),
      ).toBeInTheDocument();
    });

    it('clears all intents when confirmed', async () => {
      mockUseRedTeamConfig.mockReturnValue({
        config: configWithIntents,
        updatePlugins: mockUpdatePlugins,
      });

      render(<CustomIntentPluginSection />);

      const clearAllButton = screen.getByText('Clear All');
      fireEvent.click(clearAllButton);

      const confirmButton = screen.getByRole('button', { name: 'Clear All' });
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(screen.queryByText('Clear All Intents')).not.toBeInTheDocument();
      });
    });

    it('cancels clear operation when Cancel is clicked', async () => {
      mockUseRedTeamConfig.mockReturnValue({
        config: configWithIntents,
        updatePlugins: mockUpdatePlugins,
      });

      render(<CustomIntentPluginSection />);

      const clearAllButton = screen.getByText('Clear All');
      fireEvent.click(clearAllButton);

      const cancelButton = screen.getByText('Cancel');
      fireEvent.click(cancelButton);

      await waitFor(() => {
        expect(screen.queryByText('Clear All Intents')).not.toBeInTheDocument();
      });
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
      expect(dropZone).toHaveClass('MuiPaper-root');
      expect(screen.getByTestId('CloudUploadIcon')).toBeInTheDocument();
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

      // Should show pagination component
      expect(screen.getByRole('navigation')).toBeInTheDocument();

      // Should show only 10 items per page
      const textFields = screen.getAllByRole('textbox');
      expect(textFields).toHaveLength(10);
    });
  });

  describe('Error Handling', () => {
    it('shows tooltip with file format information', () => {
      render(<CustomIntentPluginSection />);

      const infoIcon = screen.getByTestId('InfoIcon');
      expect(infoIcon).toBeInTheDocument();
    });
  });

  describe('Plugin Configuration Updates', () => {
    it('calls updatePlugins when intents are modified', async () => {
      render(<CustomIntentPluginSection />);

      const textField = screen.getByRole('textbox');
      fireEvent.change(textField, { target: { value: 'New intent' } });

      // Wait for debounced update
      await waitFor(
        () => {
          expect(mockUpdatePlugins).toHaveBeenCalled();
        },
        { timeout: 2000 },
      );
    });

    it('shows clear all confirmation dialog', async () => {
      mockUseRedTeamConfig.mockReturnValue({
        config: configWithIntents,
        updatePlugins: mockUpdatePlugins,
      });

      render(<CustomIntentPluginSection />);

      // Clear all intents
      const clearAllButton = screen.getByText('Clear All');
      fireEvent.click(clearAllButton);

      // Should show dialog
      expect(screen.getByText('Clear All Intents')).toBeInTheDocument();
      expect(
        screen.getByText(
          'Are you sure you want to clear all intents? This action cannot be undone.',
        ),
      ).toBeInTheDocument();

      const confirmButton = screen.getByRole('button', { name: 'Clear All' });
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(screen.queryByText('Clear All Intents')).not.toBeInTheDocument();
      });
    });
  });
});
