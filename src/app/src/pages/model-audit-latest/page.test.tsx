import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import ModelAuditLatest from './page';

vi.mock('./ModelAuditResultLatestPage', () => ({
  default: () => <div data-testid="model-audit-latest-page">Mocked Model Audit Latest Page</div>,
}));

describe('ModelAuditLatest', () => {
  it('renders the ModelAuditResultLatestPage component', () => {
    render(
      <MemoryRouter>
        <ModelAuditLatest />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('model-audit-latest-page')).toBeInTheDocument();
    expect(screen.getByText('Mocked Model Audit Latest Page')).toBeInTheDocument();
  });
});
