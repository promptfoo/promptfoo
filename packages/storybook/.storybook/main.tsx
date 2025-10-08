import { dirname, join } from 'path';

import { themes } from 'storybook/theming';
import type { StorybookConfig } from '@storybook/react-vite';

/**
 * This function is used to resolve the absolute path of a package.
 * It is needed in projects that use Yarn PnP or are set up within a monorepo.
 */
function getAbsolutePath(value: string): string {
  return dirname(require.resolve(join(value, 'package.json')));
}
const config: StorybookConfig = {
  stories: ['../src/**/*.mdx', '../src/**/*.stories.@(js|jsx|mjs|ts|tsx)'],
  addons: [
    {
      name: getAbsolutePath('@storybook/addon-themes'),
      options: {
        defaultTheme: 'light',
        themes: {
          light: {
            ...themes.light,
            name: 'Light',
            class: 'light-theme',
            colorIcon: '#ffffff',
          },
          dark: {
            name: 'Dark',
            class: 'dark-theme',
            colorIcon: '#1a1a1a',
          },
        },
        clearable: false,
        attribute: 'data-theme',
        target: 'html',
      },
    },
    getAbsolutePath('@storybook/addon-docs'),
    getAbsolutePath('@storybook/addon-a11y'),
    getAbsolutePath('@storybook/addon-vitest'),
  ],
  framework: {
    name: getAbsolutePath('@storybook/react-vite'),
    options: {},
  },
  typescript: {
    check: false,
    reactDocgen: 'react-docgen-typescript',
    reactDocgenTypescriptOptions: {
      shouldExtractLiteralValuesFromEnum: true,
      shouldExtractValuesFromUnion: true,
      shouldRemoveUndefinedFromOptional: true,
      propFilter: (prop) => {
        if (prop.parent) {
          // Include props from the toolkit package
          if (prop.parent.fileName.includes('promptfoo-toolkit')) {
            return true;
          }
          // Include props from MUI packages (needed for extended types)
          if (prop.parent.fileName.includes('@mui/material')) {
            return true;
          }
          // Exclude props from other node_modules
          return !/node_modules/.test(prop.parent.fileName);
        }
        return true;
      },
      savePropValueAsString: true,
    },
  },
};
export default config;
