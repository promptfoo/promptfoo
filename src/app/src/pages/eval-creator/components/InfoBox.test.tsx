import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { InfoBox } from './InfoBox';

describe('InfoBox component', () => {
  describe('variant selection and styling', () => {
    it('renders info variant with correct icon and styling', () => {
      render(<InfoBox variant="info">This is an info message</InfoBox>);

      const container = screen.getByText('This is an info message').closest('div')?.parentElement;
      expect(container).toHaveClass('bg-blue-50', 'dark:bg-blue-950/30');
      expect(container).toHaveClass('border-blue-200', 'dark:border-blue-800');
      expect(container).toHaveClass('text-blue-700', 'dark:text-blue-300');

      // Check that Info icon is rendered (lucide-react icons render as SVG)
      const svg = container?.querySelector('svg');
      expect(svg).toBeInTheDocument();
    });

    it('renders tip variant with correct icon and styling', () => {
      render(<InfoBox variant="tip">This is a tip</InfoBox>);

      const container = screen.getByText('This is a tip').closest('div')?.parentElement;
      expect(container).toHaveClass('bg-amber-50', 'dark:bg-amber-950/30');
      expect(container).toHaveClass('border-amber-200', 'dark:border-amber-800');
      expect(container).toHaveClass('text-amber-700', 'dark:text-amber-300');

      const svg = container?.querySelector('svg');
      expect(svg).toBeInTheDocument();
    });

    it('renders help variant with correct icon and styling', () => {
      render(<InfoBox variant="help">This is a help message</InfoBox>);

      const container = screen.getByText('This is a help message').closest('div')?.parentElement;
      expect(container).toHaveClass('bg-purple-50', 'dark:bg-purple-950/30');
      expect(container).toHaveClass('border-purple-200', 'dark:border-purple-800');
      expect(container).toHaveClass('text-purple-700', 'dark:text-purple-300');

      const svg = container?.querySelector('svg');
      expect(svg).toBeInTheDocument();
    });

    it('defaults to info variant when no variant is provided', () => {
      render(<InfoBox>Default variant message</InfoBox>);

      const container = screen.getByText('Default variant message').closest('div')?.parentElement;
      expect(container).toHaveClass('bg-blue-50', 'dark:bg-blue-950/30');
      expect(container).toHaveClass('border-blue-200', 'dark:border-blue-800');
      expect(container).toHaveClass('text-blue-700', 'dark:text-blue-300');
    });
  });

  describe('content rendering', () => {
    it('renders text content correctly', () => {
      render(<InfoBox variant="info">Simple text content</InfoBox>);

      expect(screen.getByText('Simple text content')).toBeInTheDocument();
    });

    it('renders complex JSX children', () => {
      render(
        <InfoBox variant="tip">
          <div>
            <strong>Bold text</strong> and <em>italic text</em>
          </div>
        </InfoBox>,
      );

      expect(screen.getByText('Bold text')).toBeInTheDocument();
      expect(screen.getByText('italic text')).toBeInTheDocument();
    });

    it('renders multiple child elements', () => {
      render(
        <InfoBox variant="help">
          <p>First paragraph</p>
          <p>Second paragraph</p>
        </InfoBox>,
      );

      expect(screen.getByText('First paragraph')).toBeInTheDocument();
      expect(screen.getByText('Second paragraph')).toBeInTheDocument();
    });
  });

  describe('custom className', () => {
    it('applies custom className along with default classes', () => {
      render(
        <InfoBox variant="info" className="custom-class">
          Custom styled message
        </InfoBox>,
      );

      const container = screen.getByText('Custom styled message').closest('div')?.parentElement;
      expect(container).toHaveClass('custom-class');
      // Should also retain default classes
      expect(container).toHaveClass('bg-blue-50', 'border-blue-200');
    });

    it('allows overriding spacing with custom className', () => {
      render(
        <InfoBox variant="info" className="p-8 m-4">
          Override spacing
        </InfoBox>,
      );

      const container = screen.getByText('Override spacing').closest('div')?.parentElement;
      expect(container).toHaveClass('p-8', 'm-4');
    });
  });

  describe('structure and layout', () => {
    it('has correct base structure with border and rounded corners', () => {
      render(<InfoBox variant="info">Test content</InfoBox>);

      const container = screen.getByText('Test content').closest('div')?.parentElement;
      expect(container).toHaveClass('rounded-lg', 'border', 'p-4', 'flex', 'gap-3');
    });

    it('renders icon with correct size and shrink class', () => {
      render(<InfoBox variant="info">Test content</InfoBox>);

      const container = screen.getByText('Test content').closest('div')?.parentElement;
      const icon = container?.querySelector('svg');
      expect(icon).toHaveClass('size-5', 'shrink-0', 'mt-0.5');
    });

    it('renders content in a flex container with correct styling', () => {
      render(<InfoBox variant="info">Test content</InfoBox>);

      const contentDiv = screen.getByText('Test content');
      expect(contentDiv).toHaveClass('text-sm', 'leading-relaxed', 'flex-1');
    });
  });
});
