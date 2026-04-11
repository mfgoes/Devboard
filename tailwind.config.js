/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"Fira Code"', 'Consolas', 'monospace'],
      },
      colors: {
        canvas: '#1c1916',
        chrome: '#242019',
        surface: '#2d2820',
        border: '#3c3529',
        muted: '#8a7b6c',
        text: '#ece6dd',
        accent: '#b87750',
        'accent-hover': '#a06038',
      },
    },
  },
  plugins: [],
};
