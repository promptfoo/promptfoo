/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        notion: {
          bg: '#ffffff',
          sidebar: '#f7f6f3',
          border: '#e9e9e7',
          text: '#37352f',
          'text-secondary': '#787774',
          accent: '#2383e2',
          hover: '#ebebea',
        },
      },
    },
  },
  plugins: [],
};
