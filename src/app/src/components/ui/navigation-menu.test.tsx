import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from './navigation-menu';

describe('NavigationMenu', () => {
  it('renders navigation menu', () => {
    render(
      <NavigationMenu>
        <NavigationMenuList>
          <NavigationMenuItem>
            <NavigationMenuLink href="/">Home</NavigationMenuLink>
          </NavigationMenuItem>
        </NavigationMenuList>
      </NavigationMenu>,
    );

    expect(screen.getByRole('navigation')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Home' })).toBeInTheDocument();
  });

  it('renders menu list', () => {
    render(
      <NavigationMenu>
        <NavigationMenuList />
      </NavigationMenu>,
    );

    const list = screen.getByRole('list');
    expect(list).toBeInTheDocument();
    expect(list).toHaveClass('flex', 'items-center');
  });

  it('renders menu trigger with chevron icon', () => {
    const { container } = render(
      <NavigationMenu>
        <NavigationMenuList>
          <NavigationMenuItem>
            <NavigationMenuTrigger>Products</NavigationMenuTrigger>
          </NavigationMenuItem>
        </NavigationMenuList>
      </NavigationMenu>,
    );

    expect(screen.getByText('Products')).toBeInTheDocument();

    const chevronIcon = container.querySelector('svg');
    expect(chevronIcon).toBeInTheDocument();
  });

  it('expands menu content on trigger click', async () => {
    const user = userEvent.setup();
    render(
      <NavigationMenu>
        <NavigationMenuList>
          <NavigationMenuItem>
            <NavigationMenuTrigger>Products</NavigationMenuTrigger>
            <NavigationMenuContent>
              <NavigationMenuLink href="/product1">Product 1</NavigationMenuLink>
            </NavigationMenuContent>
          </NavigationMenuItem>
        </NavigationMenuList>
      </NavigationMenu>,
    );

    const trigger = screen.getByText('Products');
    await user.click(trigger);

    expect(await screen.findByRole('link', { name: 'Product 1' })).toBeInTheDocument();
  });

  it('expands menu content on trigger hover', async () => {
    const user = userEvent.setup();
    render(
      <NavigationMenu>
        <NavigationMenuList>
          <NavigationMenuItem>
            <NavigationMenuTrigger>Products</NavigationMenuTrigger>
            <NavigationMenuContent>
              <NavigationMenuLink href="/product1">Product 1</NavigationMenuLink>
            </NavigationMenuContent>
          </NavigationMenuItem>
        </NavigationMenuList>
      </NavigationMenu>,
    );

    await user.hover(screen.getByText('Products'));

    expect(await screen.findByRole('link', { name: 'Product 1' })).toBeInTheDocument();
  });

  it('anchors dropdown content to the owning item instead of a shared viewport', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <NavigationMenu>
        <NavigationMenuList>
          <NavigationMenuItem>
            <NavigationMenuTrigger>Products</NavigationMenuTrigger>
            <NavigationMenuContent>
              <NavigationMenuLink href="/product1">Product 1</NavigationMenuLink>
            </NavigationMenuContent>
          </NavigationMenuItem>
        </NavigationMenuList>
      </NavigationMenu>,
    );

    await user.click(screen.getByText('Products'));

    expect(screen.getByText('Products').closest('li')).toHaveClass('relative');
    expect(screen.getByRole('link', { name: 'Product 1' }).parentElement).toHaveClass(
      'absolute',
      'left-0',
      'top-full',
    );
    expect(
      container.querySelector('[data-radix-navigation-menu-viewport]'),
    ).not.toBeInTheDocument();
  });

  it('applies custom className to menu', () => {
    render(
      <NavigationMenu className="custom-nav">
        <NavigationMenuList />
      </NavigationMenu>,
    );

    const nav = screen.getByRole('navigation');
    expect(nav).toHaveClass('custom-nav');
  });

  it('renders navigation link', () => {
    render(
      <NavigationMenu>
        <NavigationMenuList>
          <NavigationMenuItem>
            <NavigationMenuLink href="/about">About</NavigationMenuLink>
          </NavigationMenuItem>
        </NavigationMenuList>
      </NavigationMenu>,
    );

    const link = screen.getByRole('link', { name: 'About' });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/about');
  });

  it('supports multiple menu items', () => {
    render(
      <NavigationMenu>
        <NavigationMenuList>
          <NavigationMenuItem>
            <NavigationMenuLink href="/">Home</NavigationMenuLink>
          </NavigationMenuItem>
          <NavigationMenuItem>
            <NavigationMenuLink href="/about">About</NavigationMenuLink>
          </NavigationMenuItem>
          <NavigationMenuItem>
            <NavigationMenuLink href="/contact">Contact</NavigationMenuLink>
          </NavigationMenuItem>
        </NavigationMenuList>
      </NavigationMenu>,
    );

    expect(screen.getByRole('link', { name: 'Home' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'About' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Contact' })).toBeInTheDocument();
  });

  it('includes z-index class in root element', () => {
    render(
      <NavigationMenu>
        <NavigationMenuList>
          <NavigationMenuItem>
            <NavigationMenuLink href="/">Home</NavigationMenuLink>
          </NavigationMenuItem>
        </NavigationMenuList>
      </NavigationMenu>,
    );

    const nav = screen.getByRole('navigation');
    expect(nav).toHaveClass('z-(--z-dropdown)');
  });
});
