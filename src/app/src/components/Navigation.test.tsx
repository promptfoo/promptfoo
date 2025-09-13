import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import Navigation from './Navigation';

describe('Navigation', () => {
  it('renders the navigation bar', () => {
    render(
      <MemoryRouter>
        <Navigation darkMode={false} onToggleDarkMode={() => {}} />
      </MemoryRouter>,
    );
    expect(screen.getByText('Create')).toBeInTheDocument();
    expect(screen.getByText('Results')).toBeInTheDocument();
    expect(screen.getByText('Model Audit')).toBeInTheDocument();
    expect(screen.getByText('Prompts')).toBeInTheDocument();
    expect(screen.getByText('Datasets')).toBeInTheDocument();
    expect(screen.getByText('History')).toBeInTheDocument();
  });

  it('shows the Model Audit item in the Create dropdown', () => {
    render(
      <MemoryRouter>
        <Navigation darkMode={false} onToggleDarkMode={() => {}} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByText('Create'));
    const modelAuditItem = screen.getByText('Model Audit', { selector: 'div' });
    expect(modelAuditItem).toBeInTheDocument();
    expect(modelAuditItem.closest('a')).toHaveAttribute('href', '/model-audit/setup');
  });

  it('activates the Create button when on model audit setup page', () => {
    render(
      <MemoryRouter initialEntries={['/model-audit/setup']}>
        <Navigation darkMode={false} onToggleDarkMode={() => {}} />
      </MemoryRouter>,
    );
    const createButton = screen.getByText('Create').closest('button');
    expect(createButton).toHaveClass('Mui-selected'); // This depends on the exact class name used for active state
  });

  it('activates the Model Audit NavLink on relevant paths', () => {
    const { rerender } = render(
      <MemoryRouter initialEntries={['/model-audit']}>
        <Navigation darkMode={false} onToggleDarkMode={() => {}} />
      </MemoryRouter>,
    );
    let modelAuditLink = screen.getByText('Model Audit', { selector: 'a' });
    expect(modelAuditLink).toHaveClass('active');

    rerender(
      <MemoryRouter initialEntries={['/model-audit/history/123']}>
        <Navigation darkMode={false} onToggleDarkMode={() => {}} />
      </MemoryRouter>,
    );
    modelAuditLink = screen.getByText('Model Audit', { selector: 'a' });
    expect(modelAuditLink).toHaveClass('active');

    rerender(
      <MemoryRouter initialEntries={['/model-audit/setup']}>
        <Navigation darkMode={false} onToggleDarkMode={() => {}} />
      </MemoryRouter>,
    );
    modelAuditLink = screen.getByText('Model Audit', { selector: 'a' });
    expect(modelAuditLink).not.toHaveClass('active');

    rerender(
        <MemoryRouter initialEntries={['/model-audit/history']}>
          <Navigation darkMode={false} onToggleDarkMode={() => {}} />
        </MemoryRouter>,
      );
      modelAuditLink = screen.getByText('Model Audit', { selector: 'a' });
      expect(modelAuditLink).not.toHaveClass('active');
  });
});