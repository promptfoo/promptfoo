import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './card';

describe('Card', () => {
  it('renders card', () => {
    render(<Card>Card content</Card>);
    const card = screen.getByText('Card content');
    expect(card).toBeInTheDocument();
  });

  it('applies correct styles', () => {
    const { container } = render(<Card>Content</Card>);
    const card = container.firstChild;
    expect(card).toHaveClass('rounded-lg', 'border', 'shadow-sm');
  });

  it('applies custom className', () => {
    const { container } = render(<Card className="custom-card">Content</Card>);
    const card = container.firstChild;
    expect(card).toHaveClass('custom-card');
  });
});

describe('CardHeader', () => {
  it('renders card header', () => {
    render(<CardHeader>Header content</CardHeader>);
    const header = screen.getByText('Header content');
    expect(header).toBeInTheDocument();
  });

  it('applies correct styles', () => {
    const { container } = render(<CardHeader>Header</CardHeader>);
    const header = container.firstChild;
    expect(header).toHaveClass('flex', 'flex-col', 'p-6');
  });

  it('applies custom className', () => {
    const { container } = render(<CardHeader className="custom-header">Header</CardHeader>);
    const header = container.firstChild;
    expect(header).toHaveClass('custom-header');
  });
});

describe('CardTitle', () => {
  it('renders card title', () => {
    render(<CardTitle>Title</CardTitle>);
    const title = screen.getByText('Title');
    expect(title).toBeInTheDocument();
    expect(title.tagName).toBe('H3');
  });

  it('applies correct styles', () => {
    render(<CardTitle>Title</CardTitle>);
    const title = screen.getByText('Title');
    expect(title).toHaveClass('text-2xl', 'font-semibold');
  });

  it('applies custom className', () => {
    render(<CardTitle className="custom-title">Title</CardTitle>);
    const title = screen.getByText('Title');
    expect(title).toHaveClass('custom-title');
  });
});

describe('CardDescription', () => {
  it('renders card description', () => {
    render(<CardDescription>Description text</CardDescription>);
    const description = screen.getByText('Description text');
    expect(description).toBeInTheDocument();
  });

  it('applies correct styles', () => {
    render(<CardDescription>Description</CardDescription>);
    const description = screen.getByText('Description');
    expect(description).toHaveClass('text-sm', 'text-muted-foreground');
  });

  it('applies custom className', () => {
    render(<CardDescription className="custom-desc">Description</CardDescription>);
    const description = screen.getByText('Description');
    expect(description).toHaveClass('custom-desc');
  });
});

describe('CardContent', () => {
  it('renders card content', () => {
    render(<CardContent>Content</CardContent>);
    const content = screen.getByText('Content');
    expect(content).toBeInTheDocument();
  });

  it('applies correct styles', () => {
    const { container } = render(<CardContent>Content</CardContent>);
    const content = container.firstChild;
    expect(content).toHaveClass('p-6', 'pt-0');
  });

  it('applies custom className', () => {
    const { container } = render(<CardContent className="custom-content">Content</CardContent>);
    const content = container.firstChild;
    expect(content).toHaveClass('custom-content');
  });
});

describe('CardFooter', () => {
  it('renders card footer', () => {
    render(<CardFooter>Footer</CardFooter>);
    const footer = screen.getByText('Footer');
    expect(footer).toBeInTheDocument();
  });

  it('applies correct styles', () => {
    const { container } = render(<CardFooter>Footer</CardFooter>);
    const footer = container.firstChild;
    expect(footer).toHaveClass('flex', 'items-center', 'p-6', 'pt-0');
  });

  it('applies custom className', () => {
    const { container } = render(<CardFooter className="custom-footer">Footer</CardFooter>);
    const footer = container.firstChild;
    expect(footer).toHaveClass('custom-footer');
  });
});

describe('Card composition', () => {
  it('renders complete card with all components', () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>Card Title</CardTitle>
          <CardDescription>Card Description</CardDescription>
        </CardHeader>
        <CardContent>Card Content</CardContent>
        <CardFooter>Card Footer</CardFooter>
      </Card>,
    );

    expect(screen.getByText('Card Title')).toBeInTheDocument();
    expect(screen.getByText('Card Description')).toBeInTheDocument();
    expect(screen.getByText('Card Content')).toBeInTheDocument();
    expect(screen.getByText('Card Footer')).toBeInTheDocument();
  });
});
