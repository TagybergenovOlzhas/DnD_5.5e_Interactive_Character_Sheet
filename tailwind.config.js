/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/client/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        serif: ['"Newsreader"', 'Georgia', 'serif'],
        sans: ['"Plus Jakarta Sans"', 'system-ui', '-apple-system', 'sans-serif'],
      },
      colors: {
        paper: {
          canvas: '#F8F5EE',
          surface: '#EFECE6',
          muted: '#E5E0D5',
        },
        ink: {
          DEFAULT: '#1C222D',
          secondary: '#8C857B',
        },
        accent: {
          sage: '#7E998A',
          terracotta: '#C86D5B',
          ochre: '#D4A359',
          lavender: '#9BA2B8',
        },
      },
    },
  },
  plugins: [],
};
