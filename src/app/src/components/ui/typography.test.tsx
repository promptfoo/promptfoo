import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Typography } from './typography';

describe('Typography', () => {
  describe('variants', () => {
    it('renders with default body variant', () => {
      render(<Typography>Default text</Typography>);
      const element = screen.getByText('Default text');
      expect(element).toBeInTheDocument();
      expect(element).toHaveClass('text-sm');
      expect(element.tagName).toBe('P');
    });

    it('renders with pageTitle variant', () => {
      render(<Typography variant="pageTitle">Page Title</Typography>);
      const element = screen.getByText('Page Title');
      expect(element).toHaveClass('text-2xl', 'font-semibold', 'tracking-tight');
    });

    it('renders with title variant', () => {
      render(<Typography variant="title">Title</Typography>);
      const element = screen.getByText('Title');
      expect(element).toHaveClass('text-xl', 'font-semibold', 'tracking-tight');
    });

    it('renders with subtitle variant', () => {
      render(<Typography variant="subtitle">Subtitle</Typography>);
      const element = screen.getByText('Subtitle');
      expect(element).toHaveClass('text-lg', 'font-semibold');
    });

    it('renders with label variant', () => {
      render(<Typography variant="label">Label</Typography>);
      const element = screen.getByText('Label');
      expect(element).toHaveClass('text-base', 'font-semibold');
    });

    it('renders with body variant', () => {
      render(<Typography variant="body">Body text</Typography>);
      const element = screen.getByText('Body text');
      expect(element).toHaveClass('text-sm');
    });

    it('renders with bodyMedium variant', () => {
      render(<Typography variant="bodyMedium">Body medium</Typography>);
      const element = screen.getByText('Body medium');
      expect(element).toHaveClass('text-sm', 'font-medium');
    });

    it('renders with small variant', () => {
      render(<Typography variant="small">Small text</Typography>);
      const element = screen.getByText('Small text');
      expect(element).toHaveClass('text-xs');
    });

    it('renders with muted variant', () => {
      render(<Typography variant="muted">Muted text</Typography>);
      const element = screen.getByText('Muted text');
      expect(element).toHaveClass('text-sm', 'text-muted-foreground');
    });

    it('renders with code variant', () => {
      render(<Typography variant="code">const x = 1</Typography>);
      const element = screen.getByText('const x = 1');
      expect(element).toHaveClass('font-mono', 'text-sm');
    });
  });

  describe('polymorphic as prop', () => {
    it('renders as p by default', () => {
      render(<Typography>Paragraph</Typography>);
      const element = screen.getByText('Paragraph');
      expect(element.tagName).toBe('P');
    });

    it('renders as h1 when specified', () => {
      render(
        <Typography as="h1" variant="pageTitle">
          Heading 1
        </Typography>,
      );
      const element = screen.getByText('Heading 1');
      expect(element.tagName).toBe('H1');
    });

    it('renders as h2 when specified', () => {
      render(
        <Typography as="h2" variant="title">
          Heading 2
        </Typography>,
      );
      const element = screen.getByText('Heading 2');
      expect(element.tagName).toBe('H2');
    });

    it('renders as h3 when specified', () => {
      render(
        <Typography as="h3" variant="subtitle">
          Heading 3
        </Typography>,
      );
      const element = screen.getByText('Heading 3');
      expect(element.tagName).toBe('H3');
    });

    it('renders as span when specified', () => {
      render(
        <Typography as="span" variant="muted">
          Inline text
        </Typography>,
      );
      const element = screen.getByText('Inline text');
      expect(element.tagName).toBe('SPAN');
    });

    it('renders as pre when specified', () => {
      render(
        <Typography as="pre" variant="code">
          Code block
        </Typography>,
      );
      const element = screen.getByText('Code block');
      expect(element.tagName).toBe('PRE');
    });

    it('renders as label when specified', () => {
      render(
        <Typography as="label" variant="bodyMedium">
          Form label
        </Typography>,
      );
      const element = screen.getByText('Form label');
      expect(element.tagName).toBe('LABEL');
    });
  });

  describe('className prop', () => {
    it('applies custom className', () => {
      render(<Typography className="custom-class">Text</Typography>);
      const element = screen.getByText('Text');
      expect(element).toHaveClass('custom-class');
    });

    it('merges custom className with variant classes', () => {
      render(
        <Typography variant="title" className="text-red-500">
          Colored title
        </Typography>,
      );
      const element = screen.getByText('Colored title');
      expect(element).toHaveClass('text-xl', 'font-semibold', 'text-red-500');
    });
  });

  describe('HTML attributes', () => {
    it('passes through id attribute', () => {
      render(<Typography id="test-id">Text</Typography>);
      const element = screen.getByText('Text');
      expect(element).toHaveAttribute('id', 'test-id');
    });

    it('passes through data attributes', () => {
      render(<Typography data-testid="custom-test">Text</Typography>);
      const element = screen.getByTestId('custom-test');
      expect(element).toBeInTheDocument();
    });

    it('passes through aria attributes', () => {
      render(<Typography aria-label="accessible text">Text</Typography>);
      const element = screen.getByText('Text');
      expect(element).toHaveAttribute('aria-label', 'accessible text');
    });
  });

  describe('weight prop', () => {
    it('applies light weight', () => {
      render(<Typography weight="light">Light text</Typography>);
      const element = screen.getByText('Light text');
      expect(element).toHaveClass('font-light');
    });

    it('applies normal weight', () => {
      render(<Typography weight="normal">Normal text</Typography>);
      const element = screen.getByText('Normal text');
      expect(element).toHaveClass('font-normal');
    });

    it('applies medium weight', () => {
      render(<Typography weight="medium">Medium text</Typography>);
      const element = screen.getByText('Medium text');
      expect(element).toHaveClass('font-medium');
    });

    it('applies semibold weight', () => {
      render(<Typography weight="semibold">Semibold text</Typography>);
      const element = screen.getByText('Semibold text');
      expect(element).toHaveClass('font-semibold');
    });

    it('applies bold weight', () => {
      render(<Typography weight="bold">Bold text</Typography>);
      const element = screen.getByText('Bold text');
      expect(element).toHaveClass('font-bold');
    });

    it('overrides default variant weight', () => {
      render(
        <Typography variant="pageTitle" weight="light">
          Light page title
        </Typography>,
      );
      const element = screen.getByText('Light page title');
      expect(element).toHaveClass('text-2xl', 'tracking-tight', 'font-light');
      expect(element).not.toHaveClass('font-semibold');
    });

    it('uses default weight when not specified for heading variants', () => {
      render(<Typography variant="title">Default weight title</Typography>);
      const element = screen.getByText('Default weight title');
      expect(element).toHaveClass('font-semibold');
    });
  });

  describe('children', () => {
    it('renders string children', () => {
      render(<Typography>Simple string</Typography>);
      expect(screen.getByText('Simple string')).toBeInTheDocument();
    });

    it('renders element children', () => {
      render(
        <Typography>
          <span>Nested span</span>
        </Typography>,
      );
      expect(screen.getByText('Nested span')).toBeInTheDocument();
    });

    it('renders mixed children', () => {
      render(
        <Typography>
          Text with <strong>bold</strong> content
        </Typography>,
      );
      expect(screen.getByText(/Text with/)).toBeInTheDocument();
      expect(screen.getByText('bold')).toBeInTheDocument();
    });
  });
});
