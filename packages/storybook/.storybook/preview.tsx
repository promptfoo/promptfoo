// biome-ignore lint/correctness/noUnusedImports: React is needed for Storybook
import React, { useEffect } from 'react';

import { Theme } from '@mui/material';
import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider } from '@mui/material/styles';
import { DecoratorHelpers } from '@storybook/addon-themes';
import { themes as sbThemes } from 'storybook/theming';
import { darkTheme, lightTheme } from '../src/ThemeProvider';
import type { Preview } from '@storybook/react-vite';
import './theme.css';

const { pluckThemeFromContext, initializeThemeState } = DecoratorHelpers;

const withTheme =
  ({ themes, defaultTheme }: { themes: Record<string, Theme>; defaultTheme: string }) =>
  (storyFn, context) => {
    initializeThemeState(Object.keys(themes), defaultTheme);
    const selectedTheme = pluckThemeFromContext(context);
    const theme = themes[selectedTheme || defaultTheme];
    console.log(sbThemes.dark);

    // // Sync MUI theme with Storybook theme
    useEffect(() => {
      const htmlElement = document.documentElement;
      if (selectedTheme === 'dark') {
        htmlElement.setAttribute('data-theme', 'dark');
        htmlElement.classList.add('dark-theme');
        htmlElement.classList.remove('light-theme');
      } else {
        htmlElement.setAttribute('data-theme', 'light');
        htmlElement.classList.add('light-theme');
        htmlElement.classList.remove('dark-theme');
      }
    }, [selectedTheme]);

    return (
      <ThemeProvider theme={theme}>
        <CssBaseline>{storyFn(context)}</CssBaseline>
      </ThemeProvider>
    );
  };

const preview: Preview = {
  decorators: [
    withTheme({ themes: { light: lightTheme, dark: darkTheme }, defaultTheme: 'light' }),
  ],
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    a11y: {
      test: 'todo',
    },
    backgrounds: {
      default: 'light',
      values: [
        {
          name: 'light',
          value: lightTheme.palette.background.default,
        },
        {
          name: 'dark',
          value: darkTheme.palette.background.default,
        },
      ],
    },
  },
};

export default preview;
