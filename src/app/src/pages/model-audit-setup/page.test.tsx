import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import ModelAuditSetup from './page';

vi.mock('./ModelAuditSetupPage', () => ({
  default: () => <div data-testid="model-audit-setup-page">Mocked Model Audit Setup Page</div>,
}));

describe('ModelAuditSetup', () => {
  it('renders the ModelAuditSetupPage component', () => {
    render(
      <MemoryRouter>
        <ModelAuditSetup />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('model-audit-setup-page')).toBeInTheDocument();
    expect(screen.getByText('Mocked Model Audit Setup Page')).toBeInTheDocument();
  });
});
