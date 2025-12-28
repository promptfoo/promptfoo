import { render, screen } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import ReconSummaryBanner from './ReconSummaryBanner';

// Mock the useRedTeamConfig hook
const mockReconContext = vi.fn();
vi.mock('../hooks/useRedTeamConfig', () => ({
  useRedTeamConfig: () => ({
    reconContext: mockReconContext(),
  }),
}));

describe('ReconSummaryBanner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('should not render when reconContext is null', () => {
    mockReconContext.mockReturnValue(null);

    const { container } = render(<ReconSummaryBanner />);
    expect(container.firstChild).toBeNull();
  });

  it('should not render when source is not recon-cli', () => {
    mockReconContext.mockReturnValue({
      source: 'in-app-recon',
      timestamp: Date.now(),
    });

    const { container } = render(<ReconSummaryBanner />);
    expect(container.firstChild).toBeNull();
  });

  it('should render banner when reconContext is from recon-cli', () => {
    mockReconContext.mockReturnValue({
      source: 'recon-cli',
      timestamp: Date.now(),
    });

    render(<ReconSummaryBanner />);
    expect(screen.getByText('Configuration loaded from Recon CLI')).toBeInTheDocument();
  });

  it('should display codebase directory', () => {
    mockReconContext.mockReturnValue({
      source: 'recon-cli',
      timestamp: Date.now(),
      codebaseDirectory: '/Users/test/projects/my-app',
    });

    render(<ReconSummaryBanner />);
    expect(screen.getByText('.../projects/my-app')).toBeInTheDocument();
  });

  it('should display key files analyzed count', () => {
    mockReconContext.mockReturnValue({
      source: 'recon-cli',
      timestamp: Date.now(),
      keyFilesAnalyzed: 42,
    });

    render(<ReconSummaryBanner />);
    expect(screen.getByText('42 key files analyzed')).toBeInTheDocument();
  });

  it('should display fields populated count', () => {
    mockReconContext.mockReturnValue({
      source: 'recon-cli',
      timestamp: Date.now(),
      fieldsPopulated: 8,
    });

    render(<ReconSummaryBanner />);
    expect(screen.getByText('8 fields populated')).toBeInTheDocument();
  });

  it('should display timestamp in readable format', () => {
    const timestamp = new Date('2024-01-15T10:30:00').getTime();
    mockReconContext.mockReturnValue({
      source: 'recon-cli',
      timestamp,
    });

    render(<ReconSummaryBanner />);
    // The date format will vary by locale, just check it contains "Analyzed on"
    expect(screen.getByText(/Analyzed on/)).toBeInTheDocument();
  });

  it('should hide chips when values are zero or undefined', () => {
    mockReconContext.mockReturnValue({
      source: 'recon-cli',
      timestamp: Date.now(),
      keyFilesAnalyzed: 0,
      fieldsPopulated: 0,
    });

    render(<ReconSummaryBanner />);
    expect(screen.queryByText(/key files analyzed/)).not.toBeInTheDocument();
    expect(screen.queryByText(/fields populated/)).not.toBeInTheDocument();
  });

  it('should show full directory path if short', () => {
    mockReconContext.mockReturnValue({
      source: 'recon-cli',
      timestamp: Date.now(),
      codebaseDirectory: '/app',
    });

    render(<ReconSummaryBanner />);
    expect(screen.getByText('/app')).toBeInTheDocument();
  });
});
