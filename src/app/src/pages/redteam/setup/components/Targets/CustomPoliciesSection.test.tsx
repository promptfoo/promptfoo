import { ToastProvider } from '@app/contexts/ToastContext';
import { useToast } from '@app/hooks/useToast';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import { useRedTeamConfig } from '../../hooks/useRedTeamConfig';
import { CustomPoliciesSection } from './CustomPoliciesSection';

vi.mock('../../hooks/useRedTeamConfig');
vi.mock('@app/hooks/useTelemetry', () => ({
  useTelemetry: () => ({
    recordEvent: vi.fn(),
  }),
}));
vi.mock('@app/hooks/useToast');

const mockUpdateConfig = vi.fn();
const mockShowToast = vi.fn();

const renderComponent = () => {
  const theme = createTheme();
  return render(
    <ThemeProvider theme={theme}>
      <ToastProvider>
        <CustomPoliciesSection />
      </ToastProvider>
    </ThemeProvider>,
  );
};

describe('CustomPoliciesSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    (useRedTeamConfig as unknown as Mock).mockReturnValue({
      config: {
        plugins: [],
      },
      updateConfig: mockUpdateConfig,
    });

    (useToast as unknown as Mock).mockReturnValue({
      showToast: mockShowToast,
    });
  });

  describe('CSV Upload', () => {
    it('should append new policies and show a success toast for a valid CSV upload', async () => {
      renderComponent();

      expect(screen.getByDisplayValue('Custom Policy 1')).toBeInTheDocument();

      const csvContent = 'policy_text\n"Policy from CSV 1"\n"Policy from CSV 2"';
      const file = new File([csvContent], 'policies.csv', { type: 'text/csv' });
      Object.defineProperty(file, 'text', {
        value: () => Promise.resolve(csvContent),
      });

      const uploadButton = screen.getByRole('button', { name: /upload csv/i });
      const fileInput = uploadButton.querySelector('input[type="file"]');
      expect(fileInput).not.toBeNull();

      fireEvent.change(fileInput!, {
        target: { files: [file] },
      });

      await waitFor(() => {
        expect(screen.getByDisplayValue('Custom Policy 2')).toBeInTheDocument();
        expect(screen.getByDisplayValue('Custom Policy 3')).toBeInTheDocument();

        expect(screen.getByDisplayValue('Policy from CSV 1')).toBeInTheDocument();
        expect(screen.getByDisplayValue('Policy from CSV 2')).toBeInTheDocument();

        expect(mockShowToast).toHaveBeenCalledWith(
          'Successfully imported 2 policies from CSV',
          'success',
        );
      });

      expect(screen.getByDisplayValue('Custom Policy 1')).toBeInTheDocument();
    });

    it('should disable the "Upload CSV" button and display "Uploading..." while processing, then re-enable and restore label', async () => {
      renderComponent();

      const csvContent = 'policy_text\n"Policy from CSV 1"';
      const file = new File([csvContent], 'policies.csv', { type: 'text/csv' });
      Object.defineProperty(file, 'text', {
        value: () => Promise.resolve(csvContent),
      });

      const uploadButton = screen.getByRole('button', { name: /upload csv/i });
      const fileInput = uploadButton.querySelector('input[type="file"]');

      fireEvent.change(fileInput!, {
        target: { files: [file] },
      });

      expect(uploadButton).toHaveAttribute('aria-disabled', 'true');
      expect(uploadButton).toHaveClass('Mui-disabled');
      expect(uploadButton).toHaveTextContent('Uploading...');

      await waitFor(() => {
        expect(uploadButton).not.toHaveAttribute('aria-disabled');
        expect(uploadButton).not.toHaveClass('Mui-disabled');
        expect(uploadButton).toHaveTextContent('Upload CSV');
      });
    });

    it('should not add new policies and show a warning toast when a CSV file is uploaded with only empty or whitespace values', async () => {
      renderComponent();

      expect(screen.getByDisplayValue('Custom Policy 1')).toBeInTheDocument();

      const initialPoliciesCount = screen.getAllByLabelText('Policy Text').length;

      const csvContent = 'policy_text\n""\n"   "\n" "';
      const file = new File([csvContent], 'empty_policies.csv', { type: 'text/csv' });
      Object.defineProperty(file, 'text', {
        value: () => Promise.resolve(csvContent),
      });

      const uploadButton = screen.getByRole('button', { name: /upload csv/i });
      const fileInput = uploadButton.querySelector('input[type="file"]');
      expect(fileInput).not.toBeNull();

      fireEvent.change(fileInput!, {
        target: { files: [file] },
      });

      await waitFor(() => {
        const currentPoliciesCount = screen.getAllByLabelText('Policy Text').length;
        expect(currentPoliciesCount).toBe(initialPoliciesCount);

        expect(mockShowToast).toHaveBeenCalledWith(
          'No valid policies found in CSV file',
          'warning',
        );
      });

      expect(screen.getByDisplayValue('Custom Policy 1')).toBeInTheDocument();
    });

    it('should show an error toast when a non-CSV file is uploaded with a .csv extension', async () => {
      renderComponent();

      const invalidCsvContent =
        'This is not a CSV file. <?xml version="1.0" encoding="UTF-8"?> <root> <element> <subelement>Invalid CSV Data</subelement> </element> </root>';
      const file = new File([invalidCsvContent], 'invalid.csv', { type: 'text/plain' });
      Object.defineProperty(file, 'text', {
        value: () => Promise.resolve(invalidCsvContent),
      });

      const uploadButton = screen.getByRole('button', { name: /upload csv/i });
      const fileInput = uploadButton.querySelector('input[type="file"]');
      expect(fileInput).not.toBeNull();

      fireEvent.change(fileInput!, {
        target: { files: [file] },
      });

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith(
          expect.stringContaining('Error parsing CSV:'),
          'error',
        );
      });
    });

    it('should show a warning toast when a CSV file with no columns (empty lines) is uploaded', async () => {
      renderComponent();

      const csvContent = '\n\n\n';
      const file = new File([csvContent], 'empty_policies.csv', { type: 'text/csv' });
      Object.defineProperty(file, 'text', {
        value: () => Promise.resolve(csvContent),
      });

      const uploadButton = screen.getByRole('button', { name: /upload csv/i });
      const fileInput = uploadButton.querySelector('input[type="file"]');
      expect(fileInput).not.toBeNull();

      fireEvent.change(fileInput!, {
        target: { files: [file] },
      });

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith(
          'No valid policies found in CSV file',
          'warning',
        );
      });

      expect(screen.getByDisplayValue('Custom Policy 1')).toBeInTheDocument();
      const policyNameInputs = screen.getAllByLabelText('Policy Name');
      expect(policyNameInputs.length).toBe(1);
    });

    it('should show an error toast when a file cannot be read as text', async () => {
      renderComponent();

      const file = new File([''], 'invalid.csv', { type: 'image/jpeg' });
      Object.defineProperty(file, 'text', {
        value: () => Promise.reject(new Error('File could not be read')),
      });

      const uploadButton = screen.getByRole('button', { name: /upload csv/i });
      const fileInput = uploadButton.querySelector('input[type="file"]');
      expect(fileInput).not.toBeNull();

      fireEvent.change(fileInput!, {
        target: { files: [file] },
      });

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith(
          'Error parsing CSV: Error: File could not be read',
          'error',
        );
      });
    });
  });

  describe('Policy Name Persistence', () => {
    it('should restore policy names from existing config', () => {
      const mockConfigWithPolicies = {
        plugins: [
          {
            id: 'policy',
            config: {
              policy: 'First policy text',
              name: 'Data Privacy Policy',
            },
          },
          {
            id: 'policy',
            config: {
              policy: 'Second policy text',
              name: 'Content Guidelines',
            },
          },
        ],
      };

      (useRedTeamConfig as unknown as Mock).mockReturnValue({
        config: mockConfigWithPolicies,
        updateConfig: mockUpdateConfig,
      });

      renderComponent();

      expect(screen.getByDisplayValue('Data Privacy Policy')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Content Guidelines')).toBeInTheDocument();
      expect(screen.getByDisplayValue('First policy text')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Second policy text')).toBeInTheDocument();
    });

    it('should fall back to default names when config has no names', () => {
      const mockConfigWithoutNames = {
        plugins: [
          {
            id: 'policy',
            config: {
              policy: 'Policy without name',
            },
          },
        ],
      };

      (useRedTeamConfig as unknown as Mock).mockReturnValue({
        config: mockConfigWithoutNames,
        updateConfig: mockUpdateConfig,
      });

      renderComponent();

      expect(screen.getByDisplayValue('Custom Policy 1')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Policy without name')).toBeInTheDocument();
    });

    it('should save policy names to config when policies are synced', async () => {
      renderComponent();

      // Change the default policy name
      const policyNameInput = screen.getByDisplayValue('Custom Policy 1');
      fireEvent.change(policyNameInput, { target: { value: 'My Custom Policy' } });

      // Add policy text to trigger sync
      const policyTextInput = screen.getByLabelText('Policy Text');
      fireEvent.change(policyTextInput, { target: { value: 'Test policy content' } });

      // Wait for debounced update
      await waitFor(
        () => {
          expect(mockUpdateConfig).toHaveBeenCalledWith('plugins', [
            {
              id: 'policy',
              config: {
                policy: 'Test policy content',
                name: 'My Custom Policy',
              },
            },
          ]);
        },
        { timeout: 1000 },
      );
    });

    it('should use "Custom Policy" prefix for CSV imports', async () => {
      renderComponent();

      const csvContent = 'policy_text\n"CSV imported policy"';
      const file = new File([csvContent], 'policies.csv', { type: 'text/csv' });
      Object.defineProperty(file, 'text', {
        value: () => Promise.resolve(csvContent),
      });

      const uploadButton = screen.getByRole('button', { name: /upload csv/i });
      const fileInput = uploadButton.querySelector('input[type="file"]');

      fireEvent.change(fileInput!, {
        target: { files: [file] },
      });

      await waitFor(() => {
        expect(screen.getByDisplayValue('Custom Policy 2')).toBeInTheDocument();
        expect(screen.getByDisplayValue('CSV imported policy')).toBeInTheDocument();
      });
    });
  });

  describe('User Interactions', () => {
    it("should add a new policy with a default name and empty policy text when the 'Add Policy' button is clicked", async () => {
      renderComponent();

      const addPolicyButton = screen.getByRole('button', { name: /add policy/i });
      fireEvent.click(addPolicyButton);

      await waitFor(() => {
        expect(screen.getByDisplayValue('Custom Policy 2')).toBeInTheDocument();
      });

      const policyTextAreas = screen.getAllByLabelText('Policy Text');
      expect(policyTextAreas.length).toBeGreaterThanOrEqual(2);

      const newPolicyTextArea = policyTextAreas[policyTextAreas.length - 1] as HTMLTextAreaElement;
      expect(newPolicyTextArea.value).toBe('');
    });

    it('should update the displayed policy name and policy text when the user edits the respective input fields for an existing policy', async () => {
      renderComponent();

      const policyNameInput = screen.getByLabelText('Policy Name');
      const policyTextInput = screen.getByLabelText('Policy Text');

      fireEvent.change(policyNameInput, { target: { value: 'Updated Policy Name' } });
      fireEvent.change(policyTextInput, { target: { value: 'Updated policy text.' } });

      expect(policyNameInput).toHaveValue('Updated Policy Name');
      expect(policyTextInput).toHaveValue('Updated policy text.');
    });

    it('should remove a policy from the list when the delete icon is clicked for that policy', async () => {
      renderComponent();

      const deleteButton = screen.getByTestId('DeleteIcon').closest('button');

      if (!deleteButton) {
        throw new Error('Delete button not found');
      }

      fireEvent.click(deleteButton);

      await waitFor(() => {
        expect(screen.queryByDisplayValue('Custom Policy 1')).toBeNull();
      });
    });

    it('should not save policy names to config when user navigates away before debounce', async () => {
      vi.useFakeTimers();
      const { unmount } = renderComponent();

      const policyNameInput = screen.getByDisplayValue('Custom Policy 1');
      fireEvent.change(policyNameInput, { target: { value: 'Unsaved Policy Name' } });

      expect(mockUpdateConfig).not.toHaveBeenCalled();

      vi.advanceTimersByTime(499);

      unmount();

      expect(mockUpdateConfig).not.toHaveBeenCalled();

      vi.useRealTimers();
    });
  });

  describe('Large Dataset Handling', () => {
    it('should correctly increment policy names after importing multiple CSV policies', async () => {
      const initialPolicies = [
        {
          id: 'policy-1',
          name: 'Custom Policy 1',
          policy: 'Initial policy text',
          isExpanded: true,
        },
        {
          id: 'policy-2',
          name: 'Custom Policy 2',
          policy: 'Another policy text',
          isExpanded: true,
        },
      ];

      (useRedTeamConfig as unknown as Mock).mockReturnValue({
        config: {
          plugins: initialPolicies.map((policy) => ({
            id: 'policy',
            config: {
              policy: policy.policy,
              name: policy.name,
            },
          })),
        },
        updateConfig: mockUpdateConfig,
      });

      renderComponent();

      // Use 10 policies instead of 100 for faster test execution
      const numPolicies = 10;
      let csvContent = 'policy_text\n';
      for (let i = 0; i < numPolicies; i++) {
        csvContent += `"Policy from CSV ${i + 1}"\n`;
      }

      const file = new File([csvContent], 'policies.csv', { type: 'text/csv' });
      Object.defineProperty(file, 'text', {
        value: () => Promise.resolve(csvContent),
      });

      const uploadButton = screen.getByRole('button', { name: /upload csv/i });
      const fileInput = uploadButton.querySelector('input[type="file"]');

      fireEvent.change(fileInput!, {
        target: { files: [file] },
      });

      await waitFor(() => {
        // Verify total count (2 initial + 10 from CSV = 12)
        const policyNameInputs = screen.getAllByLabelText('Policy Name');
        expect(policyNameInputs).toHaveLength(12);

        // Verify first and last imported policies have correct names
        expect(screen.getByDisplayValue('Custom Policy 3')).toBeInTheDocument();
        expect(screen.getByDisplayValue('Custom Policy 12')).toBeInTheDocument();

        // Verify original policies are still present
        expect(screen.getByDisplayValue('Custom Policy 1')).toBeInTheDocument();
        expect(screen.getByDisplayValue('Custom Policy 2')).toBeInTheDocument();
      });
    });
  });
});
