/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        mono: ['"JetBrains Mono"', '"Fira Code"', 'Consolas', 'monospace'],
      },
      colors: {
        canvas: '#111118',
        chrome: '#1a1a2a',
        surface: '#22223a',
        border: '#2e2e46',
        muted: '#4a4a6a',
        text: '#e2e8f0',
        accent: '#6366f1',
        'accent-hover': '#4f46e5',
      },
    },
  },
  plugins: [],
};
