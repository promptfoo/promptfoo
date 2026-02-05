import { renderWithProviders } from '@app/utils/testutils';
import { Severity } from '@promptfoo/redteam/constants';
import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SeverityCard from './SeverityCard';

describe('SeverityCard', () => {
  const mockNavigateToIssues = vi.fn();

  beforeEach(() => {
    mockNavigateToIssues.mockClear();
  });

  describe('Rendering', () => {
    it.each([
      { severity: Severity.Critical, displayName: 'Critical' },
      { severity: Severity.High, displayName: 'High' },
      { severity: Severity.Medium, displayName: 'Medium' },
      { severity: Severity.Low, displayName: 'Low' },
      { severity: Severity.Informational, displayName: 'Informational' },
    ])('should render $displayName severity card with issues', ({ severity, displayName }) => {
      renderWithProviders(
        <SeverityCard
          severity={severity}
          issueCount={3}
          navigateOnClick={false}
          navigateToIssues={mockNavigateToIssues}
        />,
      );

      expect(screen.getByText(displayName)).toBeInTheDocument();
      expect(screen.getByText('3')).toBeInTheDocument();
      expect(screen.getByText('Vulnerabilities')).toBeInTheDocument();
    });

    it('should render card with no issues', () => {
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

  describe('NavigateToIssues Callback', () => {
    it.each([
      { severity: Severity.Critical, displayName: 'Critical' },
      { severity: Severity.High, displayName: 'High' },
      { severity: Severity.Medium, displayName: 'Medium' },
      { severity: Severity.Low, displayName: 'Low' },
      { severity: Severity.Informational, displayName: 'Informational' },
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

      const cardButton = screen.getByRole('button');
      fireEvent.click(cardButton);

      expect(mockNavigateToIssues).toHaveBeenCalledTimes(1);
      expect(mockNavigateToIssues).toHaveBeenCalledWith({ severity });
    });

    it('should not render button when navigateOnClick is false', () => {
      renderWithProviders(
        <SeverityCard
          severity={Severity.Critical}
          issueCount={5}
          navigateOnClick={false}
          navigateToIssues={mockNavigateToIssues}
        />,
      );

      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });

    it('should not render button when no issues exist', () => {
      renderWithProviders(
        <SeverityCard
          severity={Severity.Critical}
          issueCount={0}
          navigateOnClick={true}
          navigateToIssues={mockNavigateToIssues}
        />,
      );

      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });
  });

  describe('Card Button Accessibility', () => {
    it.each([
      { severity: Severity.Critical, displayName: 'Critical' },
      { severity: Severity.High, displayName: 'High' },
      { severity: Severity.Medium, displayName: 'Medium' },
      { severity: Severity.Low, displayName: 'Low' },
      { severity: Severity.Informational, displayName: 'Informational' },
    ])('should render button with correct accessibility props for $displayName', ({
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

      const cardButton = screen.getByRole('button');

      expect(cardButton).toHaveAttribute('tabIndex', '0');
      expect(cardButton).toHaveAttribute('aria-label', `Filter by ${displayName} vulnerabilities`);
    });

    it('should not render button when navigateOnClick is false', () => {
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

    it('should not render button when navigateOnClick is true but no issues', () => {
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

    it('should render button with clear filter aria-label when isActive', () => {
      renderWithProviders(
        <SeverityCard
          severity={Severity.Critical}
          issueCount={3}
          navigateOnClick={true}
          navigateToIssues={mockNavigateToIssues}
          isActive={true}
          hasActiveFilter={true}
        />,
      );

      const cardButton = screen.getByRole('button');
      expect(cardButton).toHaveAttribute('aria-label', 'Clear Critical filter');
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

  describe('Keyboard Navigation', () => {
    it('should trigger navigateToIssues on Enter key', () => {
      renderWithProviders(
        <SeverityCard
          severity={Severity.Critical}
          issueCount={5}
          navigateOnClick={true}
          navigateToIssues={mockNavigateToIssues}
        />,
      );

      const cardButton = screen.getByRole('button');
      fireEvent.keyDown(cardButton, { key: 'Enter' });

      expect(mockNavigateToIssues).toHaveBeenCalledWith({ severity: Severity.Critical });
    });

    it('should trigger navigateToIssues on Space key', () => {
      renderWithProviders(
        <SeverityCard
          severity={Severity.High}
          issueCount={3}
          navigateOnClick={true}
          navigateToIssues={mockNavigateToIssues}
        />,
      );

      const cardButton = screen.getByRole('button');
      fireEvent.keyDown(cardButton, { key: ' ' });

      expect(mockNavigateToIssues).toHaveBeenCalledWith({ severity: Severity.High });
    });
  });
});
