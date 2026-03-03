import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Computer, Settings } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './tabs';

describe('Tabs', () => {
  it('renders tabs with default value', () => {
    render(
      <Tabs defaultValue="tab1">
        <TabsList>
          <TabsTrigger value="tab1">Tab 1</TabsTrigger>
          <TabsTrigger value="tab2">Tab 2</TabsTrigger>
        </TabsList>
        <TabsContent value="tab1">Content 1</TabsContent>
        <TabsContent value="tab2">Content 2</TabsContent>
      </Tabs>,
    );

    expect(screen.getByRole('tab', { name: 'Tab 1' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Tab 2' })).toBeInTheDocument();
    expect(screen.getByText('Content 1')).toBeInTheDocument();
  });

  it('switches between tabs', async () => {
    const user = userEvent.setup();
    render(
      <Tabs defaultValue="tab1">
        <TabsList>
          <TabsTrigger value="tab1">Tab 1</TabsTrigger>
          <TabsTrigger value="tab2">Tab 2</TabsTrigger>
        </TabsList>
        <TabsContent value="tab1">Content 1</TabsContent>
        <TabsContent value="tab2">Content 2</TabsContent>
      </Tabs>,
    );

    const tab2 = screen.getByRole('tab', { name: 'Tab 2' });
    await user.click(tab2);

    expect(screen.getByText('Content 2')).toBeInTheDocument();
  });

  it('shows active state on selected tab', () => {
    render(
      <Tabs defaultValue="tab1">
        <TabsList>
          <TabsTrigger value="tab1">Tab 1</TabsTrigger>
          <TabsTrigger value="tab2">Tab 2</TabsTrigger>
        </TabsList>
      </Tabs>,
    );

    const tab1 = screen.getByRole('tab', { name: 'Tab 1' });
    expect(tab1).toHaveAttribute('data-state', 'active');
  });
});

describe('TabsList', () => {
  it('renders tab list', () => {
    render(
      <Tabs defaultValue="tab1">
        <TabsList>
          <TabsTrigger value="tab1">Tab 1</TabsTrigger>
        </TabsList>
      </Tabs>,
    );
    const tablist = screen.getByRole('tablist');
    expect(tablist).toBeInTheDocument();
  });

  it('applies correct styles for pill variant (default)', () => {
    render(
      <Tabs defaultValue="tab1">
        <TabsList>
          <TabsTrigger value="tab1">Tab 1</TabsTrigger>
        </TabsList>
      </Tabs>,
    );
    const tablist = screen.getByRole('tablist');
    expect(tablist).toHaveClass('inline-flex', 'rounded-md', 'bg-muted');
    expect(tablist).toHaveAttribute('data-variant', 'pill');
  });

  it('applies correct styles for line variant', () => {
    render(
      <Tabs defaultValue="tab1">
        <TabsList variant="line">
          <TabsTrigger value="tab1">Tab 1</TabsTrigger>
        </TabsList>
      </Tabs>,
    );
    const tablist = screen.getByRole('tablist');
    expect(tablist).toHaveClass('bg-transparent');
    expect(tablist).toHaveAttribute('data-variant', 'line');
    expect(tablist).not.toHaveClass('rounded-md', 'bg-muted');
  });

  it('applies fullWidth class when fullWidth is true', () => {
    render(
      <Tabs defaultValue="tab1">
        <TabsList fullWidth>
          <TabsTrigger value="tab1">Tab 1</TabsTrigger>
        </TabsList>
      </Tabs>,
    );
    const tablist = screen.getByRole('tablist');
    expect(tablist).toHaveClass('w-full');
  });

  it('applies custom className', () => {
    render(
      <Tabs defaultValue="tab1">
        <TabsList className="custom-tablist">
          <TabsTrigger value="tab1">Tab 1</TabsTrigger>
        </TabsList>
      </Tabs>,
    );
    const tablist = screen.getByRole('tablist');
    expect(tablist).toHaveClass('custom-tablist');
  });
});

describe('TabsTrigger', () => {
  it('renders tab trigger', () => {
    render(
      <Tabs defaultValue="tab1">
        <TabsList>
          <TabsTrigger value="tab1">Click me</TabsTrigger>
        </TabsList>
      </Tabs>,
    );
    const trigger = screen.getByRole('tab', { name: 'Click me' });
    expect(trigger).toBeInTheDocument();
  });

  it('applies correct styles', () => {
    render(
      <Tabs defaultValue="tab1">
        <TabsList>
          <TabsTrigger value="tab1">Tab</TabsTrigger>
        </TabsList>
      </Tabs>,
    );
    const trigger = screen.getByRole('tab', { name: 'Tab' });
    expect(trigger).toHaveClass('inline-flex', 'items-center');
  });

  it('applies custom className', () => {
    render(
      <Tabs defaultValue="tab1">
        <TabsList>
          <TabsTrigger value="tab1" className="custom-trigger">
            Tab
          </TabsTrigger>
        </TabsList>
      </Tabs>,
    );
    const trigger = screen.getByRole('tab', { name: 'Tab' });
    expect(trigger).toHaveClass('custom-trigger');
  });

  it('can be disabled', () => {
    render(
      <Tabs defaultValue="tab1">
        <TabsList>
          <TabsTrigger value="tab1" disabled>
            Disabled
          </TabsTrigger>
        </TabsList>
      </Tabs>,
    );
    const trigger = screen.getByRole('tab', { name: 'Disabled' });
    expect(trigger).toHaveAttribute('data-disabled', '');
  });

  it('renders with icon at start position', () => {
    render(
      <Tabs defaultValue="tab1">
        <TabsList>
          <TabsTrigger value="tab1" icon={<Computer data-testid="computer-icon" />}>
            Local Files
          </TabsTrigger>
        </TabsList>
      </Tabs>,
    );
    expect(screen.getByTestId('computer-icon')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Local Files/i })).toBeInTheDocument();
  });

  it('renders with icon at end position', () => {
    render(
      <Tabs defaultValue="tab1">
        <TabsList>
          <TabsTrigger
            value="tab1"
            icon={<Settings data-testid="settings-icon" />}
            iconPosition="end"
          >
            Settings
          </TabsTrigger>
        </TabsList>
      </Tabs>,
    );
    expect(screen.getByRole('tab', { name: /Settings/i })).toBeInTheDocument();
    expect(screen.getByTestId('settings-icon')).toBeInTheDocument();
    // Icon should come after the text in the DOM when iconPosition="end"
    const iconWrapper = screen.getByTestId('settings-icon').parentElement;
    expect(iconWrapper).toHaveClass('ml-2');
  });
});

describe('TabsContent', () => {
  it('renders content when tab is active', () => {
    render(
      <Tabs defaultValue="tab1">
        <TabsList>
          <TabsTrigger value="tab1">Tab 1</TabsTrigger>
        </TabsList>
        <TabsContent value="tab1">Active content</TabsContent>
      </Tabs>,
    );
    expect(screen.getByText('Active content')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    const { container } = render(
      <Tabs defaultValue="tab1">
        <TabsList>
          <TabsTrigger value="tab1">Tab 1</TabsTrigger>
        </TabsList>
        <TabsContent value="tab1" className="custom-content">
          Content
        </TabsContent>
      </Tabs>,
    );
    const content = container.querySelector('.custom-content');
    expect(content).toBeInTheDocument();
  });
});

describe('Tabs composition', () => {
  it('renders complete tabs with multiple tabs and content', () => {
    render(
      <Tabs defaultValue="account">
        <TabsList>
          <TabsTrigger value="account">Account</TabsTrigger>
          <TabsTrigger value="password">Password</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>
        <TabsContent value="account">Account settings</TabsContent>
        <TabsContent value="password">Password settings</TabsContent>
        <TabsContent value="settings">General settings</TabsContent>
      </Tabs>,
    );

    expect(screen.getByRole('tab', { name: 'Account' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Password' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByText('Account settings')).toBeInTheDocument();
  });

  it('renders tabs with line variant and icons', () => {
    render(
      <Tabs defaultValue="local">
        <TabsList variant="line">
          <TabsTrigger value="local" icon={<Computer data-testid="computer-icon" />}>
            Local Files
          </TabsTrigger>
          <TabsTrigger value="settings" icon={<Settings data-testid="settings-icon" />}>
            Settings
          </TabsTrigger>
        </TabsList>
        <TabsContent value="local">Local content</TabsContent>
        <TabsContent value="settings">Settings content</TabsContent>
      </Tabs>,
    );

    const tablist = screen.getByRole('tablist');
    expect(tablist).toHaveAttribute('data-variant', 'line');
    expect(screen.getByTestId('computer-icon')).toBeInTheDocument();
    expect(screen.getByTestId('settings-icon')).toBeInTheDocument();
    expect(screen.getByText('Local content')).toBeInTheDocument();
  });

  it('renders full width tabs', async () => {
    const user = userEvent.setup();
    render(
      <Tabs defaultValue="tab1">
        <TabsList variant="line" fullWidth>
          <TabsTrigger value="tab1">Tab 1</TabsTrigger>
          <TabsTrigger value="tab2">Tab 2</TabsTrigger>
          <TabsTrigger value="tab3">Tab 3</TabsTrigger>
        </TabsList>
        <TabsContent value="tab1">Content 1</TabsContent>
        <TabsContent value="tab2">Content 2</TabsContent>
        <TabsContent value="tab3">Content 3</TabsContent>
      </Tabs>,
    );

    const tablist = screen.getByRole('tablist');
    // Line variant always has w-full via group-data classes
    expect(tablist).toHaveAttribute('data-variant', 'line');

    // Verify tab switching still works
    await user.click(screen.getByRole('tab', { name: 'Tab 2' }));
    expect(screen.getByText('Content 2')).toBeInTheDocument();
  });
});

describe('Tabs vertical orientation', () => {
  it('renders vertical tabs with correct orientation attribute', () => {
    render(
      <Tabs defaultValue="dashboard" orientation="vertical">
        <TabsList variant="line">
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>
        <TabsContent value="dashboard">Dashboard content</TabsContent>
        <TabsContent value="settings">Settings content</TabsContent>
      </Tabs>,
    );

    const tablist = screen.getByRole('tablist');
    expect(tablist).toHaveAttribute('aria-orientation', 'vertical');
  });

  it('renders vertical tabs with icons', async () => {
    const user = userEvent.setup();
    render(
      <Tabs defaultValue="dashboard" orientation="vertical">
        <TabsList variant="line">
          <TabsTrigger value="dashboard" icon={<Computer data-testid="dashboard-icon" />}>
            Dashboard
          </TabsTrigger>
          <TabsTrigger value="settings" icon={<Settings data-testid="settings-icon" />}>
            Settings
          </TabsTrigger>
        </TabsList>
        <TabsContent value="dashboard">Dashboard content</TabsContent>
        <TabsContent value="settings">Settings content</TabsContent>
      </Tabs>,
    );

    expect(screen.getByTestId('dashboard-icon')).toBeInTheDocument();
    expect(screen.getByTestId('settings-icon')).toBeInTheDocument();
    expect(screen.getByText('Dashboard content')).toBeInTheDocument();

    // Verify tab switching works
    await user.click(screen.getByRole('tab', { name: /Settings/i }));
    expect(screen.getByText('Settings content')).toBeInTheDocument();
  });

  it('renders vertical pill variant tabs', () => {
    render(
      <Tabs defaultValue="tab1" orientation="vertical">
        <TabsList variant="pill">
          <TabsTrigger value="tab1">Tab 1</TabsTrigger>
          <TabsTrigger value="tab2">Tab 2</TabsTrigger>
        </TabsList>
        <TabsContent value="tab1">Content 1</TabsContent>
        <TabsContent value="tab2">Content 2</TabsContent>
      </Tabs>,
    );

    const tablist = screen.getByRole('tablist');
    expect(tablist).toHaveAttribute('aria-orientation', 'vertical');
    expect(tablist).toHaveAttribute('data-variant', 'pill');
  });
});
