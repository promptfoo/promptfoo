import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import type { Assertion, TestCase } from '@promptfoo/types';
import TestCaseForm from './TestCaseDialog';
import VarsForm from './VarsForm';
import AssertsForm from './AssertsForm';

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
    const theme = createTheme();
    return render(
      <ThemeProvider theme={theme}>
        <TestCaseForm {...defaultProps} {...props} />
      </ThemeProvider>,
    );
  };

  it('should render with the title "Add Test Case" and show both "Add Test Case" and "Add Another" buttons when initialValues is undefined and open is true', () => {
    renderComponent();

    const dialogTitle = screen.getByRole('heading', { name: 'Add Test Case' });
    expect(dialogTitle).toBeInTheDocument();

    const addTestCaseButton = screen.getByRole('button', { name: 'Add Test Case' });
    expect(addTestCaseButton).toBeInTheDocument();

    const addAnotherButton = screen.getByRole('button', { name: 'Add Another' });
    expect(addAnotherButton).toBeInTheDocument();
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
    expect(screen.queryByRole('button', { name: 'Add Another' })).toBeNull();
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

  it("should call onAdd with the current form state and shouldClose=false, then reset the form but not call onCancel when the 'Add Another' button is clicked in add mode", async () => {
    renderComponent();

    const testVars = { var1: 'value1', var2: 'value2' };
    const testAsserts: Assertion[] = [{ type: 'equals', value: 'expected value' }];

    act(() => {
      const varsFormProps = mockVarsForm.mock.calls[0][0];
      varsFormProps.onAdd(testVars);

      const assertsFormProps = mockAssertsForm.mock.calls[0][0];
      assertsFormProps.onAdd(testAsserts);
    });

    const addAnotherButton = screen.getByRole('button', { name: 'Add Another' });
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

  it('should update form fields when initialValues change', () => {
    const initialValues1: TestCase = {
      description: 'Initial description',
      vars: { var1: 'initial value 1', var2: 'initial value 2' },
      assert: [{ type: 'equals', value: 'initial assert value' }],
    };

    const { rerender } = renderComponent({ initialValues: initialValues1 });

    expect(mockVarsForm).toHaveBeenCalledWith(
      expect.objectContaining({
        initialValues: initialValues1.vars,
      }),
      expect.anything(),
    );

    expect(mockAssertsForm).toHaveBeenCalledWith(
      expect.objectContaining({
        initialValues: initialValues1.assert,
      }),
      expect.anything(),
    );

    const initialValues2: TestCase = {
      description: 'Updated description',
      vars: { var1: 'updated value 1', var2: 'updated value 2' },
      assert: [{ type: 'contains', value: 'updated assert value' }],
    };

    rerender(
      <ThemeProvider theme={createTheme()}>
        <TestCaseForm
          open={true}
          onAdd={onAdd}
          varsList={['var1', 'var2']}
          onCancel={onCancel}
          initialValues={initialValues2}
        />
      </ThemeProvider>,
    );

    expect(mockVarsForm).toHaveBeenCalledWith(
      expect.objectContaining({
        initialValues: initialValues2.vars,
      }),
      expect.anything(),
    );

    expect(mockAssertsForm).toHaveBeenCalledWith(
      expect.objectContaining({
        initialValues: initialValues2.assert,
      }),
      expect.anything(),
    );
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
      <ThemeProvider theme={createTheme()}>
        <TestCaseForm
          open={true}
          onAdd={onAdd}
          varsList={['var1', 'var2']}
          onCancel={onCancel}
          initialValues={initialValues}
        />
      </ThemeProvider>,
    );

    const lastVarsFormCall = mockVarsForm.mock.calls[mockVarsForm.mock.calls.length - 1];
    expect(lastVarsFormCall[0].initialValues).toEqual(initialValues.vars);

    const lastAssertsFormCall = mockAssertsForm.mock.calls[mockAssertsForm.mock.calls.length - 1];
    expect(lastAssertsFormCall[0].initialValues).toEqual(initialValues.assert);
  });

  it('should call onAdd when form is submitted with empty data (empty vars and asserts)', async () => {
    renderComponent();

    const addButton = screen.getByRole('button', { name: 'Add Test Case' });
    expect(addButton).toBeInTheDocument();
    await userEvent.click(addButton);

    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onAdd).toHaveBeenCalledWith(
      {
        description: '',
        vars: {},
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
    expect(varsFormProps.initialValues || {}).toEqual({});

    expect(mockAssertsForm).toHaveBeenCalled();
    const assertsFormProps = mockAssertsForm.mock.calls[0][0];
    expect(assertsFormProps.initialValues || []).toEqual([]);
  });

  it('should handle an empty varsList gracefully', () => {
    renderComponent({ varsList: [] });

    expect(mockVarsForm).toHaveBeenCalled();
    expect(mockVarsForm).toHaveBeenCalledWith(
      expect.objectContaining({
        varsList: [],
      }),
      expect.anything(),
    );
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
