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
    const onValidityChange = vi.fn();
    initialValues = [{ type: 'llm-rubric' }];
    renderComponent(
      <AssertsForm
        onAdd={onAdd}
        initialValues={initialValues}
        onValidityChange={onValidityChange}
      />,
    );

    const valueInput = screen.getByRole('textbox', { name: 'Value' });
    expect(valueInput).toHaveAttribute('aria-invalid', 'false');
    expect(screen.getByText(/leave blank for the default rubric/i)).toBeInTheDocument();
    await waitFor(() => expect(onValidityChange).toHaveBeenLastCalledWith(true));
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

    expect(screen.getByRole('textbox', { name: 'Value' })).toHaveAccessibleDescription(
      'Enter an expected value before saving this check.',
    );
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

  it('does not invite unused values for imported inverse context checks', () => {
    initialValues = [{ type: 'not-context-relevance' }];
    renderComponent(<AssertsForm onAdd={onAdd} initialValues={initialValues} />);

    expect(screen.queryByRole('textbox', { name: 'Value' })).toBeNull();
    expect(screen.getByText('Model-graded: may add cost')).toBeVisible();
    expect(screen.getByText(/uses your query and context variables/i)).toBeVisible();
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
