import React from 'react';

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AssertsForm from './AssertsForm';
import type { Assertion } from '@promptfoo/types';

// Mock APIs needed for Radix Select
HTMLElement.prototype.hasPointerCapture = vi.fn();
HTMLElement.prototype.setPointerCapture = vi.fn();
HTMLElement.prototype.releasePointerCapture = vi.fn();
HTMLElement.prototype.scrollIntoView = vi.fn();

const renderComponent = (component: React.ReactNode) => {
  return render(component);
};

describe('AssertsForm', () => {
  let onAdd: (asserts: Assertion[]) => void;
  let initialValues: Assertion[];

  beforeEach(() => {
    onAdd = vi.fn();
    initialValues = [];
  });

  it('should render all assertions from initialValues as rows with the correct type and value fields populated', () => {
    initialValues = [
      { type: 'equals', value: 'expected output' },
      { type: 'contains-all', value: ['foo', 'bar'] },
      { type: 'latency', threshold: 1000 },
    ];

    renderComponent(<AssertsForm onAdd={onAdd} initialValues={initialValues} />);

    const typeInputs = screen.getAllByRole('combobox', { name: 'Type' });
    const valueInputs = screen.getAllByRole('textbox', { name: 'Value' });

    expect(typeInputs).toHaveLength(initialValues.length);
    expect(valueInputs).toHaveLength(2);

    // Radix Select displays the value as text content, not as input value
    expect(typeInputs[0]).toHaveTextContent('equals');
    expect(valueInputs[0]).toHaveValue('expected output');

    expect(typeInputs[1]).toHaveTextContent('contains-all');
    expect(valueInputs[1]).toHaveValue('foo, bar');

    expect(typeInputs[2]).toHaveTextContent('latency');
    expect(screen.getByRole('spinbutton', { name: /Threshold/ })).toHaveValue(1000);
  });

  it('starts new assertions as a deterministic text check that requires an expected value', async () => {
    const user = userEvent.setup();
    const onValidityChange = vi.fn();
    renderComponent(
      <AssertsForm
        onAdd={onAdd}
        initialValues={initialValues}
        onValidityChange={onValidityChange}
      />,
    );

    const addButton = screen.getByRole('button', { name: 'Add Assertion' });

    await user.click(addButton);

    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onAdd).toHaveBeenCalledWith([{ type: 'contains', value: '' }]);
    expect(screen.getByRole('textbox', { name: 'Value' })).toHaveAttribute('aria-invalid', 'true');
    expect(
      screen.getByText('Enter an expected value before saving this check.'),
    ).toBeInTheDocument();
    await waitFor(() => expect(onValidityChange).toHaveBeenLastCalledWith(false));

    await user.click(addButton);

    expect(onAdd).toHaveBeenCalledTimes(2);
    expect(onAdd).toHaveBeenCalledWith([
      { type: 'contains', value: '' },
      { type: 'contains', value: '' },
    ]);
  });

  it('should update the value of an assertion and call onAdd with the updated assertions array when the value is changed in the TextField', async () => {
    const user = userEvent.setup();
    initialValues = [{ type: 'equals', value: 'initial value' }];
    renderComponent(<AssertsForm onAdd={onAdd} initialValues={initialValues} />);

    const valueInput = screen.getByRole('textbox', { name: 'Value' });

    await user.click(valueInput);
    await user.keyboard('{Control>}a{/Control}');
    await user.paste('new value');

    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onAdd).toHaveBeenCalledWith([{ type: 'equals', value: 'new value' }]);
  });

  it('should update the type of an assertion and call onAdd with the updated assertions array when the type is changed via the Select', async () => {
    initialValues = [{ type: 'equals', value: 'initial value' }];
    renderComponent(<AssertsForm onAdd={onAdd} initialValues={initialValues} />);

    const select = screen.getByRole('combobox', { name: 'Type' });
    await userEvent.click(select);

    // Wait for options to appear (Radix Select uses portals)
    const newTypeOption = await waitFor(() =>
      screen.getByRole('option', { name: /Contains text \(contains\)/ }),
    );
    await userEvent.click(newTypeOption);

    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onAdd).toHaveBeenCalledWith([{ type: 'contains', value: 'initial value' }]);
  });

  it('explains deterministic and model-graded assertions and groups choices', async () => {
    const user = userEvent.setup();
    initialValues = [{ type: 'llm-rubric', value: 'Be helpful' }];
    renderComponent(<AssertsForm onAdd={onAdd} initialValues={initialValues} />);

    expect(screen.getByText(/Assertions are pass or fail checks/i)).toBeInTheDocument();
    expect(screen.getByText('Model-graded: may add cost')).toBeInTheDocument();
    expect(screen.getByText(/A model judges the response/i)).toBeInTheDocument();

    await user.click(screen.getByRole('combobox', { name: 'Type' }));

    expect(await screen.findByText('Recommended starting checks')).toBeInTheDocument();
    expect(screen.getByText('Model-graded quality')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Equals exactly \(equals\)/ })).toBeInTheDocument();
  });

  it('stores comma-separated list assertions as the array required by evaluation', async () => {
    const user = userEvent.setup();
    initialValues = [{ type: 'contains-any', value: [] }];
    renderComponent(<AssertsForm onAdd={onAdd} initialValues={initialValues} />);

    const valueInput = screen.getByRole('textbox', { name: 'Value' });
    await user.type(valueInput, 'hello, world');

    expect(onAdd).toHaveBeenLastCalledWith([{ type: 'contains-any', value: ['hello', 'world'] }]);
  });

  it('allows the default LLM rubric while disclosing optional criteria and cost', async () => {
    const user = userEvent.setup();
    const onValidityChange = vi.fn();
    initialValues = [{ type: 'llm-rubric' }];
    renderComponent(
      <AssertsForm
        onAdd={onAdd}
        initialValues={initialValues}
        onValidityChange={onValidityChange}
      />,
    );

    const valueInput = screen.getByRole('textbox', { name: 'Rubric criteria (optional)' });
    expect(valueInput).toHaveAttribute('aria-invalid', 'false');
    expect(screen.getByText(/leave blank for the default rubric/i)).toBeInTheDocument();
    const threshold = screen.getByRole('spinbutton', {
      name: 'Minimum score threshold (optional)',
    });
    expect(threshold).toHaveAccessibleDescription(/numeric score alone does not fail/i);
    await waitFor(() => expect(onValidityChange).toHaveBeenLastCalledWith(true));

    await user.type(threshold, '0.8');

    expect(onAdd).toHaveBeenLastCalledWith([{ type: 'llm-rubric', threshold: 0.8 }]);
  });

  it('configures G-Eval criteria with its documented default threshold', async () => {
    const user = userEvent.setup();
    initialValues = [{ type: 'g-eval', value: 'Be concise and accurate.' }];
    renderComponent(<AssertsForm onAdd={onAdd} initialValues={initialValues} />);

    expect(screen.getByRole('textbox', { name: 'Evaluation criterion (required)' })).toHaveValue(
      'Be concise and accurate.',
    );
    const threshold = screen.getByRole('spinbutton', {
      name: 'Minimum score threshold (optional)',
    });
    expect(threshold).toHaveAccessibleDescription(/default threshold is 0.7/i);

    await user.type(threshold, '0.9');

    expect(onAdd).toHaveBeenLastCalledWith([
      { type: 'g-eval', value: 'Be concise and accurate.', threshold: 0.9 },
    ]);
  });

  it('places missing G-Eval criterion feedback beside its required input', () => {
    initialValues = [{ type: 'g-eval', value: '' }];
    renderComponent(<AssertsForm onAdd={onAdd} initialValues={initialValues} />);

    const criteria = screen.getByRole('textbox', { name: 'Evaluation criterion (required)' });
    expect(criteria).toHaveAttribute('placeholder', expect.stringContaining('Example:'));
    expect(criteria.parentElement?.nextElementSibling).toHaveTextContent(
      'Enter at least one grading criterion for G-Eval.',
    );
  });

  it('preserves imported multi-criterion G-Eval configurations until explicitly replaced', async () => {
    const user = userEvent.setup();
    initialValues = [{ type: 'g-eval', value: ['Be accurate.', 'Be concise.'] }];
    renderComponent(<AssertsForm onAdd={onAdd} initialValues={initialValues} />);

    expect(screen.queryByRole('textbox', { name: 'Evaluation criterion (required)' })).toBeNull();
    expect(
      screen.getByText(/Multiple G-Eval criteria are configured.*Edit them in YAML/i),
    ).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Replace with text criteria' }));

    expect(onAdd).toHaveBeenLastCalledWith([{ type: 'g-eval', value: '' }]);
    expect(screen.getByRole('textbox', { name: 'Evaluation criterion (required)' })).toBeVisible();
  });

  it('requires expected text for model-graded checks that cannot run without it', async () => {
    const onValidityChange = vi.fn();
    initialValues = [{ type: 'factuality', value: '' }];
    renderComponent(
      <AssertsForm
        onAdd={onAdd}
        initialValues={initialValues}
        onValidityChange={onValidityChange}
      />,
    );

    const reference = screen.getByRole('textbox', { name: 'Reference statement (required)' });
    expect(reference).toHaveAccessibleDescription('Enter the factual reference statement.');
    expect(reference).toHaveAttribute('placeholder', expect.stringContaining('Example:'));
    expect(screen.getByText(/Configure category scoring or custom graders in YAML/i)).toBeVisible();
    expect(screen.queryByRole('spinbutton')).toBeNull();
    await waitFor(() => expect(onValidityChange).toHaveBeenLastCalledWith(false));
  });

  it('asks for a closed QA evaluation criterion without exposing an unused threshold', async () => {
    const onValidityChange = vi.fn();
    initialValues = [{ type: 'model-graded-closedqa', value: '' }];
    renderComponent(
      <AssertsForm
        onAdd={onAdd}
        initialValues={initialValues}
        onValidityChange={onValidityChange}
      />,
    );

    const criterion = screen.getByRole('textbox', { name: 'Evaluation criterion (required)' });
    expect(criterion).toHaveAccessibleDescription('Enter the criterion the response must meet.');
    expect(screen.getByText(/answers yes or no/i)).toBeVisible();
    expect(screen.queryByRole('spinbutton')).toBeNull();
    await waitFor(() => expect(onValidityChange).toHaveBeenLastCalledWith(false));
  });

  it('allows an explicit exact-match check for an intentionally empty response', async () => {
    const onValidityChange = vi.fn();
    initialValues = [{ type: 'equals', value: '' }];
    renderComponent(
      <AssertsForm
        onAdd={onAdd}
        initialValues={initialValues}
        onValidityChange={onValidityChange}
      />,
    );

    expect(screen.getByRole('textbox', { name: 'Value' })).toHaveAttribute('aria-invalid', 'false');
    await waitFor(() => expect(onValidityChange).toHaveBeenLastCalledWith(true));
  });

  it('requires at least one value for comma-separated list checks', async () => {
    const onValidityChange = vi.fn();
    initialValues = [{ type: 'contains-any', value: [] }];
    renderComponent(
      <AssertsForm
        onAdd={onAdd}
        initialValues={initialValues}
        onValidityChange={onValidityChange}
      />,
    );

    expect(
      screen.getByText('Enter at least one comma-separated value for this check.'),
    ).toBeInTheDocument();
    await waitFor(() => expect(onValidityChange).toHaveBeenLastCalledWith(false));
  });

  it('stores a required latency threshold in the property used by evaluation', async () => {
    const user = userEvent.setup();
    const onValidityChange = vi.fn();
    initialValues = [{ type: 'latency' }];
    renderComponent(
      <AssertsForm
        onAdd={onAdd}
        initialValues={initialValues}
        onValidityChange={onValidityChange}
      />,
    );

    const thresholdInput = screen.getByRole('spinbutton', { name: /Threshold/ });
    expect(thresholdInput).toHaveAccessibleDescription(
      'Enter a maximum latency in milliseconds, 0 or greater.',
    );
    await waitFor(() => expect(onValidityChange).toHaveBeenLastCalledWith(false));

    await user.type(thresholdInput, '250');

    expect(onAdd).toHaveBeenLastCalledWith([{ type: 'latency', threshold: 250 }]);
    await waitFor(() => expect(onValidityChange).toHaveBeenLastCalledWith(true));
  });

  it('guides finish reason checks through normalized values and preserves a custom path', async () => {
    const user = userEvent.setup();
    const onValidityChange = vi.fn();
    initialValues = [{ type: 'finish-reason' }];
    renderComponent(
      <AssertsForm
        onAdd={onAdd}
        initialValues={initialValues}
        onValidityChange={onValidityChange}
      />,
    );

    const reasonSelect = screen.getByRole('combobox', {
      name: 'Expected finish reason (required)',
    });
    expect(reasonSelect).toHaveAccessibleDescription('Select or enter the expected finish reason.');
    await waitFor(() => expect(onValidityChange).toHaveBeenLastCalledWith(false));

    await user.click(reasonSelect);
    await user.click(await screen.findByRole('option', { name: 'Natural completion (stop)' }));

    expect(onAdd).toHaveBeenLastCalledWith([{ type: 'finish-reason', value: 'stop' }]);
    await waitFor(() => expect(onValidityChange).toHaveBeenLastCalledWith(true));

    await user.click(screen.getByRole('button', { name: 'Use provider-specific reason' }));
    const customInput = screen.getByRole('textbox', {
      name: 'Provider-specific finish reason (required)',
    });
    await user.type(customInput, 'pause_turn');

    expect(onAdd).toHaveBeenLastCalledWith([{ type: 'finish-reason', value: 'pause_turn' }]);
    expect(customInput).toHaveAccessibleDescription(/provider returns another reason/i);
  });

  it('clears unrelated expected text before revealing finish reason choices', async () => {
    const user = userEvent.setup();
    initialValues = [{ type: 'equals', value: 'stale expected text' }];
    renderComponent(<AssertsForm onAdd={onAdd} initialValues={initialValues} />);

    await user.click(screen.getByRole('combobox', { name: 'Type' }));
    await user.click(
      await screen.findByRole('option', { name: /Finish reason \(finish-reason\)/ }),
    );

    expect(onAdd).toHaveBeenLastCalledWith([{ type: 'finish-reason' }]);
    expect(
      screen.getByRole('combobox', { name: 'Expected finish reason (required)' }),
    ).toBeVisible();
    expect(screen.queryByDisplayValue('stale expected text')).toBeNull();
  });

  it('discloses webhook data sharing and clears unrelated values before configuration', async () => {
    const user = userEvent.setup();
    const onValidityChange = vi.fn();
    initialValues = [{ type: 'equals', value: 'stale expected text' }];
    renderComponent(
      <AssertsForm
        onAdd={onAdd}
        initialValues={initialValues}
        onValidityChange={onValidityChange}
      />,
    );

    await user.click(screen.getByRole('combobox', { name: 'Type' }));
    await user.click(await screen.findByRole('option', { name: /Webhook validation \(webhook\)/ }));

    expect(onAdd).toHaveBeenLastCalledWith([{ type: 'webhook' }]);
    const urlInput = screen.getByRole('textbox', { name: 'Webhook URL (required)' });
    expect(urlInput).toHaveAttribute('type', 'url');
    expect(urlInput).toHaveAccessibleDescription(
      /Enter the webhook URL that will validate responses.*sends generated output and test-case variables/i,
    );
    expect(screen.getByText(/Use only an endpoint you trust/i)).toBeVisible();
    await waitFor(() => expect(onValidityChange).toHaveBeenLastCalledWith(false));

    await user.type(urlInput, 'https://example.com/validate');

    expect(onAdd).toHaveBeenLastCalledWith([
      { type: 'webhook', value: 'https://example.com/validate' },
    ]);
    await waitFor(() => expect(onValidityChange).toHaveBeenLastCalledWith(true));
  });

  it('progressively configures deterministic text-score thresholds', async () => {
    const user = userEvent.setup();
    const onValidityChange = vi.fn();
    initialValues = [{ type: 'bleu', value: 'Expected translation' }];
    renderComponent(
      <AssertsForm
        onAdd={onAdd}
        initialValues={initialValues}
        onValidityChange={onValidityChange}
      />,
    );

    expect(screen.getByRole('textbox', { name: 'Reference answer (required)' })).toHaveValue(
      'Expected translation',
    );
    const threshold = screen.getByRole('spinbutton', { name: 'Score threshold (optional)' });
    expect(threshold).toHaveAccessibleDescription(/default to 0.5.*BLEU rewards precision/i);
    await waitFor(() => expect(onValidityChange).toHaveBeenLastCalledWith(true));

    await user.type(threshold, '0.7');

    expect(onAdd).toHaveBeenLastCalledWith([
      { type: 'bleu', value: 'Expected translation', threshold: 0.7 },
    ]);
  });

  it('explains the different default threshold for ROUGE-N coverage scoring', () => {
    initialValues = [{ type: 'rouge-n', value: 'Required summary facts' }];
    renderComponent(<AssertsForm onAdd={onAdd} initialValues={initialValues} />);

    expect(
      screen.getByRole('spinbutton', { name: 'Score threshold (optional)' }),
    ).toHaveAccessibleDescription(/default to 0.75.*ROUGE-N rewards coverage/i);
  });

  it('configures semantic similarity thresholds with model-cost disclosure', async () => {
    const user = userEvent.setup();
    initialValues = [{ type: 'similar', value: 'A clear response' }];
    renderComponent(<AssertsForm onAdd={onAdd} initialValues={initialValues} />);

    expect(screen.getByText('Model-graded: may add cost')).toBeVisible();
    const threshold = screen.getByRole('spinbutton', { name: 'Score threshold (optional)' });
    expect(threshold).toHaveAccessibleDescription(/default to 0.75.*embeddings and may add cost/i);

    await user.type(threshold, '0.8');

    expect(onAdd).toHaveBeenLastCalledWith([
      { type: 'similar', value: 'A clear response', threshold: 0.8 },
    ]);
  });

  it('discloses Pi Labs data sharing and configures its passing threshold', async () => {
    const user = userEvent.setup();
    const onValidityChange = vi.fn();
    initialValues = [{ type: 'pi' }];
    renderComponent(
      <AssertsForm
        onAdd={onAdd}
        initialValues={initialValues}
        onValidityChange={onValidityChange}
      />,
    );

    expect(screen.getByText(/external Pi Labs scorer.*requires WITHPI_API_KEY/i)).toBeVisible();
    const criteria = screen.getByRole('textbox', { name: 'Scoring criteria (required)' });
    expect(criteria).toHaveAccessibleDescription(
      /Enter criteria for Pi Labs scoring.*Pi Labs receives the prompt and generated output/i,
    );
    await waitFor(() => expect(onValidityChange).toHaveBeenLastCalledWith(false));

    await user.type(criteria, 'Is the response accurate and concise?');
    const threshold = screen.getByRole('spinbutton', {
      name: 'Passing score threshold (optional)',
    });
    expect(threshold).toHaveAccessibleDescription(/WITHPI_API_KEY.*defaults to 0.5/i);
    await user.type(threshold, '0.8');

    expect(onAdd).toHaveBeenLastCalledWith([
      {
        type: 'pi',
        value: 'Is the response accurate and concise?',
        threshold: 0.8,
      },
    ]);
    await waitFor(() => expect(onValidityChange).toHaveBeenLastCalledWith(true));
  });

  it('exposes permissive defaults and thresholds for answer relevance scoring', async () => {
    const user = userEvent.setup();
    initialValues = [{ type: 'answer-relevance' }];
    renderComponent(<AssertsForm onAdd={onAdd} initialValues={initialValues} />);

    expect(screen.queryByRole('textbox', { name: 'Value' })).toBeNull();
    const threshold = screen.getByRole('spinbutton', {
      name: 'Minimum score threshold (optional)',
    });
    expect(threshold).toHaveAccessibleDescription(
      /Scores range from 0 to 1.*runtime default is 0.*prompt or a query variable/i,
    );

    await user.type(threshold, '0.75');

    expect(onAdd).toHaveBeenLastCalledWith([{ type: 'answer-relevance', threshold: 0.75 }]);
  });

  it('guides context recall setup with ground truth and a normalized threshold', async () => {
    const user = userEvent.setup();
    initialValues = [{ type: 'context-recall', value: '' }];
    renderComponent(<AssertsForm onAdd={onAdd} initialValues={initialValues} />);

    const groundTruth = screen.getByRole('textbox', { name: 'Ground truth answer (required)' });
    expect(groundTruth).toHaveAccessibleDescription(/Provide retrieved context.*prompt content/i);
    await user.type(groundTruth, 'Paris is the capital of France.');
    await user.type(
      screen.getByRole('spinbutton', { name: 'Minimum score threshold (optional)' }),
      '0.9',
    );

    expect(onAdd).toHaveBeenLastCalledWith([
      {
        type: 'context-recall',
        value: 'Paris is the capital of France.',
        threshold: 0.9,
      },
    ]);
  });

  it('stores word count limits in the runtime range shape without model-grading cost', async () => {
    const user = userEvent.setup();
    const onValidityChange = vi.fn();
    initialValues = [{ type: 'word-count' }];
    renderComponent(
      <AssertsForm
        onAdd={onAdd}
        initialValues={initialValues}
        onValidityChange={onValidityChange}
      />,
    );

    expect(screen.queryByText('Model-graded: may add cost')).toBeNull();
    expect(screen.getByRole('spinbutton', { name: 'Maximum words' })).toHaveAccessibleDescription(
      'Enter an exact word count or at least one limit.',
    );
    await waitFor(() => expect(onValidityChange).toHaveBeenLastCalledWith(false));

    await user.type(screen.getByRole('spinbutton', { name: 'Maximum words' }), '120');

    expect(onAdd).toHaveBeenLastCalledWith([{ type: 'word-count', value: { max: 120 } }]);
    expect(screen.getByRole('spinbutton', { name: 'Maximum words' })).toHaveAccessibleDescription(
      /Enter an exact count, or a minimum and\/or maximum/,
    );
    await waitFor(() => expect(onValidityChange).toHaveBeenLastCalledWith(true));
  });

  it('supports an exact word count from an imported configuration', async () => {
    const onValidityChange = vi.fn();
    initialValues = [{ type: 'word-count', value: 50 }];
    renderComponent(
      <AssertsForm
        onAdd={onAdd}
        initialValues={initialValues}
        onValidityChange={onValidityChange}
      />,
    );

    expect(screen.getByRole('spinbutton', { name: 'Exact word count' })).toHaveValue(50);
    await waitFor(() => expect(onValidityChange).toHaveBeenLastCalledWith(true));
  });

  it('stores structured trajectory matchers as JSON objects required by evaluation', async () => {
    const user = userEvent.setup();
    const onValidityChange = vi.fn();
    initialValues = [{ type: 'trajectory:step-count' }];
    renderComponent(
      <AssertsForm
        onAdd={onAdd}
        initialValues={initialValues}
        onValidityChange={onValidityChange}
      />,
    );

    const valueInput = screen.getByRole('textbox', { name: 'Expected trace data (JSON)' });
    expect(valueInput).toHaveAccessibleDescription(
      'Enter JSON with a minimum or maximum trajectory step count.',
    );
    await waitFor(() => expect(onValidityChange).toHaveBeenLastCalledWith(false));

    await user.click(valueInput);
    await user.paste('{"min": 1}');

    expect(onAdd).toHaveBeenLastCalledWith([{ type: 'trajectory:step-count', value: { min: 1 } }]);
    await waitFor(() => expect(onValidityChange).toHaveBeenLastCalledWith(true));
  });

  it('guides traced goal success checks with their required goal and threshold', async () => {
    const user = userEvent.setup();
    const onValidityChange = vi.fn();
    initialValues = [{ type: 'trajectory:goal-success' }];
    renderComponent(
      <AssertsForm
        onAdd={onAdd}
        initialValues={initialValues}
        onValidityChange={onValidityChange}
      />,
    );

    expect(screen.getByText(/requires trace data and a grading model/i)).toBeVisible();
    const goal = screen.getByRole('textbox', { name: 'Goal to achieve (required)' });
    expect(goal).toHaveAccessibleDescription(
      /Enter the goal that the agent should achieve.*Requires trace data.*summarized trajectory and final response/i,
    );
    expect(
      screen.getByRole('spinbutton', { name: 'Minimum score threshold (optional)' }),
    ).toHaveAttribute('aria-invalid', 'false');
    await waitFor(() => expect(onValidityChange).toHaveBeenLastCalledWith(false));

    await user.type(goal, 'Determine whether order 123 shipped.');
    const threshold = screen.getByRole('spinbutton', {
      name: 'Minimum score threshold (optional)',
    });
    expect(threshold).toHaveAccessibleDescription(/grader's pass result decides.*YAML/i);
    await user.type(threshold, '0.8');

    expect(onAdd).toHaveBeenLastCalledWith([
      {
        type: 'trajectory:goal-success',
        value: 'Determine whether order 123 shipped.',
        threshold: 0.8,
      },
    ]);
    await waitFor(() => expect(onValidityChange).toHaveBeenLastCalledWith(true));
  });

  it('preserves imported object-shaped trajectory goals until replaced', async () => {
    const user = userEvent.setup();
    initialValues = [{ type: 'trajectory:goal-success', value: { goal: 'Resolve the request' } }];
    renderComponent(<AssertsForm onAdd={onAdd} initialValues={initialValues} />);

    expect(screen.queryByRole('textbox', { name: 'Goal to achieve (required)' })).toBeNull();
    expect(screen.getByText(/object-shaped goal is configured/i)).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Replace with text goal' }));

    expect(onAdd).toHaveBeenLastCalledWith([{ type: 'trajectory:goal-success', value: '' }]);
  });

  it('allows SQL syntax validation without optional JSON configuration', async () => {
    const onValidityChange = vi.fn();
    initialValues = [{ type: 'is-sql' }];
    renderComponent(
      <AssertsForm
        onAdd={onAdd}
        initialValues={initialValues}
        onValidityChange={onValidityChange}
      />,
    );

    expect(
      screen.getByRole('textbox', { name: 'SQL validation settings (JSON, optional)' }),
    ).toHaveAccessibleDescription(
      'Optional. Leave blank to validate SQL syntax using the default database parser.',
    );
    await waitFor(() => expect(onValidityChange).toHaveBeenLastCalledWith(true));
  });

  it('stores optional moderation categories as the array accepted by evaluation', async () => {
    const user = userEvent.setup();
    initialValues = [{ type: 'moderation' }];
    renderComponent(<AssertsForm onAdd={onAdd} initialValues={initialValues} />);

    const categoriesInput = screen.getByRole('textbox', { name: 'Categories (optional)' });
    expect(categoriesInput).toHaveAccessibleDescription(/leave blank to check all categories/i);

    await user.type(categoriesInput, 'hate, harassment');

    expect(onAdd).toHaveBeenLastCalledWith([{ type: 'moderation', value: ['hate', 'harassment'] }]);
  });

  it('does not invite unused values for provider tool-call checks', () => {
    initialValues = [{ type: 'is-valid-openai-tools-call' }];
    renderComponent(<AssertsForm onAdd={onAdd} initialValues={initialValues} />);

    expect(screen.queryByRole('textbox', { name: 'Value' })).toBeNull();
    expect(
      screen.getByText(/validates function or tool calls returned by the provider/i),
    ).toBeVisible();
  });

  it('offers deterministic HTML checks without irrelevant expected-value input', async () => {
    const user = userEvent.setup();
    initialValues = [{ type: 'equals', value: 'stale expected text' }];
    renderComponent(<AssertsForm onAdd={onAdd} initialValues={initialValues} />);

    await user.click(screen.getByRole('combobox', { name: 'Type' }));
    await user.click(
      await screen.findByRole('option', { name: /Valid HTML document \(is-html\)/ }),
    );

    expect(onAdd).toHaveBeenLastCalledWith([{ type: 'is-html' }]);
    expect(screen.queryByRole('textbox', { name: 'Value' })).toBeNull();
    expect(screen.getByText(/full response is HTML/i)).toBeVisible();
  });

  it('explains imported inverse refusal checks without asking for a value', () => {
    initialValues = [{ type: 'not-is-refusal' }];
    renderComponent(<AssertsForm onAdd={onAdd} initialValues={initialValues} />);

    expect(screen.queryByRole('textbox', { name: 'Value' })).toBeNull();
    expect(screen.getByText(/response is a refusal/i)).toBeVisible();
  });

  it('does not invite unused values for imported inverse context checks', () => {
    initialValues = [{ type: 'not-context-relevance' }];
    renderComponent(<AssertsForm onAdd={onAdd} initialValues={initialValues} />);

    expect(screen.queryByRole('textbox', { name: 'Value' })).toBeNull();
    expect(screen.getByText('Model-graded: may add cost')).toBeVisible();
    expect(
      screen.getByRole('spinbutton', { name: 'Minimum score threshold (optional)' }),
    ).toHaveAccessibleDescription(/Provide query and context variables/i);
  });

  it('discloses model grading for a negative semantic similarity check', () => {
    initialValues = [{ type: 'not-similar', value: 'An unrelated answer' }];
    renderComponent(<AssertsForm onAdd={onAdd} initialValues={initialValues} />);

    expect(screen.getByText('Model-graded: may add cost')).toBeVisible();
    expect(screen.getByText(/fails when a model finds semantic similarity/i)).toBeVisible();
  });

  it('explains select-best criteria and its multi-output prerequisite', async () => {
    const onValidityChange = vi.fn();
    initialValues = [{ type: 'select-best' }];
    renderComponent(
      <AssertsForm
        onAdd={onAdd}
        initialValues={initialValues}
        onValidityChange={onValidityChange}
      />,
    );

    expect(screen.getByText('Model-graded: may add cost')).toBeVisible();
    expect(screen.getByText(/Add at least two prompts or providers/i)).toBeVisible();
    expect(
      screen.getByRole('textbox', { name: 'Selection criteria (required)' }),
    ).toHaveAccessibleDescription('Enter criteria for selecting the best output.');
    await waitFor(() => expect(onValidityChange).toHaveBeenLastCalledWith(false));
  });

  it('offers deterministic highest-score comparison without asking for an expected value', async () => {
    const user = userEvent.setup();
    initialValues = [{ type: 'equals', value: 'stale expected text' }];
    renderComponent(<AssertsForm onAdd={onAdd} initialValues={initialValues} />);

    await user.click(screen.getByRole('combobox', { name: 'Type' }));
    await user.click(
      await screen.findByRole('option', { name: /Choose highest score \(max-score\)/ }),
    );

    expect(onAdd).toHaveBeenLastCalledWith([{ type: 'max-score' }]);
    expect(screen.queryByRole('textbox', { name: 'Value' })).toBeNull();
    expect(screen.queryByText('Model-graded: may add cost')).toBeNull();
    expect(screen.getByText(/highest-scoring output from your other checks/i)).toBeVisible();
    expect(screen.getByText(/configure advanced settings in the YAML editor/i)).toBeVisible();
  });

  it('discloses retained advanced max-score YAML settings without hiding their edit path', () => {
    initialValues = [{ type: 'max-score', value: { method: 'sum' } }];
    renderComponent(<AssertsForm onAdd={onAdd} initialValues={initialValues} />);

    expect(screen.queryByRole('textbox', { name: 'Value' })).toBeNull();
    expect(screen.getByText(/Advanced scoring settings are configured/i)).toBeVisible();
    expect(screen.getByText(/Use the YAML editor to change weights/i)).toBeVisible();
  });

  it('progressively reveals optional XML element requirements', async () => {
    const user = userEvent.setup();
    initialValues = [{ type: 'is-xml' }];
    renderComponent(<AssertsForm onAdd={onAdd} initialValues={initialValues} />);

    expect(screen.queryByRole('textbox', { name: 'Required elements (optional)' })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Add required XML elements' }));

    const elementsInput = screen.getByRole('textbox', { name: 'Required elements (optional)' });
    expect(elementsInput).toHaveAccessibleDescription(/Separate required XML element names/i);
    await user.type(elementsInput, 'answer, confidence');

    expect(onAdd).toHaveBeenLastCalledWith([{ type: 'is-xml', value: 'answer, confidence' }]);
  });

  it('progressively reveals optional JSON schema validation', async () => {
    const user = userEvent.setup();
    initialValues = [{ type: 'is-json' }];
    renderComponent(<AssertsForm onAdd={onAdd} initialValues={initialValues} />);

    expect(screen.queryByRole('textbox', { name: 'JSON schema (optional)' })).toBeNull();
    expect(screen.getByText(/validates JSON without requiring a schema/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Add optional JSON schema' }));

    const schemaInput = screen.getByRole('textbox', { name: 'JSON schema (optional)' });
    await user.type(schemaInput, 'type: object');

    expect(onAdd).toHaveBeenLastCalledWith([{ type: 'is-json', value: 'type: object' }]);

    await user.click(screen.getByRole('button', { name: 'Remove schema' }));
    expect(onAdd).toHaveBeenLastCalledWith([{ type: 'is-json' }]);
    expect(screen.queryByRole('textbox', { name: 'JSON schema (optional)' })).toBeNull();
  });

  it('drops an incompatible expected value when switching to basic JSON validation', async () => {
    const user = userEvent.setup();
    initialValues = [{ type: 'equals', value: 'previous exact answer' }];
    renderComponent(<AssertsForm onAdd={onAdd} initialValues={initialValues} />);

    await user.click(screen.getByRole('combobox', { name: 'Type' }));
    await user.click(await screen.findByRole('option', { name: /Valid JSON \(is-json\)/ }));

    expect(onAdd).toHaveBeenLastCalledWith([{ type: 'is-json' }]);
    expect(screen.getByRole('button', { name: 'Add optional JSON schema' })).toBeInTheDocument();
  });

  it('should remove an assertion and call onAdd with the updated assertions array when the delete button is clicked for that assertion', async () => {
    const user = userEvent.setup();
    initialValues = [
      { type: 'equals', value: 'expected output' },
      { type: 'contains-all', value: '["foo", "bar"]' },
    ];
    renderComponent(<AssertsForm onAdd={onAdd} initialValues={initialValues} />);

    const deleteButtons = screen.getAllByRole('button', { name: 'Remove assertion' });
    await user.click(deleteButtons[0]);

    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onAdd).toHaveBeenCalledWith([{ type: 'contains-all', value: '["foo", "bar"]' }]);
  });

  it('should handle undefined initialValues gracefully by defaulting to an empty array', () => {
    renderComponent(<AssertsForm onAdd={onAdd} initialValues={[]} />);

    const assertionsHeader = screen.getByText('Assertions');
    expect(assertionsHeader).toBeInTheDocument();

    const addAssertButton = screen.getByRole('button', { name: 'Add Assertion' });
    expect(addAssertButton).toBeInTheDocument();
  });

  it('should call onAdd with an empty array when all assertions are removed', async () => {
    const user = userEvent.setup();
    initialValues = [{ type: 'equals', value: 'initial value' }];
    renderComponent(<AssertsForm onAdd={onAdd} initialValues={initialValues} />);

    const deleteButton = screen.getByRole('button', { name: 'Remove assertion' });
    await user.click(deleteButton);

    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onAdd).toHaveBeenCalledWith([]);
  });
});
