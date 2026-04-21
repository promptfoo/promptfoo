import { cleanup, render, screen } from '@testing-library/react';
import { Eye } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import SettingsSection from './SettingsSection';

describe('SettingsSection', () => {
  it('should render the title, icon, description, and children when all props are provided', () => {
    const testTitle = 'Test Section Title';
    const testDescription = 'This is a test description for the section.';
    const testChildText = 'This is the child content.';

    render(
      <SettingsSection
        title={testTitle}
        description={testDescription}
        icon={<Eye data-testid="test-icon" />}
      >
        <div>{testChildText}</div>
      </SettingsSection>,
    );

    expect(screen.getByText(testTitle)).toBeInTheDocument();

    expect(screen.getByText(testDescription)).toBeInTheDocument();

    expect(screen.getByTestId('test-icon')).toBeInTheDocument();

    expect(screen.getByText(testChildText)).toBeInTheDocument();
  });

  it('should render the title and children when only the required props are provided (icon and description omitted)', () => {
    const testTitle = 'Test Section Title';
    const testChildText = 'This is the child content.';

    render(
      <SettingsSection title={testTitle}>
        <div>{testChildText}</div>
      </SettingsSection>,
    );

    expect(screen.getByText(testTitle)).toBeInTheDocument();

    expect(screen.getByText(testChildText)).toBeInTheDocument();
  });

  it('should set the aria-labelledby attribute and Typography id based on the title prop', () => {
    const testTitle = 'Section Title with Spaces';
    const expectedSectionId = 'section-section-title-with-spaces';

    render(
      <SettingsSection title={testTitle}>
        <div>Test Content</div>
      </SettingsSection>,
    );

    const sectionElement = screen.getByRole('region');
    expect(sectionElement).toHaveAttribute('aria-labelledby', expectedSectionId);

    const titleElement = screen.getByText(testTitle);
    expect(titleElement).toHaveAttribute('id', expectedSectionId);
  });

  it('should ensure children of SettingsSection do not have role="listitem" when not explicitly set', () => {
    const testTitle = 'Accessibility Test Section';

    render(
      <SettingsSection title={testTitle}>
        <div data-testid="child1">Child 1</div>
        <div data-testid="child2">Child 2</div>
      </SettingsSection>,
    );

    const child1 = screen.getByTestId('child1');
    const child2 = screen.getByTestId('child2');

    expect(child1).not.toHaveAttribute('role', 'listitem');
    expect(child2).not.toHaveAttribute('role', 'listitem');
  });

  it('should render correctly with different props', () => {
    const testTitle = 'Test Section Title';
    const testDescription = 'Test description';

    render(
      <SettingsSection title={testTitle} icon={<Eye />} description={testDescription}>
        <div>Test Children</div>
      </SettingsSection>,
    );
    expect(screen.getByText(testTitle)).toBeInTheDocument();
    expect(screen.getByText(testDescription)).toBeInTheDocument();
    cleanup();

    render(
      <SettingsSection title={testTitle} icon={<Eye />} description={testDescription}>
        <div>Test Children</div>
      </SettingsSection>,
    );
    expect(screen.getByText(testTitle)).toBeInTheDocument();
    expect(screen.getByText(testDescription)).toBeInTheDocument();
  });
});
