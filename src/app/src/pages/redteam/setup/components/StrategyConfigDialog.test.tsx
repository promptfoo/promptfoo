import { TooltipProvider } from '@app/components/ui/tooltip';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import StrategyConfigDialog from './StrategyConfigDialog';

const AllProviders = ({ children }: { children: React.ReactNode }) => (
  <TooltipProvider>{children}</TooltipProvider>
);

const renderWithProviders = (ui: React.ReactElement) => {
  return render(ui, { wrapper: AllProviders });
};

describe('StrategyConfigDialog', () => {
  const mockOnSave = vi.fn();
  const mockOnClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should correctly filter layerPlugins when using the stable empty array for selectedPlugins', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <StrategyConfigDialog
        open={true}
        strategy="layer"
        config={{}}
        onClose={mockOnClose}
        onSave={mockOnSave}
        strategyData={{ id: 'layer', name: 'Layer', description: 'Layer strategy' }}
        selectedPlugins={[]}
      />,
    );

    const specificPluginsButton = screen.getByText('Specific plugins only');
    await user.click(specificPluginsButton);

    // Use the custom file:// input field to add a step
    const customStepInput = screen.getByPlaceholderText('Or type file://path/to/custom.js');
    await user.click(customStepInput);
    await user.keyboard('{Control>}a{/Control}');
    await user.paste('file://base64.js');
    customStepInput.focus();
    await user.keyboard('{Enter}');

    const saveButton = screen.getByRole('button', { name: 'Save' });
    await user.click(saveButton);

    expect(mockOnSave).toHaveBeenCalledTimes(1);
    expect(mockOnSave).toHaveBeenCalledWith('layer', { steps: ['file://base64.js'] });
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('should compute availableStrategies correctly with stable empty array for allStrategies', () => {
    renderWithProviders(
      <StrategyConfigDialog
        open={true}
        strategy="layer"
        config={{}}
        onClose={mockOnClose}
        onSave={mockOnSave}
        strategyData={{ id: 'layer', name: 'Layer', description: 'Layer strategy' }}
        allStrategies={[]}
      />,
    );

    // Check that the strategy selector and custom input field are present
    const strategySelector = screen.getByRole('combobox');
    expect(strategySelector).toBeInTheDocument();
    const customInput = screen.getByPlaceholderText('Or type file://path/to/custom.js');
    expect(customInput).toBeInTheDocument();
  });

  it('should use stable empty arrays when selectedPlugins and allStrategies are not provided', () => {
    renderWithProviders(
      <StrategyConfigDialog
        open={true}
        strategy="basic"
        config={{}}
        onClose={mockOnClose}
        onSave={mockOnSave}
        strategyData={{ id: 'basic', name: 'Basic', description: 'Basic strategy' }}
      />,
    );

    expect(screen.getByText('Configure Basic')).toBeInTheDocument();
  });

  it('should not trigger infinite re-renders when using default empty array parameters', () => {
    let renderCount = 0;

    const TestComponent = () => {
      renderCount++;

      return (
        <StrategyConfigDialog
          open={true}
          strategy="layer"
          config={{}}
          onClose={mockOnClose}
          onSave={mockOnSave}
          strategyData={{ id: 'layer', name: 'Layer', description: 'Layer strategy' }}
        />
      );
    };

    renderWithProviders(<TestComponent />);

    expect(renderCount).toBeLessThan(5);
  });

  it('should not mutate the default empty arrays, which could affect other component instances', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <StrategyConfigDialog
        open={true}
        strategy="layer"
        config={{}}
        onClose={mockOnClose}
        onSave={mockOnSave}
        strategyData={{ id: 'layer', name: 'Layer', description: 'Layer strategy' }}
      />,
    );

    // Use the custom file:// input field to add a step
    const customStepInput = screen.getByPlaceholderText('Or type file://path/to/custom.js');
    await user.click(customStepInput);
    await user.keyboard('{Control>}a{/Control}');
    await user.paste('file://base64.js');
    customStepInput.focus();
    await user.keyboard('{Enter}');

    const saveButton = screen.getByRole('button', { name: 'Save' });
    await user.click(saveButton);

    renderWithProviders(
      <StrategyConfigDialog
        open={true}
        strategy="layer"
        config={{}}
        onClose={mockOnClose}
        onSave={mockOnSave}
        strategyData={{ id: 'layer', name: 'Layer', description: 'Layer strategy' }}
      />,
    );

    expect(mockOnSave).toHaveBeenCalledTimes(1);
    expect(mockOnSave).toHaveBeenCalledWith('layer', { steps: ['file://base64.js'] });
  });

  it('should handle null or undefined values for selectedPlugins and allStrategies without crashing', () => {
    renderWithProviders(
      <StrategyConfigDialog
        open={true}
        strategy="basic"
        config={{}}
        onClose={() => {}}
        onSave={() => {}}
        strategyData={{ id: 'basic', name: 'Basic', description: 'Basic strategy' }}
        selectedPlugins={undefined}
        allStrategies={undefined}
      />,
    );

    const titleElement = screen.getByText('Configure Basic');
    expect(titleElement).toBeInTheDocument();
  });

  it("should render the correct title and switch when open is true and strategy is 'basic'", () => {
    renderWithProviders(
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

  it('should save basic strategy configuration correctly', async () => {
    const user = userEvent.setup();
    const initialConfig = { enabled: false };

    renderWithProviders(
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
    await user.click(switchElement);

    const saveButton = screen.getByRole('button', { name: 'Save' });
    await user.click(saveButton);

    expect(mockOnSave).toHaveBeenCalledTimes(1);
    expect(mockOnSave).toHaveBeenCalledWith('basic', {
      ...initialConfig,
      enabled: true,
    });
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it("should call onSave with the correct arguments and then onClose when Save is clicked for a valid 'custom' strategy", async () => {
    const user = userEvent.setup();
    const initialConfig = {};
    const strategyText = 'This is a valid custom strategy.';

    renderWithProviders(
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
    await user.click(strategyTextField);
    await user.keyboard('{Control>}a{/Control}');
    await user.paste(strategyText);

    const saveButton = screen.getByRole('button', { name: 'Save' });
    expect(saveButton).not.toBeDisabled();
    await user.click(saveButton);

    expect(mockOnSave).toHaveBeenCalledTimes(1);
    expect(mockOnSave).toHaveBeenCalledWith('custom', { strategyText });

    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('should return early from handleSave when custom strategy is invalid', async () => {
    const user = userEvent.setup();
    const initialConfig = {};

    renderWithProviders(
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
    await user.click(saveButton);

    expect(mockOnSave).not.toHaveBeenCalled();
    expect(mockOnClose).not.toHaveBeenCalled();
  });

  it("should render the number input for maximum tests and update the value when changed for the 'retry' strategy", async () => {
    const user = userEvent.setup();
    renderWithProviders(
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

    await user.click(numTestsInput);
    await user.keyboard('{Control>}a{/Control}');
    await user.paste('15');
    expect(numTestsInput).toHaveValue(15);

    const saveButton = screen.getByRole('button', { name: 'Save' });
    await user.click(saveButton);

    expect(mockOnSave).toHaveBeenCalledTimes(1);
    expect(mockOnSave).toHaveBeenCalledWith('retry', { numTests: 15 });
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('should not call onSave and disable the Save button when a non-numeric value is entered for numTests in the retry strategy', async () => {
    const user = userEvent.setup();
    renderWithProviders(
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
    // Bypass browser type="number" validation via the native setter — userEvent
    // correctly rejects non-numeric input, but we need to test defensive handling.
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(
        numTestsInput,
        'abc',
      );
      numTestsInput.dispatchEvent(new Event('input', { bubbles: true }));
      numTestsInput.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const saveButton = screen.getByRole('button', { name: 'Save' });
    expect(saveButton).toBeDisabled();

    await user.click(saveButton);
    expect(mockOnSave).not.toHaveBeenCalled();
  });

  it("should render the number of iterations input and update local config when changed for the 'jailbreak' strategy", async () => {
    const user = userEvent.setup();
    const initialConfig = { numIterations: 5 };
    const newNumIterations = 8;

    renderWithProviders(
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
    await user.click(numIterationsInput);
    await user.keyboard('{Control>}a{/Control}');
    await user.paste(String(newNumIterations));
    await user.tab();

    const saveButton = screen.getByRole('button', { name: 'Save' });
    await user.click(saveButton);

    expect(mockOnSave).toHaveBeenCalledTimes(1);
    expect(mockOnSave).toHaveBeenCalledWith('jailbreak', { numIterations: newNumIterations });
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it("should render switches for academic, journal, and book citations and update local config when toggled for the 'citation' strategy", async () => {
    const user = userEvent.setup();
    const initialConfig = {
      useAcademic: true,
      useJournals: false,
      useBooks: true,
    };

    renderWithProviders(
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

    await user.click(academicSwitch);
    await user.click(journalsSwitch);
    await user.click(booksSwitch);

    const saveButton = screen.getByRole('button', { name: 'Save' });
    await user.click(saveButton);

    expect(mockOnSave).toHaveBeenCalledTimes(1);
    expect(mockOnSave).toHaveBeenCalledWith('citation', {
      useAcademic: false,
      useJournals: true,
      useBooks: false,
    });
  });

  it('should render and handle best-of-n strategy configuration correctly', async () => {
    const user = userEvent.setup();
    const initialConfig = {
      maxConcurrency: 3,
      nSteps: 10,
      maxCandidatesPerStep: 5,
    };

    renderWithProviders(
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

    await user.click(maxConcurrencyInput);
    await user.keyboard('{Control>}a{/Control}');
    await user.paste('5');
    await user.click(nStepsInput);
    await user.keyboard('{Control>}a{/Control}');
    await user.paste('15');
    await user.click(maxCandidatesPerStepInput);
    await user.keyboard('{Control>}a{/Control}');
    await user.paste('7');

    const saveButton = screen.getByRole('button', { name: 'Save' });
    await user.click(saveButton);

    expect(mockOnSave).toHaveBeenCalledTimes(1);
    expect(mockOnSave).toHaveBeenCalledWith('best-of-n', {
      maxConcurrency: 5,
      nSteps: 15,
      maxCandidatesPerStep: 7,
    });
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('should render and handle gcg strategy configuration correctly', async () => {
    const user = userEvent.setup();
    const initialConfig = { n: 5 };
    const newN = 10;

    renderWithProviders(
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
    await user.click(nTextField);
    await user.keyboard('{Control>}a{/Control}');
    await user.paste(String(newN));

    const saveButton = screen.getByRole('button', { name: 'Save' });
    await user.click(saveButton);

    expect(mockOnSave).toHaveBeenCalledTimes(1);
    expect(mockOnSave).toHaveBeenCalledWith('gcg', { n: newN });

    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('should update jailbreak:tree strategy parameters when changed', async () => {
    const user = userEvent.setup();
    const initialConfig = {
      maxDepth: 25,
      maxAttempts: 250,
      maxWidth: 10,
      branchingFactor: 4,
      maxNoImprovement: 25,
    };

    renderWithProviders(
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
    await user.click(maxDepthInput);
    await user.keyboard('{Control>}a{/Control}');
    await user.paste('4');

    const maxAttemptsInput = screen.getByLabelText('Maximum Attempts');
    await user.click(maxAttemptsInput);
    await user.keyboard('{Control>}a{/Control}');
    await user.paste('25');

    const maxWidthInput = screen.getByLabelText('Max Width');
    await user.click(maxWidthInput);
    await user.keyboard('{Control>}a{/Control}');
    await user.paste('3');

    const branchingFactorInput = screen.getByLabelText('Branching Factor');
    await user.click(branchingFactorInput);
    await user.keyboard('{Control>}a{/Control}');
    await user.paste('2');

    const maxNoImprovementInput = screen.getByLabelText('Max No Improvement');
    await user.click(maxNoImprovementInput);
    await user.keyboard('{Control>}a{/Control}');
    await user.paste('8');

    const saveButton = screen.getByRole('button', { name: 'Save' });
    await user.click(saveButton);

    expect(mockOnSave).toHaveBeenCalledTimes(1);
    expect(mockOnSave).toHaveBeenCalledWith('jailbreak:tree', {
      maxDepth: 4,
      maxAttempts: 25,
      maxWidth: 3,
      branchingFactor: 2,
      maxNoImprovement: 8,
    });

    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('should reset local state when switching between strategies', async () => {
    const user = userEvent.setup();
    const { rerender } = renderWithProviders(
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
    await user.click(customMaxTurnsInput);
    await user.keyboard('{Control>}a{/Control}');
    await user.paste('8');
    expect(customMaxTurnsInput).toHaveValue(8);

    const customStatefulSwitch = screen.getByRole('switch', {
      name: /When enabled, Promptfoo should only send/,
    });
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

    const goatStatefulSwitch = screen.getByRole('switch', {
      name: /When enabled, Promptfoo should only send/,
    });
    expect(goatStatefulSwitch).not.toBeChecked();
  });

  it("should render Hydra configuration fields when strategy is 'jailbreak:hydra'", () => {
    renderWithProviders(
      <StrategyConfigDialog
        open={true}
        strategy="jailbreak:hydra"
        config={{}}
        onClose={mockOnClose}
        onSave={mockOnSave}
        strategyData={{
          id: 'jailbreak:hydra',
          name: 'Hydra',
          description: 'Hydra multi-turn jailbreak',
        }}
      />,
    );

    expect(screen.getByText('Configure Hydra')).toBeInTheDocument();
    const maxTurnsInput = screen.getByLabelText('Max Turns');
    expect(maxTurnsInput).toBeInTheDocument();
    expect(maxTurnsInput).toHaveValue(10);

    expect(screen.queryByLabelText('Max Backtracks')).not.toBeInTheDocument();
    const statefulSwitch = screen.getByRole('switch', {
      name: /Enable when your target maintains server-side sessions/,
    });
    expect(statefulSwitch).not.toBeChecked();
  });

  it("should save updated Hydra configuration when strategy is 'jailbreak:hydra'", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <StrategyConfigDialog
        open={true}
        strategy="jailbreak:hydra"
        config={{}}
        onClose={mockOnClose}
        onSave={mockOnSave}
        strategyData={{
          id: 'jailbreak:hydra',
          name: 'Hydra',
          description: 'Hydra multi-turn jailbreak',
        }}
      />,
    );

    const maxTurnsInput = screen.getByLabelText('Max Turns');
    await user.click(maxTurnsInput);
    await user.keyboard('{Control>}a{/Control}');
    await user.paste('8');

    const statefulSwitch = screen.getByRole('switch', {
      name: /Enable when your target maintains server-side sessions/,
    });
    await user.click(statefulSwitch);

    const saveButton = screen.getByRole('button', { name: 'Save' });
    await user.click(saveButton);

    expect(mockOnSave).toHaveBeenCalledWith('jailbreak:hydra', {
      maxTurns: 8,
      stateful: true,
    });
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('should not persist localConfig changes when closing the dialog without saving for the jailbreak:meta strategy', async () => {
    const user = userEvent.setup();
    const initialConfig = { numIterations: 10 };

    renderWithProviders(
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
    await user.click(numIterationsInput);
    await user.keyboard('{Control>}a{/Control}');
    await user.paste('20');

    const cancelButton = screen.getByRole('button', { name: 'Cancel' });
    await user.click(cancelButton);

    expect(mockOnSave).not.toHaveBeenCalled();
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it("should render the 'jailbreak:meta' strategy config without falling through to multi-turn or default", () => {
    renderWithProviders(
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

    const statefulSwitch = screen.queryByRole('switch', {
      name: /When enabled, Promptfoo should only send/,
    });
    expect(statefulSwitch).toBeNull();

    const noConfigMessage = screen.queryByText(
      /No configuration options available for this strategy/,
    );
    expect(noConfigMessage).toBeNull();
  });

  it("should render the number of iterations input with the correct initial value and reset local state when switching to 'jailbreak:meta'", () => {
    const initialConfig = { numIterations: 25 };
    const newConfig = { numIterations: 35 };

    const { rerender } = renderWithProviders(
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

  it("should call onSave with localConfig and the strategy string when Save is clicked for the 'jailbreak:meta' strategy", async () => {
    const user = userEvent.setup();
    const initialConfig = {};
    const numIterations = 8;

    renderWithProviders(
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
    await user.click(numIterationsInput);
    await user.keyboard('{Control>}a{/Control}');
    await user.paste(String(numIterations));

    const saveButton = screen.getByRole('button', { name: 'Save' });
    await user.click(saveButton);

    expect(mockOnSave).toHaveBeenCalledTimes(1);
    expect(mockOnSave).toHaveBeenCalledWith('jailbreak:meta', { numIterations: numIterations });
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it("should save 'jailbreak:meta' strategy with default numIterations when input is empty", async () => {
    const user = userEvent.setup();
    const initialConfig = {};

    renderWithProviders(
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
    await user.clear(numIterationsInput);

    const saveButton = screen.getByRole('button', { name: 'Save' });
    await user.click(saveButton);

    expect(mockOnSave).toHaveBeenCalledTimes(1);
    expect(mockOnSave).toHaveBeenCalledWith('jailbreak:meta', { numIterations: 10 });
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('should reset localConfig when the jailbreak:meta strategy dialog is opened multiple times with different config values', () => {
    const { rerender } = renderWithProviders(
      <StrategyConfigDialog
        open={true}
        strategy="jailbreak:meta"
        config={{ numIterations: 8 }}
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
    expect(numIterationsInput1).toHaveValue(8);

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

  it('should preserve other config properties when saving numIterations for jailbreak:meta', async () => {
    const user = userEvent.setup();
    const initialConfig = {
      numIterations: 5,
      someOtherField: 'someValue',
      anotherField: 123,
    };
    const newNumIterations = 8;

    renderWithProviders(
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
    await user.click(numIterationsInput);
    await user.keyboard('{Control>}a{/Control}');
    await user.paste(String(newNumIterations));

    const saveButton = screen.getByRole('button', { name: 'Save' });
    await user.click(saveButton);

    expect(mockOnSave).toHaveBeenCalledTimes(1);
    expect(mockOnSave).toHaveBeenCalledWith('jailbreak:meta', {
      numIterations: newNumIterations,
      someOtherField: 'someValue',
      anotherField: 123,
    });
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it("should call onSave with the updated numIterations and then onClose when Save is clicked for the 'jailbreak:meta' strategy", async () => {
    const user = userEvent.setup();
    const initialConfig = { numIterations: 5 };
    const newNumIterations = 8;

    renderWithProviders(
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
    await user.click(numIterationsInput);
    await user.keyboard('{Control>}a{/Control}');
    await user.paste(String(newNumIterations));

    const saveButton = screen.getByRole('button', { name: 'Save' });
    await user.click(saveButton);

    expect(mockOnSave).toHaveBeenCalledTimes(1);
    expect(mockOnSave).toHaveBeenCalledWith('jailbreak:meta', { numIterations: newNumIterations });
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it("should render the number of iterations input and relevant instructions when open is true and strategy is 'jailbreak:meta'", () => {
    renderWithProviders(
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

  describe('layer strategy', () => {
    it('should render layer strategy configuration correctly', () => {
      renderWithProviders(
        <StrategyConfigDialog
          open={true}
          strategy="layer"
          config={{}}
          onClose={mockOnClose}
          onSave={mockOnSave}
          strategyData={{ id: 'layer', name: 'Layer', description: 'Layer strategy' }}
        />,
      );

      expect(screen.getByText('Target Plugins')).toBeInTheDocument();
      expect(screen.getByText('Steps (in order)')).toBeInTheDocument();
      // Check that the strategy selector and custom input field are present
      expect(screen.getByRole('combobox')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Or type file://path/to/custom.js')).toBeInTheDocument();
    });

    it('should save layer strategy with all plugins by default', async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <StrategyConfigDialog
          open={true}
          strategy="layer"
          config={{ steps: ['base64'] }}
          onClose={mockOnClose}
          onSave={mockOnSave}
          strategyData={{ id: 'layer', name: 'Layer', description: 'Layer strategy' }}
        />,
      );

      const saveButton = screen.getByRole('button', { name: 'Save' });
      await user.click(saveButton);

      expect(mockOnSave).toHaveBeenCalledWith('layer', { steps: ['base64'] });
    });

    it('should save layer strategy with specific plugins when selected', async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <StrategyConfigDialog
          open={true}
          strategy="layer"
          config={{ steps: ['base64'], plugins: ['harmful', 'pii'] }}
          onClose={mockOnClose}
          onSave={mockOnSave}
          strategyData={{ id: 'layer', name: 'Layer', description: 'Layer strategy' }}
          selectedPlugins={['harmful', 'pii', 'contracts']}
        />,
      );

      const saveButton = screen.getByRole('button', { name: 'Save' });
      await user.click(saveButton);

      expect(mockOnSave).toHaveBeenCalledWith('layer', {
        plugins: ['harmful', 'pii'],
        steps: ['base64'],
      });
    });

    it('should disable save button when no steps are configured', () => {
      renderWithProviders(
        <StrategyConfigDialog
          open={true}
          strategy="layer"
          config={{}}
          onClose={mockOnClose}
          onSave={mockOnSave}
          strategyData={{ id: 'layer', name: 'Layer', description: 'Layer strategy' }}
        />,
      );

      const saveButton = screen.getByRole('button', { name: 'Save' });
      expect(saveButton).toBeDisabled();
    });

    it('should normalize steps with id and config to strings', () => {
      const config = {
        steps: [{ id: 'base64', config: { plugins: ['harmful'] } }, 'rot13'],
      };

      renderWithProviders(
        <StrategyConfigDialog
          open={true}
          strategy="layer"
          config={config}
          onClose={mockOnClose}
          onSave={mockOnSave}
          strategyData={{ id: 'layer', name: 'Layer', description: 'Layer strategy' }}
        />,
      );

      // Steps should be displayed as strings
      expect(screen.getByText(/1\./)).toBeInTheDocument();
      expect(screen.getByText('base64')).toBeInTheDocument();
      expect(screen.getByText(/2\./)).toBeInTheDocument();
      expect(screen.getByText('rot13')).toBeInTheDocument();
    });

    it('should display "Configure Layer Strategy" description when no steps are added', () => {
      renderWithProviders(
        <StrategyConfigDialog
          open={true}
          strategy="layer"
          config={{}}
          onClose={mockOnClose}
          onSave={mockOnSave}
          strategyData={{ id: 'layer', name: 'Layer', description: 'Layer strategy' }}
        />,
      );

      expect(screen.getByText('Configure Layer Strategy')).toBeInTheDocument();
      expect(
        screen.getByText(/Add steps to create transform chains or combine agentic strategies/),
      ).toBeInTheDocument();
    });

    it('should display "Transform Chain" mode when only transform steps are added', () => {
      renderWithProviders(
        <StrategyConfigDialog
          open={true}
          strategy="layer"
          config={{ steps: ['base64', 'rot13'] }}
          onClose={mockOnClose}
          onSave={mockOnSave}
          strategyData={{ id: 'layer', name: 'Layer', description: 'Layer strategy' }}
        />,
      );

      expect(screen.getByText('Transform Chain')).toBeInTheDocument();
      expect(
        screen.getByText(/Test cases will be transformed through 2 steps sequentially/),
      ).toBeInTheDocument();
    });

    it('should display "Multi-Turn + Multi-Modal Attack" mode when agentic and multi-modal steps are combined', () => {
      renderWithProviders(
        <StrategyConfigDialog
          open={true}
          strategy="layer"
          config={{ steps: ['jailbreak:hydra', 'audio'] }}
          onClose={mockOnClose}
          onSave={mockOnSave}
          strategyData={{ id: 'layer', name: 'Layer', description: 'Layer strategy' }}
        />,
      );

      expect(screen.getByText('Multi-Turn + Multi-Modal Attack')).toBeInTheDocument();
      expect(
        screen.getByText(
          /The agentic strategy will orchestrate the attack.*converted to audio\/image/,
        ),
      ).toBeInTheDocument();
    });

    it('should display "Multi-Turn Agentic Attack" mode when only agentic step is added', () => {
      renderWithProviders(
        <StrategyConfigDialog
          open={true}
          strategy="layer"
          config={{ steps: ['crescendo'] }}
          onClose={mockOnClose}
          onSave={mockOnSave}
          strategyData={{ id: 'layer', name: 'Layer', description: 'Layer strategy' }}
        />,
      );

      expect(screen.getByText('Multi-Turn Agentic Attack')).toBeInTheDocument();
      expect(
        screen.getByText(/The agentic strategy will orchestrate a multi-turn conversation/),
      ).toBeInTheDocument();
    });

    it('should display "Multi-Modal Transform" mode when only multi-modal step is added', () => {
      renderWithProviders(
        <StrategyConfigDialog
          open={true}
          strategy="layer"
          config={{ steps: ['audio'] }}
          onClose={mockOnClose}
          onSave={mockOnSave}
          strategyData={{ id: 'layer', name: 'Layer', description: 'Layer strategy' }}
        />,
      );

      expect(screen.getByText('Multi-Modal Transform')).toBeInTheDocument();
      expect(
        screen.getByText(/Test cases will be converted to audio\/image format/),
      ).toBeInTheDocument();
    });

    it('should display "agentic" chip for agentic strategies', () => {
      renderWithProviders(
        <StrategyConfigDialog
          open={true}
          strategy="layer"
          config={{ steps: ['jailbreak:hydra'] }}
          onClose={mockOnClose}
          onSave={mockOnSave}
          strategyData={{ id: 'layer', name: 'Layer', description: 'Layer strategy' }}
        />,
      );

      expect(screen.getByText('agentic')).toBeInTheDocument();
    });

    it('should display "multi-modal" chip for multi-modal strategies', () => {
      renderWithProviders(
        <StrategyConfigDialog
          open={true}
          strategy="layer"
          config={{ steps: ['audio'] }}
          onClose={mockOnClose}
          onSave={mockOnSave}
          strategyData={{ id: 'layer', name: 'Layer', description: 'Layer strategy' }}
        />,
      );

      expect(screen.getByText('multi-modal')).toBeInTheDocument();
    });

    it('should display "configured" chip when step has config', () => {
      renderWithProviders(
        <StrategyConfigDialog
          open={true}
          strategy="layer"
          config={{ steps: [{ id: 'base64', config: { option: 'value' } }] }}
          onClose={mockOnClose}
          onSave={mockOnSave}
          strategyData={{ id: 'layer', name: 'Layer', description: 'Layer strategy' }}
        />,
      );

      expect(screen.getByText('configured')).toBeInTheDocument();
    });

    it('should show warning when agentic strategy is not first step', () => {
      renderWithProviders(
        <StrategyConfigDialog
          open={true}
          strategy="layer"
          config={{ steps: ['base64', 'jailbreak:hydra'] }}
          onClose={mockOnClose}
          onSave={mockOnSave}
          strategyData={{ id: 'layer', name: 'Layer', description: 'Layer strategy' }}
        />,
      );

      expect(
        screen.getByText(/Agentic strategies work best as the first step/),
      ).toBeInTheDocument();
    });

    it('should show warning when transforms are between agentic and multi-modal steps', () => {
      renderWithProviders(
        <StrategyConfigDialog
          open={true}
          strategy="layer"
          config={{ steps: ['jailbreak:hydra', 'base64', 'audio'] }}
          onClose={mockOnClose}
          onSave={mockOnSave}
          strategyData={{ id: 'layer', name: 'Layer', description: 'Layer strategy' }}
        />,
      );

      expect(screen.getByText(/Transforms between agentic and multi-modal/)).toBeInTheDocument();
    });

    it('should disable step movement when multi-modal is at the end', () => {
      renderWithProviders(
        <StrategyConfigDialog
          open={true}
          strategy="layer"
          config={{ steps: ['jailbreak:hydra', 'audio'] }}
          onClose={mockOnClose}
          onSave={mockOnSave}
          strategyData={{ id: 'layer', name: 'Layer', description: 'Layer strategy' }}
        />,
      );

      // The move down button for jailbreak:hydra should be disabled
      const moveDownButtons = screen.getAllByLabelText('move step down');
      expect(moveDownButtons[0]).toBeDisabled();
    });

    it('should show validation message when last step is multi-modal', () => {
      renderWithProviders(
        <StrategyConfigDialog
          open={true}
          strategy="layer"
          config={{ steps: ['jailbreak:hydra', 'audio'] }}
          onClose={mockOnClose}
          onSave={mockOnSave}
          strategyData={{ id: 'layer', name: 'Layer', description: 'Layer strategy' }}
        />,
      );

      // The autocomplete should show that multi-modal must be last
      expect(screen.getByText(/Multi-modal strategies must be the last step/)).toBeInTheDocument();
    });
  });
});
