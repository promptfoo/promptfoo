import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Review from './Review';

// Mock the dependencies
vi.mock('@app/hooks/useEmailVerification', () => ({
  useEmailVerification: () => ({
    checkEmailStatus: vi.fn().mockResolvedValue({ canProceed: true }),
  }),
}));

vi.mock('@app/hooks/useTelemetry', () => ({
  useTelemetry: () => ({
    recordEvent: vi.fn(),
  }),
}));

vi.mock('@app/hooks/useToast', () => ({
  useToast: () => ({
    showToast: vi.fn(),
  }),
}));

vi.mock('@app/utils/api', () => ({
  callApi: vi.fn(),
  fetchUserEmail: vi.fn(() => Promise.resolve('test@example.com')),
  fetchUserId: vi.fn(() => Promise.resolve('test-user-id')),
  updateEvalAuthor: vi.fn(() => Promise.resolve({})),
}));

vi.mock('@app/pages/eval-creator/components/YamlEditor', () => ({
  default: ({ initialYaml }: { initialYaml: string }) => (
    <div data-testid="yaml-editor">{initialYaml}</div>
  ),
}));

vi.mock('@promptfoo/redteam/sharedFrontend', () => ({
  getUnifiedConfig: vi.fn().mockReturnValue({
    description: 'Test config',
    plugins: [],
    strategies: [],
  }),
}));

vi.mock('../utils/yamlHelpers', () => ({
  generateOrderedYaml: vi.fn().mockReturnValue('description: Test config\nplugins: []'),
}));

vi.mock('./DefaultTestVariables', () => ({
  default: () => <div data-testid="default-test-variables">Default Test Variables Component</div>,
}));

// Mock the useRedTeamConfig hook
const mockUpdateConfig = vi.fn();
const mockUseRedTeamConfig = vi.fn();

vi.mock('../hooks/useRedTeamConfig', () => ({
  useRedTeamConfig: () => mockUseRedTeamConfig(),
}));

describe('Review Component', () => {
  const defaultConfig = {
    description: 'Test Configuration',
    plugins: [],
    strategies: [],
    purpose: 'Test purpose',
    numTests: 10,
    maxConcurrency: 4,
    target: { id: 'test-target', config: {} },
    applicationDefinition: {},
    entities: [],
    defaultTest: { vars: {} },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseRedTeamConfig.mockReturnValue({
      config: defaultConfig,
      updateConfig: mockUpdateConfig,
    });
  });

  describe('Component Integration', () => {
    it('renders all main sections including DefaultTestVariables component', () => {
      render(
        <Review
          navigateToPlugins={vi.fn()}
          navigateToStrategies={vi.fn()}
          navigateToPurpose={vi.fn()}
        />,
      );

      expect(screen.getByText('Review & Run')).toBeInTheDocument();
      expect(screen.getByText('Configuration Summary')).toBeInTheDocument();
      expect(screen.getByTestId('default-test-variables')).toBeInTheDocument();
      expect(screen.getByText('Run Options')).toBeInTheDocument();
    });

    it('renders configuration description field', () => {
      render(
        <Review
          navigateToPlugins={vi.fn()}
          navigateToStrategies={vi.fn()}
          navigateToPurpose={vi.fn()}
        />,
      );

      const descriptionField = screen.getByLabelText('Description');
      expect(descriptionField).toBeInTheDocument();
      expect(descriptionField).toHaveValue('Test Configuration');
    });

    it('renders DefaultTestVariables component inside AccordionDetails', () => {
      render(
        <Review
          navigateToPlugins={vi.fn()}
          navigateToStrategies={vi.fn()}
          navigateToPurpose={vi.fn()}
        />,
      );

      const defaultTestVariables = screen.getByTestId('default-test-variables');
      const accordionDetails = defaultTestVariables.closest(
        'div[class*="MuiAccordionDetails-root"]',
      );

      expect(accordionDetails).toBeInTheDocument();
    });
  });

  describe('Advanced Configuration Accordion', () => {
    it('should render the accordion collapsed by default when there are no test variables', () => {
      render(
        <Review
          navigateToPlugins={vi.fn()}
          navigateToStrategies={vi.fn()}
          navigateToPurpose={vi.fn()}
        />,
      );

      const accordionSummary = screen
        .getByText('Advanced Configuration')
        .closest('.MuiAccordionSummary-root');
      expect(accordionSummary).not.toHaveClass('Mui-expanded');
    });

    it("should render the 'Advanced Configuration' accordion expanded by default when config.defaultTest.vars contains at least one variable", () => {
      mockUseRedTeamConfig.mockReturnValue({
        config: {
          ...defaultConfig,
          defaultTest: {
            vars: {
              testVar: 'testValue',
            },
          },
        },
        updateConfig: mockUpdateConfig,
      });

      render(
        <Review
          navigateToPlugins={vi.fn()}
          navigateToStrategies={vi.fn()}
          navigateToPurpose={vi.fn()}
        />,
      );

      const accordionSummary = screen.getByRole('button', {
        name: 'Advanced Configuration Optional',
      });
      expect(accordionSummary).toHaveAttribute('aria-expanded', 'true');
    });

    it('displays the advanced configuration description text when the accordion is expanded', async () => {
      render(
        <Review
          navigateToPlugins={vi.fn()}
          navigateToStrategies={vi.fn()}
          navigateToPurpose={vi.fn()}
        />,
      );

      const accordionSummary = screen.getByText('Advanced Configuration').closest('button');

      if (accordionSummary) {
        fireEvent.click(accordionSummary);
      }

      expect(
        screen.getByText(
          'Configure advanced options that apply to all test cases. These settings are for power users who need fine-grained control over their red team evaluation.',
        ),
      ).toBeInTheDocument();
    });
  });

  it('renders DefaultTestVariables without Paper wrapper and title when Advanced Configuration is expanded', async () => {
    render(
      <Review
        navigateToPlugins={vi.fn()}
        navigateToStrategies={vi.fn()}
        navigateToPurpose={vi.fn()}
      />,
    );

    const accordionSummary = screen.getByText('Advanced Configuration');
    fireEvent.click(accordionSummary);

    const defaultTestVariables = await screen.findByTestId('default-test-variables');

    expect(defaultTestVariables).toBeInTheDocument();

    expect(defaultTestVariables.closest('paper')).toBeNull();
  });

  it('should not treat indented lines ending with colons as section headers', () => {
    mockUseRedTeamConfig.mockReturnValue({
      config: {
        ...defaultConfig,
        purpose: `
Application Details:
  This is a test application.
  It has some indented lines:
    - line 1:
    - line 2:
`,
      },
      updateConfig: mockUpdateConfig,
    });

    render(
      <Review
        navigateToPlugins={vi.fn()}
        navigateToStrategies={vi.fn()}
        navigateToPurpose={vi.fn()}
      />,
    );

    const sectionTitles = screen.getAllByRole('heading', { name: 'Application Details' });
    expect(sectionTitles.length).toBe(1);
  });

  it('handles extremely long section headers and content without breaking layout', () => {
    const longHeader = 'This is an extremely long section header that should wrap appropriately:';
    const longContent =
      'This is an extremely long section content that should wrap appropriately. '.repeat(50);
    mockUseRedTeamConfig.mockReturnValue({
      config: {
        ...defaultConfig,
        purpose: `${longHeader}\n${longContent}`,
      },
      updateConfig: mockUpdateConfig,
    });

    render(
      <Review
        navigateToPlugins={vi.fn()}
        navigateToStrategies={vi.fn()}
        navigateToPurpose={vi.fn()}
      />,
    );

    const sectionHeaderElement = screen.getByText(longHeader.slice(0, -1));
    fireEvent.click(sectionHeaderElement);

    expect(
      screen.getByText((content) => {
        return content.includes(longContent.substring(0, 50));
      }),
    ).toBeInTheDocument();
  });

  describe('Custom Policies', () => {
    it('should display the custom policy name in the Custom Policies section when a policy plugin includes a name property in its config', () => {
      const customPolicyName = 'My Custom Policy';
      mockUseRedTeamConfig.mockReturnValue({
        config: {
          ...defaultConfig,
          plugins: [
            {
              id: 'policy',
              config: {
                policy: 'This is my custom policy text.',
                name: customPolicyName,
              },
            },
          ],
        },
        updateConfig: mockUpdateConfig,
      });

      render(
        <Review
          navigateToPlugins={vi.fn()}
          navigateToStrategies={vi.fn()}
          navigateToPurpose={vi.fn()}
        />,
      );

      expect(screen.getByText(customPolicyName)).toBeInTheDocument();
    });

    it("displays 'Custom Policy' as the title when a policy plugin does not include a 'name' property in its config", () => {
      mockUseRedTeamConfig.mockReturnValue({
        config: {
          ...defaultConfig,
          plugins: [
            {
              id: 'policy',
              config: {
                policy: 'This is a test policy.',
              },
            },
          ],
        },
        updateConfig: mockUpdateConfig,
      });

      render(
        <Review
          navigateToPlugins={vi.fn()}
          navigateToStrategies={vi.fn()}
          navigateToPurpose={vi.fn()}
        />,
      );

      expect(screen.getByText('Custom Policies (1)')).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Custom Policy' })).toBeInTheDocument();
    });

    it('handles a mix of named and unnamed policies', () => {
      mockUseRedTeamConfig.mockReturnValue({
        config: {
          ...defaultConfig,
          plugins: [
            { id: 'policy', config: { policy: 'Policy text 1', name: 'Named Policy' } },
            { id: 'policy', config: { policy: 'Policy text 2' } },
            { id: 'policy', config: { policy: 'Policy text 3', name: 'Another Named Policy' } },
            { id: 'policy', config: { policy: 'Policy text 4' } },
          ],
        },
        updateConfig: mockUpdateConfig,
      });

      render(
        <Review
          navigateToPlugins={vi.fn()}
          navigateToStrategies={vi.fn()}
          navigateToPurpose={vi.fn()}
        />,
      );

      expect(screen.getByText('Named Policy')!).toBeInTheDocument();
      expect(screen.getByText('Another Named Policy')!).toBeInTheDocument();

      const customPolicyElements = screen.getAllByText('Custom Policy');
      expect(customPolicyElements.length).toBe(2);
    });

    it('handles extremely long policy names in the Custom Policies section', () => {
      const longPolicyName =
        'This is an extremely long policy name that should be handled gracefully without breaking the layout.';
      mockUseRedTeamConfig.mockReturnValue({
        config: {
          ...defaultConfig,
          plugins: [
            {
              id: 'policy',
              config: {
                policy: 'This is a policy.',
                name: longPolicyName,
              },
            },
          ],
        },
        updateConfig: mockUpdateConfig,
      });

      render(
        <Review
          navigateToPlugins={vi.fn()}
          navigateToStrategies={vi.fn()}
          navigateToPurpose={vi.fn()}
        />,
      );

      const policyNameElement = screen.getByText(longPolicyName);
      expect(policyNameElement).toBeInTheDocument();
    });

    it('displays the "Imported Policy" prefix for policies imported from CSV files', () => {
      mockUseRedTeamConfig.mockReturnValue({
        config: {
          ...defaultConfig,
          plugins: [
            {
              id: 'policy',
              config: {
                policy: 'Test policy text',
                name: 'Imported Policy',
              },
            },
          ],
        },
        updateConfig: mockUpdateConfig,
      });

      render(
        <Review
          navigateToPlugins={vi.fn()}
          navigateToStrategies={vi.fn()}
          navigateToPurpose={vi.fn()}
        />,
      );

      expect(screen.getByText('Imported Policy')).toBeInTheDocument();
    });

    it('renders multiple policies with identical names correctly', () => {
      const policyName = 'Duplicate Policy Name';
      const policyText = 'This is the policy text.';
      const configWithDuplicatePolicyNames = {
        ...defaultConfig,
        plugins: [
          { id: 'policy', config: { name: policyName, policy: policyText } },
          { id: 'policy', config: { name: policyName, policy: policyText } },
          { id: 'policy', config: { name: 'Unique Policy Name', policy: 'unique policy text' } },
        ],
      };

      mockUseRedTeamConfig.mockReturnValue({
        config: configWithDuplicatePolicyNames,
        updateConfig: mockUpdateConfig,
      });

      render(
        <Review
          navigateToPlugins={vi.fn()}
          navigateToStrategies={vi.fn()}
          navigateToPurpose={vi.fn()}
        />,
      );

      const policyElements = screen.getAllByText(policyName);
      expect(policyElements.length).toBe(2);
    });

    it('should remove the correct custom policy from the configuration when the delete button is clicked, even if multiple policies have the same policy text but different names', () => {
      const policyText = 'This is a test policy.';
      const configWithDuplicatePolicies = {
        ...defaultConfig,
        plugins: [
          { id: 'policy', config: { policy: policyText, name: 'Policy A' } },
          { id: 'policy', config: { policy: policyText, name: 'Policy B' } },
          { id: 'policy', config: { policy: 'Different policy', name: 'Policy C' } },
        ],
      };

      mockUseRedTeamConfig.mockReturnValue({
        config: configWithDuplicatePolicies,
        updateConfig: mockUpdateConfig,
      });

      render(
        <Review
          navigateToPlugins={vi.fn()}
          navigateToStrategies={vi.fn()}
          navigateToPurpose={vi.fn()}
        />,
      );

      const policyBElement = screen.getByText('Policy B').closest('div');
      const deleteButton = policyBElement?.querySelector('button');

      if (deleteButton) {
        fireEvent.click(deleteButton);
      }

      expect(mockUpdateConfig).toHaveBeenCalledWith('plugins', [
        { id: 'policy', config: { policy: policyText, name: 'Policy A' } },
        { id: 'policy', config: { policy: 'Different policy', name: 'Policy C' } },
      ]);
    });
  });
});
