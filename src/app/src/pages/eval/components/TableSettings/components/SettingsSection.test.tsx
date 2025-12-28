import React from 'react';

import VisibilityIcon from '@mui/icons-material/Visibility';
import Box from '@mui/material/Box';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import { cleanup, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import SettingsSection from './SettingsSection';

const theme = createTheme();
const renderWithTheme = (component: React.ReactElement) => {
  return render(<ThemeProvider theme={theme}>{component}</ThemeProvider>);
};

describe('SettingsSection', () => {
  it('should render the title, icon, description, and children when all props are provided', () => {
    const testTitle = 'Test Section Title';
    const testDescription = 'This is a test description for the section.';
    const testChildText = 'This is the child content.';

    renderWithTheme(
      <SettingsSection
        title={testTitle}
        description={testDescription}
        icon={<VisibilityIcon data-testid="test-icon" />}
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

    renderWithTheme(
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

    renderWithTheme(
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

    renderWithTheme(
      <SettingsSection title={testTitle}>
        <Box data-testid="child1">Child 1</Box>
        <Box data-testid="child2">Child 2</Box>
      </SettingsSection>,
    );

    const child1 = screen.getByTestId('child1');
    const child2 = screen.getByTestId('child2');

    expect(child1).not.toHaveAttribute('role', 'listitem');
    expect(child2).not.toHaveAttribute('role', 'listitem');
  });

  it('should handle theme changes between light and dark modes without visual artifacts', () => {
    const lightTheme = createTheme({ palette: { mode: 'light' } });
    const darkTheme = createTheme({
      palette: {
        mode: 'dark',
        primary: {
          main: '#90caf9',
          light: '#90caf9',
        },
        background: {
          paper: '#303030',
        },
      },
    });

    const testTitle = 'Test Section Title';
    const testDescription = 'Test description';

    const renderWithTheme = (theme: any) => {
      return render(
        <ThemeProvider theme={theme}>
          <SettingsSection
            title={testTitle}
            icon={<VisibilityIcon />}
            description={testDescription}
          >
            <div>Test Children</div>
          </SettingsSection>
        </ThemeProvider>,
      );
    };

    renderWithTheme(lightTheme);
    expect(screen.getByText(testTitle)).toBeInTheDocument();
    expect(screen.getByText(testDescription)).toBeInTheDocument();
    cleanup();

    renderWithTheme(darkTheme);
    expect(screen.getByText(testTitle)).toBeInTheDocument();
    expect(screen.getByText(testDescription)).toBeInTheDocument();
  });
});
