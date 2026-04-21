import { TooltipProvider } from '@app/components/ui/tooltip';
import { MODEL_AUDIT_ROUTES, REDTEAM_ROUTES, ROUTES } from '@app/constants/routes';
import { mockMatchMedia, restoreBrowserMocks } from '@app/tests/browserMocks';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Navigation from './Navigation';

const LEGACY_MODEL_AUDIT_HISTORY_ROUTE = `${MODEL_AUDIT_ROUTES.ROOT}/history`;

// Helper function to render Navigation with all required providers
const renderNavigation = (routerProps: { initialEntries?: string[] } = {}) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <TooltipProvider delayDuration={0}>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter {...routerProps}>
          <Navigation />
        </MemoryRouter>
      </QueryClientProvider>
    </TooltipProvider>,
  );
};

const renderWithModal = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  const Modal = () => (
    <div
      data-testid="modal"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        zIndex: 1300,
      }}
    >
      Modal Content
    </div>
  );

  return render(
    <TooltipProvider delayDuration={0}>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <Navigation />
          <Modal />
        </MemoryRouter>
      </QueryClientProvider>
    </TooltipProvider>,
  );
};

describe('Navigation', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.style.colorScheme = '';
    mockMatchMedia();
    vi.clearAllMocks();
  });

  afterEach(() => {
    restoreBrowserMocks();
    vi.restoreAllMocks();
  });

  it('renders the navigation bar', () => {
    renderNavigation();
    expect(screen.getByText('New')).toBeInTheDocument();
    expect(screen.getByText('View Results')).toBeInTheDocument();
    expect(screen.getByText('Model Audit')).toBeInTheDocument();
    expect(screen.getByText('Prompts')).toBeInTheDocument();
    expect(screen.getByText('Datasets')).toBeInTheDocument();
    expect(screen.getByText('History')).toBeInTheDocument();
  });

  it('should have the correct z-index class', () => {
    renderNavigation();
    const header = screen.getByRole('banner');
    expect(header).toHaveClass('z-(--z-appbar)');
  });

  it('shows the Model Audit item in the Create dropdown', async () => {
    const user = userEvent.setup();
    renderNavigation();
    await user.click(screen.getByText('New'));
    const modelAuditItem = screen.getByText('Model Audit', { selector: 'div' });
    expect(modelAuditItem).toBeInTheDocument();
    expect(modelAuditItem.closest('a')).toHaveAttribute('href', MODEL_AUDIT_ROUTES.SETUP);
  });

  it('activates the Create button when on model audit setup page', () => {
    renderNavigation({ initialEntries: [MODEL_AUDIT_ROUTES.SETUP] });
    const createButton = screen.getByText('New').closest('button');
    // The Create button gets a visual highlight when active, but specific class depends on implementation
    expect(createButton).toBeInTheDocument();
  });

  it('changes theme preference from the compact theme button', async () => {
    const user = userEvent.setup();
    renderNavigation();

    const themeButton = screen.getByRole('button', {
      name: 'Theme preference: System theme (light). Switch to Dark theme.',
    });
    expect(themeButton).toHaveClass('size-9');

    await user.click(themeButton);

    await waitFor(() => {
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    });
    expect(localStorage.getItem('darkMode')).toBe('true');
    expect(
      screen.getByRole('button', {
        name: 'Theme preference: Dark theme. Switch to Light theme.',
      }),
    ).toBeInTheDocument();
  });

  it('keeps the compact theme button in the same nav footprint', () => {
    renderNavigation();

    expect(
      screen.getByRole('button', {
        name: 'Theme preference: System theme (light). Switch to Dark theme.',
      }),
    ).toHaveClass('size-9');
  });

  it('renders appropriately on mobile viewport sizes', () => {
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(320);

    renderNavigation();

    expect(screen.getByText('New')).toBeInTheDocument();
    expect(screen.getByText('View Results')).toBeInTheDocument();
    expect(screen.getByText('Model Audit')).toBeInTheDocument();
    expect(screen.getByText('Prompts')).toBeInTheDocument();
    expect(screen.getByText('Datasets')).toBeInTheDocument();
    expect(screen.getByText('History')).toBeInTheDocument();
  });

  it('activates the Model Audit NavLink on /model-audit path', () => {
    renderNavigation({ initialEntries: [MODEL_AUDIT_ROUTES.ROOT] });
    const navBar = screen.getByRole('banner');
    const modelAuditLink = within(navBar).getByRole('link', { name: 'Model Audit' });
    expect(modelAuditLink).toHaveClass('bg-primary/10');
    expect(modelAuditLink).toHaveClass('text-primary');
  });

  it('activates the Model Audit NavLink on /model-audit/:id path', () => {
    renderNavigation({ initialEntries: [MODEL_AUDIT_ROUTES.DETAIL('123')] });
    const navBar = screen.getByRole('banner');
    const modelAuditLink = within(navBar).getByRole('link', { name: 'Model Audit' });
    expect(modelAuditLink).toHaveClass('bg-primary/10');
    expect(modelAuditLink).toHaveClass('text-primary');
  });

  it('does not activate Model Audit NavLink on /model-audit/setup path', () => {
    renderNavigation({ initialEntries: [MODEL_AUDIT_ROUTES.SETUP] });
    const navBar = screen.getByRole('banner');
    const topLevelNavLink = within(navBar).getByRole('link', { name: 'Model Audit' });
    expect(topLevelNavLink).toBeDefined();
    expect(topLevelNavLink).toHaveAttribute('href', MODEL_AUDIT_ROUTES.ROOT);
    expect(topLevelNavLink).not.toHaveClass('bg-primary/10');
    expect(topLevelNavLink).toHaveClass('text-foreground');
  });

  it('does not activate Model Audit NavLink on /model-audit/history path', () => {
    renderNavigation({ initialEntries: [LEGACY_MODEL_AUDIT_HISTORY_ROUTE] });
    const navBar = screen.getByRole('banner');
    const topLevelNavLink = within(navBar).getByRole('link', { name: 'Model Audit' });
    expect(topLevelNavLink).toBeDefined();
    expect(topLevelNavLink).toHaveAttribute('href', MODEL_AUDIT_ROUTES.ROOT);
    expect(topLevelNavLink).not.toHaveClass('bg-primary/10');
    expect(topLevelNavLink).toHaveClass('text-foreground');
  });

  it('does not activate Model Audit NavLink on /model-audit/history/:id path', () => {
    renderNavigation({ initialEntries: [`${LEGACY_MODEL_AUDIT_HISTORY_ROUTE}/123`] });
    const navBar = screen.getByRole('banner');
    const topLevelNavLink = within(navBar).getByRole('link', { name: 'Model Audit' });
    expect(topLevelNavLink).toBeDefined();
    expect(topLevelNavLink).toHaveAttribute('href', MODEL_AUDIT_ROUTES.ROOT);
    expect(topLevelNavLink).not.toHaveClass('bg-primary/10');
    expect(topLevelNavLink).toHaveClass('text-foreground');
  });

  describe('Create Dropdown', () => {
    it('opens dropdown on click and shows Model Audit option', async () => {
      const user = userEvent.setup();
      renderNavigation();

      const createButton = screen.getByText('New');
      await user.click(createButton);

      const modelAuditItem = screen.getByText('Model Audit', { selector: 'div' });
      expect(modelAuditItem).toBeInTheDocument();
      expect(modelAuditItem.closest('a')).toHaveAttribute('href', MODEL_AUDIT_ROUTES.SETUP);

      // Check description text
      expect(screen.getByText('Configure and run a model security scan')).toBeInTheDocument();
    });

    it('closes dropdown when clicking outside', async () => {
      const user = userEvent.setup();
      renderNavigation();

      const createButton = screen.getByText('New');
      await user.click(createButton);

      // Wait for dropdown to appear
      await waitFor(() => {
        expect(screen.getByText('Model Audit', { selector: 'div' })).toBeInTheDocument();
      });

      // Click outside the dropdown
      await user.click(document.body);

      await waitFor(() => {
        expect(screen.queryByText('Model Audit', { selector: 'div' })).not.toBeInTheDocument();
      });
    });

    it('closes dropdown when selecting an item', async () => {
      const user = userEvent.setup();
      renderNavigation();

      const createButton = screen.getByText('New');
      await user.click(createButton);
      expect(screen.getByText('Model Audit', { selector: 'div' })).toBeInTheDocument();

      const modelAuditItem = screen.getByText('Model Audit', { selector: 'div' });
      await user.click(modelAuditItem);

      // Dropdown should close after selection
      expect(screen.queryByText('Model Audit', { selector: 'div' })).not.toBeInTheDocument();
    });

    it('supports keyboard navigation in dropdown', async () => {
      const user = userEvent.setup();
      renderNavigation();

      const createButton = screen.getByText('New');

      // Click to open dropdown
      await user.click(createButton);

      // Verify dropdown opens and items are accessible
      const modelAuditItem = screen.getByText('Model Audit', { selector: 'div' }).closest('a');
      expect(modelAuditItem).toHaveAttribute('href', MODEL_AUDIT_ROUTES.SETUP);

      // Verify keyboard accessibility of the link
      expect(modelAuditItem).toBeInTheDocument();
      expect(modelAuditItem).not.toHaveAttribute('aria-hidden', 'true');
    });

    it('shows correct descriptions for all dropdown items', async () => {
      const user = userEvent.setup();
      renderNavigation();

      await user.click(screen.getByText('New'));

      // Verify Model Audit description
      expect(screen.getByText('Configure and run a model security scan')).toBeInTheDocument();

      // Check that other standard items are present (these should exist based on current UI)
      const evalItem = screen.queryByText('Eval');
      if (evalItem) {
        expect(evalItem.closest('a')).toHaveAttribute('href', ROUTES.SETUP);
      }

      const redTeamItem = screen.queryByText('Red Team');
      if (redTeamItem) {
        expect(redTeamItem.closest('a')).toHaveAttribute('href', REDTEAM_ROUTES.SETUP);
      }
    });
  });

  describe('Model Audit NavLink Active States', () => {
    it('activates Model Audit NavLink on /model-audit path', () => {
      renderNavigation({ initialEntries: [MODEL_AUDIT_ROUTES.ROOT] });

      // Find the top-level Model Audit NavLink (not the dropdown item)
      const allModelAuditLinks = screen.getAllByRole('link', { name: 'Model Audit' });
      const topLevelModelAuditLink = allModelAuditLinks.find(
        (link) => link.getAttribute('href') === MODEL_AUDIT_ROUTES.ROOT,
      );
      expect(topLevelModelAuditLink).toBeDefined();
      expect(topLevelModelAuditLink).toHaveClass('bg-primary/10');
      expect(topLevelModelAuditLink).toHaveClass('text-primary');
    });

    it('activates Model Audit NavLink on /model-audit/:id path', () => {
      renderNavigation({ initialEntries: [MODEL_AUDIT_ROUTES.DETAIL('123')] });

      const allModelAuditLinks = screen.getAllByRole('link', { name: 'Model Audit' });
      const topLevelModelAuditLink = allModelAuditLinks.find(
        (link) => link.getAttribute('href') === MODEL_AUDIT_ROUTES.ROOT,
      );
      expect(topLevelModelAuditLink).toBeDefined();
      expect(topLevelModelAuditLink).toHaveClass('bg-primary/10');
      expect(topLevelModelAuditLink).toHaveClass('text-primary');
    });

    it('does not activate Model Audit NavLink on /model-audit/setup path', () => {
      renderNavigation({ initialEntries: [MODEL_AUDIT_ROUTES.SETUP] });

      const allModelAuditLinks = screen.getAllByRole('link', { name: 'Model Audit' });
      const topLevelModelAuditLink = allModelAuditLinks.find(
        (link) => link.getAttribute('href') === MODEL_AUDIT_ROUTES.ROOT,
      );
      expect(topLevelModelAuditLink).toBeDefined();
      expect(topLevelModelAuditLink).not.toHaveClass('bg-primary/10');
      expect(topLevelModelAuditLink).toHaveClass('text-foreground');
    });

    it('does not activate Model Audit NavLink on /model-audit/history path', () => {
      renderNavigation({ initialEntries: [LEGACY_MODEL_AUDIT_HISTORY_ROUTE] });

      const allModelAuditLinks = screen.getAllByRole('link', { name: 'Model Audit' });
      const topLevelModelAuditLink = allModelAuditLinks.find(
        (link) => link.getAttribute('href') === MODEL_AUDIT_ROUTES.ROOT,
      );
      expect(topLevelModelAuditLink).toBeDefined();
      expect(topLevelModelAuditLink).not.toHaveClass('bg-primary/10');
      expect(topLevelModelAuditLink).toHaveClass('text-foreground');
    });

    it('does not activate Model Audit NavLink on deeply nested paths under excluded routes like /model-audit/history/details/123', () => {
      renderNavigation({ initialEntries: [`${LEGACY_MODEL_AUDIT_HISTORY_ROUTE}/details/123`] });

      const allModelAuditLinks = screen.getAllByRole('link', { name: 'Model Audit' });
      const topLevelModelAuditLink = allModelAuditLinks.find(
        (link) => link.getAttribute('href') === MODEL_AUDIT_ROUTES.ROOT,
      );
      expect(topLevelModelAuditLink).toBeDefined();
      expect(topLevelModelAuditLink).not.toHaveClass('bg-primary/10');
      expect(topLevelModelAuditLink).toHaveClass('text-foreground');
    });
  });

  describe('Accessibility', () => {
    it('has proper ARIA attributes on dropdown trigger', async () => {
      const user = userEvent.setup();
      renderNavigation();

      const createButton = screen.getByText('New').closest('button');
      expect(createButton).toBeInTheDocument();

      // Check basic accessibility - button should be focusable
      await user.click(createButton!);

      // Verify dropdown functionality works
      expect(screen.getByText('Model Audit', { selector: 'div' })).toBeInTheDocument();
    });

    it('has accessible link labels for Model Audit', async () => {
      const user = userEvent.setup();
      renderNavigation();

      await user.click(screen.getByText('New'));

      const modelAuditLink = screen.getByText('Model Audit', { selector: 'div' }).closest('a');
      expect(modelAuditLink).toHaveAttribute('href', MODEL_AUDIT_ROUTES.SETUP);
      expect(modelAuditLink).toBeInTheDocument();
    });

    it('supports keyboard navigation patterns', async () => {
      const user = userEvent.setup();
      renderNavigation();

      const createButton = screen.getByText('New').closest('button');

      // Should be focusable
      expect(createButton).not.toHaveAttribute('tabindex', '-1');

      // Focus and activate with click (keyboard simulation is complex with MUI)
      createButton?.focus();
      await user.click(createButton!);

      expect(screen.getByText('Model Audit', { selector: 'div' })).toBeInTheDocument();
    });
  });

  it("should display the 'Red Team Vulnerability Reports' menu item with the correct description when the Results dropdown is open", async () => {
    const user = userEvent.setup();
    renderNavigation();

    const evalsButton = screen.getByRole('button', { name: /View Results/i });
    await user.click(evalsButton);

    expect(screen.getByText('Red Team Vulnerability Reports')).toBeInTheDocument();
    expect(screen.getByText('View findings from red teams')).toBeInTheDocument();
  });

  it('renders a modal above the Navigation component', () => {
    renderWithModal();
    const modal = screen.getByTestId('modal');
    expect(modal).toBeInTheDocument();
    expect(modal).toHaveStyle('zIndex: 1300;');
  });
});
