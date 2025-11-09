import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import StrategyConfigDialog from './StrategyConfigDialog';

describe('StrategyConfigDialog', () => {
  const mockOnSave = vi.fn();
  const mockOnClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should render the correct title and switch when open is true and strategy is 'basic'", () => {
    render(
      <StrategyConfigDialog
        open={true}
        strategy="basic"
        config={{}}
        onClose={() => {}}
        onSave={() => {}}
        strategyData={{ id: 'basic', name: 'Basic', description: 'Basic strategy' }}
      />,
    );

    const titleElement = screen.getByText('Configure Basic');
    expect(titleElement).toBeInTheDocument();

    const switchElement = screen.getByRole('switch', {
      name: /Include plugin-generated test cases/,
    });
    expect(switchElement).toBeInTheDocument();
  });

  it('should save basic strategy configuration correctly', () => {
    const initialConfig = { enabled: false };

    render(
      <StrategyConfigDialog
        open={true}
        strategy="basic"
        config={initialConfig}
        onClose={mockOnClose}
        onSave={mockOnSave}
        strategyData={{ id: 'basic', name: 'Basic', description: 'Basic strategy' }}
      />,
    );

    const switchElement = screen.getByRole('switch', {
      name: /Include plugin-generated test cases/,
    });
    fireEvent.click(switchElement);

    const saveButton = screen.getByRole('button', { name: 'Save' });
    fireEvent.click(saveButton);

    expect(mockOnSave).toHaveBeenCalledTimes(1);
    expect(mockOnSave).toHaveBeenCalledWith('basic', {
      ...initialConfig,
      enabled: true,
    });
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it("should call onSave with the correct arguments and then onClose when Save is clicked for a valid 'custom' strategy", () => {
    const initialConfig = {};
    const strategyText = 'This is a valid custom strategy.';

    render(
      <StrategyConfigDialog
        open={true}
        strategy="custom"
        config={initialConfig}
        onClose={mockOnClose}
        onSave={mockOnSave}
        strategyData={{ id: 'custom', name: 'Custom', description: 'A custom strategy' }}
      />,
    );

    const strategyTextField = screen.getByLabelText('Strategy Text');
    fireEvent.change(strategyTextField, { target: { value: strategyText } });

    const saveButton = screen.getByRole('button', { name: 'Save' });
    expect(saveButton).not.toBeDisabled();
    fireEvent.click(saveButton);

    expect(mockOnSave).toHaveBeenCalledTimes(1);
    expect(mockOnSave).toHaveBeenCalledWith('custom', { strategyText });

    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('should return early from handleSave when custom strategy is invalid', () => {
    const initialConfig = {};

    render(
      <StrategyConfigDialog
        open={true}
        strategy="custom"
        config={initialConfig}
        onClose={mockOnClose}
        onSave={mockOnSave}
        strategyData={{ id: 'custom', name: 'Custom', description: 'A custom strategy' }}
      />,
    );

    const saveButton = screen.getByRole('button', { name: 'Save' });
    expect(saveButton).toBeDisabled();
    fireEvent.click(saveButton);

    expect(mockOnSave).not.toHaveBeenCalled();
    expect(mockOnClose).not.toHaveBeenCalled();
  });

  it("should render the number input for maximum tests and update the value when changed for the 'retry' strategy", () => {
    render(
      <StrategyConfigDialog
        open={true}
        strategy="retry"
        config={{ numTests: 5 }}
        onClose={mockOnClose}
        onSave={mockOnSave}
        strategyData={{ id: 'retry', name: 'Retry', description: 'Retry strategy' }}
      />,
    );

    const numTestsInput = screen.getByLabelText('Maximum Tests Per Plugin');
    expect(numTestsInput).toBeInTheDocument();
    expect(numTestsInput).toHaveValue(5);

    fireEvent.change(numTestsInput, { target: { value: '15' } });
    expect(numTestsInput).toHaveValue(15);

    const saveButton = screen.getByRole('button', { name: 'Save' });
    fireEvent.click(saveButton);

    expect(mockOnSave).toHaveBeenCalledTimes(1);
    expect(mockOnSave).toHaveBeenCalledWith('retry', { numTests: 15 });
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('should not call onSave and disable the Save button when a non-numeric value is entered for numTests in the retry strategy', () => {
    render(
      <StrategyConfigDialog
        open={true}
        strategy="retry"
        config={{}}
        onClose={mockOnClose}
        onSave={mockOnSave}
        strategyData={{ id: 'retry', name: 'Retry', description: 'A retry strategy' }}
      />,
    );

    const numTestsInput = screen.getByLabelText('Maximum Tests Per Plugin');
    fireEvent.change(numTestsInput, { target: { value: 'abc' } });

    const saveButton = screen.getByRole('button', { name: 'Save' });
    expect(saveButton).toBeDisabled();

    fireEvent.click(saveButton);
    expect(mockOnSave).not.toHaveBeenCalled();
  });

  it("should render the number of iterations input and update local config when changed for the 'jailbreak' strategy", () => {
    const initialConfig = { numIterations: 10 };
    const newNumIterations = 20;

    render(
      <StrategyConfigDialog
        open={true}
        strategy="jailbreak"
        config={initialConfig}
        onClose={mockOnClose}
        onSave={mockOnSave}
        strategyData={{ id: 'jailbreak', name: 'Jailbreak', description: 'Jailbreak strategy' }}
      />,
    );

    const numIterationsInput = screen.getByLabelText('Number of Iterations');
    fireEvent.change(numIterationsInput, { target: { value: newNumIterations.toString() } });
    fireEvent.blur(numIterationsInput);

    const saveButton = screen.getByRole('button', { name: 'Save' });
    fireEvent.click(saveButton);

    expect(mockOnSave).toHaveBeenCalledTimes(1);
    expect(mockOnSave).toHaveBeenCalledWith('jailbreak', { numIterations: newNumIterations });
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it("should render switches for academic, journal, and book citations and update local config when toggled for the 'citation' strategy", () => {
    const initialConfig = {
      useAcademic: true,
      useJournals: false,
      useBooks: true,
    };

    render(
      <StrategyConfigDialog
        open={true}
        strategy="citation"
        config={initialConfig}
        onClose={mockOnClose}
        onSave={mockOnSave}
        strategyData={{ id: 'citation', name: 'Citation', description: 'Citation strategy' }}
      />,
    );

    const academicSwitch = screen.getByRole('switch', { name: /Use Academic Citations/i });
    const journalsSwitch = screen.getByRole('switch', { name: /Include Journal Citations/i });
    const booksSwitch = screen.getByRole('switch', { name: /Include Book Citations/i });

    expect(academicSwitch).toBeChecked();
    expect(journalsSwitch).not.toBeChecked();
    expect(booksSwitch).toBeChecked();

    fireEvent.click(academicSwitch);
    fireEvent.click(journalsSwitch);
    fireEvent.click(booksSwitch);

    const saveButton = screen.getByRole('button', { name: 'Save' });
    fireEvent.click(saveButton);

    expect(mockOnSave).toHaveBeenCalledTimes(1);
    expect(mockOnSave).toHaveBeenCalledWith('citation', {
      useAcademic: false,
      useJournals: true,
      useBooks: false,
    });
  });

  it('should render and handle best-of-n strategy configuration correctly', () => {
    const initialConfig = {
      maxConcurrency: 3,
      nSteps: 10,
      maxCandidatesPerStep: 5,
    };

    render(
      <StrategyConfigDialog
        open={true}
        strategy="best-of-n"
        config={initialConfig}
        onClose={mockOnClose}
        onSave={mockOnSave}
        strategyData={{ id: 'best-of-n', name: 'Best-of-N', description: 'Best-of-N strategy' }}
      />,
    );

    const maxConcurrencyInput = screen.getByLabelText('Max Concurrency');
    const nStepsInput = screen.getByLabelText('Number of Steps');
    const maxCandidatesPerStepInput = screen.getByLabelText('Max Candidates Per Step');

    fireEvent.change(maxConcurrencyInput, { target: { value: '5' } });
    fireEvent.change(nStepsInput, { target: { value: '15' } });
    fireEvent.change(maxCandidatesPerStepInput, { target: { value: '7' } });

    const saveButton = screen.getByRole('button', { name: 'Save' });
    fireEvent.click(saveButton);

    expect(mockOnSave).toHaveBeenCalledTimes(1);
    expect(mockOnSave).toHaveBeenCalledWith('best-of-n', {
      maxConcurrency: 5,
      nSteps: 15,
      maxCandidatesPerStep: 7,
    });
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('should render and handle gcg strategy configuration correctly', () => {
    const initialConfig = { n: 5 };
    const newN = 10;

    render(
      <StrategyConfigDialog
        open={true}
        strategy="gcg"
        config={initialConfig}
        onClose={mockOnClose}
        onSave={mockOnSave}
        strategyData={{ id: 'gcg', name: 'GCG', description: 'GCG strategy' }}
      />,
    );

    const nTextField = screen.getByLabelText('Number of Outputs (n)');
    fireEvent.change(nTextField, { target: { value: newN.toString() } });

    const saveButton = screen.getByRole('button', { name: 'Save' });
    fireEvent.click(saveButton);

    expect(mockOnSave).toHaveBeenCalledTimes(1);
    expect(mockOnSave).toHaveBeenCalledWith('gcg', { n: newN });

    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('should update jailbreak:tree strategy parameters when changed', () => {
    const initialConfig = {
      maxDepth: 25,
      maxAttempts: 250,
      maxWidth: 10,
      branchingFactor: 4,
      maxNoImprovement: 25,
    };

    render(
      <StrategyConfigDialog
        open={true}
        strategy="jailbreak:tree"
        config={initialConfig}
        onClose={mockOnClose}
        onSave={mockOnSave}
        strategyData={{
          id: 'jailbreak:tree',
          name: 'Jailbreak: Tree',
          description: 'A tree-based jailbreak strategy',
        }}
      />,
    );

    const maxDepthInput = screen.getByLabelText('Maximum Depth');
    fireEvent.change(maxDepthInput, { target: { value: '30' } });

    const maxAttemptsInput = screen.getByLabelText('Maximum Attempts');
    fireEvent.change(maxAttemptsInput, { target: { value: '300' } });

    const maxWidthInput = screen.getByLabelText('Max Width');
    fireEvent.change(maxWidthInput, { target: { value: '15' } });

    const branchingFactorInput = screen.getByLabelText('Branching Factor');
    fireEvent.change(branchingFactorInput, { target: { value: '5' } });

    const maxNoImprovementInput = screen.getByLabelText('Max No Improvement');
    fireEvent.change(maxNoImprovementInput, { target: { value: '30' } });

    const saveButton = screen.getByRole('button', { name: 'Save' });
    fireEvent.click(saveButton);

    expect(mockOnSave).toHaveBeenCalledTimes(1);
    expect(mockOnSave).toHaveBeenCalledWith('jailbreak:tree', {
      maxDepth: 30,
      maxAttempts: 300,
      maxWidth: 15,
      branchingFactor: 5,
      maxNoImprovement: 30,
    });

    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('should reset local state when switching between strategies', () => {
    const { rerender } = render(
      <StrategyConfigDialog
        open={true}
        strategy="custom"
        config={{ strategyText: 'Initial strategy', maxTurns: 4 }}
        onClose={mockOnClose}
        onSave={mockOnSave}
        strategyData={{ id: 'custom', name: 'Custom', description: 'A custom strategy' }}
      />,
    );

    const customMaxTurnsInput = screen.getByLabelText('Max Turns');
    expect(customMaxTurnsInput).toHaveValue(4);
    fireEvent.change(customMaxTurnsInput, { target: { value: '12' } });
    expect(customMaxTurnsInput).toHaveValue(12);

    const customStatefulSwitch = screen.getByRole('switch', { name: /Stateful/ });
    expect(customStatefulSwitch).toBeChecked();

    rerender(
      <StrategyConfigDialog
        open={true}
        strategy="goat"
        config={{ maxTurns: 3, stateful: false }}
        onClose={mockOnClose}
        onSave={mockOnSave}
        strategyData={{ id: 'goat', name: 'GOAT', description: 'A multi-turn strategy' }}
      />,
    );

    const goatMaxTurnsInput = screen.getByLabelText('Max Turns');
    expect(goatMaxTurnsInput).toHaveValue(3);

    const goatStatefulSwitch = screen.getByRole('switch', { name: /Stateful/ });
    expect(goatStatefulSwitch).not.toBeChecked();
  });

  it('should not persist localConfig changes when closing the dialog without saving for the jailbreak:meta strategy', () => {
    const initialConfig = { numIterations: 10 };

    render(
      <StrategyConfigDialog
        open={true}
        strategy="jailbreak:meta"
        config={initialConfig}
        onClose={mockOnClose}
        onSave={mockOnSave}
        strategyData={{
          id: 'jailbreak:meta',
          name: 'Meta-Agent Jailbreak',
          description: 'Meta-Agent Jailbreak strategy',
        }}
      />,
    );

    const numIterationsInput = screen.getByLabelText('Number of Iterations');
    fireEvent.change(numIterationsInput, { target: { value: '20' } });

    const cancelButton = screen.getByRole('button', { name: 'Cancel' });
    fireEvent.click(cancelButton);

    expect(mockOnSave).not.toHaveBeenCalled();
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it("should render the 'jailbreak:meta' strategy config without falling through to multi-turn or default", () => {
    render(
      <StrategyConfigDialog
        open={true}
        strategy="jailbreak:meta"
        config={{}}
        onClose={() => {}}
        onSave={() => {}}
        strategyData={{
          id: 'jailbreak:meta',
          name: 'Meta-Agent Jailbreak',
          description: 'Meta-Agent Jailbreak strategy',
        }}
      />,
    );

    const iterationsInput = screen.getByLabelText('Number of Iterations');
    expect(iterationsInput).toBeInTheDocument();

    const iterationsDescription = screen.getByText(
      /Number of iterations for the meta-agent to attempt/,
    );
    expect(iterationsDescription).toBeInTheDocument();

    const maxTurnsInput = screen.queryByLabelText('Max Turns');
    expect(maxTurnsInput).toBeNull();

    const statefulSwitch = screen.queryByRole('switch', { name: /Stateful/ });
    expect(statefulSwitch).toBeNull();

    const noConfigMessage = screen.queryByText(
      /No configuration options available for this strategy/,
    );
    expect(noConfigMessage).toBeNull();
  });

  it("should render the number of iterations input with the correct initial value and reset local state when switching to 'jailbreak:meta'", () => {
    const initialConfig = { numIterations: 25 };
    const newConfig = { numIterations: 35 };

    const { rerender } = render(
      <StrategyConfigDialog
        open={true}
        strategy="custom"
        config={{}}
        onClose={mockOnClose}
        onSave={mockOnSave}
        strategyData={{ id: 'custom', name: 'Custom', description: 'A custom strategy' }}
      />,
    );

    rerender(
      <StrategyConfigDialog
        open={true}
        strategy="jailbreak:meta"
        config={initialConfig}
        onClose={mockOnClose}
        onSave={mockOnSave}
        strategyData={{
          id: 'jailbreak:meta',
          name: 'Meta-Agent Jailbreak',
          description: 'Meta-Agent Jailbreak strategy',
        }}
      />,
    );

    const numIterationsInput = screen.getByLabelText('Number of Iterations');
    expect(numIterationsInput).toHaveValue(25);

    rerender(
      <StrategyConfigDialog
        open={true}
        strategy="basic"
        config={{}}
        onClose={mockOnClose}
        onSave={mockOnSave}
        strategyData={{ id: 'basic', name: 'Basic', description: 'Basic strategy' }}
      />,
    );

    rerender(
      <StrategyConfigDialog
        open={true}
        strategy="jailbreak:meta"
        config={newConfig}
        onClose={mockOnClose}
        onSave={mockOnSave}
        strategyData={{
          id: 'jailbreak:meta',
          name: 'Meta-Agent Jailbreak',
          description: 'Meta-Agent Jailbreak strategy',
        }}
      />,
    );

    const numIterationsInputUpdated = screen.getByLabelText('Number of Iterations');
    expect(numIterationsInputUpdated).toHaveValue(35);
  });

  it("should call onSave with localConfig and the strategy string when Save is clicked for the 'jailbreak:meta' strategy", () => {
    const initialConfig = {};
    const numIterations = 25;

    render(
      <StrategyConfigDialog
        open={true}
        strategy="jailbreak:meta"
        config={initialConfig}
        onClose={mockOnClose}
        onSave={mockOnSave}
        strategyData={{
          id: 'jailbreak:meta',
          name: 'Meta Jailbreak',
          description: 'Meta Jailbreak strategy',
        }}
      />,
    );

    const numIterationsInput = screen.getByLabelText('Number of Iterations');
    fireEvent.change(numIterationsInput, { target: { value: numIterations.toString() } });

    const saveButton = screen.getByRole('button', { name: 'Save' });
    fireEvent.click(saveButton);

    expect(mockOnSave).toHaveBeenCalledTimes(1);
    expect(mockOnSave).toHaveBeenCalledWith('jailbreak:meta', { numIterations: numIterations });
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it("should save 'jailbreak:meta' strategy with default numIterations when input is empty", () => {
    const initialConfig = {};

    render(
      <StrategyConfigDialog
        open={true}
        strategy="jailbreak:meta"
        config={initialConfig}
        onClose={mockOnClose}
        onSave={mockOnSave}
        strategyData={{
          id: 'jailbreak:meta',
          name: 'Meta-Agent Jailbreak',
          description: 'Meta-Agent Jailbreak strategy',
        }}
      />,
    );

    const numIterationsInput = screen.getByLabelText('Number of Iterations');
    fireEvent.change(numIterationsInput, { target: { value: '' } });

    const saveButton = screen.getByRole('button', { name: 'Save' });
    fireEvent.click(saveButton);

    expect(mockOnSave).toHaveBeenCalledTimes(1);
    expect(mockOnSave).toHaveBeenCalledWith('jailbreak:meta', { numIterations: 10 });
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('should reset localConfig when the jailbreak:meta strategy dialog is opened multiple times with different config values', () => {
    const { rerender } = render(
      <StrategyConfigDialog
        open={true}
        strategy="jailbreak:meta"
        config={{ numIterations: 20 }}
        onClose={mockOnClose}
        onSave={mockOnSave}
        strategyData={{
          id: 'jailbreak:meta',
          name: 'Meta-Agent Jailbreak',
          description: 'Meta-Agent Jailbreak strategy',
        }}
      />,
    );

    const numIterationsInput1 = screen.getByLabelText('Number of Iterations');
    expect(numIterationsInput1).toHaveValue(20);

    rerender(
      <StrategyConfigDialog
        open={true}
        strategy="jailbreak:meta"
        config={{ numIterations: 5 }}
        onClose={mockOnClose}
        onSave={mockOnSave}
        strategyData={{
          id: 'jailbreak:meta',
          name: 'Meta-Agent Jailbreak',
          description: 'Meta-Agent Jailbreak strategy',
        }}
      />,
    );

    const numIterationsInput2 = screen.getByLabelText('Number of Iterations');
    expect(numIterationsInput2).toHaveValue(5);
  });

  it('should preserve other config properties when saving numIterations for jailbreak:meta', () => {
    const initialConfig = {
      numIterations: 10,
      someOtherField: 'someValue',
      anotherField: 123,
    };
    const newNumIterations = 20;

    render(
      <StrategyConfigDialog
        open={true}
        strategy="jailbreak:meta"
        config={initialConfig}
        onClose={mockOnClose}
        onSave={mockOnSave}
        strategyData={{
          id: 'jailbreak:meta',
          name: 'Meta-Agent Jailbreak',
          description: 'Meta-Agent Jailbreak strategy',
        }}
      />,
    );

    const numIterationsInput = screen.getByLabelText('Number of Iterations');
    fireEvent.change(numIterationsInput, { target: { value: newNumIterations.toString() } });

    const saveButton = screen.getByRole('button', { name: 'Save' });
    fireEvent.click(saveButton);

    expect(mockOnSave).toHaveBeenCalledTimes(1);
    expect(mockOnSave).toHaveBeenCalledWith('jailbreak:meta', {
      numIterations: newNumIterations,
      someOtherField: 'someValue',
      anotherField: 123,
    });
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it("should call onSave with the updated numIterations and then onClose when Save is clicked for the 'jailbreak:meta' strategy", () => {
    const initialConfig = { numIterations: 10 };
    const newNumIterations = 20;

    render(
      <StrategyConfigDialog
        open={true}
        strategy="jailbreak:meta"
        config={initialConfig}
        onClose={mockOnClose}
        onSave={mockOnSave}
        strategyData={{
          id: 'jailbreak:meta',
          name: 'Meta-Agent Jailbreak',
          description: 'Meta-Agent Jailbreak strategy',
        }}
      />,
    );

    const numIterationsInput = screen.getByLabelText('Number of Iterations');
    fireEvent.change(numIterationsInput, { target: { value: newNumIterations.toString() } });

    const saveButton = screen.getByRole('button', { name: 'Save' });
    fireEvent.click(saveButton);

    expect(mockOnSave).toHaveBeenCalledTimes(1);
    expect(mockOnSave).toHaveBeenCalledWith('jailbreak:meta', { numIterations: newNumIterations });
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it("should render the number of iterations input and relevant instructions when open is true and strategy is 'jailbreak:meta'", () => {
    render(
      <StrategyConfigDialog
        open={true}
        strategy="jailbreak:meta"
        config={{}}
        onClose={() => {}}
        onSave={() => {}}
        strategyData={{
          id: 'jailbreak:meta',
          name: 'Meta-Agent Jailbreak',
          description: 'Meta-Agent Jailbreak strategy',
        }}
      />,
    );

    const numIterationsInput = screen.getByLabelText('Number of Iterations');
    expect(numIterationsInput).toBeInTheDocument();
    expect(numIterationsInput).toHaveValue(10);
  });
});
