import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, it, expect } from 'vitest';
import ProviderDocumentationLink from './ProviderDocumentationLink';

const expectProperLinkAttributes = (element: HTMLElement, expectedUrl: string) => {
  expect(element).toBeInTheDocument();
  expect(element).toHaveAttribute('href', expectedUrl);
  expect(element).toHaveAttribute('target', '_blank');
  expect(element).toHaveAttribute('rel', 'noopener noreferrer');
};

const getDocumentationUrl = (providerId: string) =>
  `https://www.promptfoo.dev/docs/providers/${providerId}`;

describe('ProviderDocumentationLink', () => {
  it.each([
    {
      showTooltip: true,
      providerLabel: undefined,
      expectedTooltipText: 'View openai documentation',
    },
    { showTooltip: false, providerLabel: undefined, expectedTooltipText: null },
    {
      showTooltip: true,
      providerLabel: 'OpenAI Custom Label',
      expectedTooltipText: 'View OpenAI Custom Label documentation',
    },
  ])(
    'should render icon variant with showTooltip=$showTooltip and providerLabel=$providerLabel',
    async ({ showTooltip, providerLabel, expectedTooltipText }) => {
      const providerId = 'openai';
      const expectedUrl = getDocumentationUrl(providerId);

      render(
        <ProviderDocumentationLink
          providerId={providerId}
          variant="icon"
          showTooltip={showTooltip}
          providerLabel={providerLabel}
        />,
      );

      const linkButton = screen.getByRole('link');
      expectProperLinkAttributes(linkButton, expectedUrl);

      const icon = screen.getByTestId('HelpOutlineIcon');
      expect(icon).toBeInTheDocument();
      expect(linkButton).toContainElement(icon);

      if (showTooltip && expectedTooltipText) {
        fireEvent.mouseEnter(linkButton);
        const tooltip = await screen.findByRole('tooltip');
        expect(tooltip).toBeInTheDocument();
        expect(tooltip).toHaveTextContent(expectedTooltipText);
      } else {
        const tooltip = screen.queryByRole('tooltip');
        expect(tooltip).not.toBeInTheDocument();
      }
    },
  );

  it("should render a Button with the correct documentation URL and label when variant is 'button' and providerId is valid and has documentation", () => {
    const providerId = 'openai';
    const expectedUrl = getDocumentationUrl(providerId);

    render(<ProviderDocumentationLink providerId={providerId} variant="button" />);

    const button = screen.getByRole('link', { name: 'View Documentation' });
    expectProperLinkAttributes(button, expectedUrl);

    const icon = screen.getByTestId('HelpOutlineIcon');
    expect(icon).toBeInTheDocument();
    expect(button).toContainElement(icon);
  });

  it("should render a Link with the correct documentation URL and label when variant is 'link' and providerId is valid and has documentation", () => {
    const providerId = 'openai';
    const providerLabel = 'OpenAI';
    const expectedUrl = getDocumentationUrl(providerId);
    const expectedText = `${providerLabel} documentation`;

    render(
      <ProviderDocumentationLink
        providerId={providerId}
        providerLabel={providerLabel}
        variant="link"
      />,
    );

    const linkElement = screen.getByRole('link');

    expectProperLinkAttributes(linkElement, expectedUrl);
    expect(linkElement).toHaveTextContent(expectedText);
  });

  it('should return null when providerId is not provided', () => {
    const { container: container1 } = render(<ProviderDocumentationLink providerId={undefined} />);
    expect(container1.firstChild).toBeNull();

    const { container: container2 } = render(<ProviderDocumentationLink providerId="" />);
    expect(container2.firstChild).toBeNull();
  });

  it('should return null when the provider does not have specific documentation', () => {
    const providerId = 'nonexistent-provider';
    const { container } = render(<ProviderDocumentationLink providerId={providerId} />);

    expect(container.firstChild).toBeNull();
  });

  it('should render without crashing when an invalid size prop is passed with variant="icon"', () => {
    const providerId = 'openai';
    render(<ProviderDocumentationLink providerId={providerId} variant="icon" />);

    const linkButton = screen.getByRole('link');
    expect(linkButton).toBeInTheDocument();
  });

  it('should render as a link with the correct documentation URL and label when an invalid variant is provided', () => {
    const providerId = 'openai';
    const invalidVariant = 'invalid';
    const expectedUrl = getDocumentationUrl(providerId);
    const expectedText = `${providerId} documentation`;

    render(<ProviderDocumentationLink providerId={providerId} variant={invalidVariant as any} />);

    const linkElement = screen.getByRole('link', { name: expectedText });
    expectProperLinkAttributes(linkElement, expectedUrl);
  });
});
