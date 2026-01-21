import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import ModelAuditResultPage from './page';

vi.mock('./ModelAuditResult', () => ({
  default: () => <div data-testid="model-audit-result">Mocked Model Audit Result</div>,
}));

describe('ModelAuditResultPage', () => {
  it('renders the ModelAuditResult component', () => {
    render(
      <MemoryRouter>
        <ModelAuditResultPage />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('model-audit-result')).toBeInTheDocument();
    expect(screen.getByText('Mocked Model Audit Result')).toBeInTheDocument();
  });
});
