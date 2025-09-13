import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';
import ModelAuditHistoryPage from './page';

// Mock the ModelAuditHistory component since we're testing the page wrapper
vi.mock('./ModelAuditHistory', () => ({
  default: function MockModelAuditHistory({ onScanSelected, showUtilityButtons }: any) {
    return (
      <div data-testid="model-audit-history">
        <div>onScanSelected: {typeof onScanSelected}</div>
        <div>showUtilityButtons: {String(showUtilityButtons)}</div>
      </div>
    );
  },
}));

// Mock usePageMeta hook
vi.mock('@app/hooks/usePageMeta', () => ({
  usePageMeta: vi.fn(),
}));

const renderWithRouter = (component: React.ReactElement) => {
  return render(
    <MemoryRouter>
      {component}
    </MemoryRouter>
  );
};

describe('ModelAuditHistoryPage', () => {
  it('renders ModelAuditHistory component with correct props', () => {
    renderWithRouter(<ModelAuditHistoryPage />);

    expect(screen.getByTestId('model-audit-history')).toBeInTheDocument();
    expect(screen.getByText('onScanSelected: function')).toBeInTheDocument();
    expect(screen.getByText('showUtilityButtons: true')).toBeInTheDocument();
  });

  it('renders within a container with proper styling', () => {
    const { container } = renderWithRouter(<ModelAuditHistoryPage />);

    const containerElement = container.querySelector('.MuiContainer-root');
    expect(containerElement).toBeInTheDocument();
    expect(containerElement).toHaveClass('MuiContainer-maxWidthXl');
  });
});