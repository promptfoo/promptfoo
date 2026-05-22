import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AssertsForm from './AssertsForm';
import TestCaseForm from './TestCaseDialog';
import VarsForm from './VarsForm';
import type { Assertion, TestCase } from '@promptfoo/types';

vi.mock('./VarsForm', () => ({
  default: vi.fn(() => <div data-testid="mock-vars-form" />),
}));

vi.mock('./AssertsForm', () => ({
  default: vi.fn(() => <div data-testid="mock-asserts-form" />),
}));

const mockVarsForm = vi.mocked(VarsForm);
const mockAssertsForm = vi.mocked(AssertsForm);

describe('TestCaseForm', () => {
  const onAdd = vi.fn();
  const onCancel = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockVarsForm.mockClear();
    mockAssertsForm.mockClear();
  });

  const renderComponent = (props = {}) => {
    const defaultProps = {
      open: true,
      onAdd,
      varsList: ['var1', 'var2'],
      onCancel,
      initialValues: undefined,
    };
    return render(<TestCaseForm {...defaultProps} {...props} />);
  };

  it('explains how test cases run and offers add-and-continue in create mode', () => {
    renderComponent();

    const dialogTitle = screen.getByRole('heading', { name: 'Add Test Case' });
    expect(dialogTitle).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Add Test Case' })).toHaveAccessibleDescription(
      'Set inputs for one evaluation example, then add optional pass or fail checks. Each test case runs against every configured prompt and provider.',
    );

    const addTestCaseButton = screen.getByRole('button', { name: 'Add Test Case' });
    expect(addTestCaseButton).toBeInTheDocument();

    const addAnotherButton = screen.getByRole('button', { name: 'Add and create another' });
    expect(addAnotherButton).toBeInTheDocument();
    expect(screen.getByText(/set inputs for one evaluation example/i)).toBeInTheDocument();
    expect(
      screen.getByText(/runs against every configured prompt and provider/i),
    ).toBeInTheDocument();
  });

  it('should render with the title "Edit Test Case" and show only the "Update Test Case" button when initialValues is provided and open is true', () => {
    const initialValues = {
      description: 'Test description',
      vars: { var1: 'value1' },
      assert: [{ type: 'equals', value: 'expected' }],
    };
    renderComponent({ initialValues });

    expect(screen.getByText('Edit Test Case')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Update Test Case' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Add and create another' })).toBeNull();
  });

  it('keeps dialog actions visible while the test case form scrolls independently', () => {
    renderComponent();

    const dialog = screen.getByRole('dialog');
    const scrollBody = screen.getByTestId('test-case-dialog-scroll-body');
    const footer = screen.getByTestId('test-case-dialog-footer');

    expect(dialog).toHaveClass('flex', 'max-h-[85vh]', 'flex-col', 'overflow-hidden');
    expect(scrollBody).toHaveClass('min-h-0', 'flex-1', 'overflow-y-auto');
    expect(footer).toHaveClass('shrink-0');
  });

  it("should call onAdd with form data and onCancel when 'Add Test Case' button is clicked", async () => {
    renderComponent();

    const testVars = { var1: 'value1', var2: 'value2' };
    const testAsserts: Assertion[] = [{ type: 'equals', value: 'expected value' }];

    act(() => {
      const varsFormProps = mockVarsForm.mock.calls[0][0];
      varsFormProps.onAdd(testVars);

      const assertsFormProps = mockAssertsForm.mock.calls[0][0];
      assertsFormProps.onAdd(testAsserts);
    });

    const addButton = screen.getByRole('button', { name: 'Add Test Case' });
    await userEvent.click(addButton);

    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onAdd).toHaveBeenCalledWith(
      {
        description: '',
        vars: testVars,
        assert: testAsserts,
      },
      true,
    );

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('acknowledges a saved test case while keeping the add flow open for another', async () => {
    renderComponent();

    const testVars = { var1: 'value1', var2: 'value2' };
    const testAsserts: Assertion[] = [{ type: 'equals', value: 'expected value' }];

    act(() => {
      const varsFormProps = mockVarsForm.mock.calls[0][0];
      varsFormProps.onAdd(testVars);

      const assertsFormProps = mockAssertsForm.mock.calls[0][0];
      assertsFormProps.onAdd(testAsserts);
    });

    const addAnotherButton = screen.getByRole('button', { name: 'Add and create another' });
    await userEvent.click(addAnotherButton);

    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onAdd).toHaveBeenCalledWith(
      {
        description: '',
        vars: testVars,
        assert: testAsserts,
      },
      false,
    );

    expect(onCancel).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Test case added. Enter values for the next test case.',
    );
  });

  it('keeps intentional blank inputs when creating another test case', async () => {
    renderComponent();

    await userEvent.click(screen.getByRole('button', { name: 'Add and create another' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add Test Case' }));

    expect(onAdd).toHaveBeenNthCalledWith(
      2,
      {
        description: '',
        vars: { var1: '', var2: '' },
        assert: [],
      },
      true,
    );
  });

  it('prevents saving while an assertion is missing a required value', () => {
    renderComponent();

    act(() => {
      mockAssertsForm.mock.calls[0][0].onValidityChange?.(false);
    });

    const alert = screen.getByRole('alert');
    const addButton = screen.getByRole('button', { name: 'Add Test Case' });
    const addAnotherButton = screen.getByRole('button', { name: 'Add and create another' });

    expect(alert).toHaveTextContent('Complete the highlighted assertion values before saving.');
    expect(addButton).toBeDisabled();
    expect(addAnotherButton).toBeDisabled();
    expect(addButton).toHaveAttribute('aria-describedby', 'test-case-assertion-error');

    act(() => {
      mockAssertsForm.mock.lastCall?.[0].onValidityChange?.(true);
    });

    expect(addButton).not.toBeDisabled();
    expect(addAnotherButton).not.toBeDisabled();
  });

  it('reveals and requires variables needed by selected context assertions', () => {
    renderComponent({ varsList: [] });

    act(() => {
      mockAssertsForm.mock.calls[0][0].onAdd([{ type: 'context-faithfulness' }]);
    });

    expect(mockVarsForm.mock.lastCall?.[0].varsList).toEqual(['query', 'context']);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Context assertions require values for: query, context.',
    );
    const addButton = screen.getByRole('button', { name: 'Add Test Case' });
    expect(addButton).toBeDisabled();
    expect(addButton).toHaveAttribute('aria-describedby', 'test-case-assertion-variable-error');

    act(() => {
      mockVarsForm.mock.lastCall?.[0].onAdd({
        query: 'What changed?',
        context: 'The release includes a new API.',
      });
    });

    expect(addButton).not.toBeDisabled();
  });

  it('reveals and requires variables needed by inherited context assertions', () => {
    renderComponent({
      varsList: [],
      inheritedAssertions: [{ type: 'context-relevance' }],
    });

    expect(mockVarsForm.mock.lastCall?.[0].varsList).toEqual(['query', 'context']);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Context assertions require values for: query, context.',
    );
    expect(screen.getByRole('button', { name: 'Add Test Case' })).toBeDisabled();
  });

  it("should call onAdd with the updated form state and shouldClose=true, then reset the form and call onCancel when the 'Update Test Case' button is clicked in edit mode", async () => {
    const initialValues: TestCase = {
      description: 'Initial description',
      vars: { var1: 'initialValue1', var2: 'initialValue2' },
      assert: [{ type: 'equals', value: 'initialExpectedValue' }],
    };
    renderComponent({ initialValues });

    const updatedVars = { var1: 'updatedValue1', var2: 'updatedValue2' };
    const updatedAsserts: Assertion[] = [{ type: 'contains', value: 'updatedExpectedValue' }];

    act(() => {
      const varsFormProps = mockVarsForm.mock.calls[0][0];
      varsFormProps.onAdd(updatedVars);

      const assertsFormProps = mockAssertsForm.mock.calls[0][0];
      assertsFormProps.onAdd(updatedAsserts);
    });

    const updateButton = screen.getByRole('button', { name: 'Update Test Case' });
    await userEvent.click(updateButton);

    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onAdd).toHaveBeenCalledWith(
      {
        description: 'Initial description',
        vars: updatedVars,
        assert: updatedAsserts,
      },
      true,
    );
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('should call onCancel and not call onAdd when the "Cancel" button is clicked', async () => {
    renderComponent();

    const cancelButton = screen.getByRole('button', { name: 'Cancel' });
    await userEvent.click(cancelButton);

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onAdd).not.toHaveBeenCalled();
  });

  it('confirms before cancelling a test case with unsaved changes', async () => {
    const user = userEvent.setup();
    renderComponent();

    await user.type(screen.getByLabelText('Description'), 'Draft case');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(
      screen.getByRole('dialog', { name: 'Discard test case changes?' }),
    ).toHaveAccessibleDescription('Your unsaved inputs and assertions will be lost.');
    expect(onCancel).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Continue editing' }));
    expect(screen.queryByText('Discard test case changes?')).toBeNull();
    expect(screen.getByLabelText('Description')).toHaveValue('Draft case');

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.click(screen.getByRole('button', { name: 'Discard changes' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('should update form fields when initialValues change', () => {
    const initialValues1: TestCase = {
      description: 'Initial description',
      vars: { var1: 'initial value 1', var2: 'initial value 2' },
      assert: [{ type: 'equals', value: 'initial assert value' }],
    };

    const { rerender } = renderComponent({ initialValues: initialValues1 });

    expect(mockVarsForm.mock.calls[0][0]).toMatchObject({
      initialValues: initialValues1.vars,
    });

    expect(mockAssertsForm.mock.calls[0][0]).toMatchObject({
      initialValues: initialValues1.assert,
    });

    const initialValues2: TestCase = {
      description: 'Updated description',
      vars: { var1: 'updated value 1', var2: 'updated value 2' },
      assert: [{ type: 'contains', value: 'updated assert value' }],
    };

    rerender(
      <TestCaseForm
        open={true}
        onAdd={onAdd}
        varsList={['var1', 'var2']}
        onCancel={onCancel}
        initialValues={initialValues2}
      />,
    );

    // Get the last call since it was re-rendered with new props
    expect(mockVarsForm.mock.lastCall?.[0]).toMatchObject({
      initialValues: initialValues2.vars,
    });

    expect(mockAssertsForm.mock.lastCall?.[0]).toMatchObject({
      initialValues: initialValues2.assert,
    });
  });

  it('should reset form fields when the dialog is closed and reopened', async () => {
    const initialValues: TestCase = {
      description: 'Initial description',
      vars: { var1: 'initial value 1', var2: 'initial value 2' },
      assert: [{ type: 'equals', value: 'initial expected value' }],
    };

    const { rerender } = renderComponent({ initialValues });

    const testVars = { var1: 'updated value 1', var2: 'updated value 2' };
    const testAsserts: Assertion[] = [{ type: 'contains', value: 'updated expected value' }];

    act(() => {
      const varsFormProps = mockVarsForm.mock.calls[0][0];
      varsFormProps.onAdd(testVars);

      const assertsFormProps = mockAssertsForm.mock.calls[0][0];
      assertsFormProps.onAdd(testAsserts);
    });

    await act(async () => {
      onCancel();
    });

    rerender(
      <TestCaseForm
        open={true}
        onAdd={onAdd}
        varsList={['var1', 'var2']}
        onCancel={onCancel}
        initialValues={initialValues}
      />,
    );

    const lastVarsFormCall = mockVarsForm.mock.calls[mockVarsForm.mock.calls.length - 1];
    expect(lastVarsFormCall[0].initialValues).toEqual(initialValues.vars);

    const lastAssertsFormCall = mockAssertsForm.mock.calls[mockAssertsForm.mock.calls.length - 1];
    expect(lastAssertsFormCall[0].initialValues).toEqual(initialValues.assert);
  });

  it('stores displayed blank variables as intentional empty inputs when submitted untouched', async () => {
    renderComponent();

    const addButton = screen.getByRole('button', { name: 'Add Test Case' });
    expect(addButton).toBeInTheDocument();
    await userEvent.click(addButton);

    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onAdd).toHaveBeenCalledWith(
      {
        description: '',
        vars: { var1: '', var2: '' },
        assert: [],
      },
      true,
    );
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('should handle initialValues with null or undefined properties', () => {
    const initialValues = {
      description: null,
      vars: undefined,
      assert: null,
    };

    renderComponent({ initialValues });

    expect(mockVarsForm).toHaveBeenCalled();

    const varsFormProps = mockVarsForm.mock.calls[0][0];
    expect(varsFormProps.initialValues || {}).toEqual({ var1: '', var2: '' });

    expect(mockAssertsForm).toHaveBeenCalled();
    const assertsFormProps = mockAssertsForm.mock.calls[0][0];
    expect(assertsFormProps.initialValues || []).toEqual([]);
  });

  it('should handle an empty varsList gracefully', () => {
    renderComponent({ varsList: [] });

    expect(mockVarsForm).toHaveBeenCalled();
    expect(mockVarsForm.mock.calls[0][0]).toMatchObject({
      varsList: [],
    });
  });

  it('should render a description input field and update description state when changed', async () => {
    renderComponent();

    const descriptionInput = screen.getByLabelText('Description');
    expect(descriptionInput).toBeInTheDocument();
    expect(descriptionInput).toHaveValue('');

    await userEvent.type(descriptionInput, 'My test case description');
    expect(descriptionInput).toHaveValue('My test case description');

    const addButton = screen.getByRole('button', { name: 'Add Test Case' });
    await userEvent.click(addButton);

    expect(onAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        description: 'My test case description',
      }),
      true,
    );
  });

  it('should populate description input with initialValues when editing', () => {
    const initialValues = {
      description: 'Existing description',
      vars: { var1: 'value1' },
      assert: [],
    };
    renderComponent({ initialValues });

    const descriptionInput = screen.getByLabelText('Description');
    expect(descriptionInput).toHaveValue('Existing description');
  });

  it('should create deep copies of initialValues to prevent mutation', async () => {
    const initialAsserts = [{ type: 'equals', value: 'initial value', contextTransform: 'trim' }];
    const initialValues = {
      description: 'Test description',
      vars: { var1: 'initial value' },
      assert: initialAsserts,
    };

    const initialValuesCopy = JSON.parse(JSON.stringify(initialValues));

    renderComponent({ initialValues });

    const testAsserts: Assertion[] = [
      { type: 'contains', value: 'new value', contextTransform: 'lower' },
    ];

    act(() => {
      const assertsFormProps = mockAssertsForm.mock.calls[0][0];
      assertsFormProps.onAdd(testAsserts);
    });

    expect(initialValues.assert).toEqual(initialValuesCopy.assert);
  });
});
