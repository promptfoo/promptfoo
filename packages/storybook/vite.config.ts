/// <reference types="vitest/config" />

import path from 'path';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// More info at: https://storybook.js.org/docs/next/writing-tests/integrations/vitest-addon
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@mui/material': path.resolve(__dirname, '../../node_modules/@mui/material'),
    },
  },
});
