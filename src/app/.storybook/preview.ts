import * as React from 'react';

import type { Preview } from '@storybook/react-vite';
import '../src/index.css';
import './preview.css';

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    backgrounds: { disable: true },
    layout: 'fullscreen',
  },
  globalTypes: {
    theme: {
      description: 'Global theme for components',
      toolbar: {
        title: 'Theme',
        icon: 'circlehollow',
        items: [
          { value: 'light', icon: 'sun', title: 'Light' },
          { value: 'dark', icon: 'moon', title: 'Dark' },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: {
    theme: 'light',
  },
  decorators: [
    (Story, context) => {
      const theme = context.globals.theme || 'light';

      React.useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
      }, [theme]);

      return React.createElement(
        'div',
        {
          className: 'min-h-screen p-6 print:min-h-0 print:p-0 print:bg-white',
          style: {
            backgroundColor: theme === 'dark' ? '#09090b' : '#ffffff',
            color: theme === 'dark' ? '#fafafa' : '#09090b',
          },
        },
        React.createElement(Story),
      );
    },
  ],
};

export default preview;
