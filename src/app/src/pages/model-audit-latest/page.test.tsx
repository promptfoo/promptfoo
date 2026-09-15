import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ModelAuditLatest from './page';

vi.mock('./ModelAuditResultLatestPage', () => ({
  default: () => <div data-testid="model-audit-latest-page">Mocked Model Audit Latest Page</div>,
}));

describe('ModelAuditLatest', () => {
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

  it('renders the ModelAuditResultLatestPage component', () => {
    render(
      <MemoryRouter>
        <ModelAuditLatest />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('model-audit-latest-page')).toBeInTheDocument();
    expect(screen.getByText('Mocked Model Audit Latest Page')).toBeInTheDocument();
  });

  it('sets Model Audit route metadata', () => {
    render(
      <MemoryRouter>
        <ModelAuditLatest />
      </MemoryRouter>,
    );

    expect(document.title).toBe('Model Audit | promptfoo');
    expect(descriptionMetaTag).toHaveAttribute(
      'content',
      'Review the latest model audit scan results',
    );
  });
});
