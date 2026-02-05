import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from './breadcrumb';

describe('Breadcrumb', () => {
  it('renders breadcrumb navigation', () => {
    render(<Breadcrumb />);
    const nav = screen.getByRole('navigation');
    expect(nav).toBeInTheDocument();
    expect(nav).toHaveAttribute('aria-label', 'breadcrumb');
  });
});

describe('BreadcrumbList', () => {
  it('renders as ordered list', () => {
    render(<BreadcrumbList />);
    const list = screen.getByRole('list');
    expect(list).toBeInTheDocument();
    expect(list.tagName).toBe('OL');
  });

  it('applies correct styles', () => {
    render(<BreadcrumbList />);
    const list = screen.getByRole('list');
    expect(list).toHaveClass('flex', 'items-center');
  });
});

describe('BreadcrumbItem', () => {
  it('renders list item', () => {
    render(
      <BreadcrumbList>
        <BreadcrumbItem>Item</BreadcrumbItem>
      </BreadcrumbList>,
    );
    const item = screen.getByRole('listitem');
    expect(item).toBeInTheDocument();
  });

  it('applies correct styles', () => {
    render(
      <BreadcrumbList>
        <BreadcrumbItem>Item</BreadcrumbItem>
      </BreadcrumbList>,
    );
    const item = screen.getByRole('listitem');
    expect(item).toHaveClass('inline-flex', 'items-center');
  });
});

describe('BreadcrumbLink', () => {
  it('renders as anchor by default', () => {
    render(<BreadcrumbLink href="/home">Home</BreadcrumbLink>);
    const link = screen.getByRole('link', { name: 'Home' });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/home');
  });

  it('applies correct styles', () => {
    render(<BreadcrumbLink href="/">Home</BreadcrumbLink>);
    const link = screen.getByRole('link', { name: 'Home' });
    expect(link).toHaveClass('transition-colors', 'hover:text-foreground');
  });

  it('supports asChild prop', () => {
    render(
      <BreadcrumbLink asChild>
        <span>Custom</span>
      </BreadcrumbLink>,
    );
    const custom = screen.getByText('Custom');
    expect(custom).toBeInTheDocument();
    expect(custom.tagName).toBe('SPAN');
  });
});

describe('BreadcrumbPage', () => {
  it('renders current page', () => {
    render(<BreadcrumbPage>Current</BreadcrumbPage>);
    const page = screen.getByText('Current');
    expect(page).toBeInTheDocument();
  });

  it('has correct ARIA attributes', () => {
    render(<BreadcrumbPage>Current Page</BreadcrumbPage>);
    const page = screen.getByText('Current Page');
    expect(page).toHaveAttribute('role', 'link');
    expect(page).toHaveAttribute('aria-disabled', 'true');
    expect(page).toHaveAttribute('aria-current', 'page');
  });

  it('applies correct styles', () => {
    render(<BreadcrumbPage>Current</BreadcrumbPage>);
    const page = screen.getByText('Current');
    expect(page).toHaveClass('font-normal', 'text-foreground');
  });
});

describe('BreadcrumbSeparator', () => {
  it('renders default separator icon', () => {
    const { container } = render(<BreadcrumbSeparator />);
    const separator = container.querySelector('[role="presentation"]');
    expect(separator).toBeInTheDocument();
    expect(separator).toHaveAttribute('aria-hidden', 'true');

    const icon = container.querySelector('svg');
    expect(icon).toBeInTheDocument();
  });

  it('renders custom separator', () => {
    render(<BreadcrumbSeparator>/</BreadcrumbSeparator>);
    const separator = screen.getByText('/');
    expect(separator).toBeInTheDocument();
  });
});

describe('BreadcrumbEllipsis', () => {
  it('renders ellipsis with icon', () => {
    const { container } = render(<BreadcrumbEllipsis />);
    const ellipsis = container.querySelector('[role="presentation"]');
    expect(ellipsis).toBeInTheDocument();
    expect(ellipsis).toHaveAttribute('aria-hidden', 'true');

    const icon = container.querySelector('svg');
    expect(icon).toBeInTheDocument();

    const srOnly = screen.getByText('More');
    expect(srOnly).toHaveClass('sr-only');
  });
});

describe('Breadcrumb composition', () => {
  it('renders complete breadcrumb', () => {
    render(
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/">Home</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href="/docs">Docs</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Current</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>,
    );

    expect(screen.getByRole('navigation')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Home' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Docs' })).toBeInTheDocument();
    expect(screen.getByText('Current')).toBeInTheDocument();
  });
});
