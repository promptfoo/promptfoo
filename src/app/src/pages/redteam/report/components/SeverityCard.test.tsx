import { renderWithProviders } from '@app/utils/testutils';
import { red } from '@mui/material/colors';
import { Severity } from '@promptfoo/redteam/constants';
import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SeverityCard from './SeverityCard';
import { useTheme } from '@mui/material/styles';

describe('SeverityCard', () => {
  const mockNavigateToIssues = vi.fn();

  beforeEach(() => {
    mockNavigateToIssues.mockClear();
  });

  describe('Styles and Colors', () => {
    it.each([
      {
        severity: Severity.Critical,
        severityColor: red[900],
        backgroundColor: 'rgba(183, 28, 28, 0.05)',
        displayName: 'Critical',
      },
      {
        severity: Severity.High,
        severityColor: red[500],
        backgroundColor: 'rgba(244, 67, 54, 0.05)',
        displayName: 'High',
      },
      {
        severity: Severity.Medium,
        severityColor: '#ed6c02', // warning.main color
        backgroundColor: 'rgba(237, 108, 2, 0.05)',
        displayName: 'Medium',
      },
      {
        severity: Severity.Low,
        severityColor: '#2e7d32', // success.main color
        backgroundColor: 'rgba(46, 125, 50, 0.05)',
        displayName: 'Low',
      },
    ])('should render with correct styles for $displayName severity with issues', ({
      severity,
      severityColor,
      backgroundColor,
      displayName,
    }) => {
      const { container } = renderWithProviders(
        <SeverityCard
          severity={severity}
          issueCount={3}
          navigateOnClick={false}
          navigateToIssues={mockNavigateToIssues}
        />,
      );

      const card = container.querySelector('.MuiCard-root') as HTMLElement;

      // Check border color
      expect(card).toHaveStyle(`border-left-color: ${severityColor}`);

      // Check background color with alpha
      expect(card).toHaveStyle(`background-color: ${backgroundColor}`);

      // Check text colors
      const title = screen.getByText(displayName);
      const count = screen.getByText('3');
      const label = screen.getByText('Vulnerabilities');

      expect(title).toHaveStyle(`color: ${severityColor}`);
      expect(count).toHaveStyle(`color: ${severityColor}`);
      expect(label).toHaveStyle(`color: ${severityColor}`);
    });

    it('should render with disabled styles when no issues', () => {
      const { container } = renderWithProviders(
        <SeverityCard
          severity={Severity.Critical}
          issueCount={0}
          navigateOnClick={false}
          navigateToIssues={mockNavigateToIssues}
        />,
      );

      const card = container.querySelector('.MuiCard-root') as HTMLElement;

      // Should have disabled text color and transparent background
      expect(card).toHaveStyle('background-color: rgba(0, 0, 0, 0)');
      expect(card).toHaveStyle('filter: grayscale(0.5)');

      // Text should be disabled color
      const title = screen.getByText('Critical');
      const count = screen.getByText('0');
      const label = screen.getByText('Vulnerabilities');

      // Disabled color should be theme.palette.text.disabled
      expect(title).toHaveStyle('color: rgba(0, 0, 0, 0.38)'); // text.disabled in light mode
      expect(count).toHaveStyle('color: rgba(0, 0, 0, 0.38)');
      expect(label).toHaveStyle('color: rgba(0, 0, 0, 0.38)');
    });

    it('should render with correct styles in dark mode', () => {
      const { container } = renderWithProviders(
        <SeverityCard
          severity={Severity.Critical}
          issueCount={5}
          navigateOnClick={false}
          navigateToIssues={mockNavigateToIssues}
        />,
        {},
        { darkMode: true },
      );

      const card = container.querySelector('.MuiCard-root') as HTMLElement;
      const severityColor = red[900];

      expect(card).toHaveStyle(`border-left-color: ${severityColor}`);
      expect(card).toHaveStyle(`background-color: rgba(183, 28, 28, 0.05)`);

      const title = screen.getByText('Critical');
      expect(title).toHaveStyle(`color: ${severityColor}`);
    });
  });

  describe('NavigateToIssues Callback', () => {
    it.each([
      { severity: Severity.Critical, displayName: 'Critical' },
      { severity: Severity.High, displayName: 'High' },
      { severity: Severity.Medium, displayName: 'Medium' },
      { severity: Severity.Low, displayName: 'Low' },
    ])('should call navigateToIssues when clicked with navigateOnClick enabled for $displayName', ({
      severity,
    }) => {
      renderWithProviders(
        <SeverityCard
          severity={severity}
          issueCount={5}
          navigateOnClick={true}
          navigateToIssues={mockNavigateToIssues}
        />,
      );

      const cardActionArea = screen.getByRole('button');
      fireEvent.click(cardActionArea);

      expect(mockNavigateToIssues).toHaveBeenCalledTimes(1);
      expect(mockNavigateToIssues).toHaveBeenCalledWith({ severity });
    });

    it('should not call navigateToIssues when clicked with navigateOnClick disabled', () => {
      renderWithProviders(
        <SeverityCard
          severity={Severity.Critical}
          issueCount={5}
          navigateOnClick={false}
          navigateToIssues={mockNavigateToIssues}
        />,
      );

      // Should not render CardActionArea when navigateOnClick is false
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });

    it('should not call navigateToIssues when no issues exist', () => {
      renderWithProviders(
        <SeverityCard
          severity={Severity.Critical}
          issueCount={0}
          navigateOnClick={true}
          navigateToIssues={mockNavigateToIssues}
        />,
      );

      // Should not render CardActionArea when no issues exist
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });
  });

  describe('CardActionArea Props', () => {
    it.each([
      { severity: Severity.Critical, displayName: 'Critical' },
      { severity: Severity.High, displayName: 'High' },
      { severity: Severity.Medium, displayName: 'Medium' },
      { severity: Severity.Low, displayName: 'Low' },
    ])('should render CardActionArea with correct props when navigateOnClick is true and has issues for $displayName', ({
      severity,
      displayName,
    }) => {
      renderWithProviders(
        <SeverityCard
          severity={severity}
          issueCount={3}
          navigateOnClick={true}
          navigateToIssues={mockNavigateToIssues}
        />,
      );

      const cardActionArea = screen.getByRole('button');

      expect(cardActionArea).toHaveAttribute('type', 'button');
      expect(cardActionArea).toHaveAttribute('tabIndex', '0');
      expect(cardActionArea).toHaveAttribute(
        'aria-label',
        `Filter by ${displayName} vulnerabilities`,
      );
    });

    it('should not render CardActionArea when navigateOnClick is false', () => {
      renderWithProviders(
        <SeverityCard
          severity={Severity.High}
          issueCount={3}
          navigateOnClick={false}
          navigateToIssues={mockNavigateToIssues}
        />,
      );

      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });

    it('should not render CardActionArea when navigateOnClick is true but no issues', () => {
      renderWithProviders(
        <SeverityCard
          severity={Severity.High}
          issueCount={0}
          navigateOnClick={true}
          navigateToIssues={mockNavigateToIssues}
        />,
      );

      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });
  });

  describe('Content Display', () => {
    it('should display correct content for single vulnerability', () => {
      renderWithProviders(
        <SeverityCard
          severity={Severity.Medium}
          issueCount={1}
          navigateOnClick={false}
          navigateToIssues={mockNavigateToIssues}
        />,
      );

      expect(screen.getByText('Medium')).toBeInTheDocument();
      expect(screen.getByText('1')).toBeInTheDocument();
      expect(screen.getByText('Vulnerability')).toBeInTheDocument(); // singular
    });

    it('should display correct content for multiple vulnerabilities', () => {
      renderWithProviders(
        <SeverityCard
          severity={Severity.Low}
          issueCount={5}
          navigateOnClick={false}
          navigateToIssues={mockNavigateToIssues}
        />,
      );

      expect(screen.getByText('Low')).toBeInTheDocument();
      expect(screen.getByText('5')).toBeInTheDocument();
      expect(screen.getByText('Vulnerabilities')).toBeInTheDocument(); // plural
    });

    it('should display zero vulnerabilities', () => {
      renderWithProviders(
        <SeverityCard
          severity={Severity.Critical}
          issueCount={0}
          navigateOnClick={false}
          navigateToIssues={mockNavigateToIssues}
        />,
      );

      expect(screen.getByText('Critical')).toBeInTheDocument();
      expect(screen.getByText('0')).toBeInTheDocument();
      expect(screen.getByText('Vulnerabilities')).toBeInTheDocument();
    });
  });
});

describe('renderWithProviders', () => {
  it('should render a simple component and ensure it is present in the document when called with default options', () => {
    const TestComponent = () => <div>Test Component Content</div>;

    renderWithProviders(<TestComponent />);

    expect(screen.getByText('Test Component Content')).toBeInTheDocument();
  });

  it('should provide a dark mode theme context when called with providerOptions containing darkMode: true', () => {
    const TestComponent = () => {
      const theme = useTheme();
      return (
        <div
          data-testid="theme-aware-div"
          style={{ backgroundColor: theme.palette.background.default }}
        >
          Dark Mode Test
        </div>
      );
    };

    renderWithProviders(<TestComponent />, {}, { darkMode: true });

    const divElement = screen.getByTestId('theme-aware-div');
    expect(divElement).toHaveStyle('background-color: #121212');
  });
});
