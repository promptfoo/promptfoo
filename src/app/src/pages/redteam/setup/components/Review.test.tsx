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
      expect(screen.getByText('Running Your Configuration')).toBeInTheDocument();
    });

    it('renders configuration description field', () => {
      render(
        <Review
          navigateToPlugins={vi.fn()}
          navigateToStrategies={vi.fn()}
          navigateToPurpose={vi.fn()}
        />,
      );

      const descriptionField = screen.getByLabelText('Configuration Description');
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

  it('should display an Expand All button when multiple parsedPurposeSections exist, and clicking it should expand/collapse all sections', async () => {
    mockUseRedTeamConfig.mockReturnValue({
      config: {
        ...defaultConfig,
        purpose: 'Section1:\nContent1\nSection2:\nContent2',
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

    const expandAllButton = screen.getByText('Expand All');
    expect(expandAllButton).toBeInTheDocument();

    fireEvent.click(expandAllButton);

    const collapseAllButton = screen.getByText('Collapse All');
    expect(collapseAllButton).toBeInTheDocument();

    expect(screen.getByText('Content1')).toBeVisible();
    expect(screen.getByText('Content2')).toBeVisible();

    fireEvent.click(collapseAllButton);

    expect(screen.queryByText('Content1')).not.toBeInTheDocument();
    expect(screen.queryByText('Content2')).not.toBeInTheDocument();

    const expandAllButtonAgain = screen.getByText('Expand All');
    expect(expandAllButtonAgain).toBeInTheDocument();
  });

  it('should correctly toggle purpose section expansion on multiple clicks', async () => {
    mockUseRedTeamConfig.mockReturnValue({
      config: {
        ...defaultConfig,
        purpose: `Section 1:
Content 1

Section 2:
Content 2`,
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

    const sectionHeaders = await screen.findAllByText(/Section 1/);
    const firstSectionHeader = sectionHeaders[0];

    fireEvent.click(firstSectionHeader);
    const sectionContent = await screen.findByText('Content 1');
    expect(sectionContent).toBeVisible();

    fireEvent.click(firstSectionHeader);
    expect(sectionContent).not.toBeVisible();
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

  it('should properly parse and display the last section in config.purpose when it is not followed by another section header', () => {
    const purposeText = `Section 1:\nContent of section 1.\nSection 2:\nContent of section 2.\nLast Section:\nContent of last section.`;
    mockUseRedTeamConfig.mockReturnValue({
      config: {
        ...defaultConfig,
        purpose: purposeText,
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

    expect(screen.getByText('Last Section')).toBeInTheDocument();
    expect(screen.getByText('Content of last section.')).toBeInTheDocument();
  });
});
