import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RunOptionsSection } from './RunOptionsSection';

vi.mock('./RunTestSuiteButton', () => ({
  default: () => <div data-testid="run-test-suite-button">Run Test Suite Button</div>,
}));

describe('RunOptionsSection', () => {
  const mockOnChange = vi.fn();

  function ControlledRunOptionsSection() {
    const [options, setOptions] = useState<{
      description?: string;
      delay?: number;
      maxConcurrency?: number;
    }>({});

    return <RunOptionsSection {...options} onChange={setOptions} />;
  }

  beforeEach(() => {
    mockOnChange.mockClear();
  });

  describe('Description field', () => {
    it('renders description input with correct label and placeholder', () => {
      render(<RunOptionsSection onChange={mockOnChange} />);

      expect(screen.getByLabelText('Evaluation name or description')).toBeInTheDocument();
      expect(
        screen.getByPlaceholderText(
          'e.g., GPT-4 vs Claude comparison for customer support prompts',
        ),
      ).toBeInTheDocument();
      expect(
        screen.getByText('Optional. Helps you find this evaluation later.'),
      ).toBeInTheDocument();
    });

    it('displays existing description value', () => {
      render(<RunOptionsSection description="My test evaluation" onChange={mockOnChange} />);

      expect(screen.getByDisplayValue('My test evaluation')).toBeInTheDocument();
    });

    it('calls onChange when description is updated', async () => {
      const user = userEvent.setup();
      render(<RunOptionsSection onChange={mockOnChange} />);

      const input = screen.getByLabelText('Evaluation name or description');
      await user.type(input, 't');

      expect(mockOnChange).toHaveBeenCalledWith({
        description: 't',
        delay: undefined,
        maxConcurrency: undefined,
      });
    });

    it('preserves delay and maxConcurrency when updating description', async () => {
      const user = userEvent.setup();
      render(
        <RunOptionsSection description="" delay={100} maxConcurrency={1} onChange={mockOnChange} />,
      );

      const input = screen.getByLabelText('Evaluation name or description');
      await user.type(input, 't');

      expect(mockOnChange).toHaveBeenCalledWith({
        description: 't',
        delay: 100,
        maxConcurrency: 1,
      });
    });
  });

  describe('Delay field', () => {
    it('renders delay input with correct label and placeholder', () => {
      render(<RunOptionsSection onChange={mockOnChange} />);

      expect(screen.getByLabelText('Delay between API calls (ms)')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('0')).toBeInTheDocument();
      expect(
        screen.getByText('Add a delay between API calls to avoid rate limits'),
      ).toBeInTheDocument();
    });

    it('displays existing delay value', () => {
      render(<RunOptionsSection delay={500} onChange={mockOnChange} />);

      const input = screen.getByLabelText('Delay between API calls (ms)');
      expect(input).toHaveValue(500);
    });

    it('is enabled when maxConcurrency is not set', () => {
      render(<RunOptionsSection onChange={mockOnChange} />);

      const input = screen.getByLabelText('Delay between API calls (ms)');
      expect(input).not.toBeDisabled();

      const label = screen.getByText('Delay between API calls (ms)');
      expect(label).not.toHaveClass('text-muted-foreground');
    });

    it('is enabled when maxConcurrency is 1', () => {
      render(<RunOptionsSection maxConcurrency={1} onChange={mockOnChange} />);

      const input = screen.getByLabelText('Delay between API calls (ms)');
      expect(input).not.toBeDisabled();
    });

    it('is disabled when maxConcurrency is greater than 1', () => {
      render(<RunOptionsSection maxConcurrency={4} onChange={mockOnChange} />);

      const input = screen.getByLabelText('Delay between API calls (ms)');
      expect(input).toBeDisabled();
      const label = screen.getByText('Delay between API calls (ms)');
      expect(label).toHaveClass('text-muted-foreground');
      expect(
        screen.getByText('To set a delay, max concurrent requests must be 1'),
      ).toBeInTheDocument();
    });

    it('calls onChange with undefined when delay input is cleared', async () => {
      const user = userEvent.setup();
      render(<RunOptionsSection delay={100} onChange={mockOnChange} />);

      const input = screen.getByLabelText('Delay between API calls (ms)');
      await user.clear(input);

      expect(mockOnChange).toHaveBeenCalledWith({
        description: undefined,
        delay: undefined,
        maxConcurrency: undefined,
      });
    });

    it('parses positive delay values and forces maxConcurrency to 1', async () => {
      const user = userEvent.setup();
      render(<RunOptionsSection onChange={mockOnChange} />);

      const input = screen.getByLabelText('Delay between API calls (ms)');
      await user.type(input, '5');

      expect(mockOnChange).toHaveBeenLastCalledWith({
        description: undefined,
        delay: 5,
        maxConcurrency: 1,
      });
    });

    it('handles negative input by setting delay to 0', () => {
      render(<RunOptionsSection onChange={mockOnChange} />);

      const input = screen.getByLabelText('Delay between API calls (ms)');
      fireEvent.change(input, { target: { value: '-50' } });

      expect(mockOnChange).toHaveBeenCalledWith({
        description: undefined,
        delay: 0,
        maxConcurrency: undefined,
      });
    });
  });

  describe('Max Concurrency field', () => {
    it('renders maxConcurrency input with correct label and placeholder', () => {
      render(<RunOptionsSection onChange={mockOnChange} />);

      expect(screen.getByLabelText('Max concurrent requests')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('4')).toBeInTheDocument();
      expect(screen.getByText('Maximum number of concurrent requests to make')).toBeInTheDocument();
    });

    it('displays existing maxConcurrency value', () => {
      render(<RunOptionsSection maxConcurrency={8} onChange={mockOnChange} />);

      const input = screen.getByLabelText('Max concurrent requests');
      expect(input).toHaveValue(8);
    });

    it('is enabled when delay is not set', () => {
      render(<RunOptionsSection onChange={mockOnChange} />);

      const input = screen.getByLabelText('Max concurrent requests');
      expect(input).not.toBeDisabled();

      const label = screen.getByText('Max concurrent requests');
      expect(label).not.toHaveClass('text-muted-foreground');
    });

    it('is enabled when delay is 0', () => {
      render(<RunOptionsSection delay={0} onChange={mockOnChange} />);

      const input = screen.getByLabelText('Max concurrent requests');
      expect(input).not.toBeDisabled();
    });

    it('is disabled when delay is greater than 0', () => {
      render(<RunOptionsSection delay={100} onChange={mockOnChange} />);

      const input = screen.getByLabelText('Max concurrent requests');
      expect(input).toBeDisabled();
      const label = screen.getByText('Max concurrent requests');
      expect(label).toHaveClass('text-muted-foreground');
      expect(screen.getByText('To set max concurrency, delay must be 0')).toBeInTheDocument();
    });

    it('calls onChange with undefined when maxConcurrency input is cleared', async () => {
      const user = userEvent.setup();
      render(<RunOptionsSection maxConcurrency={4} onChange={mockOnChange} />);

      const input = screen.getByLabelText('Max concurrent requests');
      await user.clear(input);

      expect(mockOnChange).toHaveBeenCalledWith({
        description: undefined,
        delay: undefined,
        maxConcurrency: undefined,
      });
    });

    it('parses maxConcurrency values above 1 and resets delay to 0', async () => {
      const user = userEvent.setup();
      render(<RunOptionsSection onChange={mockOnChange} />);

      const input = screen.getByLabelText('Max concurrent requests');
      await user.type(input, '8');

      // When maxConcurrency > 1, delay is set to 0
      expect(mockOnChange).toHaveBeenLastCalledWith({
        description: undefined,
        delay: 0,
        maxConcurrency: 8,
      });
    });

    it('does not set delay to 0 when maxConcurrency is 1', async () => {
      const user = userEvent.setup();
      render(<RunOptionsSection onChange={mockOnChange} />);

      const input = screen.getByLabelText('Max concurrent requests');
      await user.type(input, '1');

      expect(mockOnChange).toHaveBeenLastCalledWith({
        description: undefined,
        delay: undefined,
        maxConcurrency: 1,
      });
    });

    it('handles value less than 1 by setting maxConcurrency to 1', async () => {
      const user = userEvent.setup();
      render(<RunOptionsSection onChange={mockOnChange} />);

      const input = screen.getByLabelText('Max concurrent requests');
      await user.type(input, '0');

      expect(mockOnChange).toHaveBeenLastCalledWith({
        description: undefined,
        delay: undefined,
        maxConcurrency: 1,
      });
    });
  });

  describe('Mutual exclusivity information', () => {
    it('displays information about mutual exclusivity', () => {
      render(<RunOptionsSection onChange={mockOnChange} />);

      expect(
        screen.getByText(
          'These settings apply to every provider in this evaluation. Delay and max concurrency cannot be used together.',
        ),
      ).toBeInTheDocument();
    });
  });

  describe('Ready to run section', () => {
    it('renders run section with heading', () => {
      render(<RunOptionsSection onChange={mockOnChange} />);

      expect(screen.getByText('Ready to run your evaluation?')).toBeInTheDocument();
    });

    it('shows incomplete message when isReadyToRun is false', () => {
      render(<RunOptionsSection onChange={mockOnChange} isReadyToRun={false} />);

      expect(
        screen.getByText('Add providers, prompts, and test cases to run this evaluation.'),
      ).toBeInTheDocument();
    });

    it('defaults to the incomplete message when isReadyToRun is omitted', () => {
      render(<RunOptionsSection onChange={mockOnChange} />);

      expect(
        screen.getByText('Add providers, prompts, and test cases to run this evaluation.'),
      ).toBeInTheDocument();
    });

    it('shows ready message when isReadyToRun is true', () => {
      render(<RunOptionsSection onChange={mockOnChange} isReadyToRun={true} />);

      expect(
        screen.getByText('All required steps are complete. Start when you are ready.'),
      ).toBeInTheDocument();
    });

    it('renders RunTestSuiteButton component', () => {
      render(<RunOptionsSection onChange={mockOnChange} />);

      expect(screen.getByTestId('run-test-suite-button')).toBeInTheDocument();
    });
  });

  describe('Controlled interaction flow', () => {
    it('disables max concurrency after delay is entered and re-enables it when cleared', async () => {
      const user = userEvent.setup();
      render(<ControlledRunOptionsSection />);

      const delayInput = screen.getByLabelText('Delay between API calls (ms)');
      const maxConcurrencyInput = screen.getByLabelText('Max concurrent requests');

      await user.type(delayInput, '5');

      expect(maxConcurrencyInput).toBeDisabled();
      expect(screen.getByText('To set max concurrency, delay must be 0')).toBeInTheDocument();

      await user.clear(delayInput);

      expect(maxConcurrencyInput).not.toBeDisabled();
      expect(
        screen.getByText('Maximum number of concurrent requests to make'),
      ).toBeInTheDocument();
    });

    it('disables delay after max concurrency is raised above one and re-enables it when cleared', async () => {
      const user = userEvent.setup();
      render(<ControlledRunOptionsSection />);

      const delayInput = screen.getByLabelText('Delay between API calls (ms)');
      const maxConcurrencyInput = screen.getByLabelText('Max concurrent requests');

      await user.type(maxConcurrencyInput, '8');

      expect(delayInput).toBeDisabled();
      expect(
        screen.getByText('To set a delay, max concurrent requests must be 1'),
      ).toBeInTheDocument();

      await user.clear(maxConcurrencyInput);

      expect(delayInput).not.toBeDisabled();
      expect(
        screen.getByText('Add a delay between API calls to avoid rate limits'),
      ).toBeInTheDocument();
    });
  });

  describe('Edge cases', () => {
    it('handles all props being undefined', () => {
      render(<RunOptionsSection onChange={mockOnChange} />);

      expect(screen.getByLabelText('Evaluation name or description')).toHaveValue('');
      expect(screen.getByLabelText('Delay between API calls (ms)')).toHaveValue(null);
      expect(screen.getByLabelText('Max concurrent requests')).toHaveValue(null);
    });

    it('handles all props being set', () => {
      render(
        <RunOptionsSection
          description="Test eval"
          delay={0}
          maxConcurrency={1}
          onChange={mockOnChange}
          isReadyToRun={true}
        />,
      );

      expect(screen.getByLabelText('Evaluation name or description')).toHaveValue('Test eval');
      expect(screen.getByLabelText('Delay between API calls (ms)')).toHaveValue(0);
      expect(screen.getByLabelText('Max concurrent requests')).toHaveValue(1);
      expect(
        screen.getByText('All required steps are complete. Start when you are ready.'),
      ).toBeInTheDocument();
    });
  });
});
