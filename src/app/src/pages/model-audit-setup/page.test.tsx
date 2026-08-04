import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ModelAuditSetup from './page';

vi.mock('./ModelAuditSetupPage', () => ({
  default: () => <div data-testid="model-audit-setup-page">Mocked Model Audit Setup Page</div>,
}));

describe('ModelAuditSetup', () => {
  const originalTitle = document.title;
  let descriptionMetaTag: HTMLMetaElement;

  beforeEach(() => {
    descriptionMetaTag = document.createElement('meta');
    descriptionMetaTag.name = 'description';
    descriptionMetaTag.content = 'Initial description';
    document.head.appendChild(descriptionMetaTag);
    document.title = 'Initial Title';
  });

  afterEach(() => {
    cleanup();
    descriptionMetaTag.remove();
    document.title = originalTitle;
  });

  it('renders the ModelAuditSetupPage component', () => {
    render(
      <MemoryRouter>
        <ModelAuditSetup />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('model-audit-setup-page')).toBeInTheDocument();
    expect(screen.getByText('Mocked Model Audit Setup Page')).toBeInTheDocument();
  });

  it('sets Model Audit setup metadata', () => {
    render(
      <MemoryRouter>
        <ModelAuditSetup />
      </MemoryRouter>,
    );

    expect(document.title).toBe('Model Audit Setup | promptfoo');
    expect(descriptionMetaTag).toHaveAttribute(
      'content',
      'Configure and run a model audit security scan',
    );
  });
});
