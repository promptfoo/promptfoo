import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import TestCasesSection from './TestCasesSection';
import { useStore } from '@app/stores/evalConfig';
import type { TestCase } from '@promptfoo/types';
import TestCaseDialog from './TestCaseDialog';

vi.mock('@app/stores/evalConfig');

vi.mock('./TestCaseDialog', () => ({
  default: vi.fn(() => <div data-testid="mock-test-case-dialog" />),
}));

vi.mock('csv-parse/sync', () => ({
  parse: vi.fn().mockReturnValue([
    { description: 'CSV test case 1', var1: 'value1' },
    { description: 'CSV test case 2', var1: 'value2' },
  ]),
}));

vi.mock('@promptfoo/csv', () => ({
  testCaseFromCsvRow: vi.fn((row) => ({
    description: row.description,
    vars: { var1: row.var1 },
    assert: [],
  })),
}));

const mockUpdateConfig = vi.fn();
const mockedUseStore = vi.mocked(useStore);
const mockedTestCaseDialog = vi.mocked(TestCaseDialog);

describe('TestCasesSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedUseStore.mockReturnValue({
      config: { tests: [] },
      updateConfig: mockUpdateConfig,
      getTestSuite: vi.fn(),
      setConfig: vi.fn(),
      reset: vi.fn(),
    });
  });

  it('should display a message indicating no test cases are present when the test case list is empty', () => {
    render(<TestCasesSection varsList={[]} />);
    expect(screen.getByText('No test cases added yet.')).toBeInTheDocument();
  });

  it('should render correctly when varsList is an empty array', () => {
    render(<TestCasesSection varsList={[]} />);

    expect(screen.getByText('No test cases added yet.')).toBeInTheDocument();

    const addButton = screen.getByRole('button', { name: 'Add Test Case' });
    expect(addButton).toBeInTheDocument();
  });

  it('should add a new test case to the table when the user fills out the TestCaseDialog and confirms addition', async () => {
    const { rerender } = render(<TestCasesSection varsList={['topic']} />);

    expect(screen.getByText('No test cases added yet.')).toBeInTheDocument();
    expect(screen.queryByText('New test case description')).not.toBeInTheDocument();

    const addButton = screen.getByRole('button', { name: 'Add Test Case' });
    fireEvent.click(addButton);

    await waitFor(() => {
      expect(mockedTestCaseDialog).toHaveBeenCalled();
      const lastCallProps = mockedTestCaseDialog.mock.calls.slice(-1)[0][0];
      expect(lastCallProps.open).toBe(true);
    });

    const { onAdd } = mockedTestCaseDialog.mock.calls.slice(-1)[0][0];
    const newTestCase: TestCase = {
      description: 'New test case description',
      vars: {
        topic: 'testing',
      },
      assert: [{ type: 'contains', value: 'test' }],
    };

    act(() => {
      onAdd(newTestCase, true);
    });

    expect(mockUpdateConfig).toHaveBeenCalledTimes(1);
    expect(mockUpdateConfig).toHaveBeenCalledWith({ tests: [newTestCase] });

    mockedUseStore.mockReturnValue({
      config: { tests: [newTestCase] },
      updateConfig: mockUpdateConfig,
      getTestSuite: vi.fn(),
      setConfig: vi.fn(),
      reset: vi.fn(),
    });
    rerender(<TestCasesSection varsList={['topic']} />);

    await waitFor(() => {
      expect(screen.getByText('New test case description')).toBeInTheDocument();
      expect(screen.getByText('1 assertions')).toBeInTheDocument();
      expect(screen.getByText('topic=testing')).toBeInTheDocument();
      expect(screen.queryByText('No test cases added yet.')).not.toBeInTheDocument();
    });
  });

  it('should update an existing test case in the table when the user edits it via the TestCaseDialog and confirms the update', async () => {
    const initialTestCase: TestCase = {
      description: 'Initial test case description',
      vars: {
        topic: 'initial',
      },
      assert: [{ type: 'contains', value: 'initial' }],
    };

    mockedUseStore.mockReturnValue({
      config: { tests: [initialTestCase] },
      updateConfig: mockUpdateConfig,
      getTestSuite: vi.fn(),
      setConfig: vi.fn(),
      reset: vi.fn(),
    });

    const { rerender } = render(<TestCasesSection varsList={['topic']} />);

    expect(screen.getByText('Initial test case description')).toBeInTheDocument();
    expect(screen.getByText('1 assertions')).toBeInTheDocument();
    expect(screen.getByText('topic=initial')).toBeInTheDocument();

    const editButton = screen.getByTestId('EditIcon').closest('button');
    if (!editButton) {
      throw new Error('Edit button not found');
    }
    fireEvent.click(editButton);

    await waitFor(() => {
      expect(mockedTestCaseDialog).toHaveBeenCalled();
      const lastCallProps = mockedTestCaseDialog.mock.calls.slice(-1)[0][0];
      expect(lastCallProps.open).toBe(true);
      expect(lastCallProps.initialValues).toEqual(initialTestCase);
    });

    const { onAdd } = mockedTestCaseDialog.mock.calls.slice(-1)[0][0];
    const updatedTestCase: TestCase = {
      description: 'Updated test case description',
      vars: {
        topic: 'updated',
      },
      assert: [{ type: 'contains', value: 'updated' }],
    };

    act(() => {
      onAdd(updatedTestCase, true);
    });

    expect(mockUpdateConfig).toHaveBeenCalledTimes(1);
    expect(mockUpdateConfig).toHaveBeenCalledWith({ tests: [updatedTestCase] });

    mockedUseStore.mockReturnValue({
      config: { tests: [updatedTestCase] },
      updateConfig: mockUpdateConfig,
      getTestSuite: vi.fn(),
      setConfig: vi.fn(),
      reset: vi.fn(),
    });
    rerender(<TestCasesSection varsList={['topic']} />);

    await waitFor(() => {
      expect(screen.getByText('Updated test case description')).toBeInTheDocument();
      expect(screen.getByText('1 assertions')).toBeInTheDocument();
      expect(screen.getByText('topic=updated')).toBeInTheDocument();
      expect(screen.queryByText('Initial test case description')).not.toBeInTheDocument();
    });
  });

  it('should remove a test case from the table when the user confirms deletion in the delete confirmation dialog', async () => {
    const initialTestCase: TestCase = {
      description: 'Test case to delete',
      vars: { topic: 'deletion' },
      assert: [{ type: 'contains', value: 'delete' }],
    };

    mockedUseStore.mockReturnValue({
      config: { tests: [initialTestCase] },
      updateConfig: mockUpdateConfig,
      getTestSuite: vi.fn(),
      setConfig: vi.fn(),
      reset: vi.fn(),
    });

    const { rerender } = render(<TestCasesSection varsList={['topic']} />);

    expect(screen.getByText('Test case to delete')).toBeInTheDocument();

    const deleteButton = screen.getByTestId('DeleteIcon').closest('button');

    if (!deleteButton) {
      throw new Error('Delete button not found');
    }

    fireEvent.click(deleteButton);

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'Delete Test Case' })).toBeInTheDocument();
    });
    const confirmDeleteButton = screen.getByRole('button', { name: 'Delete' });
    await act(async () => {
      fireEvent.click(confirmDeleteButton);
      await waitFor(() => {
        expect(mockUpdateConfig).toHaveBeenCalledTimes(1);
        expect(mockUpdateConfig).toHaveBeenCalledWith({ tests: [] });
      });
    });

    mockedUseStore.mockReturnValue({
      config: { tests: [] },
      updateConfig: mockUpdateConfig,
      getTestSuite: vi.fn(),
      setConfig: vi.fn(),
      reset: vi.fn(),
    });
    rerender(<TestCasesSection varsList={['topic']} />);

    await waitFor(() => {
      expect(screen.getByText('No test cases added yet.')).toBeInTheDocument();
      expect(screen.queryByText('Test case to delete')).not.toBeInTheDocument();
    });
  });

  it('should duplicate a test case in the table when the user clicks the duplicate icon', async () => {
    const initialTestCase: TestCase = {
      description: 'Original test case',
      vars: { input: 'test' },
      assert: [{ type: 'contains', value: 'test' }],
    };

    mockedUseStore.mockReturnValue({
      config: { tests: [initialTestCase] },
      updateConfig: mockUpdateConfig,
      getTestSuite: vi.fn(),
      setConfig: vi.fn(),
      reset: vi.fn(),
    });

    const { rerender } = render(<TestCasesSection varsList={['input']} />);

    expect(screen.getByText('Original test case')).toBeInTheDocument();

    const duplicateButton = screen.getByTestId('ContentCopyIcon').closest('button');

    if (!duplicateButton) {
      throw new Error('Duplicate button not found');
    }

    await act(async () => {
      fireEvent.click(duplicateButton);
    });

    expect(mockUpdateConfig).toHaveBeenCalledTimes(1);
    const expectedTestCases = [initialTestCase, { ...initialTestCase }];
    expect(mockUpdateConfig).toHaveBeenCalledWith({ tests: expectedTestCases });

    mockedUseStore.mockReturnValue({
      config: { tests: [initialTestCase, { ...initialTestCase }] },
      updateConfig: mockUpdateConfig,
      getTestSuite: vi.fn(),
      setConfig: vi.fn(),
      reset: vi.fn(),
    });
    rerender(<TestCasesSection varsList={['input']} />);

    await waitFor(() => {
      expect(screen.getAllByText('Original test case').length).toBe(2);
    });
  });

  it('should append new test cases to the table when the user uploads a valid CSV file', async () => {
    const { rerender } = render(<TestCasesSection varsList={['var1']} />);

    expect(screen.getByText('No test cases added yet.')).toBeInTheDocument();

    const csvContent = 'description,var1\nCSV test case 1,value1\nCSV test case 2,value2';
    const csvFile = new File([csvContent], 'test.csv', { type: 'text/csv' });

    const fileInput = screen.getByLabelText('Upload test cases from csv');
    const inputElement = fileInput.querySelector('input') as HTMLInputElement;

    fireEvent.change(inputElement, { target: { files: [csvFile] } });

    await waitFor(() => {
      expect(mockUpdateConfig).toHaveBeenCalledTimes(1);
      const expectedTestCases = [
        {
          description: 'CSV test case 1',
          vars: { var1: 'value1' },
          assert: [],
        },
        {
          description: 'CSV test case 2',
          vars: { var1: 'value2' },
          assert: [],
        },
      ];
      expect(mockUpdateConfig).toHaveBeenCalledWith({ tests: expectedTestCases });
    });

    mockedUseStore.mockReturnValue({
      config: {
        tests: [
          {
            description: 'CSV test case 1',
            vars: { var1: 'value1' },
            assert: [],
          },
          {
            description: 'CSV test case 2',
            vars: { var1: 'value2' },
            assert: [],
          },
        ],
      },
      updateConfig: mockUpdateConfig,
      getTestSuite: vi.fn(),
      setConfig: vi.fn(),
      reset: vi.fn(),
    });
    rerender(<TestCasesSection varsList={['var1']} />);

    await waitFor(() => {
      expect(screen.getByText('CSV test case 1')).toBeInTheDocument();
      expect(screen.getByText('CSV test case 2')).toBeInTheDocument();
      expect(screen.getByText('var1=value1')).toBeInTheDocument();
      expect(screen.getByText('var1=value2')).toBeInTheDocument();
      expect(screen.queryByText('No test cases added yet.')).not.toBeInTheDocument();
    });
  });

  it('should add an example test case when the "Add Example" button is clicked', async () => {
    const { rerender } = render(<TestCasesSection varsList={['animal', 'location']} />);

    expect(screen.getByText('No test cases added yet.')).toBeInTheDocument();

    const addExampleButton = screen.getByRole('button', { name: 'Add Example' });
    fireEvent.click(addExampleButton);

    const exampleTestCase: TestCase = {
      description: 'Fun animal adventure story',
      vars: {
        animal: 'penguin',
        location: 'tropical island',
      },
      assert: [
        {
          type: 'contains-any',
          value: ['penguin', 'adventure', 'tropical', 'island'],
        },
        {
          type: 'llm-rubric',
          value:
            'Is this a fun, child-friendly story featuring a penguin on a tropical island adventure?\n\nCriteria:\n1. Does it mention a penguin as the main character?\n2. Does the story take place on a tropical island?\n3. Is it entertaining and appropriate for children?\n4. Does it have a sense of adventure?',
        },
      ],
    };

    expect(mockUpdateConfig).toHaveBeenCalledTimes(1);
    expect(mockUpdateConfig).toHaveBeenCalledWith({ tests: [exampleTestCase] });

    mockedUseStore.mockReturnValue({
      config: { tests: [exampleTestCase] },
      updateConfig: mockUpdateConfig,
      getTestSuite: vi.fn(),
      setConfig: vi.fn(),
      reset: vi.fn(),
    });
    rerender(<TestCasesSection varsList={['animal', 'location']} />);

    await waitFor(() => {
      expect(screen.getByText('Fun animal adventure story')).toBeInTheDocument();
      expect(screen.getByText('2 assertions')).toBeInTheDocument();
      expect(screen.getByText('animal=penguin, location=tropical island')).toBeInTheDocument();
      expect(screen.queryByText('No test cases added yet.')).not.toBeInTheDocument();
    });
  });

  it('should preserve edits when switching between test cases without saving', async () => {
    const initialTestCases: TestCase[] = [
      { description: 'Test Case 1', vars: {}, assert: [] },
      { description: 'Test Case 2', vars: {}, assert: [] },
    ];

    mockedUseStore.mockReturnValue({
      config: { tests: initialTestCases },
      updateConfig: mockUpdateConfig,
      getTestSuite: vi.fn(),
      setConfig: vi.fn(),
      reset: vi.fn(),
    });

    const { rerender } = render(<TestCasesSection varsList={[]} />);

    expect(screen.getByText('Test Case 1')).toBeInTheDocument();
    expect(screen.getByText('Test Case 2')).toBeInTheDocument();

    const firstRow = screen.getByText('Test Case 1').closest('tr');
    fireEvent.click(firstRow!);

    await waitFor(() => {
      expect(mockedTestCaseDialog).toHaveBeenCalled();
    });

    const { onAdd: onAddFirst } = mockedTestCaseDialog.mock.calls.slice(-1)[0][0];
    const updatedTestCase1: TestCase = {
      ...initialTestCases[0],
      description: 'Updated Test Case 1',
    };

    act(() => {
      onAddFirst(updatedTestCase1, false);
    });

    const secondRow = screen.getByText('Test Case 2').closest('tr');
    fireEvent.click(secondRow!);

    await waitFor(() => {
      expect(mockUpdateConfig).toHaveBeenCalledTimes(1);
      expect(mockUpdateConfig).toHaveBeenCalledWith({
        tests: [updatedTestCase1, initialTestCases[1]],
      });
    });

    mockedUseStore.mockReturnValue({
      config: { tests: [updatedTestCase1, initialTestCases[1]] },
      updateConfig: mockUpdateConfig,
      getTestSuite: vi.fn(),
      setConfig: vi.fn(),
      reset: vi.fn(),
    });
    rerender(<TestCasesSection varsList={[]} />);

    await waitFor(() => {
      expect(screen.getByText('Updated Test Case 1')).toBeInTheDocument();
    });
  });

  it('should render without errors and display variables with special characters correctly', async () => {
    const varsListWithSpecialChars = [
      '{{var-name}}',
      '{{var_with_underscores}}',
      '{{123numericVar}}',
    ];
    const { rerender } = render(<TestCasesSection varsList={varsListWithSpecialChars} />);

    expect(screen.getByText('No test cases added yet.')).toBeInTheDocument();

    const addButton = screen.getByRole('button', { name: 'Add Test Case' });
    fireEvent.click(addButton);

    await waitFor(() => {
      expect(mockedTestCaseDialog).toHaveBeenCalled();
      const lastCallProps = mockedTestCaseDialog.mock.calls.slice(-1)[0][0];
      expect(lastCallProps.open).toBe(true);
      expect(lastCallProps.varsList).toEqual(varsListWithSpecialChars);
    });

    const { onAdd } = mockedTestCaseDialog.mock.calls.slice(-1)[0][0];
    const newTestCase: TestCase = {
      description: 'Test case with special vars',
      vars: {
        '{{var-name}}': 'value1',
        '{{var_with_underscores}}': 'value2',
        '{{123numericVar}}': 'value3',
      },
      assert: [{ type: 'contains', value: 'test' }],
    };

    act(() => {
      onAdd(newTestCase, true);
    });

    expect(mockUpdateConfig).toHaveBeenCalledTimes(1);
    expect(mockUpdateConfig).toHaveBeenCalledWith({ tests: [newTestCase] });

    mockedUseStore.mockReturnValue({
      config: { tests: [newTestCase] },
      updateConfig: mockUpdateConfig,
      getTestSuite: vi.fn(),
      setConfig: vi.fn(),
      reset: vi.fn(),
    });
    rerender(<TestCasesSection varsList={varsListWithSpecialChars} />);

    await waitFor(() => {
      expect(screen.getByText('Test case with special vars')).toBeInTheDocument();
      expect(screen.getByText('1 assertions')).toBeInTheDocument();
      expect(
        screen.getByText(
          '{{var-name}}=value1, {{var_with_underscores}}=value2, {{123numericVar}}=value3',
        ),
      ).toBeInTheDocument();
      expect(screen.queryByText('No test cases added yet.')).not.toBeInTheDocument();
    });
  });

  it('TestCasesSection should cancel test case deletion when the Cancel button is clicked in the delete dialog', async () => {
    const initialTestCase: TestCase = {
      description: 'Initial test case',
      vars: { topic: 'initial' },
      assert: [{ type: 'contains', value: 'initial' }],
    };
    mockedUseStore.mockReturnValue({
      config: { tests: [initialTestCase] },
      updateConfig: mockUpdateConfig,
      getTestSuite: vi.fn(),
      setConfig: vi.fn(),
      reset: vi.fn(),
    });

    render(<TestCasesSection varsList={['topic']} />);

    const deleteButton = screen.getByTestId('DeleteIcon').closest('button');

    if (!deleteButton) {
      throw new Error('Delete button not found');
    }

    fireEvent.click(deleteButton);

    expect(screen.getByRole('dialog', { name: 'Delete Test Case' })).toBeVisible();

    const cancelButton = screen.getByRole('button', { name: 'Cancel' });
    fireEvent.click(cancelButton);

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Delete Test Case' })).not.toBeInTheDocument();
    });

    expect(mockUpdateConfig).not.toHaveBeenCalled();
  });

  it('should cancel test case editing when the onCancel callback is triggered in the TestCaseDialog', async () => {
    const { rerender } = render(<TestCasesSection varsList={['topic']} />);

    const initialTestCase: TestCase = {
      description: 'Initial test case',
      vars: { topic: 'initial' },
      assert: [{ type: 'contains', value: 'initial' }],
    };
    mockedUseStore.mockReturnValue({
      config: { tests: [initialTestCase] },
      updateConfig: mockUpdateConfig,
      getTestSuite: vi.fn(),
      setConfig: vi.fn(),
      reset: vi.fn(),
    });
    rerender(<TestCasesSection varsList={['topic']} />);
    await waitFor(() => {
      expect(screen.getByText('Initial test case')).toBeInTheDocument();
    });

    const testCaseRow = screen.getByText('Initial test case');
    fireEvent.click(testCaseRow);

    await waitFor(() => {
      expect(mockedTestCaseDialog).toHaveBeenCalled();
      const lastCallProps = mockedTestCaseDialog.mock.calls.slice(-1)[0][0];
      expect(lastCallProps.open).toBe(true);
    });

    const { onCancel } = mockedTestCaseDialog.mock.calls.slice(-1)[0][0];

    act(() => {
      onCancel();
    });

    mockedTestCaseDialog.mockClear();

    rerender(<TestCasesSection varsList={['topic']} />);

    await waitFor(() => {
      expect(mockedTestCaseDialog).toHaveBeenCalled();
      const lastCallProps = mockedTestCaseDialog.mock.calls.slice(-1)[0][0];
      expect(lastCallProps.open).toBe(false);
      expect(lastCallProps.initialValues).toBeUndefined();
    });
  });
});
