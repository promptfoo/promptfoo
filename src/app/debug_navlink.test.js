import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect } from 'vitest';
import Navigation from './src/components/Navigation';

describe('Debug NavLink', () => {
  it('should not be active on setup path', () => {
    render(
      <MemoryRouter initialEntries={['/model-audit/setup']}>
        <Navigation darkMode={false} onToggleDarkMode={() => {}} />
      </MemoryRouter>
    );
    
    const navBar = screen.getByRole('banner');
    const modelAuditLink = within(navBar).getByRole('link', { name: 'Model Audit' });
    
    console.log('Link href:', modelAuditLink.getAttribute('href'));
    console.log('Link classes:', modelAuditLink.className);
    console.log('Has active class:', modelAuditLink.classList.contains('active'));
    
    expect(modelAuditLink).not.toHaveClass('active');
  });
});
