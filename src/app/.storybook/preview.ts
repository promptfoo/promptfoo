import type { Preview } from '@storybook/react-vite';
import '../src/index.css';

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    backgrounds: {
      default: 'light',
      values: [
        { name: 'light', value: '#f8fafc' },
        { name: 'dark', value: '#0f172a' },
      ],
    },
  },
  decorators: [
    (Story, context) => {
      // Apply dark mode based on backgrounds selection
      const isDark = context.globals.backgrounds?.value === '#0f172a';
      document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
      return Story();
    },
  ],
};

export default preview;
