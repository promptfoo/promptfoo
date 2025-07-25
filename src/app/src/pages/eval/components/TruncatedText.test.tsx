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
});
