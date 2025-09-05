import React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import TruncatedText from './TruncatedText';

describe('TruncatedText', () => {
  it('should display truncated text with ellipsis and toggle UI when the input text length exceeds maxLength', () => {
    const longText =
      'This is a very long piece of text that is intended to be truncated by the component.';
    const maxLength = 20;
    const expectedTruncatedText = longText.slice(0, maxLength);

    const { container } = render(<TruncatedText text={longText} maxLength={maxLength} />);

    const mainDiv = container.querySelector('#eval-output-cell-text');
    expect(mainDiv).toBeInTheDocument();

    expect(mainDiv).toHaveTextContent(`${expectedTruncatedText}...`);

    expect(screen.queryByText(longText)).not.toBeInTheDocument();

    expect(mainDiv).toHaveStyle('cursor: pointer');

    expect(screen.getByText('...')).toBeInTheDocument();
  });

  it('should display the full text without truncation or toggle UI when the input text length is less than or equal to maxLength', () => {
    const shortText = 'Short text';
    const maxLength = 20;

    const { container } = render(<TruncatedText text={shortText} maxLength={maxLength} />);

    const mainDiv = container.querySelector('#eval-output-cell-text');
    expect(mainDiv).toBeInTheDocument();

    expect(mainDiv).toHaveTextContent(shortText);

    expect(screen.queryByText('...')).not.toBeInTheDocument();

    expect(screen.queryByText('Show less')).not.toBeInTheDocument();

    expect(mainDiv).toHaveStyle('cursor: normal');
  });

  it("should expand to show the full text and display the 'Show less' UI when the user clicks the truncated text", () => {
    const longText =
      'This is a very long piece of text that is intended to be truncated by the component.';
    const maxLength = 20;

    const { container } = render(<TruncatedText text={longText} maxLength={maxLength} />);

    const mainDiv = container.querySelector('#eval-output-cell-text');
    expect(mainDiv).toBeInTheDocument();

    fireEvent.click(mainDiv as Element);

    expect(screen.getByText(longText)).toBeInTheDocument();
    expect(screen.getByText('Show less')).toBeInTheDocument();
  });

  it("should collapse back to the truncated state when the user clicks the 'Show less' UI after expanding", () => {
    const longText =
      'This is a very long piece of text that is intended to be truncated by the component.';
    const maxLength = 20;
    const expectedTruncatedText = longText.slice(0, maxLength);

    const { container } = render(<TruncatedText text={longText} maxLength={maxLength} />);

    const mainDiv = container.querySelector('#eval-output-cell-text');
    expect(mainDiv).toBeInTheDocument();

    fireEvent.click(mainDiv as Element);

    const showLessButton = screen.getByText('Show less');
    expect(showLessButton).toBeInTheDocument();

    fireEvent.click(showLessButton);

    expect(mainDiv).toHaveTextContent(`${expectedTruncatedText}...`);
    expect(screen.queryByText('Show less')).not.toBeInTheDocument();
    expect(screen.getByText('...')).toBeInTheDocument();
  });

  it('should correctly truncate and render a React element input according to maxLength, preserving the element structure', () => {
    const elementText = 'Some long text inside a span';
    const reactElement = React.createElement('span', {}, elementText);
    const maxLength = 15;
    const expectedTruncatedText = elementText.slice(0, maxLength);

    const { container } = render(<TruncatedText text={reactElement} maxLength={maxLength} />);

    const mainDiv = container.querySelector('#eval-output-cell-text');
    expect(mainDiv).toBeInTheDocument();

    expect(mainDiv).toHaveTextContent(`${expectedTruncatedText}...`);

    expect(screen.queryByText(elementText)).not.toBeInTheDocument();
  });

  it('should correctly truncate and render an array of React nodes according to maxLength, preserving the structure of nodes that fit within the limit', () => {
    const nodes = [
      'This is the first part, ',
      <span key="second-part">and this is the second part</span>,
      ', and this is the third part.',
    ];
    const maxLength = 40;
    const expectedStart = 'This is the first part, ';
    const expectedEnd = ', and this is the third part.';

    const { container } = render(<TruncatedText text={nodes} maxLength={maxLength} />);

    const mainDiv = container.querySelector('#eval-output-cell-text');
    expect(mainDiv).toBeInTheDocument();

    if (!mainDiv) {
      throw new Error(
        'mainDiv is null. The element with id "eval-output-cell-text" was not found.',
      );
    }

    expect(mainDiv?.textContent).toContain(expectedStart);
    const spanElement = mainDiv.querySelector('span');
    expect(spanElement).toBeInTheDocument();
    expect(mainDiv?.textContent).toContain('...');

    expect(screen.queryByText(expectedEnd)).not.toBeInTheDocument();

    expect(mainDiv).toHaveStyle('cursor: pointer');

    expect(mainDiv?.textContent?.length).toBeLessThanOrEqual(maxLength + 3);
  });

  it('should treat numeric input as a string and truncate/render it according to maxLength', () => {
    const numericInput = 1234567890;
    const maxLength = 5;
    const expectedTruncatedText = numericInput.toString().slice(0, maxLength);

    const { container } = render(<TruncatedText text={numericInput} maxLength={maxLength} />);

    const mainDiv = container.querySelector('#eval-output-cell-text');
    expect(mainDiv).toBeInTheDocument();
    expect(mainDiv).toHaveTextContent(`${expectedTruncatedText}...`);
    expect(screen.queryByText(numericInput.toString())).not.toBeInTheDocument();
    expect(mainDiv).toHaveStyle('cursor: pointer');
    expect(screen.getByText('...')).toBeInTheDocument();
  });

  it('should NOT truncate text that is shorter than maxLength on initial render', () => {
    const shortText = 'Short';
    const maxLength = 100; // Much longer than the text

    const { container } = render(<TruncatedText text={shortText} maxLength={maxLength} />);

    const mainDiv = container.querySelector('#eval-output-cell-text');
    expect(mainDiv).toBeInTheDocument();

    // Should show the full text without truncation
    expect(mainDiv).toHaveTextContent(shortText);
    expect(mainDiv).not.toHaveTextContent('...');

    // Should not be clickable since no truncation is needed
    expect(mainDiv).toHaveStyle('cursor: normal');

    // Should not show ellipsis button
    expect(screen.queryByText('...')).not.toBeInTheDocument();
  });

  it('should properly truncate text that is exactly at maxLength boundary', () => {
    const exactText = '12345678901234567890'; // Exactly 20 characters
    const maxLength = 20;

    const { container } = render(<TruncatedText text={exactText} maxLength={maxLength} />);

    const mainDiv = container.querySelector('#eval-output-cell-text');
    expect(mainDiv).toBeInTheDocument();

    // Text at exact length should not be truncated
    expect(mainDiv).toHaveTextContent(exactText);
    expect(mainDiv).not.toHaveTextContent('...');
    expect(mainDiv).toHaveStyle('cursor: normal');
  });

  it('should properly handle text that is one character over maxLength', () => {
    const overByOneText = '123456789012345678901'; // Exactly 21 characters
    const maxLength = 20;
    const expectedTruncated = overByOneText.slice(0, maxLength);

    const { container } = render(<TruncatedText text={overByOneText} maxLength={maxLength} />);

    const mainDiv = container.querySelector('#eval-output-cell-text');
    expect(mainDiv).toBeInTheDocument();

    // Should be truncated and show ellipsis
    expect(mainDiv).toHaveTextContent(`${expectedTruncated}...`);
    expect(mainDiv).toHaveStyle('cursor: pointer');
    expect(screen.getByText('...')).toBeInTheDocument();
  });

  it('should preserve user expanded state when maxLength changes', () => {
    const longText = 'This is a very long piece of text that exceeds maxLength';
    const { container, rerender } = render(<TruncatedText text={longText} maxLength={20} />);

    const mainDiv = container.querySelector('#eval-output-cell-text');

    // Initially should be truncated
    expect(mainDiv).toHaveTextContent(`${longText.slice(0, 20)}...`);

    // User clicks to expand
    fireEvent.click(mainDiv as Element);
    expect(screen.getByText(longText)).toBeInTheDocument();
    expect(screen.getByText('Show less')).toBeInTheDocument();

    // maxLength changes (e.g., user adjusts slider)
    rerender(<TruncatedText text={longText} maxLength={25} />);

    // User's expanded state should be preserved
    expect(screen.getByText(longText)).toBeInTheDocument();
    expect(screen.getByText('Show less')).toBeInTheDocument();
    expect(mainDiv).toHaveTextContent(longText);
  });

  it('should update truncation state when text prop changes', () => {
    const shortText = 'Short';
    const longText = 'This is a very long piece of text that exceeds maxLength';
    const maxLength = 20;

    const { container, rerender } = render(
      <TruncatedText text={shortText} maxLength={maxLength} />,
    );

    const mainDiv = container.querySelector('#eval-output-cell-text');

    // Initially should not be truncated
    expect(mainDiv).toHaveTextContent(shortText);
    expect(mainDiv).not.toHaveTextContent('...');
    expect(mainDiv).toHaveStyle('cursor: normal');

    // Re-render with longer text
    rerender(<TruncatedText text={longText} maxLength={maxLength} />);

    // Now should be truncated
    expect(mainDiv).toHaveTextContent(`${longText.slice(0, maxLength)}...`);
    expect(mainDiv).toHaveStyle('cursor: pointer');
    expect(screen.getByText('...')).toBeInTheDocument();
  });

  it('should reset truncation state when props change', () => {
    const longText = 'This is a very long piece of text that exceeds maxLength';
    const shortText = 'Short';
    const maxLength = 20;

    const { container, rerender } = render(<TruncatedText text={longText} maxLength={maxLength} />);

    const mainDiv = container.querySelector('#eval-output-cell-text');

    // Initially should be truncated
    expect(mainDiv).toHaveTextContent(`${longText.slice(0, maxLength)}...`);

    // Change to short text
    rerender(<TruncatedText text={shortText} maxLength={maxLength} />);

    // Should not be truncated
    expect(mainDiv).toHaveTextContent(shortText);
    expect(mainDiv).not.toHaveTextContent('...');
    expect(mainDiv).toHaveStyle('cursor: normal');

    // Change back to long text
    rerender(<TruncatedText text={longText} maxLength={maxLength} />);

    // Should be truncated again
    expect(mainDiv).toHaveTextContent(`${longText.slice(0, maxLength)}...`);
    expect(screen.getByText('...')).toBeInTheDocument();
  });

  it('should correctly reset state when React element content changes', () => {
    const longText = 'This is a very long initial React element';
    const shortText = 'Short element';
    const maxLength = 20;

    const initialElement = <span>{longText}</span>;
    const shortElement = <span>{shortText}</span>;

    const { container, rerender } = render(
      <TruncatedText text={initialElement} maxLength={maxLength} />,
    );

    const mainDiv = container.querySelector('#eval-output-cell-text');

    // Initially should be truncated
    expect(mainDiv).toHaveTextContent(`${longText.slice(0, maxLength)}...`);

    // Re-render with a shorter element
    rerender(<TruncatedText text={shortElement} maxLength={maxLength} />);

    // Now should NOT be truncated
    expect(mainDiv).toHaveTextContent(shortText);
    expect(mainDiv).not.toHaveTextContent('...');

    // Re-render with the long one again
    rerender(<TruncatedText text={<span>{longText}</span>} maxLength={maxLength} />);

    // Should be truncated again
    expect(mainDiv).toHaveTextContent(`${longText.slice(0, maxLength)}...`);
  });
});
