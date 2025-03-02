import { vi, describe, it, expect } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import CustomIntentSection, { EXAMPLE_INTENTS, ITEMS_PER_PAGE } from './CustomIntentPluginSection';
import { useRedTeamConfig } from '../hooks/useRedTeamConfig';

vi.mock('../hooks/useRedTeamConfig');

describe('CustomIntentSection', () => {
  const mockUpdatePlugins = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    (useRedTeamConfig as any).mockReturnValue({
      config: {
        plugins: []
      },
      updatePlugins: mockUpdatePlugins
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders empty intent input by default', () => {
    render(<CustomIntentSection />);
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('renders existing intents from config', () => {
    (useRedTeamConfig as any).mockReturnValue({
      config: {
        plugins: [
          {
            id: 'intent',
            config: {
              intent: ['test intent 1', 'test intent 2']
            }
          }
        ]
      },
      updatePlugins: mockUpdatePlugins
    });

    render(<CustomIntentSection />);
    const inputs = screen.getAllByRole('textbox');
    expect(inputs).toHaveLength(2);
    expect(inputs[0]).toHaveValue('test intent 1');
    expect(inputs[1]).toHaveValue('test intent 2');
  });

  it('allows adding new intents', async () => {
    (useRedTeamConfig as any).mockReturnValue({
      config: {
        plugins: [
          {
            id: 'intent',
            config: {
              intent: ['test intent']
            }
          }
        ]
      },
      updatePlugins: mockUpdatePlugins
    });

    render(<CustomIntentSection />);

    const input = screen.getByRole('textbox');
    await act(async () => {
      fireEvent.change(input, { target: { value: 'test intent' } });
    });

    const addButton = screen.getByRole('button', { name: /add prompt/i });
    await act(async () => {
      fireEvent.click(addButton);
    });

    await vi.runAllTimersAsync();

    const inputs = screen.getAllByRole('textbox');
    expect(inputs).toHaveLength(2);
  });

  it('allows removing intents', async () => {
    (useRedTeamConfig as any).mockReturnValue({
      config: {
        plugins: [
          {
            id: 'intent',
            config: {
              intent: ['test intent 1', 'test intent 2']
            }
          }
        ]
      },
      updatePlugins: mockUpdatePlugins
    });

    render(<CustomIntentSection />);

    const deleteButtons = screen.getAllByTestId('DeleteIcon');
    await act(async () => {
      fireEvent.click(deleteButtons[0]);
    });

    await vi.runAllTimersAsync();

    const inputs = screen.getAllByRole('textbox');
    expect(inputs).toHaveLength(1);
  });

  it('handles CSV file upload', async () => {
    const csvContent = new Blob(['prompt\nprompt1\nprompt2'], { type: 'text/csv' });
    const file = new File([csvContent], 'test.csv', { type: 'text/csv' });

    (useRedTeamConfig as any).mockReturnValue({
      config: {
        plugins: [
          {
            id: 'intent',
            config: {
              intent: ['initial intent']
            }
          }
        ]
      },
      updatePlugins: mockUpdatePlugins
    });

    render(<CustomIntentSection />);

    const uploadInput = screen.getByLabelText(/upload csv/i, { selector: 'input' });

    Object.defineProperty(file, 'text', {
      value: () => Promise.resolve('prompt\nprompt1\nprompt2'),
    });

    await act(async () => {
      fireEvent.change(uploadInput, { target: { files: [file] } });
    });

    await vi.runAllTimersAsync();

    const inputs = screen.getAllByRole('textbox');
    expect(inputs[0]).toHaveValue('initial intent');
    expect(inputs[1]).toHaveValue('prompt1');
    expect(inputs[2]).toHaveValue('prompt2');
  });

  it('shows pagination when intents exceed items per page', () => {
    const manyIntents = Array(ITEMS_PER_PAGE + 1).fill('').map((_, i) => `intent ${i}`);

    (useRedTeamConfig as any).mockReturnValue({
      config: {
        plugins: [
          {
            id: 'intent',
            config: {
              intent: manyIntents
            }
          }
        ]
      },
      updatePlugins: mockUpdatePlugins
    });

    render(<CustomIntentSection />);
    expect(screen.getByRole('navigation')).toBeInTheDocument();
  });

  it('updates plugins when intents change', async () => {
    render(<CustomIntentSection />);

    const input = screen.getByRole('textbox');
    await act(async () => {
      fireEvent.change(input, { target: { value: 'new intent' } });
    });

    await vi.runAllTimersAsync();

    expect(mockUpdatePlugins).toHaveBeenCalledWith([{
      id: 'intent',
      config: {
        intent: ['new intent']
      }
    }]);
  });

  it('shows example intents as placeholders', () => {
    render(<CustomIntentSection />);

    const input = screen.getByRole('textbox');
    expect(input).toHaveAttribute('placeholder', EXAMPLE_INTENTS[0]);
  });

  it('disables delete button when only one intent remains', () => {
    (useRedTeamConfig as any).mockReturnValue({
      config: {
        plugins: [
          {
            id: 'intent',
            config: {
              intent: ['test intent']
            }
          }
        ]
      },
      updatePlugins: mockUpdatePlugins
    });

    render(<CustomIntentSection />);
    const deleteButton = screen.getByTestId('DeleteIcon').closest('button');
    expect(deleteButton).toBeDisabled();
  });

  it('disables add button when there are empty intents', () => {
    (useRedTeamConfig as any).mockReturnValue({
      config: {
        plugins: [
          {
            id: 'intent',
            config: {
              intent: ['', 'test intent']
            }
          }
        ]
      },
      updatePlugins: mockUpdatePlugins
    });

    render(<CustomIntentSection />);
    const addButton = screen.getByRole('button', { name: /add prompt/i });
    expect(addButton).toBeDisabled();
  });

  it('handles pagination navigation', async () => {
    const manyIntents = Array(ITEMS_PER_PAGE + 1).fill('').map((_, i) => `intent ${i}`);

    (useRedTeamConfig as any).mockReturnValue({
      config: {
        plugins: [
          {
            id: 'intent',
            config: {
              intent: manyIntents
            }
          }
        ]
      },
      updatePlugins: mockUpdatePlugins
    });

    render(<CustomIntentSection />);

    const nextPageButton = screen.getByRole('button', { name: /go to page 2/i });
    await act(async () => {
      fireEvent.click(nextPageButton);
    });

    await vi.runAllTimersAsync();

    const inputs = screen.getAllByRole('textbox');
    expect(inputs[0]).toHaveValue(`intent ${ITEMS_PER_PAGE}`);
  });
});
